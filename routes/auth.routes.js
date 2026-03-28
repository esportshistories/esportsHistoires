/**
 * Authentication Routes
 * Defines all authentication-related API endpoints
 */

const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { veryStrictRateLimiter } = require('../middleware/rateLimit.middleware');
const { PASSWORD_VALIDATION } = require('../constants');
const {
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
  getCSRFToken,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  logout,
  logoutAll,
  deviceHistory,
  logoutDevice
} = require('../controllers/auth.controller');

const router = express.Router();

router.post(
  '/register',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters')
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Name can only contain letters and spaces'),
    body('password')
      .isLength({ min: PASSWORD_VALIDATION.MIN_LENGTH })
      .withMessage(PASSWORD_VALIDATION.MESSAGE)
      .matches(PASSWORD_VALIDATION.REGEX)
      .withMessage(PASSWORD_VALIDATION.MESSAGE)
  ],
  validate,
  register
);

router.post(
  '/verify-otp',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('otp')
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits')
      .isNumeric()
      .withMessage('OTP must contain only numbers')
  ],
  validate,
  verifyOTPAndSetPassword
);

router.post(
  '/resend-otp',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
  ],
  validate,
  resendOTP
);

router.post(
  '/login',
  veryStrictRateLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    body('twoFactorCode')
      .optional()
      .isLength({ min: 6, max: 6 })
      .withMessage('2FA code must be 6 digits')
      .isNumeric()
      .withMessage('2FA code must contain only numbers')
  ],
  validate,
  login
);

router.get('/2fa/status', authenticate, twoFactorStatus);

router.post('/2fa/setup', authenticate, twoFactorSetup);

router.post(
  '/2fa/enable',
  authenticate,
  [
    body('code')
      .isLength({ min: 6, max: 6 })
      .withMessage('2FA code must be 6 digits')
      .isNumeric()
      .withMessage('2FA code must contain only numbers')
  ],
  validate,
  twoFactorEnable
);

router.post(
  '/2fa/disable',
  authenticate,
  [
    body('code')
      .isLength({ min: 6, max: 6 })
      .withMessage('2FA code must be 6 digits')
      .isNumeric()
      .withMessage('2FA code must contain only numbers')
  ],
  validate,
  twoFactorDisable
);

router.post(
  '/2fa/verify-login',
  [
    body('twoFactorToken')
      .notEmpty()
      .withMessage('twoFactorToken is required'),
    body('code')
      .isLength({ min: 6, max: 6 })
      .withMessage('2FA code must be 6 digits')
      .isNumeric()
      .withMessage('2FA code must contain only numbers')
  ],
  validate,
  twoFactorVerifyLogin
);

router.get('/google', googleOAuthInitiate);

router.get('/google/callback', googleOAuthCallback);

router.get('/csrf-token', getCSRFToken);

router.post(
  '/google-login',
  [
    body('idToken')
      .notEmpty()
      .withMessage('Google ID token is required')
      .isString()
      .withMessage('Google ID token must be a string'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters')
  ],
  validate,
  googleLogin
);

router.post(
  '/refresh-token',
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required')
  ],
  validate,
  refreshToken
);

router.post(
  '/forgot-password',
  veryStrictRateLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
  ],
  validate,
  forgotPassword
);

router.post(
  '/reset-password',
  veryStrictRateLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('otp')
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits')
      .isNumeric()
      .withMessage('OTP must contain only numbers'),
    body('newPassword')
      .isLength({ min: PASSWORD_VALIDATION.MIN_LENGTH })
      .withMessage(PASSWORD_VALIDATION.MESSAGE)
      .matches(PASSWORD_VALIDATION.REGEX)
      .withMessage(PASSWORD_VALIDATION.MESSAGE)
  ],
  validate,
  resetPassword
);

router.put(
  '/change-password',
  authenticate,
  [
    body('oldPassword')
      .notEmpty()
      .withMessage('Old password is required'),
    body('newPassword')
      .isLength({ min: PASSWORD_VALIDATION.MIN_LENGTH })
      .withMessage(PASSWORD_VALIDATION.MESSAGE)
      .matches(PASSWORD_VALIDATION.REGEX)
      .withMessage(PASSWORD_VALIDATION.MESSAGE)
  ],
  validate,
  changePassword
);

router.post(
  '/logout',
  authenticate,
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required')
  ],
  validate,
  logout
);

router.post(
  '/logout-all',
  authenticate,
  logoutAll
);

router.get('/device-history', authenticate, deviceHistory);

router.post(
  '/logout-device',
  authenticate,
  [
    body('sessionId')
      .notEmpty()
      .withMessage('sessionId is required')
  ],
  validate,
  logoutDevice
);

module.exports = router;
