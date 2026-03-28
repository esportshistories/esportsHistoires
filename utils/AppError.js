/**
 * AppError - Domain error with HTTP status for use with asyncHandler
 * Controllers can throw new AppError(status, message) for 4xx/5xx responses
 */

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'AppError';
  }
}

module.exports = AppError;
