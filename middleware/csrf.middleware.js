/**
 * CSRF Protection Middleware
 * Implements CSRF protection using double-submit cookie pattern
 * Requires CSRF token in X-CSRF-Token header for state-changing requests
 */

const csrf = require('csrf');
const { HTTP_STATUS, MESSAGES } = require('../constants');
const Logger = require('../utils/logger');

// Create CSRF instance
const tokens = new csrf();

/**
 * Generate CSRF token and set it in cookie
 * Should be called on GET requests to provide token to client
 */
const generateCSRFToken = (req, res, next) => {
  try {
    // Generate secret if not exists in session/cookie
    let secret = req.cookies?._csrfSecret;
    
    if (!secret) {
      secret = tokens.secretSync();
      // Set secret in httpOnly cookie
      // Use 'lax' for cross-origin support (allows OAuth redirects and cross-origin requests)
      // Use 'none' with secure in production HTTPS for full cross-origin support
      const isProduction = process.env.NODE_ENV === 'production';
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction, // Only send over HTTPS in production
        sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-origin in production, 'lax' for dev
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      };
      // Only set domain in production for subdomain sharing
      if (isProduction) {
        cookieOptions.domain = '.gaminghuballday.buzz';
      }
      res.cookie('_csrfSecret', secret, cookieOptions);
    }

    // Generate token from secret
    const token = tokens.create(secret);
    
    // Set token in cookie (for double-submit pattern)
    // Use 'lax' for cross-origin support (allows OAuth redirects and cross-origin requests)
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: false, // Must be readable by JavaScript
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-origin in production, 'lax' for dev
      maxAge: 24 * 60 * 60 * 1000
    };
    // Only set domain in production for subdomain sharing
    if (isProduction) {
      cookieOptions.domain = '.gaminghuballday.buzz';
    }
    res.cookie('XSRF-TOKEN', token, cookieOptions);

    // Also set in response header for convenience
    res.setHeader('X-CSRF-Token', token);

    // Attach token to request for use in responses
    req.csrfToken = token;

    next();
  } catch (error) {
    Logger.error('CSRF token generation error', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate CSRF token'
    });
  }
};

/**
 * Verify CSRF token for state-changing requests
 * Checks token in X-CSRF-Token header against cookie
 */
const verifyCSRF = (req, res, next) => {
  try {
    // Skip CSRF check for safe methods (GET, HEAD, OPTIONS)
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
      return next();
    }

    // Get secret from cookie
    const secret = req.cookies?._csrfSecret;
    if (!secret) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        status: HTTP_STATUS.FORBIDDEN,
        success: false,
        message: 'CSRF token missing. Please refresh the page and try again.'
      });
    }

    // Get token from header (preferred) or cookie
    const token = req.headers['x-csrf-token'] || req.headers['xsrf-token'] || req.cookies?.['XSRF-TOKEN'];
    
    if (!token) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        status: HTTP_STATUS.FORBIDDEN,
        success: false,
        message: 'CSRF token required. Please include X-CSRF-Token header.'
      });
    }

    // Verify token
    if (!tokens.verify(secret, token)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        status: HTTP_STATUS.FORBIDDEN,
        success: false,
        message: 'Invalid CSRF token. Please refresh the page and try again.'
      });
    }

    next();
  } catch (error) {
    Logger.error('CSRF verification error', error);
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      status: HTTP_STATUS.FORBIDDEN,
      success: false,
      message: 'CSRF verification failed'
    });
  }
};

module.exports = {
  generateCSRFToken,
  verifyCSRF
};

