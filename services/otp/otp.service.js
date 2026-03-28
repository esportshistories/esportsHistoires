/**
 * OTP Service
 * Handles OTP generation, validation, email sending, and rate limiting
 */

const crypto = require('crypto');
const { Resend } = require('resend');
const OTPRateLimit = require('../../models/OTPRateLimit.model');
const { OTP_LIMITS } = require('../../constants');
const { generateOTPEmailTemplate, getOTPEmailSubject } = require('./email.templates');
const Logger = require('../../utils/logger');

/**
 * Generate a random OTP code
 * @param {number} length - Length of OTP (default: 6)
 * @returns {string} Generated OTP code
 * 
 * NOTE: Currently set to static OTP "202020" for development/testing
 * TODO: Change back to random OTP generation for production
 */
const generateOTP = (length = parseInt(process.env.OTP_LENGTH) || 6) => {
  // Static OTP for development/testing
  
  // Original random OTP generation (commented out for now)
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  
  return otp;
};

/**
 * Calculate OTP expiration time
 * @param {number} minutes - Minutes until expiration (default: 10)
 * @returns {Date} Expiration date
 */
const getOTPExpiration = (minutes = parseInt(process.env.OTP_EXPIRE_MINUTES) || 5) => {
  const expirationTime = new Date();
  expirationTime.setMinutes(expirationTime.getMinutes() + minutes);
  return expirationTime;
};

/**
 * Check if OTP is expired
 * Optimized: Single date comparison
 * @param {Date} expiresAt - OTP expiration date
 * @returns {boolean} True if expired, false otherwise
 */
const isOTPExpired = (expiresAt) => {
  if (!expiresAt) return true;
  return Date.now() > new Date(expiresAt).getTime();
};

/**
 * Send OTP via email using Resend API
 * @param {string} email - Recipient email address
 * @param {string} otpCode - OTP code to send
 * @param {string} name - Recipient name (optional)
 * @param {string} purpose - Purpose of OTP: 'registration' or 'password_reset' (default: 'registration')
 * @returns {Promise<Object>} Email send result
 */
const sendOTPEmail = async (email, otpCode, name = 'User', purpose = 'registration') => {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const senderEmail = process.env.EMAIL_FROM || 'no-reply@gaminghuballday.buzz';
    const senderName = process.env.EMAIL_SENDER_NAME || 'EsportsHistories';

    // Generate email template
    const htmlContent = generateOTPEmailTemplate({
      otpCode,
      name,
      purpose
    });

    const subject = getOTPEmailSubject(purpose);

    const { data, error } = await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: email,
      subject: subject,
      html: htmlContent,
    });

    if (error) {
      console.error("Resend Error:", error);
      throw new Error("Failed to send OTP via Resend.");
    }

    return {
      success: true,
      messageId: data.id,
    };

  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw new Error("Failed to send OTP email: " + error.message);
  }
};

/**
 * Check rate limit for OTP generation
 * Optimized: Parallel queries for email and IP checks
 * @param {string} email - Email address
 * @param {string} ipAddress - IP address
 * @returns {Promise<Object>} { allowed: boolean, message?: string, retryAfter?: number }
 */
const checkOTPRateLimit = async (email, ipAddress) => {
  try {
    const emailLower = email.toLowerCase();
    const now = Date.now();
    const oneHourAgo = new Date(now - OTP_LIMITS.RATE_LIMIT_WINDOW_MS);

    // Parallel queries for better performance
    const [emailRateLimit, ipRateLimit] = await Promise.all([
      OTPRateLimit.findOne({ identifier: emailLower, type: 'email' }),
      OTPRateLimit.findOne({ identifier: ipAddress, type: 'ip' })
    ]);

    // Check email-based rate limit
    if (emailRateLimit) {
      // Filter old requests in one pass
      emailRateLimit.requests = emailRateLimit.requests.filter(
        req => new Date(req.timestamp) > oneHourAgo
      );
      
      if (emailRateLimit.requests.length >= OTP_LIMITS.MAX_REQUESTS_PER_EMAIL) {
        const oldestRequest = emailRateLimit.requests[0]?.timestamp;
        const retryAfter = oldestRequest 
          ? Math.ceil((OTP_LIMITS.RATE_LIMIT_WINDOW_MS - (now - new Date(oldestRequest).getTime())) / 1000)
          : OTP_LIMITS.RATE_LIMIT_WINDOW_MS / 1000;
        
        return {
          allowed: false,
          message: `Too many OTP requests. Maximum ${OTP_LIMITS.MAX_REQUESTS_PER_EMAIL} requests per hour allowed. Please try again later.`,
          retryAfter: Math.max(0, retryAfter)
        };
      }
    }

    // Check IP-based rate limit
    if (ipRateLimit) {
      // Filter old requests in one pass
      ipRateLimit.requests = ipRateLimit.requests.filter(
        req => new Date(req.timestamp) > oneHourAgo
      );
      
      if (ipRateLimit.requests.length >= OTP_LIMITS.MAX_REQUESTS_PER_IP) {
        const oldestRequest = ipRateLimit.requests[0]?.timestamp;
        const retryAfter = oldestRequest 
          ? Math.ceil((OTP_LIMITS.RATE_LIMIT_WINDOW_MS - (now - new Date(oldestRequest).getTime())) / 1000)
          : OTP_LIMITS.RATE_LIMIT_WINDOW_MS / 1000;
        
        return {
          allowed: false,
          message: `Too many OTP requests from this IP. Maximum ${OTP_LIMITS.MAX_REQUESTS_PER_IP} requests per hour allowed. Please try again later.`,
          retryAfter: Math.max(0, retryAfter)
        };
      }
    }

    return { allowed: true, emailRateLimit, ipRateLimit };
  } catch (error) {
    Logger.error('Error checking OTP rate limit', { errName: error.name });
    // On error, allow the request (fail open) but log the error
    return { allowed: true };
  }
};

