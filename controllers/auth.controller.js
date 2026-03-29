/**
 * Authentication Controller
 * Handles user registration, OTP verification, password setting, and login
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User.model');
const walletService = require('../services/wallet.service');
const PendingRegistration = require('../models/PendingRegistration.model');
const { 
  generateOTP, 
  getOTPExpiration, 
  isOTPExpired, 
  sendOTPEmail,
  checkOTPRateLimit,
  recordOTPRequest,
  checkResendCooldown,
  checkVerificationAttemptLimit,
  isCooldownActive,
  getClientIP,
  getCooldownEndTime,
  generateDefaultPassword,
  sendWelcomeEmail
} = require('../services/otp/otp.service');
const { generateTokenPair, verifyRefreshToken, generateTwoFactorLoginToken, verifyTwoFactorLoginToken } = require('../utils/jwt.service');
const { HTTP_STATUS, MESSAGES, ENV, JWT, OTP_LIMITS, TIME } = require('../constants');
const { asyncHandler } = require('../utils/response.helper');
const { checkUserExists, checkEmailVerified, formatUserData, buildAuthResponseData, validateOTP, handleDatabaseError } = require('../utils/controller.helper');
const Logger = require('../utils/logger');

/**
 * Helper function to clean up expired refresh tokens from user document
 * @param {Object} user - User document
 */
const cleanupExpiredRefreshTokens = (user) => {
  const now = new Date();
  user.refreshTokens = user.refreshTokens.filter(token => {
    if (!token.expiresAt) return true; // Keep tokens without expiration (shouldn't happen, but safe)
    const expiresAt = new Date(token.expiresAt);
    return !isNaN(expiresAt.getTime()) && expiresAt > now;
  });
};

const toShortClientLabel = (ua = '') => {
  const s = String(ua || '');
  const lower = s.toLowerCase();

  const pick = (pairs, fallback) => {
    for (const [needle, name] of pairs) {
      if (lower.includes(needle)) return name;
    }
    return fallback;
  };

  const browser = pick(
    [
      ['edg/', 'Edge'],
      ['brave', 'Brave'],
      ['opr/', 'Opera'],
      ['opera', 'Opera'],
      ['chrome/', 'Chrome'],
      ['firefox/', 'Firefox'],
      ['fxios', 'Firefox'],
      ['safari/', 'Safari']
    ],
    'Browser'
  );

  // Safari UA also contains "Chrome/" in some cases (iOS WebView variations). Prefer Safari if it says Safari but not Chrome.
  const browserFinal =
    browser === 'Chrome' && lower.includes('safari/') && !lower.includes('chrome/')
      ? 'Safari'
      : browser;

  const os = pick(
    [
      ['android', 'Android'],
      ['iphone', 'iOS'],
      ['ipad', 'iOS'],
      ['windows', 'Windows'],
      ['mac os x', 'macOS'],
      ['linux', 'Linux']
    ],
    null
  );

  return os ? `${browserFinal} • ${os}` : browserFinal;
};

const recordDeviceLogoutHistory = (user, sessionId, reason) => {
  if (!sessionId) return;
  const entry = user.deviceHistory?.find(h => h.sessionId === sessionId && !h.loggedOutAt);
  if (entry) {
    entry.loggedOutAt = new Date();
    entry.logoutReason = reason || entry.logoutReason || 'user_logout';
  }
};

const recordDeviceLoginHistory = (user, { sessionId, deviceInfo, ip }) => {
  if (!user.deviceHistory) user.deviceHistory = [];
  user.deviceHistory.unshift({
    sessionId,
    deviceInfo: deviceInfo || 'Unknown device',
    ip: ip || null,
    loggedInAt: new Date(),
    loggedOutAt: null,
    logoutReason: null
  });
  if (user.deviceHistory.length > 20) {
    user.deviceHistory = user.deviceHistory.slice(0, 20);
  }
};

const logoutOtherDeviceSessions = (user, keepSessionId, reason) => {
  const otherSessions = (user.refreshTokens || []).filter(s => s.sessionId && s.sessionId !== keepSessionId);
  otherSessions.forEach(s => recordDeviceLogoutHistory(user, s.sessionId, reason || 'logout_other_device'));
  user.refreshTokens = (user.refreshTokens || []).filter(s => s.sessionId === keepSessionId);
};

/**
 * Helper function to save refresh token to user document
 * @param {Object} user - User document
 * @param {string} refreshToken - Refresh token string
 * @param {string} sessionId - Stable session identifier
 * @param {string} tokenId - Rotating refresh token identifier
 * @param {string} deviceInfo - Optional device information
 * @param {string} ip - Optional IP
 */
const saveRefreshToken = async (user, refreshToken, sessionId, tokenId, deviceInfo = 'Unknown device', ip = null) => {
  // Clean up expired tokens first
  cleanupExpiredRefreshTokens(user);

  // Decode token to get expiration (safe, unverified) for DB TTL-like cleanup
  const decoded = jwt.decode(refreshToken);
  let expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (decoded && typeof decoded.exp === 'number' && !isNaN(decoded.exp)) {
    expiresAt = new Date(decoded.exp * 1000);
  }

  // Upsert by sessionId (refresh token rotation should NOT create a new session)
  const idx = (user.refreshTokens || []).findIndex(t => t.sessionId === sessionId);
  if (idx >= 0) {
    user.refreshTokens[idx].token = refreshToken;
    user.refreshTokens[idx].tokenId = tokenId;
    user.refreshTokens[idx].expiresAt = expiresAt;
    user.refreshTokens[idx].deviceInfo = deviceInfo || user.refreshTokens[idx].deviceInfo;
    user.refreshTokens[idx].ip = ip || user.refreshTokens[idx].ip;
    user.refreshTokens[idx].lastUsedAt = new Date();
  } else {
    user.refreshTokens.push({
      sessionId,
      token: refreshToken,
      tokenId,
      expiresAt,
      deviceInfo,
      ip,
      createdAt: new Date(),
      lastUsedAt: new Date()
    });
  }

  // Keep only last 5 refresh tokens per user (prevent unlimited growth)
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
  }

  await user.save();
};

