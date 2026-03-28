/**
 * Payment Service
 * Handles custom payment operations with QR code generation
 * No payment gateway integration - manual verification required
 */

const crypto = require('crypto');
const QRCode = require('qrcode');
const WalletHistory = require('../models/WalletHistory.model');
const { PAYMENT } = require('../constants');
const Logger = require('../utils/logger');

/**
 * Generate a unique payment ID
 * @returns {string} Unique payment ID
 */
const generatePaymentId = () => {
  return `pay_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
};

/**
 * Generate a unique QR code ID
 * @returns {string} Unique QR code ID
 */
const generateQRCodeId = () => {
  return `qr_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
};

/**
 * Check if QR code ID is unique (doesn't exist in database)
 * @param {string} qrCodeId - QR code ID to check
 * @returns {Promise<boolean>} True if unique (doesn't exist)
 */
const checkQRCodeUniqueness = async (qrCodeId) => {
  try {
    const existing = await WalletHistory.findOne({ qrCodeId: qrCodeId });
    return !existing;
  } catch (error) {
    Logger.error('Error checking QR code uniqueness:', error);
    throw error;
  }
};

/**
 * Generate a unique QR code ID that doesn't exist in database
 * @param {number} maxAttempts - Maximum attempts to generate unique ID (default: 10)
 * @returns {Promise<string>} Unique QR code ID
 */
const generateUniqueQRCodeId = async (maxAttempts = 10) => {
  for (let i = 0; i < maxAttempts; i++) {
    const qrCodeId = generateQRCodeId();
    const isUnique = await checkQRCodeUniqueness(qrCodeId);
    if (isUnique) {
      return qrCodeId;
    }
    // If not unique, wait a bit and try again
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Failed to generate unique QR code ID after maximum attempts');
};

/**
 * Get count of active QR codes for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Count of active QR codes
 */
const getActiveQRCodeCount = async (userId) => {
  try {
    const now = new Date();
    const count = await WalletHistory.countDocuments({
      userId: userId,
      type: 'topup',
      qrCodeId: { $ne: null },
      status: 'fail', // Only count pending transactions
      $or: [
        { qrCodeExpiresAt: null },
        { qrCodeExpiresAt: { $gt: now } }
      ]
    });
    return count;
  } catch (error) {
    Logger.error('Error getting active QR code count:', error);
    throw error;
  }
};

/**
 * Check if user has exceeded QR code rate limit
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if rate limit exceeded
 */
const checkQRCodeRateLimit = async (userId) => {
  try {
    const rateLimit = PAYMENT.QR_CODE_RATE_LIMIT || 10; // Default: 10 QR codes per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const count = await WalletHistory.countDocuments({
      userId: userId,
      type: 'topup',
      qrCodeGeneratedAt: { $gte: oneHourAgo }
    });
    
    return count >= rateLimit;
  } catch (error) {
    Logger.error('Error checking QR code rate limit:', error);
    throw error;
  }
};

/**
 * Expire old QR codes that are past their expiration time
 * @returns {Promise<number>} Number of QR codes expired
 */