/**
 * Record OTP generation request
 * Optimized: Reuses rate limit documents from checkOTPRateLimit if available
 * @param {string} email - Email address
 * @param {string} ipAddress - IP address
 * @param {Object} existingLimits - Optional: existing rate limit documents from checkOTPRateLimit
 * @returns {Promise<void>}
 */
const recordOTPRequest = async (email, ipAddress, existingLimits = null) => {
  try {
    const emailLower = email.toLowerCase();
    const now = new Date();
    const oneHourAgo = new Date(Date.now() - OTP_LIMITS.RATE_LIMIT_WINDOW_MS);

    // Reuse existing documents if available to avoid redundant queries
    let emailRateLimit = existingLimits?.emailRateLimit;
    let ipRateLimit = existingLimits?.ipRateLimit;

    // Record email-based request
    if (!emailRateLimit) {
      emailRateLimit = await OTPRateLimit.findOne({ 
        identifier: emailLower, 
        type: 'email' 
      });
    }

    if (!emailRateLimit) {
      emailRateLimit = new OTPRateLimit({
        identifier: emailLower,
        type: 'email',
        requests: []
      });
    }

    // Clean old requests before adding new one
    emailRateLimit.requests = emailRateLimit.requests.filter(
      req => new Date(req.timestamp) > oneHourAgo
    );
    emailRateLimit.requests.push({ timestamp: now });
    emailRateLimit.lastOTPGenerated = now;

    // Record IP-based request
    if (!ipRateLimit) {
      ipRateLimit = await OTPRateLimit.findOne({ 
        identifier: ipAddress, 
        type: 'ip' 
      });
    }

    if (!ipRateLimit) {
      ipRateLimit = new OTPRateLimit({
        identifier: ipAddress,
        type: 'ip',
        requests: []
      });
    }

    // Clean old requests before adding new one
    ipRateLimit.requests = ipRateLimit.requests.filter(
      req => new Date(req.timestamp) > oneHourAgo
    );
    ipRateLimit.requests.push({ timestamp: now });
    ipRateLimit.lastOTPGenerated = now;
    
    // Parallel saves for better performance
    await Promise.all([
      emailRateLimit.save(),
      ipRateLimit.save()
    ]);
  } catch (error) {
    Logger.error('Error recording OTP request', { errName: error.name });
    // Don't throw - rate limiting should not block OTP generation
  }
};

/**
 * Check resend cooldown
 * Optimized: Direct timestamp comparison
 * @param {Date} lastResendAt - Last resend timestamp
 * @returns {Object} { allowed: boolean, retryAfter?: number }
 */
const checkResendCooldown = (lastResendAt) => {
  if (!lastResendAt) {
    return { allowed: true };
  }

  const now = Date.now();
  const lastResend = new Date(lastResendAt).getTime();
  const secondsSinceLastResend = Math.floor((now - lastResend) / 1000);
  const cooldownSeconds = OTP_LIMITS.RESEND_COOLDOWN_SECONDS;

  if (secondsSinceLastResend < cooldownSeconds) {
    return {
      allowed: false,
      retryAfter: cooldownSeconds - secondsSinceLastResend
    };
  }

  return { allowed: true };
};

/**
 * Check verification attempt limit
 * Optimized: Direct timestamp comparison
 * @param {number} attemptCount - Current attempt count
 * @param {Date} cooldownUntil - Cooldown until timestamp (optional)
 * @returns {Object} { allowed: boolean, message?: string, retryAfter?: number }
 */
const checkVerificationAttemptLimit = (attemptCount, cooldownUntil = null) => {
  // Check if user is in cooldown period
  if (cooldownUntil) {
    const now = Date.now();
    const cooldownEnd = new Date(cooldownUntil).getTime();
    
    if (now < cooldownEnd) {
      const retryAfter = Math.ceil((cooldownEnd - now) / 1000); // seconds
      const hours = Math.floor(retryAfter / 3600);
      const minutes = Math.floor((retryAfter % 3600) / 60);
      
      return {
        allowed: false,
        message: `Too many failed attempts. Please try again after ${hours} hour${hours !== 1 ? 's' : ''} ${minutes > 0 ? `and ${minutes} minute${minutes !== 1 ? 's' : ''}` : ''}.`,
        retryAfter: retryAfter
      };
    }
  }
  
  if (attemptCount >= OTP_LIMITS.MAX_VERIFICATION_ATTEMPTS) {
    return {
      allowed: false,
      message: `Maximum ${OTP_LIMITS.MAX_VERIFICATION_ATTEMPTS} verification attempts exceeded. Please request a new OTP.`
    };
  }
  return { allowed: true };
};

