/**
 * Payment Controller
 * Handles custom payment operations with QR code generation
 */

const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS, MESSAGES, PAYMENT } = require('../constants');
const paymentService = require('../services/payment.service');
const paymentVerificationService = require('../services/paymentVerification.service');
const walletService = require('../services/wallet.service');
const WalletHistory = require('../models/WalletHistory.model');
const User = require('../models/User.model');
const { getDisplayStatus } = require('../utils/transaction.helper');
const Logger = require('../utils/logger');
const { normalizeUTR, validateUTR } = require('../utils/bankStatement.helper');
const { roundInr } = require('../utils/inr');

const PAYER_UPI_PATTERN = /^[\w.-]+@[\w]+$/;

/**
 * Shared: UPI top-up / deposit intent (QR + image, or link-only for manual UPI apps).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ forceIncludeQr?: boolean }} opts - If forceIncludeQr is boolean, overrides body includeQr
 */
const initiateUpiDepositFlow = async (req, res, opts = {}) => {
  const userId = req.userId;
  const { amountINR: rawAmountInr, fixedAmount = true, description, includeQr: includeQrRaw, payerUPI } =
    req.body;

  const includeQr =
    typeof opts.forceIncludeQr === 'boolean' ? opts.forceIncludeQr : includeQrRaw !== false;

  const payerUpiTrimmed =
    payerUPI != null && String(payerUPI).trim() !== '' ? String(payerUPI).trim() : null;
  if (payerUpiTrimmed && !PAYER_UPI_PATTERN.test(payerUpiTrimmed)) {
    return res.badRequest('Please provide a valid payer UPI ID (format: name@bank)');
  }

  if (fixedAmount && (rawAmountInr == null || rawAmountInr === '')) {
    return res.badRequest(
      includeQr ? 'amountINR is required for fixed amount QR code' : 'amountINR is required for deposit'
    );
  }

  const creditInr = fixedAmount ? roundInr(rawAmountInr) : 0;
  if (fixedAmount && (!Number.isFinite(creditInr) || creditInr < PAYMENT.MIN_AMOUNT_INR)) {
    return res.badRequest(`Minimum amount is ${PAYMENT.MIN_AMOUNT_INR} INR`);
  }

  const upiId = process.env.PAYMENT_UPI_ID;
  const merchantName = process.env.PAYMENT_MERCHANT_NAME || 'BooyahX Gaming';

  if (!upiId) {
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Payment system is not configured. Please contact administrator.',
      { code: 'PAYMENT_NOT_CONFIGURED' }
    );
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.notFound(MESSAGES.ERROR.USER_NOT_FOUND);
    }

    const rateLimitExceeded = await paymentService.checkQRCodeRateLimit(userId);
    if (rateLimitExceeded) {
      return res.badRequest(
        `You have exceeded the payment request limit. Please wait before creating a new request.`
      );
    }

    const activeQRCount = await paymentService.getActiveQRCodeCount(userId);
    if (activeQRCount >= 5) {
      return res.badRequest(
        `You have ${activeQRCount} active payment requests. Please complete or close existing ones before creating a new one.`
      );
    }

    let qrCodeId;
    try {
      qrCodeId = await paymentService.generateUniqueQRCodeId();
    } catch (error) {
      Logger.error('Error generating unique QR code ID:', error);
      return res.error(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Failed to create payment request. Please try again.',
        { code: 'QR_GENERATION_FAILED' },
        error
      );
    }

    const paymentId = paymentService.generatePaymentId();
    const receiptCode = paymentService.generateReceiptCode();
    const expiresAt = new Date(Date.now() + PAYMENT.QR_CODE_EXPIRY_MS);

    const transactionNote =
      description || `Payment for ${fixedAmount ? `₹${creditInr}` : 'top-up'} - ${receiptCode}`;

    const qrCodeData = await paymentService.createQRCode({
      upiId,
      merchantName,
      amount: fixedAmount ? creditInr : null,
      transactionNote,
      transactionId: paymentId,
      qrCodeId,
      expiresAt,
      skipQrMedia: !includeQr
    });

    const paymentMethod = includeQr ? 'upi_qr' : 'upi_link';
    const internalDescription = includeQr ? 'Top-up via QR code' : 'Deposit via UPI (manual)';

    const transaction = await WalletHistory.create({
      userId,
      type: 'topup',
      amountINR: fixedAmount ? creditInr : 0,
      description: internalDescription,
      status: 'fail',
      addedBy: 'user',
      paymentId,
      qrCodeId,
      receiptCode,
      paymentMethod,
      ...(payerUpiTrimmed ? { payerUpiId: payerUpiTrimmed } : {}),
      qrCodeExpiresAt: expiresAt,
      qrCodeGeneratedAt: new Date(),
      paymentVerified: false,
      verificationAttempts: 0,
      flaggedForReview: false
    });

    const okTitle = includeQr ? 'QR code created successfully' : 'Deposit request created';
    const okMessage = includeQr
      ? 'QR code generated. Make payment and confirm with UTR to submit for admin approval.'
      : 'Open any UPI app, pay using merchant UPI or the link below (or scan from another device). Then confirm with UTR for admin approval.';

    res.success(HTTP_STATUS.OK, okTitle, {
      qrCodeId,
      depositRequestId: qrCodeId,
      paymentId,
      receiptCode,
      merchantUpi: upiId,
      merchantName,
      qrCodeImage: qrCodeData.qrImage,
      qrCodeSVG: qrCodeData.qrSVG,
      qrCodeString: qrCodeData.qrString,
      upiLink: qrCodeData.upiLink,
      amountINR: fixedAmount ? creditInr : null,
      creditINR: fixedAmount ? creditInr : null,
      fixedAmount,
      description: transactionNote,
      expiresAt,
      transactionId: transaction._id,
      paymentMethod,
      payerUPI: payerUpiTrimmed || undefined,
      includeQr,
      status: 'pending',
      message: okMessage
    });
  } catch (error) {
    Logger.error('Error creating UPI payment / deposit request', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to create payment request. Please try again.',
      null,
      error
    );
  }
};

