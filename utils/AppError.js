/**
 * AppError - Domain error with HTTP status for use with asyncHandler
 * Throw from services/controllers for 4xx/5xx; asyncHandler returns JSON without logging as unhandled 500.
 */

class AppError extends Error {
  /**
   * @param {number} status - HTTP status
   * @param {string} message - User-facing message
   * @param {object|null} errors - Optional payload (e.g. { code: '...', hints: [] }) merged into JSON errors
   */
  constructor(status, message, errors = null) {
    super(message);
    this.status = status;
    this.name = 'AppError';
    this.errors = errors;
  }
}

module.exports = AppError;