/**
 * Register user with email and name
 * Sends OTP to email for verification
 * User data is NOT saved to database until OTP is verified
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { email, name, password } = req.body;
  const emailLower = email.toLowerCase();
  const clientIP = getClientIP(req);

  // Check if user already exists (verified user)
  const existingUser = await User.findOne({ email: emailLower });
  
  if (existingUser && existingUser.isEmailVerified) {
    return res.badRequest(MESSAGES.ERROR.USER_EXISTS);
  }
  
  // If user exists but not verified, delete it to allow re-registration
  if (existingUser && !existingUser.isEmailVerified) {
    await User.deleteOne({ _id: existingUser._id });
  }

  // Check rate limit before generating OTP
  const rateLimitCheck = await checkOTPRateLimit(emailLower, clientIP);
  if (!rateLimitCheck.allowed) {
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS || 429).json({
      status: HTTP_STATUS.TOO_MANY_REQUESTS || 429,
      success: false,
      message: rateLimitCheck.message,
      retryAfter: rateLimitCheck.retryAfter
    });
  }

  // Hash password once and store hash in pending registration (never plain text)
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Check if there's already a pending registration
  const existingPending = await PendingRegistration.findOne({ email: emailLower });

  // Generate OTP
  const otpCode = generateOTP();
  const otpExpiresAt = getOTPExpiration();

  if (existingPending) {
    // Update existing pending registration with new OTP and password hash
    existingPending.name = name.trim();
    existingPending.passwordHash = hashedPassword;
    existingPending.otp = {
      code: otpCode,
      expiresAt: otpExpiresAt
    };
    existingPending.createdAt = new Date(); // Reset expiration timer
    existingPending.verificationAttempts = 0; // Reset verification attempts
    existingPending.cooldownUntil = null; // Clear cooldown when new OTP is generated
    await existingPending.save();
  } else {
    // Create new pending registration (NOT saved to User collection)
    // Use try-catch to handle race condition where pending registration might be created by another request
    try {
      const pendingRegistration = new PendingRegistration({
        email: emailLower,
        name: name.trim(),
        passwordHash: hashedPassword,
        otp: {
          code: otpCode,
          expiresAt: otpExpiresAt
        },
        verificationAttempts: 0,
        resendCount: 0,
        cooldownUntil: null
      });
      await pendingRegistration.save();
    } catch (saveError) {
      // Handle duplicate key error (E11000) - pending registration was created by another request
      if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
        // Find the existing pending registration and update it
        const raceConditionPending = await PendingRegistration.findOne({ email: emailLower });
        if (raceConditionPending) {
          raceConditionPending.name = name.trim();
          raceConditionPending.passwordHash = hashedPassword;
          raceConditionPending.otp = {
            code: otpCode,
            expiresAt: otpExpiresAt
          };
          raceConditionPending.createdAt = new Date();
          raceConditionPending.verificationAttempts = 0;
          raceConditionPending.cooldownUntil = null;
          await raceConditionPending.save();
        }
      } else {
        // Re-throw if it's a different error
        throw saveError;
      }
    }
  }

  // Record OTP request for rate limiting (reuse documents from checkOTPRateLimit)
  await recordOTPRequest(emailLower, clientIP, {
    emailRateLimit: rateLimitCheck.emailRateLimit,
    ipRateLimit: rateLimitCheck.ipRateLimit
  });

  // Send OTP email (non-blocking - user can request OTP again if email fails)
  sendOTPEmail(emailLower, otpCode, name.trim()).catch((emailError) => {
    Logger.error('Error sending OTP email', { errName: emailError.name });
  });

  return res.created(MESSAGES.SUCCESS.REGISTRATION, {
    email: emailLower,
    name: name.trim()
    // Note: No userId returned since user is not created yet
  });
});

/**
 * Verify OTP and set password
 * Creates user in database only after OTP verification
 * POST /api/auth/verify-otp
 */
const verifyOTPAndSetPassword = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const emailLower = email.toLowerCase();

  // Check if user already exists (already verified)
  const existingUser = await User.findOne({ email: emailLower });
  
  if (existingUser) {
    if (existingUser.isEmailVerified) {
      return res.badRequest(MESSAGES.ERROR.EMAIL_ALREADY_VERIFIED);
    }
    // If user exists but not verified, delete it (shouldn't happen with new flow, but handle it)
    await User.deleteOne({ _id: existingUser._id });
  }

  // Find pending registration
  const pendingRegistration = await PendingRegistration.findOne({ email: emailLower });
  
  if (!pendingRegistration) {
    return res.badRequest(MESSAGES.ERROR.USER_NOT_FOUND + '. Please register first.');
  }

  // Check if user is in cooldown period
  const attemptLimitCheck = checkVerificationAttemptLimit(
    pendingRegistration.verificationAttempts || 0,
    pendingRegistration.cooldownUntil
  );
  if (!attemptLimitCheck.allowed) {
    // Don't delete, keep the record for cooldown tracking
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS || 429).json({
      status: HTTP_STATUS.TOO_MANY_REQUESTS || 429,
      success: false,
      message: attemptLimitCheck.message,
      retryAfter: attemptLimitCheck.retryAfter
    });
  }

  // Check if OTP is expired
  if (isOTPExpired(pendingRegistration.otp.expiresAt)) {
    // Delete expired pending registration
    await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
    return res.badRequest(MESSAGES.ERROR.OTP_EXPIRED);
  }

  // Validate OTP
  if (!pendingRegistration.otp || pendingRegistration.otp.code !== otp.toString()) {
    // Increment failed verification attempts
    pendingRegistration.verificationAttempts = (pendingRegistration.verificationAttempts || 0) + 1;
    
    // If max attempts reached, set cooldown
    if (pendingRegistration.verificationAttempts >= OTP_LIMITS.MAX_VERIFICATION_ATTEMPTS) {
      pendingRegistration.cooldownUntil = getCooldownEndTime();
      await pendingRegistration.save();
      
      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS || 429).json({
        status: HTTP_STATUS.TOO_MANY_REQUESTS || 429,
        success: false,
        message: `Maximum ${OTP_LIMITS.MAX_VERIFICATION_ATTEMPTS} verification attempts exceeded. Please try again after 4 hours.`,
        retryAfter: OTP_LIMITS.FAILED_ATTEMPTS_COOLDOWN_MS / 1000
      });
    }
    
    await pendingRegistration.save();
    return res.badRequest(MESSAGES.ERROR.INVALID_OTP);
  }

  // Double-check if user was created between the first check and now (race condition prevention)
  const doubleCheckUser = await User.findOne({ email: emailLower });
  if (doubleCheckUser && doubleCheckUser.isEmailVerified) {
    // User was created by another request, delete pending registration and return error
    await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
    return res.badRequest(MESSAGES.ERROR.EMAIL_ALREADY_VERIFIED);
  }

  // Create user in database (only after OTP verification)
  // Use try-catch to handle race condition where user might be created between checks
  let user;
  try {
    user = new User({
      email: emailLower,
      name: pendingRegistration.name,
      password: pendingRegistration.passwordHash,
      isEmailVerified: true
      // OTP is not stored in user document
    });

    await user.save();
  } catch (saveError) {
    // Handle duplicate key error (E11000) - user was created by another request
    if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
      // Check if user now exists
      const existingUserAfterError = await User.findOne({ email: emailLower });
      if (existingUserAfterError && existingUserAfterError.isEmailVerified) {
        // Delete pending registration
        await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
        return res.badRequest(MESSAGES.ERROR.EMAIL_ALREADY_VERIFIED);
      }
    }
    // Re-throw if it's a different error
    throw saveError;
  }

  // Create wallet for new user
  try {
    await walletService.getOrCreateWallet(user._id.toString());
  } catch (walletError) {
    Logger.error('Error creating wallet for new user', { errName: walletError.name });
    // Continue even if wallet creation fails - it will be created on first access
  }

  // Delete pending registration after successful verification
  await PendingRegistration.deleteOne({ _id: pendingRegistration._id });

  // Enforce single-device login: new login kicks older devices
  user.refreshTokens = [];
  recordDeviceLoginHistory(user, { sessionId: null, deviceInfo: req.headers['user-agent'], ip: getClientIP(req) }); // temp entry; will be overwritten below

  // Generate access and refresh token pair
  const { accessToken, refreshToken, sessionId, tokenId } = generateTokenPair(user._id.toString(), user.email);
  // Fix the history entry with real sessionId
  if (user.deviceHistory?.length) user.deviceHistory[0].sessionId = sessionId;

  await saveRefreshToken(user, refreshToken, sessionId, tokenId, req.headers['user-agent'], getClientIP(req));

  return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.OTP_VERIFIED, buildAuthResponseData(user, accessToken, refreshToken));
});