/**
 * Check if cooldown period has passed
 * Optimized: Direct timestamp comparison
 * @param {Date} cooldownUntil - Cooldown until timestamp
 * @returns {boolean} True if cooldown has passed, false otherwise
 */
const isCooldownActive = (cooldownUntil) => {
  if (!cooldownUntil) return false;
  return Date.now() < new Date(cooldownUntil).getTime();
};

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} IP address
 */
const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
};

/**
 * Calculate cooldown end time (4 hours from now)
 * @returns {Date} Cooldown end timestamp
 */
const getCooldownEndTime = () => {
  const cooldownEnd = new Date();
  cooldownEnd.setTime(cooldownEnd.getTime() + OTP_LIMITS.FAILED_ATTEMPTS_COOLDOWN_MS);
  return cooldownEnd;
};

/**
 * Generate a default password for Google login users
 * Format: Capitalized name + random number + special character + random chars
 * Ensures: min 8 chars, 1+ capital letter, 1+ number, 1+ special character
 * @param {string} name - User's name
 * @returns {string} Generated password
 */
const generateDefaultPassword = (name) => {
  // Remove spaces and get first part of name
  let cleanName = name.trim().replace(/\s+/g, '');
  
  // If name is empty or too short, use a default prefix
  if (!cleanName || cleanName.length < 2) {
    cleanName = 'User';
  }
  
  // Capitalize first letter and take first 3-4 characters
  const namePart = cleanName.charAt(0).toUpperCase() + cleanName.slice(1, 4).toLowerCase();
  
  // Generate random 2-digit number
  const randomNumber = crypto.randomInt(10, 100);
  
  // Special characters pool
  const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const randomSpecialChar = specialChars[crypto.randomInt(0, specialChars.length)];
  
  // Generate additional random lowercase letters to ensure minimum 8 characters
  const lowercaseLetters = 'abcdefghijklmnopqrstuvwxyz';
  const additionalChars = Array.from({ length: 2 }, () => 
    lowercaseLetters[crypto.randomInt(0, lowercaseLetters.length)]
  ).join('');
  
  // Combine: Capitalized name + number + special char + additional chars
  // Format ensures: capital letter (from name), number, special char, min 8 chars
  const password = `${namePart}${randomNumber}${randomSpecialChar}${additionalChars}`;
  
  // Ensure minimum length of 8 characters
  if (password.length < 8) {
    // Add more random characters if needed
    const moreChars = Array.from({ length: 8 - password.length }, () => 
      lowercaseLetters[crypto.randomInt(0, lowercaseLetters.length)]
    ).join('');
    return password + moreChars;
  }
  
  return password;
};

/**
 * Send welcome email with default password to new Google login users
 * @param {string} email - Recipient email address
 * @param {string} name - Recipient name
 * @param {string} password - Default password to include in email
 * @returns {Promise<Object>} Email send result
 */
const sendWelcomeEmail = async (email, name, password) => {
  try {
    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.trim() === '') {
      Logger.warn('RESEND_API_KEY not configured. Skipping welcome email.');
      return {
        success: false,
        message: 'Email service not configured'
      };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { generateWelcomeEmailTemplate, getWelcomeEmailSubject } = require('./email.templates');

    const senderEmail = process.env.EMAIL_FROM || 'no-reply@gaminghuballday.buzz';
    const senderName = process.env.EMAIL_SENDER_NAME || 'EsportsHistories';

    // Generate email template
    const htmlContent = generateWelcomeEmailTemplate({
      name,
      password
    });

    const subject = getWelcomeEmailSubject();

    const { data, error } = await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: email,
      subject: subject,
      html: htmlContent,
    });

    if (error) {
      // Handle domain verification errors gracefully - don't show as error
      if (error.statusCode === 403 && error.message?.includes('domain is not verified')) {
        Logger.warn('Resend: Domain not verified. Email service unavailable. User can still login with Google.');
        return {
          success: false,
          message: 'Email service not configured (domain not verified)'
        };
      }
      // For other errors, log but don't throw
      Logger.error('Resend Error', { errName: error.name });
      return {
        success: false,
        message: error.message || 'Failed to send welcome email via Resend',
        error: error
      };
    }

    return {
      success: true,
      messageId: data.id,
    };

  } catch (error) {
    // Only log unexpected errors, don't throw
    Logger.error('Error sending welcome email', { errName: error.name });
    return {
      success: false,
      message: error.message || 'Unknown error sending welcome email'
    };
  }
};

module.exports = {
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
};

