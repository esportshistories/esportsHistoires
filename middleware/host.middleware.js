/**
 * Host Middleware
 * Verifies if user has host or admin privileges
 */

const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * Middleware to verify host access
 * Checks if user has host or admin role
 */
const isHost = (req, res, next) => {
  try {
    // Check if user is authenticated (should be called after authenticate middleware)
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        status: HTTP_STATUS.UNAUTHORIZED,
        success: false,
        message: MESSAGES.ERROR.NO_TOKEN
      });
    }

    // Check if user has host or admin role
    if (req.user.role === 'host' || req.user.role === 'admin') {
      return next();
    }

    // User is not a host or admin
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      status: HTTP_STATUS.FORBIDDEN,
      success: false,
      message: 'Unauthorized. Host or admin access required.'
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || MESSAGES.ERROR.INTERNAL_ERROR
    });
  }
};

/**
 * Middleware to verify host or admin access (alias for isHost)
 */
const isHostOrAdmin = isHost;

module.exports = {
  isHost,
  isHostOrAdmin
};

