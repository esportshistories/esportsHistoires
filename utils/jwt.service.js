/**
 * JWT Service
 * Handles JWT token generation and verification
 * Supports both access tokens (short-lived) and refresh tokens (long-lived)
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT } = require('../constants');

/**
 * Generate Access Token (short-lived, 15 minutes)
 * Used for API authentication
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string} [sessionId] - Stable session identifier (device session)
 * @returns {string} JWT access token
 */
const generateAccessToken = (userId, email, sessionId) => {
  const payload = {
    userId,
    email,
    type: 'access',
    sessionId: sessionId || undefined
  };

  const options = {
    expiresIn: process.env.JWT_ACCESS_EXPIRE || JWT.ACCESS_TOKEN_EXPIRE
  };

  return jwt.sign(payload, process.env.JWT_SECRET, options);
};

const generateSessionId = () => crypto.randomBytes(16).toString('hex');
const generateRefreshTokenId = () => crypto.randomBytes(16).toString('hex');

/**
 * Generate Refresh Token (long-lived, 7 days)
 * Used to obtain new access tokens
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string} sessionId - Stable session identifier (device session)
 * @param {string} tokenId - Rotating refresh token identifier
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (userId, email, sessionId, tokenId) => {
  const payload = {
    userId,
    email,
    type: 'refresh',
    sessionId,
    tokenId // Unique token ID for refresh rotation / revocation
  };

  const options = {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || JWT.REFRESH_TOKEN_EXPIRE
  };

  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  return jwt.sign(payload, secret, options);
};

/**
 * Verify Access Token
 * @param {string} token - JWT access token to verify
 * @returns {Object} Decoded token payload
 */
const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

/**
 * Verify Refresh Token
 * @param {string} token - JWT refresh token to verify
 * @returns {Object} Decoded token payload
 */
const verifyRefreshToken = (token) => {
  try {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

/**
 * Verify JWT token (backward compatibility - verifies access token)
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  return verifyAccessToken(token);
};

/**
 * Generate both access and refresh tokens
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {Object} [opts]
 * @param {string} [opts.sessionId] - Provide to keep the same device session across refresh rotation
 * @returns {Object} Object containing accessToken and refreshToken
 */
const generateTokenPair = (userId, email, opts = {}) => {
  const sessionId = opts.sessionId || generateSessionId();
  const tokenId = generateRefreshTokenId();
  return {
    sessionId,
    tokenId,
    accessToken: generateAccessToken(userId, email, sessionId),
    refreshToken: generateRefreshToken(userId, email, sessionId, tokenId)
  };
};

/**
 * Generate a short-lived token for completing 2FA login.
 * This is used when password is valid but user has 2FA enabled.
 * @param {string} userId
 * @param {string} email
 * @returns {string} JWT token
 */
const generateTwoFactorLoginToken = (userId, email) => {
  const payload = {
    userId,
    email,
    type: '2fa',
    purpose: 'login',
    tokenId: crypto.randomBytes(16).toString('hex')
  };

  const options = { expiresIn: process.env.JWT_2FA_EXPIRE || '10m' };
  return jwt.sign(payload, process.env.JWT_SECRET, options);
};

/**
 * Verify 2FA login token.
 * @param {string} token
 * @returns {Object} Decoded token payload
 */
const verifyTwoFactorLoginToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== '2fa' || decoded.purpose !== 'login') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired 2FA token');
  }
};

/**
 * Decode JWT token without verification (for debugging)
 * @param {string} token - JWT token to decode
 * @returns {Object} Decoded token payload
 */
const decodeToken = (token) => {
  return jwt.decode(token);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  generateTwoFactorLoginToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyTwoFactorLoginToken,
  verifyToken, // Backward compatibility
  decodeToken,
  generateSessionId,
  generateRefreshTokenId
};

