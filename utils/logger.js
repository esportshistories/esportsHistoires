/**
 * Logger Utility
 * Centralized logging with different log levels
 * Can be extended to use winston, pino, or other logging libraries
 */

const { ENV } = require('../constants');

/**
 * Log levels
 */
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

/**
 * Get current timestamp
 */
const getTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Format log message
 */
const formatMessage = (level, message, data = null) => {
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  
  if (data) {
    return `${prefix} ${message}\n${JSON.stringify(data, null, 2)}`;
  }
  
  return `${prefix} ${message}`;
};

/**
 * Logger class
 */
class Logger {
  /**
   * Log error message
   * @param {string} message - Error message
   * @param {Error|Object} error - Error object or additional data
   */
  static error(message, error = null) {
    const formattedMessage = formatMessage(LOG_LEVELS.ERROR, message, error);
    console.error(formattedMessage);
    
    // In production, you might want to send to error tracking service
    if (process.env.NODE_ENV === ENV.PRODUCTION && error instanceof Error) {
      // TODO: Integrate with error tracking service (Sentry, etc.)
    }
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {Object} data - Additional data
   */
  static warn(message, data = null) {
    const formattedMessage = formatMessage(LOG_LEVELS.WARN, message, data);
    console.warn(formattedMessage);
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {Object} data - Additional data
   */
  static info(message, data = null) {
    const formattedMessage = formatMessage(LOG_LEVELS.INFO, message, data);
    console.log(formattedMessage);
  }

  /**
   * Log debug message (in development or when LOG_LEVEL=debug)
   * @param {string} message - Debug message
   * @param {Object} data - Additional data
   */
  static debug(message, data = null) {
    if (process.env.NODE_ENV === ENV.DEVELOPMENT || process.env.LOG_LEVEL === 'debug') {
      const formattedMessage = formatMessage(LOG_LEVELS.DEBUG, message, data);
      console.log(formattedMessage);
    }
  }
}

module.exports = Logger;
