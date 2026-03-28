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
  createRazorpayOrder,
  verifyRazorpayPayment,
  razorpayWebhook
} = require('../controllers/razorpay.controller');

const router = express.Router();

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

router.post(
  '/razorpay/order',
  authenticate,
  [
    body('amountINR')
      .isFloat({ min: 1 })
      .withMessage('amountINR must be at least 1')
  ],
  validate,
  createRazorpayOrder
);

router.post(
  '/razorpay/verify',
  authenticate,
  [
    body('orderId').notEmpty().trim().withMessage('orderId is required'),
    body('paymentId').notEmpty().trim().withMessage('paymentId is required'),
    body('signature').notEmpty().trim().withMessage('signature is required')
  ],
  validate,
  verifyRazorpayPayment
);

// Razorpay webhook must be raw-body verified (wired in server.js)
router.post('/razorpay/webhook', razorpayWebhook);

module.exports = router;
