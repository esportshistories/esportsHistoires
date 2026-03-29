/**
 * Payment Routes
 * Defines all payment-related API endpoints
 */

const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const {
  createQRCode,
  initiateDeposit,
  confirmPayment,
  getQRCodeStatus,
  closeQRCode,
  handlePaymentWebhook
} = require('../controllers/payment.controller');
const {
  createCashfreeOrder,
  verifyCashfreePayment,
  cashfreeWebhook
} = require('../controllers/cashfree.controller');
const { requestWithdraw } = require('../controllers/wallet.controller');
const { normalizeWithdrawBody } = require('../middleware/normalizeWithdraw.middleware');

const router = express.Router();

const withdrawBodyValidators = [
  body('amountINR')
    .isFloat({ min: 0.01 })
    .withMessage('amountINR or amount must be a positive number'),
  body('description')
    .optional()
    .trim()
    .isString()
    .withMessage('description must be a string'),
  body('upiId')
    .optional()
    .trim()
    .matches(/^[\w.-]+@[\w.-]+$/)
    .withMessage('upiId / vpa / upi must be a valid UPI ID (e.g. name@bank)')
];

const upiDepositBodyValidators = [
  body('amountINR')
    .optional()
    .isFloat({ min: 1 })
    .withMessage('amountINR must be at least 1 INR if provided'),
  body('fixedAmount')
    .optional()
    .isBoolean()
    .withMessage('fixedAmount must be a boolean'),
  body('description')
    .optional()
    .trim(),
  body('payerUPI')
    .optional()
    .trim()
    .matches(/^[\w.-]+@[\w]+$/)
    .withMessage('Please provide a valid payer UPI ID (format: name@bank)')
];

router.post(
  '/create-qr',
  authenticate,
  [
    ...upiDepositBodyValidators,
    body('includeQr')
      .optional()
      .isBoolean()
      .withMessage('includeQr must be a boolean')
  ],
  validate,
  createQRCode
);

router.post(
  '/deposit',
  authenticate,
  upiDepositBodyValidators,
  validate,
  initiateDeposit
);

router.post(
  '/confirm',
  authenticate,
  [
    body('qrCodeId')
      .notEmpty()
      .withMessage('qrCodeId is required')
      .trim(),
    body('utr')
      .notEmpty()
      .withMessage('utr is required')
      .trim()
      .isLength({ min: 8, max: 20 })
      .withMessage('UTR must be 8-20 characters long'),
    body('paymentProof')
      .optional()
      .trim()
  ],
  validate,
  confirmPayment
);

router.get(
  '/qr-status/:qrCodeId',
  authenticate,
  [
    param('qrCodeId')
      .notEmpty()
      .withMessage('qrCodeId is required')
      .trim()
  ],
  validate,
  getQRCodeStatus
);

router.post(
  '/close-qr/:qrCodeId',
  authenticate,
  [
    param('qrCodeId')
      .notEmpty()
      .withMessage('qrCodeId is required')
      .trim()
  ],
  validate,
  closeQRCode
);

router.post(
  '/webhook',
  handlePaymentWebhook
);

/**
 * Alias of POST /api/wallet/withdraw — pending withdrawal for admin manual payout.
 */
router.post(
  '/withdraw',
  authenticate,
  normalizeWithdrawBody,
  withdrawBodyValidators,
  validate,
  requestWithdraw
);

router.post(
  '/cashfree/order',
  authenticate,
  [
    body('amountINR')
      .isFloat({ min: 1 })
      .withMessage('amountINR must be at least 1')
  ],
  validate,
  createCashfreeOrder
);

router.post(
  '/cashfree/verify',
  authenticate,
  [body('orderId').notEmpty().trim().withMessage('orderId is required')],
  validate,
  verifyCashfreePayment
);

// Cashfree PG webhooks: raw body (wired in server.js)
router.post('/cashfree/webhook', cashfreeWebhook);

module.exports = router;
