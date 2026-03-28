/**
 * Geocode proxy routes (Nominatim reverse — server-side only).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('express-validator');
const path = require('path');
const { validate } = require(path.join(__dirname, '../middleware/validation.middleware'));
const { authenticate } = require(path.join(__dirname, '../middleware/auth.middleware'));
const { getReverseGeocode } = require(path.join(__dirname, '../controllers/geocode.controller'));
const { API_RATE_LIMITS, HTTP_STATUS } = require(path.join(__dirname, '../constants'));

const router = express.Router();

const geocodeRateLimiter = rateLimit({
  ...API_RATE_LIMITS.GEOCODE,
  handler: (req, res) =>
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
      success: false,
      message: API_RATE_LIMITS.GEOCODE.message
    }),
  skip: () => false
});

router.get(
  '/reverse',
  authenticate,
  geocodeRateLimiter,
  [
    query('lat')
      .notEmpty()
      .withMessage('lat is required')
      .isFloat({ min: -90, max: 90 })
      .withMessage('lat must be between -90 and 90'),
    query('lon')
      .notEmpty()
      .withMessage('lon is required')
      .isFloat({ min: -180, max: 180 })
      .withMessage('lon must be between -180 and 180'),
    query('acceptLanguage').optional().isString().isLength({ max: 80 })
  ],
  validate,
  getReverseGeocode
);

module.exports = router;