/**
 * Resend OTP
 * POST /api/auth/resend-otp
 */
const resendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const emailLower = email.toLowerCase();
  const clientIP = getClientIP(req);

  // Check if user already exists (already verified)
  const existingUser = await User.findOne({ email: emailLower });
  
  if (existingUser && existingUser.isEmailVerified) {
    return res.badRequest(MESSAGES.ERROR.EMAIL_ALREADY_VERIFIED);
  }

  // Find pending registration
  const pendingRegistration = await PendingRegistration.findOne({ email: emailLower });
  
  if (!pendingRegistration) {
    return res.badRequest(MESSAGES.ERROR.USER_NOT_FOUND + '. Please register first.');
  }

  // Check resend cooldown
  const cooldownCheck = checkResendCooldown(pendingRegistration.lastResendAt);
  if (!cooldownCheck.allowed) {
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS || 429).json({
      status: HTTP_STATUS.TOO_MANY_REQUESTS || 429,
      success: false,
      message: `Please wait ${cooldownCheck.retryAfter} seconds before requesting a new OTP.`,
      retryAfter: cooldownCheck.retryAfter
    });
  }

  // Check resend count limit
  if ((pendingRegistration.resendCount || 0) >= OTP_LIMITS.MAX_RESEND_ATTEMPTS) {
    return res.badRequest(`Maximum ${OTP_LIMITS.MAX_RESEND_ATTEMPTS} resend attempts exceeded. Please register again.`);
  }

  // Check rate limit
  const rateLimitCheck = await checkOTPRateLimit(emailLower, clientIP);
  if (!rateLimitCheck.allowed) {
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS || 429).json({
      status: HTTP_STATUS.TOO_MANY_REQUESTS || 429,
      success: false,
      message: rateLimitCheck.message,
      retryAfter: rateLimitCheck.retryAfter
    });
  }

  // Generate new OTP
  const otpCode = generateOTP();
  const otpExpiresAt = getOTPExpiration();

  // Update pending registration OTP
  pendingRegistration.otp = {
    code: otpCode,
    expiresAt: otpExpiresAt
  };
  pendingRegistration.createdAt = new Date(); // Reset expiration timer
  pendingRegistration.lastResendAt = new Date(); // Update last resend timestamp
  pendingRegistration.resendCount = (pendingRegistration.resendCount || 0) + 1; // Increment resend count
  pendingRegistration.verificationAttempts = 0; // Reset verification attempts
  pendingRegistration.cooldownUntil = null; // Clear cooldown when new OTP is generated
  await pendingRegistration.save();

  // Record OTP request for rate limiting (reuse documents from checkOTPRateLimit)
  await recordOTPRequest(emailLower, clientIP, {
    emailRateLimit: rateLimitCheck.emailRateLimit,
    ipRateLimit: rateLimitCheck.ipRateLimit
  });

  // Send OTP email
  try {
    await sendOTPEmail(pendingRegistration.email, otpCode, pendingRegistration.name);
  } catch (emailError) {
    Logger.error('Error sending OTP email', { errName: emailError.name });
    return res.serverError(MESSAGES.ERROR.EMAIL_SEND_FAILED, emailError);
  }

  return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.OTP_RESENT);
});

/**
 * Login with email and password
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password, twoFactorCode } = req.body;

  // Find user by email
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!user) {
    return res.unauthorized(MESSAGES.ERROR.INVALID_CREDENTIALS);
  }

  // Check if user is blocked
  if (user.isBlocked) {
    return res.forbidden(MESSAGES.ERROR.USER_BLOCKED);
  }

  // Check if email is verified
  if (!checkEmailVerified(res, user)) {
    return;
  }

  // Check if user has password-based auth
  if (user.authProvider === 'google' && !user.password) {
    return res.badRequest('This account uses Google login. Please use Google to sign in.');
  }

  // Check if password exists (user has set password)
  if (!user.password) {
    return res.badRequest(MESSAGES.ERROR.PASSWORD_NOT_SET);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  
  if (!isPasswordValid) {
    return res.unauthorized(MESSAGES.ERROR.INVALID_CREDENTIALS);
  }

  // If user has 2FA enabled, require TOTP before issuing tokens
  if (user.twoFactor?.enabled) {
    // Allow single-step login if code is provided
    if (twoFactorCode) {
      const ok = speakeasy.totp.verify({
        secret: user.twoFactor.secret,
        encoding: 'base32',
        token: String(twoFactorCode),
        window: 1
      });
      if (!ok) {
        return res.unauthorized(MESSAGES.ERROR.INVALID_2FA_CODE);
      }
    } else {
      const twoFactorToken = generateTwoFactorLoginToken(user._id.toString(), user.email);
      return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TWO_FACTOR_REQUIRED, {
        twoFactorRequired: true,
        twoFactorToken,
        user: formatUserData(user),
        role: user.role
      });
    }
  }

  // Enforce single-device login: logout all other sessions on new login
  (user.refreshTokens || []).forEach(s => recordDeviceLogoutHistory(user, s.sessionId, 'new_login'));
  user.refreshTokens = [];

  const { accessToken, refreshToken, sessionId, tokenId } = generateTokenPair(user._id.toString(), user.email);
  recordDeviceLoginHistory(user, { sessionId, deviceInfo: req.headers['user-agent'], ip: getClientIP(req) });
  await saveRefreshToken(user, refreshToken, sessionId, tokenId, req.headers['user-agent'], getClientIP(req));

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.LOGIN, buildAuthResponseData(user, accessToken, refreshToken));
});

/**
 * Get 2FA status
 * GET /api/auth/2fa/status
 */
const twoFactorStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!checkUserExists(res, user)) return;
  return res.success(HTTP_STATUS.OK, '2FA status retrieved', {
    enabled: Boolean(user.twoFactor?.enabled)
  });
});

/**
 * Begin 2FA setup: generate a temp secret and QR code.
 * POST /api/auth/2fa/setup
 */
const twoFactorSetup = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!checkUserExists(res, user)) return;

  // Generate new secret each time setup is requested (overwrites tempSecret)
  const appName = process.env.TWO_FACTOR_APP_NAME || 'BooyahX';
  const secret = speakeasy.generateSecret({
    name: `${appName} (${user.email})`,
    length: 20
  });

  user.twoFactor = user.twoFactor || {};
  user.twoFactor.tempSecret = secret.base32;
  await user.save();

  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

  return res.success(HTTP_STATUS.OK, '2FA setup generated', {
    otpAuthUrl: secret.otpauth_url,
    qrCodeDataUrl,
    secret: secret.base32
  });
});

/**
 * Enable 2FA by verifying code against temp secret.
 * POST /api/auth/2fa/enable
 */
const twoFactorEnable = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const user = await User.findById(req.userId);
  if (!checkUserExists(res, user)) return;

  const tempSecret = user.twoFactor?.tempSecret;
  if (!tempSecret) {
    return res.badRequest(MESSAGES.ERROR.NO_2FA_SETUP_IN_PROGRESS);
  }

  const ok = speakeasy.totp.verify({
    secret: tempSecret,
    encoding: 'base32',
    token: String(code),
    window: 1
  });
  if (!ok) {
    return res.badRequest(MESSAGES.ERROR.INVALID_2FA_CODE);
  }

  user.twoFactor = user.twoFactor || {};
  user.twoFactor.enabled = true;
  user.twoFactor.secret = tempSecret;
  user.twoFactor.tempSecret = null;

  // Invalidate all refresh tokens (force re-login on other devices)
  user.refreshTokens = [];

  await user.save();

  return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TWO_FACTOR_ENABLED, {
    enabled: true
  });
});

/**
 * Disable 2FA by verifying code against current secret.
 * POST /api/auth/2fa/disable
 */
const twoFactorDisable = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const user = await User.findById(req.userId);
  if (!checkUserExists(res, user)) return;

  if (!user.twoFactor?.enabled || !user.twoFactor?.secret) {
    return res.badRequest(MESSAGES.ERROR.TWO_FACTOR_NOT_ENABLED);
  }

  const ok = speakeasy.totp.verify({
    secret: user.twoFactor.secret,
    encoding: 'base32',
    token: String(code),
    window: 1
  });
  if (!ok) {
    return res.badRequest(MESSAGES.ERROR.INVALID_2FA_CODE);
  }

  user.twoFactor.enabled = false;
  user.twoFactor.secret = null;
  user.twoFactor.tempSecret = null;
  user.refreshTokens = [];

  await user.save();

  return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TWO_FACTOR_DISABLED, {
    enabled: false
  });
});

/**
 * Verify 2FA token during login and issue access/refresh tokens.
 * POST /api/auth/2fa/verify-login
 */
const twoFactorVerifyLogin = asyncHandler(async (req, res) => {
  const { twoFactorToken, code } = req.body;
  if (!twoFactorToken) {
    return res.badRequest(MESSAGES.ERROR.VALIDATION_FAILED + ': twoFactorToken is required');
  }
  if (!code) {
    return res.badRequest(MESSAGES.ERROR.VALIDATION_FAILED + ': code is required');
  }

  let decoded;
  try {
    decoded = verifyTwoFactorLoginToken(twoFactorToken);
  } catch (e) {
    return res.unauthorized(e.message);
  }

  const user = await User.findById(decoded.userId);
  if (!checkUserExists(res, user)) return;
  if (!checkEmailVerified(res, user)) return;
  if (user.isBlocked) return res.forbidden(MESSAGES.ERROR.USER_BLOCKED);

  if (!user.twoFactor?.enabled || !user.twoFactor?.secret) {
    return res.badRequest(MESSAGES.ERROR.TWO_FACTOR_NOT_ENABLED);
  }

  const ok = speakeasy.totp.verify({
    secret: user.twoFactor.secret,
    encoding: 'base32',
    token: String(code),
    window: 1
  });
  if (!ok) {
    return res.unauthorized(MESSAGES.ERROR.INVALID_2FA_CODE);
  }

  (user.refreshTokens || []).forEach(s => recordDeviceLogoutHistory(user, s.sessionId, 'new_login'));
  user.refreshTokens = [];

  const { accessToken, refreshToken, sessionId, tokenId } = generateTokenPair(user._id.toString(), user.email);
  recordDeviceLoginHistory(user, { sessionId, deviceInfo: req.headers['user-agent'], ip: getClientIP(req) });
  await saveRefreshToken(user, refreshToken, sessionId, tokenId, req.headers['user-agent'], getClientIP(req));

  return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.LOGIN, buildAuthResponseData(user, accessToken, refreshToken));
});

/**
 * Helper function to handle Google user creation/login
 * Used by both ID token flow and OAuth code flow
 */
const handleGoogleUser = async (googleId, email, googleName, req) => {
  // Check if user exists by Google ID
  let user = await User.findOne({ googleId: googleId });

  if (user) {
    // Check if user is blocked
    if (user.isBlocked) {
      throw new Error(MESSAGES.ERROR.USER_BLOCKED);
    }

    // User exists with this Google ID - return user
    return { user, isNewUser: false };
  }

  // Check if user exists by email (same email, different auth method)
  user = await User.findOne({ email: email });

  if (user) {
    // Check if user is blocked
    if (user.isBlocked) {
      throw new Error(MESSAGES.ERROR.USER_BLOCKED);
    }

    // User exists with email auth - link Google account
    // Check if Google ID is already linked to another account
    const existingGoogleUser = await User.findOne({ googleId: googleId });
    if (existingGoogleUser && existingGoogleUser._id.toString() !== user._id.toString()) {
      throw new Error(MESSAGES.ERROR.GOOGLE_ACCOUNT_ALREADY_LINKED);
    }

    // Link Google account to existing email account
    user.googleId = googleId;
    user.authProvider = user.password ? 'both' : 'google';
    user.isEmailVerified = true; // Google already verified the email
    // Update name if provided and different
    if (googleName && googleName !== user.name) {
      user.name = googleName;
    }
    await user.save();

    // Create wallet for user if doesn't exist
    try {
      await walletService.getOrCreateWallet(user._id.toString());
    } catch (walletError) {
      Logger.error('Error creating wallet for user', { errName: walletError.name });
      // Continue even if wallet creation fails - it will be created on first access
    }

    return { user, isNewUser: false, isLinked: true };
  }

  // New user - create account directly (no OTP, no password needed)
  // Generate default password for new Google user
  const defaultPassword = generateDefaultPassword(googleName.trim());
  
  // Hash the default password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(defaultPassword, salt);

  user = new User({
    email: email,
    name: googleName.trim(),
    googleId: googleId,
    authProvider: 'both', // User can login with both Google and password
    isEmailVerified: true, // Google already verified the email
    password: hashedPassword // Store hashed default password
  });

  await user.save();

  // Create wallet for new user
  try {
    await walletService.getOrCreateWallet(user._id.toString());
  } catch (walletError) {
    Logger.error('Error creating wallet for new user', { errName: walletError.name });
    // Continue even if wallet creation fails - it will be created on first access
  }

  // Send welcome email with default password (non-blocking)
  sendWelcomeEmail(email, googleName.trim(), defaultPassword).catch((emailError) => {
    Logger.error('Error sending welcome email', { errName: emailError.name });
    // Continue even if email fails - user can still login with Google
  });

  return { user, isNewUser: true };
};

