/**
 * Me Routes
 * Single endpoint for returning users to fetch personalized data in one hit.
 */

const express = require('express');
const { query } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { getMe } = require('../controllers/profile.controller');

const router = express.Router();

router.get(
  '/',
  authenticate,
  [
    query('status')
      .optional()
      .isIn(['upcoming', 'live', 'completed', 'pendingResult', 'cancelled'])
      .withMessage('Invalid status')
  ],
  validate,
  getMe
);

module.exports = router;