/**
 * Create QR code for payment
 * POST /api/payment/create-qr
 * Body: optional includeQr (default true); false = link + merchant UPI only (no QR image).
 * Optional payerUPI — UPI the user paid from (stored for admin).
 */
const createQRCode = asyncHandler(async (req, res) => {
  return initiateUpiDepositFlow(req, res, {});
});

/**
 * Deposit request (manual UPI / link — no QR image). Same confirm/status/close APIs as QR flow (use qrCodeId).
 * POST /api/payment/deposit
 */
const initiateDeposit = asyncHandler(async (req, res) => {
  return initiateUpiDepositFlow(req, res, { forceIncludeQr: false });
});

/**
 * Confirm payment (user confirms after making payment)
 * POST /api/payment/confirm
 */
const confirmPayment = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { qrCodeId, utr, paymentProof } = req.body;

  if (!qrCodeId) {
    return res.badRequest('qrCodeId is required');
  }

  if (!utr) {
    return res.badRequest('UTR (Unique Transaction Reference) is required. Please provide the UTR number from your payment receipt.');
  }

  // Validate UTR format
  const utrTrimmed = normalizeUTR(utr);
  if (!validateUTR(utrTrimmed, PAYMENT.UTR.MIN_LENGTH, PAYMENT.UTR.MAX_LENGTH)) {
    return res.badRequest(`Invalid UTR format. UTR should be ${PAYMENT.UTR.MIN_LENGTH}-${PAYMENT.UTR.MAX_LENGTH} characters long.`);
  }

  try {
    // Find transaction
    const transaction = await WalletHistory.findOne({
      qrCodeId: qrCodeId,
      userId: userId
    });

    if (!transaction) {
      return res.notFound('Transaction not found for this QR code');
    }

    // Check if already verified
    if (transaction.status === 'success') {
      const wallet = await walletService.getWalletBalance(userId);
      return res.success(HTTP_STATUS.OK, 'Payment already confirmed', {
        transactionId: transaction._id,
        qrCodeId: qrCodeId,
        utr: transaction.utr,
        amountINR: transaction.amountINR,
        balanceINR: wallet.balanceINR,
        status: 'success'
      });
    }

    // Check if QR code is expired
    if (transaction.qrCodeExpiresAt && paymentService.isQRCodeExpired(transaction.qrCodeExpiresAt)) {
      return res.badRequest('QR code has expired. Please create a new payment request.');
    }

    // Increment verification attempts
    transaction.verificationAttempts = (transaction.verificationAttempts || 0) + 1;

    // Check if UTR already exists in another transaction (duplicate check)
    // CRITICAL: Check across ALL statuses (not just success) to prevent multiple pending credits for one UTR
    const existingUTRTransaction = await WalletHistory.findOne({
      utr: utrTrimmed,
      _id: { $ne: transaction._id },
      status: { $in: ['success', 'fail'] } // 'fail' includes pending user-submitted UTRs
    });

    if (existingUTRTransaction) {
      // If it exists and was already successful, or is another pending/fail transaction
      const isActuallySuccess = existingUTRTransaction.status === 'success';
      const errorMessage = isActuallySuccess 
        ? 'This UTR has already been used for another verified transaction.'
        : 'This UTR has already been submitted in another transaction and is under review.';
      
      // Flag for review if duplicate UTR
      transaction.flaggedForReview = true;
      await transaction.save();
      return res.badRequest(`${errorMessage} Please check your UTR number. This transaction has been flagged for admin review.`);
    }

    // Check if auto-verification is enabled (from environment variable)
    const AUTO_VERIFY_ENABLED = PAYMENT.AUTO_VERIFY_ENABLED;
    
    if (AUTO_VERIFY_ENABLED) {
      // First, try to match with bank statement transactions (if available)
      try {
        const BankStatementTransaction = require('../models/BankStatementTransaction.model');
        const bankTxn = await BankStatementTransaction.findOne({
          utr: utrTrimmed,
          processed: false,
          amount: {
            $gte: transaction.amountINR - PAYMENT.AMOUNT_TOLERANCE,
            $lte: transaction.amountINR + PAYMENT.AMOUNT_TOLERANCE
          }
        });

        if (bankTxn) {
          // Match found in bank statement - auto-verify
          const verifyResult = await paymentVerificationService.autoVerifyFromBankStatement(
            utrTrimmed,
            bankTxn.amount,
            bankTxn._id.toString()
          );

          if (verifyResult.verified) {
            const wallet = await walletService.getWalletBalance(userId);
            
            // Mark bank statement transaction as processed
            bankTxn.processed = true;
            bankTxn.matchedTransactionId = transaction._id;
            bankTxn.processedAt = new Date();
            await bankTxn.save();
            
            return res.success(HTTP_STATUS.OK, 'Payment verified automatically from bank statement! Balance has been added to your wallet.', {
              transactionId: transaction._id,
              qrCodeId: qrCodeId,
              utr: utrTrimmed,
              amountINR: transaction.amountINR,
              balanceINR: wallet.balanceINR,
              status: 'success',
              verified: true,
              verifiedBy: 'system',
              message: 'Payment verified automatically from bank statement. Balance has been added to your wallet.'
            });
          }
        }
      } catch (bankMatchError) {
        Logger.warn('Bank statement matching failed, trying direct auto-verify:', bankMatchError);
        // Continue to direct auto-verify
      }

      // If no bank statement match, try direct auto-verify (trust user-provided UTR)
      try {
        const verifyResult = await paymentVerificationService.autoVerifyByUTR(
          qrCodeId,
          utrTrimmed,
          transaction.amountINR, // Pass amount for fraud protection
          true // auto-verify
        );

        if (verifyResult.verified) {
          const wallet = await walletService.getWalletBalance(userId);
          
          // WebSocket broadcast is already handled in walletService.updateTransactionStatus
          // No need to broadcast again here
          
          return res.success(HTTP_STATUS.OK, 'Payment verified automatically! Balance has been added to your wallet.', {
            transactionId: transaction._id,
            qrCodeId: qrCodeId,
            utr: utrTrimmed,
            amountINR: transaction.amountINR,
            balanceINR: wallet.balanceINR,
            status: 'success',
            verified: true,
            message: 'Payment verified automatically. Balance has been added to your wallet.'
          });
        } else if (verifyResult.requiresManualVerification) {
          // Large amount - requires manual verification
          transaction.utr = utrTrimmed;
          transaction.paymentVerified = false;
          transaction.verifiedBy = 'user';
          transaction.verifiedAt = new Date();
          await transaction.save();
          
          return res.success(HTTP_STATUS.OK, verifyResult.message, {
            transactionId: transaction._id,
            qrCodeId: qrCodeId,
            utr: utrTrimmed,
            amountINR: transaction.amountINR,
            status: 'pending_verification',
            message: verifyResult.message
          });
        }
      } catch (error) {
        Logger.error('Auto-verification failed, falling back to manual', error);
        // Fall through to manual verification
      }
    }

    // Manual verification flow (default)
    transaction.utr = utrTrimmed;
    transaction.paymentVerified = false; // Still needs admin verification
    transaction.verifiedBy = 'user';
    transaction.verifiedAt = new Date();
    
    // Store payment proof if provided (screenshot, etc.)
    if (paymentProof) {
      transaction.description += ` | Proof: ${paymentProof}`;
    }
    
    await transaction.save();

    // Broadcast transaction update via WebSocket (status still pending, but UTR added)
    try {
      const { broadcastTransactionUpdate } = require('../services/websocket.service');
      const wallet = await walletService.getWalletBalance(userId);
      broadcastTransactionUpdate(userId, transaction, wallet, 'updated');
    } catch (wsError) {
      Logger.warn('Error broadcasting transaction update via WebSocket', wsError);
    }

    res.success(HTTP_STATUS.OK, 'Payment confirmation received with UTR. Admin will verify and process your payment shortly.', {
      transactionId: transaction._id,
      qrCodeId: qrCodeId,
      utr: transaction.utr,
      amountINR: transaction.amountINR,
      status: 'pending_verification',
      message: 'Your payment confirmation with UTR has been received. An admin will verify and process your payment shortly.'
    });
  } catch (error) {
    Logger.error('Error confirming payment', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to confirm payment. Please try again.',
      null,
      error
    );
  }
});