/**
 * Google OAuth Initiate
 * Redirects user to Google OAuth consent screen
 * GET /api/auth/google
 */
const googleOAuthInitiate = asyncHandler(async (req, res) => {
  try {
    // Validate required environment variables
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Google OAuth not configured. GOOGLE_CLIENT_ID is missing.'
      });
    }

    if (!process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Google OAuth not configured. GOOGLE_CLIENT_SECRET is missing.'
      });
    }

    if (!process.env.GOOGLE_REDIRECT_URI) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Google OAuth not configured. GOOGLE_REDIRECT_URI is missing.'
      });
    }

    // Initialize OAuth2Client with credentials
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Generate state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state in cookie (httpOnly, secure)
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: TIME.TEN_MINUTES_MS,
      domain: isProduction ? '.gaminghuballday.buzz' : undefined
    });

    // Get frontend redirect URL from query parameter (optional)
    const frontendRedirect = req.query.redirect || (isProduction ? 'https://gaminghuballday.buzz' : 'http://localhost:3001');
    
    // Store frontend redirect URL in cookie
    res.cookie('oauth_frontend_redirect', frontendRedirect, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: TIME.TEN_MINUTES_MS,
      domain: isProduction ? '.gaminghuballday.buzz' : undefined
    });

    // Generate OAuth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
      state: state,
      prompt: 'consent' // Force consent screen to get refresh token
    });

    // Redirect to Google OAuth
    res.redirect(authUrl);
  } catch (error) {
    Logger.error('Google OAuth initiate error', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to initiate Google OAuth'
    });
  }
});

/**
 * Google OAuth Callback
 * Handles OAuth callback, exchanges code for tokens, and creates/logs in user
 * GET /api/auth/google/callback
 */
