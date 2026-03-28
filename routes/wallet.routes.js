/**
 * Wallet Routes
 * Defines all wallet-related API endpoints
 */

const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const {
  getBalance,
  getHistory,
  getTopupHistory,
  requestWithdraw,
  cancelWithdraw,
  addBalance,
  addBalanceBulk
} = require('../controllers/wallet.controller');

const router = express.Router();

router.get(
  '/balance',
  authenticate,
  getBalance
);

router.get(
  '/history',
  authenticate,
  getHistory
);

router.get(
  '/topup-history',
  authenticate,
  getTopupHistory
);

router.post(
  '/withdraw',
  authenticate,
  [
    body('amountINR')
      .isFloat({ min: 0.01 })
      .withMessage('amountINR must be a positive number'),
    body('description')
      .optional()
      .trim()
      .isString()
      .withMessage('description must be a string')
  ],
  validate,
  requestWithdraw
);

router.post(
  '/withdraw/:transactionId/cancel',
  authenticate,
  cancelWithdraw
);

router.post(
  '/add-balance',
  authenticate,
  isAdmin,
  [
    body('userId')
      .notEmpty()
      .withMessage('userId is required'),
    body('amountINR')
      .isFloat({ min: 0.01 })
      .withMessage('amountINR must be a positive number'),
    body('description')
      .notEmpty()
      .trim()
      .withMessage('description is required')
  ],
  validate,
  addBalance
);

router.post(
  '/add-balance-bulk',
  authenticate,
  isAdmin,
  [
    body('userIds')
      .isArray({ min: 1 })
      .withMessage('userIds must be a non-empty array'),
    body('userIds.*')
      .notEmpty()
      .withMessage('Each userId must be a non-empty string'),
    body('amountINR')
      .isFloat({ min: 0.01 })
      .withMessage('amountINR must be a positive number'),
    body('description')
      .notEmpty()
      .trim()
      .withMessage('description is required')
  ],
  validate,
  addBalanceBulk
);

module.exports = router;