/**
 * Get QR code status
 * GET /api/payment/qr-status/:qrCodeId
 */
const getQRCodeStatus = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { qrCodeId } = req.params;

  if (!qrCodeId) {
    return res.badRequest('qrCodeId is required');
  }

  try {
    // Find transaction by QR code ID
    const transaction = await WalletHistory.findOne({
      qrCodeId: qrCodeId,
      userId: userId
    });

    if (!transaction) {
      return res.notFound('Transaction not found for this QR code');
    }

    // Check if QR code is expired
    const isExpired = transaction.qrCodeExpiresAt 
      ? paymentService.isQRCodeExpired(transaction.qrCodeExpiresAt)
      : false;

    // Transform status for user-facing display using helper function
    const displayStatus = getDisplayStatus(transaction);

    res.success(HTTP_STATUS.OK, 'QR code status retrieved successfully', {
      transactionId: transaction._id,
      qrCodeId: qrCodeId,
      paymentId: transaction.paymentId,
      receiptCode: transaction.receiptCode,
      status: displayStatus, // User-facing status (pending/success/fail)
      originalStatus: transaction.status, // Original status for reference
      amountINR: transaction.amountINR,
      paymentMethod: transaction.paymentMethod,
      paymentVerified: transaction.paymentVerified,
      verifiedBy: transaction.verifiedBy,
      verifiedAt: transaction.verifiedAt,
      utr: transaction.utr,
      bankReference: transaction.bankReference,
      isExpired: isExpired,
      expiresAt: transaction.qrCodeExpiresAt,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt
    });
  } catch (error) {
    Logger.error('Error getting QR code status', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to get QR code status. Please try again.',
      null,
      error
    );
  }
});

