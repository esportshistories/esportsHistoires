/**
 * Authentication Middleware
 * Verifies JWT tokens and protects routes
 */

const { verifyAccessToken } = require('../utils/jwt.service');
const User = require('../models/User.model');
const { HTTP_STATUS, MESSAGES, AUTH } = require('../constants');

/**
 * Middleware to verify JWT token and authenticate user
 * Adds user information to request object
 * Note: Response helpers are attached via attachResponseHelpers middleware in server.js
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith(AUTH.BEARER_PREFIX)) {
      // Use response helper if available, fallback to raw response
      if (res.unauthorized) {
        return res.unauthorized(MESSAGES.ERROR.NO_TOKEN);
      }
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        status: HTTP_STATUS.UNAUTHORIZED,
        success: false,
        message: MESSAGES.ERROR.NO_TOKEN
      });
    }

    // Extract token from header
    const token = authHeader.substring(AUTH.TOKEN_START_INDEX);

    // Verify access token
    const decoded = verifyAccessToken(token);

    // Find user in database
    const user = await User.findById(decoded.userId).select('-password -otp');
    
    if (!user) {
      if (res.unauthorized) {
        return res.unauthorized(MESSAGES.ERROR.USER_NOT_FOUND + '. Token is invalid.');
      }
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        status: HTTP_STATUS.UNAUTHORIZED,
        success: false,
        message: MESSAGES.ERROR.USER_NOT_FOUND + '. Token is invalid.'
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      if (res.forbidden) {
        return res.forbidden(MESSAGES.ERROR.EMAIL_NOT_VERIFIED);
      }
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        status: HTTP_STATUS.FORBIDDEN,
        success: false,
        message: MESSAGES.ERROR.EMAIL_NOT_VERIFIED
      });
    }

    // Enforce per-device session revocation:
    // If token has sessionId, it must exist in user's active refreshTokens.
    // This makes logout-device / new-login revocation immediate (not waiting for access token expiry).
    if (decoded.sessionId) {
      const hasSession = (user.refreshTokens || []).some(s => s.sessionId === decoded.sessionId);
      if (!hasSession) {
        if (res.unauthorized) {
          return res.unauthorized('Session expired. Please login again.');
        }
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          status: HTTP_STATUS.UNAUTHORIZED,
          success: false,
          message: 'Session expired. Please login again.'
        });
      }
    }

    if (user.isBlocked) {
      if (res.forbidden) {
        return res.forbidden(MESSAGES.ERROR.USER_BLOCKED);
      }
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        status: HTTP_STATUS.FORBIDDEN,
        success: false,
        message: MESSAGES.ERROR.USER_BLOCKED
      });
    }

    // Attach user to request object
    req.user = user;
    req.userId = decoded.userId;
    req.sessionId = decoded.sessionId;

    next();
  } catch (error) {
    if (res.unauthorized) {
      return res.unauthorized(error.message || MESSAGES.ERROR.TOKEN_INVALID);
    }
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      status: HTTP_STATUS.UNAUTHORIZED,
      success: false,
      message: error.message || MESSAGES.ERROR.TOKEN_INVALID
    });
  }
};

module.exports = {
  authenticate
};

