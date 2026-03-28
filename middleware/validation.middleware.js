/**
 * Validation Middleware
 * Uses express-validator to validate request data
 */

const { validationResult } = require('express-validator');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * Middleware to check validation results
 * Returns errors if validation fails
 * Uses response helpers if available, falls back to raw response
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg
    }));
    
    // Use response helper if available, fallback to raw response
    if (res.badRequest) {
      return res.badRequest(MESSAGES.ERROR.VALIDATION_FAILED, formattedErrors);
    }
    
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      status: HTTP_STATUS.BAD_REQUEST,
      success: false,
      message: MESSAGES.ERROR.VALIDATION_FAILED,
      errors: formattedErrors
    });
  }
  
  next();
};

module.exports = {
  validate
};