/**
 * Close/expire a QR code
 * POST /api/payment/close-qr/:qrCodeId
 */
const closeQRCode = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { qrCodeId } = req.params;

  if (!qrCodeId) {
    return res.badRequest('qrCodeId is required');
  }

  try {
    // Verify transaction belongs to user
    const transaction = await WalletHistory.findOne({
      qrCodeId: qrCodeId,
      userId: userId
    });

    if (!transaction) {
      return res.notFound('Transaction not found for this QR code');
    }

    // Check if already successful
    if (transaction.status === 'success') {
      return res.badRequest('Cannot close QR code for a successful payment');
    }

    // Expire the QR code
    transaction.qrCodeExpiresAt = new Date();
    await transaction.save();

    res.success(HTTP_STATUS.OK, 'QR code closed successfully', {
      qrCodeId: qrCodeId,
      expiresAt: transaction.qrCodeExpiresAt,
      message: 'QR code has been expired and can no longer be used for payment'
    });
  } catch (error) {
    Logger.error('Error closing QR code', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to close QR code. Please try again.',
      null,
      error
    );
  }
});

/**
 * Verify payment (Admin only - for manual verification)
 * POST /api/payment/verify/:transactionId
 * This endpoint should be in admin routes, but keeping here for reference
 */
const verifyPaymentAdmin = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { verified } = req.body; // true to verify, false to reject

  if (typeof verified !== 'boolean') {
    return res.badRequest('verified must be a boolean (true/false)');
  }

  try {
    // Find transaction
    const transaction = await WalletHistory.findById(transactionId);

    if (!transaction) {
      return res.notFound('Transaction not found');
    }

    if (transaction.type !== 'topup') {
      return res.badRequest('Can only verify top-up transactions');
    }

    // Update transaction status using wallet service
    const result = await walletService.updateTransactionStatus(
      transactionId,
      verified ? 'success' : 'fail'
    );

    // Update verification fields
    transaction.paymentVerified = verified;
    transaction.verifiedBy = 'admin';
    transaction.verifiedAt = new Date();
    await transaction.save();

    res.success(HTTP_STATUS.OK, verified ? 'Payment verified successfully' : 'Payment verification rejected', {
      transactionId: transaction._id,
      status: transaction.status,
      paymentVerified: transaction.paymentVerified,
      amountINR: transaction.amountINR,
      balanceINR: result.wallet.balanceINR
    });
  } catch (error) {
    Logger.error('Error verifying payment', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to verify payment. Please try again.',
      null,
      error
    );
  }
});