const googleOAuthCallback = asyncHandler(async (req, res) => {
  try {
    // Validate required environment variables
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Google OAuth not configured properly.'
      });
    }

    // Get authorization code and state from query parameters
    const { code, state, error } = req.query;

    // Check for OAuth errors
    if (error) {
      Logger.error('Google OAuth error', error);
      const frontendRedirect = req.cookies?.oauth_frontend_redirect || (process.env.NODE_ENV === 'production' ? 'https://gaminghuballday.buzz' : 'http://localhost:3001');
      return res.redirect(`${frontendRedirect}/auth/error?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      const frontendRedirect = req.cookies?.oauth_frontend_redirect || (process.env.NODE_ENV === 'production' ? 'https://gaminghuballday.buzz' : 'http://localhost:3001');
      return res.redirect(`${frontendRedirect}/auth/error?error=no_code`);
    }

    // Verify state parameter (CSRF protection)
    const storedState = req.cookies?.oauth_state;
    if (!storedState || storedState !== state) {
      Logger.error('Invalid OAuth state parameter');
      const frontendRedirect = req.cookies?.oauth_frontend_redirect || (process.env.NODE_ENV === 'production' ? 'https://gaminghuballday.buzz' : 'http://localhost:3001');
      return res.redirect(`${frontendRedirect}/auth/error?error=invalid_state`);
    }

    // Clear state cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie('oauth_state', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      domain: isProduction ? '.gaminghuballday.buzz' : undefined
    });

    // Initialize OAuth2Client
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google using the access token
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user info from Google');
    }
    
    const userInfo = await response.json();

    const googleId = userInfo.id;
    const email = userInfo.email?.toLowerCase();
    const googleName = userInfo.name || userInfo.given_name || 'User';
    const emailVerified = userInfo.verified_email || false;

    if (!email) {
      const frontendRedirect = req.cookies?.oauth_frontend_redirect || (process.env.NODE_ENV === 'production' ? 'https://gaminghuballday.buzz' : 'http://localhost:3001');
      return res.redirect(`${frontendRedirect}/auth/error?error=no_email`);
    }

    if (!emailVerified) {
      const frontendRedirect = req.cookies?.oauth_frontend_redirect || (process.env.NODE_ENV === 'production' ? 'https://gaminghuballday.buzz' : 'http://localhost:3001');
      return res.redirect(`${frontendRedirect}/auth/error?error=email_not_verified`);
    }

    // Handle Google user (create/login)
    const { user, isNewUser, isLinked } = await handleGoogleUser(googleId, email, googleName, req);

    (user.refreshTokens || []).forEach(s => recordDeviceLogoutHistory(user, s.sessionId, 'new_login'));
    user.refreshTokens = [];

    const { accessToken, refreshToken, sessionId, tokenId } = generateTokenPair(user._id.toString(), user.email);
    recordDeviceLoginHistory(user, { sessionId, deviceInfo: req.headers['user-agent'], ip: getClientIP(req) });
    await saveRefreshToken(user, refreshToken, sessionId, tokenId, req.headers['user-agent'], getClientIP(req));

    // Get frontend redirect URL
    const frontendRedirect = req.cookies?.oauth_frontend_redirect || (process.env.NODE_ENV === 'production' ? 'https://gaminghuballday.buzz' : 'http://localhost:3000');
    
    // Clear frontend redirect cookie
    res.clearCookie('oauth_frontend_redirect', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      domain: isProduction ? '.gaminghuballday.buzz' : undefined
    });

    // Redirect to frontend with tokens in query parameters
    // Frontend should extract tokens and store them securely
    const redirectUrl = new URL(frontendRedirect);
    redirectUrl.searchParams.set('accessToken', accessToken);
    redirectUrl.searchParams.set('refreshToken', refreshToken);
    redirectUrl.searchParams.set('success', 'true');
    if (isNewUser) {
      redirectUrl.searchParams.set('newUser', 'true');
    }
    if (isLinked) {
      redirectUrl.searchParams.set('linked', 'true');
    }

    res.redirect(redirectUrl.toString());
  } catch (error) {
    Logger.error('Google OAuth callback error', { errName: error.name });

    const frontendRedirect = req.cookies?.oauth_frontend_redirect || (process.env.NODE_ENV === 'production' ? 'https://gaminghuballday.buzz' : 'http://localhost:3000');
    
    // Handle specific errors
    if (error.message === MESSAGES.ERROR.USER_BLOCKED) {
      return res.redirect(`${frontendRedirect}/auth/error?error=user_blocked`);
    }
    if (error.message === MESSAGES.ERROR.GOOGLE_ACCOUNT_ALREADY_LINKED) {
      return res.redirect(`${frontendRedirect}/auth/error?error=account_already_linked`);
    }

    return res.redirect(`${frontendRedirect}/auth/error?error=oauth_failed`);
  }
});

/**
 * Google OAuth Login
 * Verifies Google ID token and creates/logs in user
 * No OTP or password required for Google users
 * POST /api/auth/google-login
 */
const googleLogin = asyncHandler(async (req, res) => {
  const { idToken, name } = req.body;

  if (!idToken) {
    return res.badRequest(MESSAGES.ERROR.VALIDATION_FAILED + ': Google ID token is required');
  }

  try {
    // Decode token (unverified) so we can log helpful debug info in Render logs
    let decodedIdToken;
    try {
      decodedIdToken = jwt.decode(idToken);
    } catch (decodeError) {
      Logger.error('Failed to decode Google ID token before verification', {
        errName: decodeError.name,
        message: decodeError.message
      });
    }

    Logger.info('Google login attempt', {
      hasIdToken: !!idToken,
      idTokenPreview: typeof idToken === 'string' ? idToken.substring(0, 20) + '...' : null,
      googleClientIdConfigured: !!process.env.GOOGLE_CLIENT_ID,
      env: process.env.NODE_ENV || 'unknown',
      audienceEnv: process.env.GOOGLE_CLIENT_ID || 'undefined',
      decodedAud: decodedIdToken?.aud,
      decodedAzp: decodedIdToken?.azp,
      decodedIss: decodedIdToken?.iss,
      decodedEmail: decodedIdToken?.email,
      userAgent: req.headers['user-agent'],
      ip: getClientIP(req)
    });

    // Initialize Google OAuth client
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub; // Google's unique user ID
    const email = payload.email?.toLowerCase();
    const googleName = name || payload.name || payload.given_name || 'User';
    const emailVerified = payload.email_verified || false;

    if (!email) {
      return res.badRequest('Email not provided by Google. Please grant email permission.');
    }

    if (!emailVerified) {
      return res.badRequest('Email not verified by Google. Please verify your email with Google first.');
    }

    // Handle Google user (create/login) using helper function
    const { user, isNewUser, isLinked } = await handleGoogleUser(googleId, email, googleName, req);

    (user.refreshTokens || []).forEach(s => recordDeviceLogoutHistory(user, s.sessionId, 'new_login'));
    user.refreshTokens = [];

    const { accessToken, refreshToken, sessionId, tokenId } = generateTokenPair(user._id.toString(), user.email);
    recordDeviceLoginHistory(user, { sessionId, deviceInfo: req.headers['user-agent'], ip: getClientIP(req) });
    await saveRefreshToken(user, refreshToken, sessionId, tokenId, req.headers['user-agent'], getClientIP(req));

    // Return appropriate success message
    const message = isLinked 
      ? MESSAGES.SUCCESS.GOOGLE_ACCOUNT_LINKED 
      : MESSAGES.SUCCESS.GOOGLE_LOGIN_SUCCESS;

    return res.success(HTTP_STATUS.OK, message, buildAuthResponseData(user, accessToken, refreshToken));

  } catch (error) {
    Logger.error('Google login error', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack,
      errors: error.errors,
      responseData: error.response && error.response.data ? error.response.data : undefined
    });
    // Also log raw error object so that Render application logs show full details
    // eslint-disable-next-line no-console
    console.error('Google login error raw', error);
    
    // Handle specific Google auth errors
    if (error.message && error.message.includes('Invalid token')) {
      return res.unauthorized(MESSAGES.ERROR.GOOGLE_TOKEN_INVALID);
    }

    return res.serverError(MESSAGES.ERROR.GOOGLE_LOGIN_FAILED, error);
  }
});

/**
 * Refresh access token using refresh token
 * Implements refresh token rotation for better security
 * POST /api/auth/refresh-token
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: refreshTokenInput } = req.body;

  if (!refreshTokenInput) {
    return res.badRequest(MESSAGES.ERROR.VALIDATION_FAILED + ': Refresh token is required');
  }

  // Verify refresh token (this already checks expiration)
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshTokenInput);
  } catch (error) {
    return res.unauthorized(MESSAGES.ERROR.REFRESH_TOKEN_INVALID);
  }

  // Find user by ID
  const user = await User.findById(decoded.userId);
  
  if (!checkUserExists(res, user)) {
    return;
  }

  // Clean up expired tokens first
  cleanupExpiredRefreshTokens(user);

  // Backward compatibility:
  // Older refresh tokens / DB sessions may not have sessionId stored.
  // 1) Prefer sessionId matching when available.
  // 2) Otherwise fallback to tokenId+token match and auto-migrate by assigning a sessionId.
  let sessionId = decoded.sessionId;
  let currentSession = sessionId
    ? (user.refreshTokens || []).find(s => s.sessionId === sessionId)
    : null;

  if (currentSession) {
    if (currentSession.tokenId !== decoded.tokenId || currentSession.token !== refreshTokenInput) {
      return res.unauthorized(MESSAGES.ERROR.REFRESH_TOKEN_NOT_FOUND);
    }
  } else {
    currentSession = (user.refreshTokens || []).find(
      s => s.tokenId === decoded.tokenId && s.token === refreshTokenInput
    );
    if (!currentSession) {
      return res.unauthorized(MESSAGES.ERROR.REFRESH_TOKEN_NOT_FOUND);
    }
    if (!currentSession.sessionId) {
      sessionId = require('../utils/jwt.service').generateSessionId();
      currentSession.sessionId = sessionId;
    } else {
      sessionId = currentSession.sessionId;
    }
  }

  // Generate new access token and rotated refresh token for SAME sessionId
  const { accessToken: newAccessToken, refreshToken: newRefreshToken, tokenId: newTokenId } = generateTokenPair(
    user._id.toString(),
    user.email,
    { sessionId }
  );

  await saveRefreshToken(user, newRefreshToken, sessionId, newTokenId, req.headers['user-agent'], getClientIP(req));

  res.success(
    HTTP_STATUS.OK,
    'Token refreshed successfully',
    buildAuthResponseData(user, newAccessToken, newRefreshToken)
  );
});

/**
 * Device Sessions / History
 * GET /api/auth/device-history
 */
const deviceHistory = asyncHandler(async (req, res) => {
  // Pagination for history (default)
  const pageRaw = req.query.page;
  const limitRaw = req.query.limit;
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(limitRaw, 10) || 10));
  const skip = (page - 1) * limit;

  // Pagination for active sessions (optional, same endpoint)
  const activePageRaw = req.query.activePage;
  const activeLimitRaw = req.query.activeLimit;
  const activePage = Math.max(1, Number.parseInt(activePageRaw, 10) || 1);
  const activeLimit = Math.min(50, Math.max(1, Number.parseInt(activeLimitRaw, 10) || 5));
  const activeSkip = (activePage - 1) * activeLimit;

  // By default, return ONLY active sessions (for Settings screen).
  // Fetch history only when user opens "Login history".
  const includeActive = req.query.includeActive !== '0';
  const includeHistory = req.query.includeHistory === '1';

  const now = new Date();
  const mongoose = require('mongoose');
  const userObjectId = new mongoose.Types.ObjectId(req.userId);

  const pipeline = [{ $match: { _id: userObjectId } }];
  const projectStage = {};

  if (includeActive) {
    projectStage.refreshTokens = {
      $filter: {
        input: { $ifNull: ['$refreshTokens', []] },
        as: 't',
        cond: {
          $or: [
            { $eq: ['$$t.expiresAt', null] },
            { $gt: ['$$t.expiresAt', now] }
          ]
        }
      }
    };
  }

  if (includeHistory) {
    projectStage.deviceHistory = { $ifNull: ['$deviceHistory', []] };
  }

  pipeline.push({ $project: projectStage });

  const projectStage2 = {};
  if (includeActive) {
    projectStage2.totalActive = { $size: '$refreshTokens' };
    projectStage2.activePage = { $slice: ['$refreshTokens', activeSkip, activeLimit] };
  }
  if (includeHistory) {
    projectStage2.totalHistory = { $size: '$deviceHistory' };
    projectStage2.historyPage = { $slice: ['$deviceHistory', skip, limit] };
  }
  pipeline.push({ $project: projectStage2 });

  const rows = await User.aggregate(pipeline);

  if (!rows || rows.length === 0) {
    return res.unauthorized(MESSAGES.ERROR.USER_NOT_FOUND);
  }

  const row = rows[0];
  const data = {};

  if (includeActive) {
    const totalActive = row.totalActive || 0;
    const totalActivePages = Math.max(1, Math.ceil(totalActive / activeLimit));
    const activeDevices = (row.activePage || []).map(s => ({
      sessionId: s.sessionId,
      deviceInfo: s.deviceInfo || 'Unknown device',
      deviceLabel: toShortClientLabel(s.deviceInfo),
      ip: s.ip || null,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt || s.createdAt,
      expiresAt: s.expiresAt
    }));

    data.activeDevices = {
      items: activeDevices,
      meta: {
        page: activePage,
        limit: activeLimit,
        total: totalActive,
        totalPages: totalActivePages
      }
    };
  }

  if (includeHistory) {
    const totalHistory = row.totalHistory || 0;
    const totalHistoryPages = Math.max(1, Math.ceil(totalHistory / limit));
    const history = (row.historyPage || []).map(h => ({
      sessionId: h.sessionId,
      deviceInfo: h.deviceInfo || 'Unknown device',
      deviceLabel: toShortClientLabel(h.deviceInfo),
      ip: h.ip || null,
      loggedInAt: h.loggedInAt,
      loggedOutAt: h.loggedOutAt,
      logoutReason: h.logoutReason
    }));

    data.history = {
      items: history,
      meta: {
        page,
        limit,
        total: totalHistory,
        totalPages: totalHistoryPages
      }
    };
  }

  return res.success(HTTP_STATUS.OK, 'Device history retrieved', data);
});

/**
 * Logout a specific device session by sessionId
 * POST /api/auth/logout-device
 */
const logoutDevice = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.badRequest(MESSAGES.ERROR.VALIDATION_FAILED + ': sessionId is required');
  }

  const user = await User.findById(userId);
  if (!checkUserExists(res, user)) return;

  const before = user.refreshTokens?.length || 0;
  user.refreshTokens = (user.refreshTokens || []).filter(s => s.sessionId !== sessionId);
  const after = user.refreshTokens.length;

  if (after < before) {
    recordDeviceLogoutHistory(user, sessionId, 'user_logout');
    await user.save();
  }

  return res.success(HTTP_STATUS.OK, 'Device logged out successfully');
});

/**
 * Forgot Password - Send OTP to email for password reset
 * POST /api/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const emailLower = email.toLowerCase();
  const clientIP = getClientIP(req);

  // Check rate limit before generating OTP
  const rateLimitCheck = await checkOTPRateLimit(emailLower, clientIP);
  if (!rateLimitCheck.allowed) {
    // Don't reveal if user exists or not (security best practice)
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS || 429).json({
      status: HTTP_STATUS.TOO_MANY_REQUESTS || 429,
      success: false,
      message: rateLimitCheck.message,
      retryAfter: rateLimitCheck.retryAfter
    });
  }

  // Find user by email
  const user = await User.findOne({ email: emailLower });
  
  if (!user) {
    // Don't reveal if user exists or not (security best practice)
    return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.FORGOT_PASSWORD_OTP_SENT);
  }

  // Check if email is verified - return generic success to prevent user enumeration
  if (!user.isEmailVerified) {
    // Don't reveal if user exists, email verification status, or auth method (security best practice)
    return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.FORGOT_PASSWORD_OTP_SENT);
  }

  // Check if user has password-based auth
  if (user.authProvider === 'google' && !user.password) {
    // Don't reveal if user exists or not (security best practice)
    return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.FORGOT_PASSWORD_OTP_SENT);
  }

  // Generate OTP for password reset
  const otpCode = generateOTP();
  const otpExpiresAt = getOTPExpiration();

  // Update user OTP
  user.otp = {
    code: otpCode,
    expiresAt: otpExpiresAt
  };
  user.passwordResetAttempts = 0; // Reset attempts when new OTP is generated
  user.passwordResetCooldownUntil = null; // Clear cooldown when new OTP is generated
  await user.save();

  // Record OTP request for rate limiting (reuse documents from checkOTPRateLimit)
  await recordOTPRequest(emailLower, clientIP, {
    emailRateLimit: rateLimitCheck.emailRateLimit,
    ipRateLimit: rateLimitCheck.ipRateLimit
  });

  // Send OTP email with password reset purpose
  try {
    await sendOTPEmail(user.email, otpCode, user.name, 'password_reset');
  } catch (emailError) {
    Logger.error('Error sending password reset OTP email', { errName: emailError.name });
    return res.serverError(MESSAGES.ERROR.FORGOT_PASSWORD_FAILED, emailError);
  }

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.FORGOT_PASSWORD_OTP_SENT);
});

/**
 * Reset Password - Verify OTP and set new password
 * POST /api/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  // Find user by email
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!checkUserExists(res, user)) {
    return;
  }

  // Check if email is verified
  if (!checkEmailVerified(res, user)) {
    return;
  }

  // Check if user has password-based auth
  if (user.authProvider === 'google' && !user.password) {
    return res.badRequest('This account uses Google login. Please use Google to sign in.');
  }

  // Check if user is in cooldown period
  const attemptLimitCheck = checkVerificationAttemptLimit(
    user.passwordResetAttempts || 0,
    user.passwordResetCooldownUntil
  );
  if (!attemptLimitCheck.allowed) {
    // Don't clear OTP, keep the record for cooldown tracking
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS || 429).json({
      status: HTTP_STATUS.TOO_MANY_REQUESTS || 429,
      success: false,
      message: attemptLimitCheck.message,
      retryAfter: attemptLimitCheck.retryAfter
    });
  }

  // Check if OTP is expired
  if (isOTPExpired(user.otp?.expiresAt)) {
    user.otp = undefined;
    user.passwordResetAttempts = 0;
    user.passwordResetCooldownUntil = null;
    await user.save();
    return res.badRequest(MESSAGES.ERROR.OTP_EXPIRED);
  }

  // Validate OTP
  if (!user.otp || !user.otp.code || user.otp.code !== otp.toString()) {
    // Increment failed verification attempts
    user.passwordResetAttempts = (user.passwordResetAttempts || 0) + 1;
    
    // If max attempts reached, set cooldown
    if (user.passwordResetAttempts >= OTP_LIMITS.MAX_VERIFICATION_ATTEMPTS) {
      user.passwordResetCooldownUntil = getCooldownEndTime();
      await user.save();
      
      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS || 429).json({
        status: HTTP_STATUS.TOO_MANY_REQUESTS || 429,
        success: false,
        message: `Maximum ${OTP_LIMITS.MAX_VERIFICATION_ATTEMPTS} verification attempts exceeded. Please try again after 4 hours.`,
        retryAfter: OTP_LIMITS.FAILED_ATTEMPTS_COOLDOWN_MS / 1000
      });
    }
    
    await user.save();
    return res.badRequest(MESSAGES.ERROR.INVALID_OTP);
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  // Update user password and clear OTP
  user.password = hashedPassword;
  user.otp = undefined;
  user.passwordResetAttempts = 0; // Reset attempts on success
  user.passwordResetCooldownUntil = null; // Clear cooldown on success
  
  // Invalidate all refresh tokens (security: force re-login after password reset)
  user.refreshTokens = [];
  
  await user.save();

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.PASSWORD_RESET_SUCCESS);
});

/**
 * Change Password - Change password with old password confirmation
 * PUT /api/auth/change-password
 * Requires authentication
 */
const changePassword = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { oldPassword, newPassword } = req.body;

  // Find user
  const user = await User.findById(userId);
  
  if (!checkUserExists(res, user)) {
    return;
  }

  // Check if user has password-based auth
  if (user.authProvider === 'google' && !user.password) {
    return res.badRequest('This account uses Google login. Password cannot be changed.');
  }

  // Verify old password
  const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
  
  if (!isOldPasswordValid) {
    return res.badRequest(MESSAGES.ERROR.OLD_PASSWORD_INCORRECT);
  }

  // Check if new password is different from old password
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    return res.badRequest(MESSAGES.ERROR.SAME_PASSWORD);
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  // Update user password
  user.password = hashedPassword;
  
  // Invalidate all refresh tokens (security: force re-login after password change)
  user.refreshTokens = [];
  
  await user.save();

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.PASSWORD_CHANGED);
});

/**
 * Logout - Remove refresh token from user's session
 * POST /api/auth/logout
 * Requires authentication
 * Works for all user types (admin, user, host)
 */
const logout = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { refreshToken: refreshTokenInput } = req.body;

  if (!refreshTokenInput) {
    return res.badRequest(MESSAGES.ERROR.VALIDATION_FAILED + ': Refresh token is required');
  }

  // Find user
  const user = await User.findById(userId);
  
  if (!checkUserExists(res, user)) {
    return;
  }

  // Verify refresh token to get tokenId
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshTokenInput);
  } catch (error) {
    // If token is invalid/expired, still return success (token is already invalid)
    return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.LOGOUT);
  }

  // Check if token belongs to this user
  if (decoded.userId !== userId) {
    return res.unauthorized(MESSAGES.ERROR.REFRESH_TOKEN_INVALID);
  }

  // Remove the refresh token from user's refreshTokens array
  const initialLength = user.refreshTokens.length;
  if (decoded.sessionId) {
    user.refreshTokens = user.refreshTokens.filter(token => token.sessionId !== decoded.sessionId);
  } else {
    // Backward compatibility for older refresh tokens without sessionId
    user.refreshTokens = user.refreshTokens.filter(token => token.tokenId !== decoded.tokenId);
  }

  let needsSave = user.refreshTokens.length < initialLength;
  if (needsSave) {
    recordDeviceLogoutHistory(user, decoded.sessionId, 'user_logout');
  }

  // Clear FCM token so user stops receiving push (room/tournament) notifications after logout
  if (user.fcmToken) {
    try {
      const fcmService = require('../services/fcm.service');
      if (fcmService.isInitialized()) {
        await fcmService.unsubscribeFromTopic(user.fcmToken, 'all_users');
      }
    } catch (err) {
      Logger.error('Error unsubscribing FCM token from topic on logout', err);
    }
    user.fcmToken = undefined;
    needsSave = true;
  }

  if (needsSave) {
    await user.save();
  }

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.LOGOUT);
});

/**
 * Logout All - Remove all refresh tokens from user's sessions
 * POST /api/auth/logout-all
 * Requires authentication
 * Works for all user types (admin, user, host)
 */
const logoutAll = asyncHandler(async (req, res) => {
  const userId = req.userId;

  // Find user
  const user = await User.findById(userId);
  
  if (!checkUserExists(res, user)) {
    return;
  }

  // Remove all refresh tokens
  (user.refreshTokens || []).forEach(s => recordDeviceLogoutHistory(user, s.sessionId, 'user_logout'));
  user.refreshTokens = [];

  // Clear FCM token so user stops receiving push (room/tournament) notifications after logout
  if (user.fcmToken) {
    try {
      const fcmService = require('../services/fcm.service');
      if (fcmService.isInitialized()) {
        await fcmService.unsubscribeFromTopic(user.fcmToken, 'all_users');
      }
    } catch (err) {
      Logger.error('Error unsubscribing FCM token from topic on logout-all', err);
    }
    user.fcmToken = undefined;
  }

  await user.save();

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.LOGOUT_ALL);
});

module.exports = {
  register,
  verifyOTPAndSetPassword,
  resendOTP,
  login,
  twoFactorStatus,
  twoFactorSetup,
  twoFactorEnable,
  twoFactorDisable,
  twoFactorVerifyLogin,
  googleLogin,
  googleOAuthInitiate,
  googleOAuthCallback,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  logout,
  logoutAll,
  deviceHistory,
  logoutDevice
};

