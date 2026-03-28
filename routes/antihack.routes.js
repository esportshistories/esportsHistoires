/**
 * Antihack / ban-check proxy routes
 * Frontend can hit these to check user ban history via Garena FF API
 */

const express = require('express');
const { query } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { getCheckBanned } = require('../controllers/antihack.controller');

const router = express.Router();

router.get(
  '/check-banned',
  [
    query('uid')
      .notEmpty()
      .withMessage('uid is required')
      .trim()
      .isLength({ min: 1, max: 32 })
      .withMessage('uid must be 1–32 characters'),
  ],
  validate,
  getCheckBanned
);

module.exports = router;