/**
 * Payment webhook handler (for bank notifications)
 * POST /api/payment/webhook
 * Bank can call this when payment is received
 */
const handlePaymentWebhook = asyncHandler(async (req, res) => {
  const { utr, amount, status, reference, signature } = req.body;

  // Basic validation
  if (!utr || !amount) {
    return res.badRequest('UTR and amount are required');
  }

  // Verify webhook signature if configured
  const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;
  if (WEBHOOK_SECRET && signature) {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify({ utr, amount, status }))
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        status: HTTP_STATUS.UNAUTHORIZED,
        success: false,
        message: 'Invalid webhook signature'
      });
    }
  }

  try {
    const result = await paymentVerificationService.verifyFromWebhook({
      utr,
      amount: parseFloat(amount),
      status: status || 'success',
      reference
    });

    if (result.verified) {
      res.success(HTTP_STATUS.OK, 'Payment verified from webhook', {
        verified: true,
        transactionId: result.transaction._id,
        utr: utr,
        amount: amount
      });
    } else {
      res.success(HTTP_STATUS.OK, 'Webhook received but no matching transaction found', {
        verified: false,
        utr: utr,
        message: result.message
      });
    }
  } catch (error) {
    Logger.error('Error processing payment webhook', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to process webhook',
      null,
      error
    );
  }
});

module.exports = {
  createQRCode,
  initiateDeposit,
  confirmPayment,
  getQRCodeStatus,
  closeQRCode,
  verifyPaymentAdmin,
  handlePaymentWebhook
};
