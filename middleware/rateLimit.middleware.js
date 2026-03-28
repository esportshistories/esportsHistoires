/**
 * Rate Limiting Middleware
 * Provides different rate limiting configurations for different API endpoints
 */

const rateLimit = require('express-rate-limit');
const { HTTP_STATUS, API_RATE_LIMITS } = require('../constants');

/**
 * Custom handler for rate limit errors
 * Returns response in the same format as other API responses
 */
const rateLimitHandler = (req, res) => {
  return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
    status: HTTP_STATUS.TOO_MANY_REQUESTS,
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  });
};

/**
 * General API rate limiter
 * Applied to most endpoints - 100 requests per 15 minutes
 * DISABLED: All rate limiting is currently disabled
 */
const generalRateLimiter = rateLimit({
  ...API_RATE_LIMITS.GENERAL,
  handler: rateLimitHandler,
  skip: () => true // Skip all requests - rate limiting disabled
});

/**
 * Strict rate limiter for sensitive endpoints
 * Applied to auth, wallet, admin routes - 20 requests per 15 minutes
 * DISABLED: All rate limiting is currently disabled
 */
const strictRateLimiter = rateLimit({
  ...API_RATE_LIMITS.STRICT,
  handler: rateLimitHandler,
  skip: () => true // Skip all requests - rate limiting disabled
});

/**
 * Very strict rate limiter for critical operations
 * Applied to login, password reset, etc. - 5 requests per 15 minutes
 * DISABLED: All rate limiting is currently disabled
 */
const veryStrictRateLimiter = rateLimit({
  ...API_RATE_LIMITS.VERY_STRICT,
  handler: rateLimitHandler,
  skip: () => true // Skip all requests - rate limiting disabled
});

module.exports = {
  generalRateLimiter,
  strictRateLimiter,
  veryStrictRateLimiter
};

