/**
 * Response Helper Utility
 * Provides dynamic and consistent response formatting across all API endpoints
 * Automatically handles status codes and response structure
 */

const { HTTP_STATUS, ENV } = require('../constants');
const AppError = require('./AppError');

/**
 * Enhanced Response Helper Class
 * Attaches methods to Express response object for dynamic response handling
 */
class ResponseHelper {
  /**
   * Send success response
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Response message
   * @param {Object} data - Response data (optional)
   */
  static success(res, statusCode = HTTP_STATUS.OK, message, data = null) {
    const response = {
      status: statusCode,
      success: true,
      message: message
    };
    
    if (data !== null && data !== undefined) {
      response.data = data;
    }
    
    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   * @param {Array} errors - Validation errors (optional)
   * @param {Error} error - Error object (optional, for development)
   */
  static error(res, statusCode, message, errors = null, error = null) {
    const response = {
      status: statusCode,
      success: false,
      message: message
    };
    
    if (errors !== null && errors !== undefined) {
      response.errors = errors;
    }
    
    if (error !== null && process.env.NODE_ENV === ENV.DEVELOPMENT) {
      response.error = error.message || error;
    }
    
    return res.status(statusCode).json(response);
  }

  /**
   * Send created response (201)
   */
  static created(res, message, data = null) {
    return this.success(res, HTTP_STATUS.CREATED, message, data);
  }

  /**
   * Send bad request response (400)
   */
  static badRequest(res, message, errors = null) {
    return this.error(res, HTTP_STATUS.BAD_REQUEST, message, errors);
  }

  /**
   * Send unauthorized response (401)
   */
  static unauthorized(res, message) {
    return this.error(res, HTTP_STATUS.UNAUTHORIZED, message);
  }

  /**
   * Send forbidden response (403)
   */
  static forbidden(res, message) {
    return this.error(res, HTTP_STATUS.FORBIDDEN, message);
  }

  /**
   * Send not found response (404)
   */
  static notFound(res, message) {
    return this.error(res, HTTP_STATUS.NOT_FOUND, message);
  }

  /**
   * Send internal server error response (500)
   */
  static serverError(res, message, error = null) {
    return this.error(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, message, null, error);
  }
}

/**
 * Async Handler Wrapper
 * Automatically catches errors and sends error responses
 * Eliminates need for try-catch blocks in every controller
 * 
 * @param {Function} fn - Async controller function
 * @returns {Function} Wrapped function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      if (error instanceof AppError) {
        return ResponseHelper.error(res, error.status, error.message, null, error);
      }
      const Logger = require('./logger');
      Logger.error('Async handler error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      });
      // Check if response helpers are attached
      if (res.serverError) {
        return ResponseHelper.serverError(
          res,
          error.message || 'An unexpected error occurred',
          error
        );
      }
      // Fallback if helpers not attached
      return ResponseHelper.error(
        res,
        error.status || HTTP_STATUS.INTERNAL_SERVER_ERROR,
        error.message || 'An unexpected error occurred',
        null,
        error
      );
    });
  };
};

/**
 * Attach response helper methods to Express response object
 * Makes responses more dynamic: res.success(), res.error(), etc.
 */
const attachResponseHelpers = (req, res, next) => {
  // Attach helper methods to response object
  res.success = (statusCode, message, data) => ResponseHelper.success(res, statusCode, message, data);
  res.error = (statusCode, message, errors, error) => ResponseHelper.error(res, statusCode, message, errors, error);
  res.created = (message, data) => ResponseHelper.created(res, message, data);
  res.badRequest = (message, errors) => ResponseHelper.badRequest(res, message, errors);
  res.unauthorized = (message) => ResponseHelper.unauthorized(res, message);
  res.forbidden = (message) => ResponseHelper.forbidden(res, message);
  res.notFound = (message) => ResponseHelper.notFound(res, message);
  res.serverError = (message, error) => ResponseHelper.serverError(res, message, error);
  
  next();
};

module.exports = {
  ResponseHelper,
  asyncHandler,
  attachResponseHelpers
};