const expireOldQRCodes = async () => {
  try {
    const now = new Date();
    const result = await WalletHistory.updateMany(
      {
        type: 'topup',
        status: 'fail',
        qrCodeExpiresAt: { $lte: now },
        qrCodeExpiresAt: { $ne: null }
      },
      {
        $set: {
          qrCodeExpiresAt: now // Set to now to mark as expired
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      Logger.info(`Expired ${result.modifiedCount} old QR codes`);
    }
    
    return result.modifiedCount;
  } catch (error) {
    Logger.error('Error expiring old QR codes:', error);
    throw error;
  }
};

/**
 * Create UPI payment link
 * Format: upi://pay?pa=<UPI_ID>&pn=<MERCHANT_NAME>&am=<AMOUNT>&cu=INR&tn=<TRANSACTION_NOTE>
 * @param {Object} options - Payment options
 * @param {string} options.upiId - UPI ID (e.g., merchant@oksbi)
 * @param {string} options.merchantName - Merchant name
 * @param {number} options.amount - Amount in INR (optional for variable amount)
 * @param {string} options.transactionNote - Transaction note/description
 * @param {string} options.transactionId - Unique transaction ID
 * @returns {string} UPI payment link
 */
const createUPIPaymentLink = (options) => {
  const { upiId, merchantName, amount, transactionNote, transactionId } = options;
  
  if (!upiId) {
    throw new Error('UPI ID is required. Please set PAYMENT_UPI_ID in environment variables.');
  }

  if (!merchantName) {
    throw new Error('Merchant name is required. Please set PAYMENT_MERCHANT_NAME in environment variables.');
  }

  // Build UPI payment link
  let upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}`;
  
  if (amount && amount > 0) {
    upiLink += `&am=${amount.toFixed(2)}`;
  }
  
  upiLink += `&cu=INR`;
  
  const note = transactionNote || `Payment for ${transactionId || 'transaction'}`;
  upiLink += `&tn=${encodeURIComponent(note)}`;
  
  if (transactionId) {
    upiLink += `&tr=${encodeURIComponent(transactionId)}`;
  }

  return upiLink;
};

/**
 * Create QR code for payment
 * @param {Object} options - QR code options
 * @param {string} options.upiId - UPI ID
 * @param {string} options.merchantName - Merchant name
 * @param {number} options.amount - Amount in INR (optional)
 * @param {string} options.transactionNote - Transaction note
 * @param {string} options.transactionId - Transaction ID
 * @returns {Promise<Object>} QR code data with image and string
 */
const createQRCode = async (options) => {
  try {
    const upiLink = createUPIPaymentLink(options);

    if (options.skipQrMedia) {
      return {
        qrCodeId: options.qrCodeId || generateQRCodeId(),
        qrString: upiLink,
        qrImage: null,
        qrSVG: null,
        upiLink,
        amount: options.amount || null,
        expiresAt: options.expiresAt || null
      };
    }

    // Generate QR code as data URL (base64 image)
    const qrCodeDataURL = await QRCode.toDataURL(upiLink, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 300
    });

    // Also generate QR code as SVG string (for better scalability)
    const qrCodeSVG = await QRCode.toString(upiLink, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 300
    });

    return {
      qrCodeId: options.qrCodeId || generateQRCodeId(),
      qrString: upiLink,
      qrImage: qrCodeDataURL,
      qrSVG: qrCodeSVG,
      upiLink: upiLink,
      amount: options.amount || null,
      expiresAt: options.expiresAt || null
    };
  } catch (error) {
    Logger.error('Error creating QR code', error);
    throw error;
  }
};

/**
 * Verify payment (manual verification - no automatic gateway verification)
 * This is a placeholder for manual verification by admin or user confirmation
 * @param {string} qrCodeId - QR code ID
 * @param {string} paymentId - Payment ID (optional, for tracking)
 * @returns {Promise<Object>} Verification result
 */
const verifyPayment = async (qrCodeId, paymentId = null) => {
  // Since there's no payment gateway, verification must be done manually
  // This function just returns the QR code details for manual checking
  return {
    qrCodeId,
    paymentId: paymentId || generatePaymentId(),
    verified: false, // Always false - requires manual verification
    message: 'Payment verification requires manual confirmation. Please contact admin or confirm payment manually.'
  };
};

/**
 * Check if QR code is expired
 * @param {Date|number} expiresAt - Expiration date/timestamp
 * @returns {boolean} True if expired
 */
const isQRCodeExpired = (expiresAt) => {
  if (!expiresAt) {
    return false; // No expiration if not set
  }
  
  const expiryTime = expiresAt instanceof Date ? expiresAt.getTime() : expiresAt;
  const currentTime = Date.now();
  
  return currentTime >= expiryTime;
};

/**
 * Generate payment receipt/confirmation code
 * @returns {string} Receipt code
 */
const generateReceiptCode = () => {
  return `RCPT${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

module.exports = {
  generatePaymentId,
  generateQRCodeId,
  generateUniqueQRCodeId,
  checkQRCodeUniqueness,
  getActiveQRCodeCount,
  checkQRCodeRateLimit,
  expireOldQRCodes,
  createUPIPaymentLink,
  createQRCode,
  verifyPayment,
  isQRCodeExpired,
  generateReceiptCode
};

