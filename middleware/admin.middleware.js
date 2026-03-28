/**
 * Admin Middleware
 * Verifies if user has admin privileges
 */

const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * Middleware to verify admin access
 * Checks if user has admin role from User model
 */
const isAdmin = (req, res, next) => {
  try {
    // Check if user is authenticated (should be called after authenticate middleware)
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        status: HTTP_STATUS.UNAUTHORIZED,
        success: false,
        message: MESSAGES.ERROR.NO_TOKEN
      });
    }

    // Check if user has admin role
    if (req.user.role === 'admin') {
      return next();
    }

    // User is not an admin
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      status: HTTP_STATUS.FORBIDDEN,
      success: false,
      message: MESSAGES.ERROR.UNAUTHORIZED_ADMIN
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || MESSAGES.ERROR.INTERNAL_ERROR
    });
  }
};

module.exports = {
  isAdmin
};
