/**
 * Payment Verification Service
 * Handles automatic payment verification without manual file uploads
 */

const WalletHistory = require('../models/WalletHistory.model');
const BankStatementTransaction = require('../models/BankStatementTransaction.model');
const walletService = require('./wallet.service');
const { PAYMENT } = require('../constants');
const Logger = require('../utils/logger');
const { normalizeUTR, isAmountMatch, calculateAmountDifference } = require('../utils/bankStatement.helper');

/** Cron runs only for current day; UTRs from last UTR_CRON_WINDOW_MINUTES only; exclude after UTR_CRON_CHECK_LIMIT checks. */
const getCronEligiblePendingQuery = () => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const lastWindow = new Date(now.getTime() - PAYMENT.UTR_CRON_WINDOW_MINUTES * 60 * 1000);
  return {
    type: 'topup',
    status: 'fail',
    utr: { $ne: null, $exists: true },
    paymentVerified: false,
    createdAt: { $gte: startOfToday },
    verifiedAt: { $gte: lastWindow },
    $or: [
      { utrCronCheckCount: { $exists: false } },
      { utrCronCheckCount: { $lt: PAYMENT.UTR_CRON_CHECK_LIMIT } }
    ]
  };
};

/**
 * Auto-verify payment by UTR (when user confirms with UTR)
 * Main verification method - trusts user-provided UTR
 * Includes fraud protection: amount limits and duplicate checks
 * @param {string} qrCodeId - QR code ID
 * @param {string} utr - UTR number
 * @param {number} amountINR - Amount in INR (for validation)
 * @param {boolean} autoVerify - Whether to auto-verify or just store UTR
 * @returns {Promise<Object>} Verification result
 */
const autoVerifyByUTR = async (qrCodeId, utr, amountINR, autoVerify = false) => {
  try {
    const transaction = await WalletHistory.findOne({
      qrCodeId: qrCodeId,
      type: 'topup',
      status: 'fail' // Only pending transactions
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const utrTrimmed = normalizeUTR(utr);

    Logger.debug('USER PAYMENT SUBMITTED', { utr: utrTrimmed, amountINR });

    // Fraud protection: Check amount limits
    if (amountINR > PAYMENT.MAX_AUTO_VERIFY_AMOUNT) {
      // Large amounts require manual verification
      transaction.utr = utrTrimmed;
      transaction.paymentVerified = false;
      transaction.verifiedBy = 'user';
      transaction.verifiedAt = new Date();
      await transaction.save();

      return {
        verified: false,
        transaction: transaction,
        message: `Amount exceeds auto-verify limit (₹${PAYMENT.MAX_AUTO_VERIFY_AMOUNT}). Admin verification required.`,
        requiresManualVerification: true
      };
    }

    // Check for duplicate UTR
    const existingUTR = await WalletHistory.findOne({
      utr: utrTrimmed,
      _id: { $ne: transaction._id },
      status: 'success'
    });

    if (existingUTR) {
      throw new Error('This UTR has already been used for another verified transaction');
    }

    // Store UTR and mark as submitted by user
    transaction.utr = utrTrimmed;
    transaction.paymentVerified = false; // Always false until email matches
    transaction.verifiedBy = 'user';
    transaction.verifiedAt = new Date();
    await transaction.save();

    return {
      verified: false,
      transaction: transaction,
      message: 'UTR submitted successfully. Payment will be verified once bank confirmation is received (usually within 2-5 minutes).'
    };
  } catch (error) {
    Logger.error('Error in auto-verify by UTR', { errName: error.name });
    throw error;
  }
};

/**
 * Verify payment from webhook (bank notification)
 * @param {Object} webhookData - Webhook data from bank
 * @param {string} webhookData.utr - UTR number
 * @param {number} webhookData.amount - Amount in INR
 * @param {string} webhookData.status - Payment status (success/failed)
 * @param {string} webhookData.reference - Bank reference
 * @returns {Promise<Object>} Verification result
 */
const verifyFromWebhook = async (webhookData) => {
  const { utr, amount, status, reference } = webhookData;

  if (!utr) {
    throw new Error('UTR is required in webhook data');
  }

  const utrTrimmed = normalizeUTR(utr);

  try {
    // Find transaction with matching UTR and amount
    const transaction = await WalletHistory.findOne({
      utr: utrTrimmed,
      type: 'topup',
      status: 'fail',
      amountINR: {
        $gte: amount - 0.01,
        $lte: amount + 0.01
      }
    }).populate('userId', 'name email');

    if (!transaction) {
      return {
        verified: false,
        message: 'No matching transaction found',
        utr: utrTrimmed
      };
    }

    if (status === 'success' || status === 'completed') {
      // Verify transaction
      const result = await walletService.updateTransactionStatus(
        transaction._id.toString(),
        'success',
        'system'
      );

      transaction.paymentVerified = true;
      transaction.verifiedBy = 'system';
      transaction.verifiedAt = new Date();
      if (reference) {
        transaction.bankReference = reference;
      }
      await transaction.save();

      return {
        verified: true,
        transaction: result.transaction,
        wallet: result.wallet,
        message: 'Payment verified from webhook'
      };
    } else {
      // Payment failed
      transaction.status = 'fail';
      transaction.paymentVerified = false;
      await transaction.save();

      return {
        verified: false,
        transaction: transaction,
        message: 'Payment failed according to webhook'
      };
    }
  } catch (error) {
    Logger.error('Error verifying from webhook', { errName: error.name });
    throw error;
  }
};

/**
 * Auto-verify pending transactions (called by scheduled job)
 * This checks for transactions that have UTR and can be auto-verified
 * @param {Object} options - Options for auto-verification
 * @param {boolean} [options.forCron] - If true: current day, UTR in last UTR_CRON_WINDOW_MINUTES, utrCronCheckCount < UTR_CRON_CHECK_LIMIT; increments on each check
 * @param {boolean} [options.autoVerifyAll] - If true (and !forCron), verify all pending with UTR
 * @param {number} [options.maxAgeHours] - If !forCron and !autoVerifyAll: only verify transactions older than X hours (default: 1)
 * @returns {Promise<Object>} Verification results
 */
const autoVerifyPending = async (options = {}) => {
  const { forCron = false, autoVerifyAll = false, maxAgeHours = 1 } = options;

  try {
    let query;
    if (forCron) {
      query = getCronEligiblePendingQuery();
    } else {
      query = { type: 'topup', status: 'fail', utr: { $ne: null, $exists: true }, paymentVerified: false };
      if (!autoVerifyAll) {
        const minAge = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
        query.createdAt = { $lte: minAge };
      }
    }

    const pendingTransactions = await WalletHistory.find(query)
      .populate('userId', 'name email')
      .lean();

    const results = {
      checked: pendingTransactions.length,
      verified: 0,
      failed: 0,
      errors: []
    };

    if (PAYMENT.AUTO_VERIFY_ENABLED && pendingTransactions.length > 0) {
      // Optimize: Fetch all relevant bank statement transactions in one go
      const pendingUtrs = pendingTransactions.map(t => t.utr);
      const bankStatementTransactions = await BankStatementTransaction.find({
        utr: { $in: pendingUtrs },
        processed: false
      }).lean();

      // Create a map for quick lookup
      const bankTxnMap = new Map();
      bankStatementTransactions.forEach(bt => {
        const key = `${bt.utr}_${bt.amount}`;
        if (!bankTxnMap.has(key)) bankTxnMap.set(key, bt);
      });

      for (const txn of pendingTransactions) {
        try {
          if (forCron) {
            await WalletHistory.updateOne({ _id: txn._id }, { $inc: { utrCronCheckCount: 1 } });
          }
          const amount = txn.amountINR;
          // Note: tolerance check might be slightly more complex with a map, 
          // but usually amount is exact. For tolerance, we could iterate bankTxnMap keys.
          let matchedBankTxn = null;
          
          // Try exact match first
          matchedBankTxn = bankTxnMap.get(`${txn.utr}_${amount}`);
          
          // If no exact match and tolerance enabled, look for matches within range
          if (!matchedBankTxn && PAYMENT.AMOUNT_TOLERANCE > 0) {
            for (const bt of bankStatementTransactions) {
              if (bt.utr === txn.utr && isAmountMatch(bt.amount, amount, PAYMENT.AMOUNT_TOLERANCE)) {
                matchedBankTxn = bt;
                break;
              }
            }
          }

          if (matchedBankTxn) {
            const verifyResult = await autoVerifyFromBankStatement(
              txn.utr,
              matchedBankTxn.amount,
              matchedBankTxn._id.toString()
            );

            if (verifyResult.verified) {
              results.verified++;
              await BankStatementTransaction.updateOne(
                { _id: matchedBankTxn._id },
                { 
                  $set: { 
                    processed: true, 
                    matchedTransactionId: txn._id, 
                    processedAt: new Date() 
                  } 
                }
              );
              // Remove from map to avoid double matching
              bankTxnMap.delete(`${matchedBankTxn.utr}_${matchedBankTxn.amount}`);
            } else {
              results.failed++;
              results.errors.push({
                transactionId: txn._id,
                error: verifyResult.message || 'Verification failed'
              });
            }
          } else {
            results.failed++;
          }
        } catch (error) {
          Logger.error(`Error verifying transaction ${txn._id}:`, error);
          results.failed++;
          results.errors.push({
            transactionId: txn._id,
            error: error.message
          });
        }
      }
    }

    return results;
  } catch (error) {
    Logger.error('Error in auto-verify pending', { errName: error.name });
    throw error;
  }
};

/**
 * Verify payment from external API (for bank API integration)
 * @param {string} utr - UTR number
 * @param {number} amount - Amount in INR
 * @param {string} bankReference - Bank reference
 * @returns {Promise<Object>} Verification result
 */
const verifyFromExternalAPI = async (utr, amount, bankReference = null) => {
  const utrTrimmed = normalizeUTR(utr);

  try {
    const transaction = await WalletHistory.findOne({
      utr: utrTrimmed,
      type: 'topup',
      status: 'fail',
      amountINR: {
        $gte: amount - 0.01,
        $lte: amount + 0.01
      }
    }).populate('userId', 'name email');

    if (!transaction) {
      return {
        verified: false,
        message: 'No matching transaction found',
        utr: utrTrimmed
      };
    }

    // Verify transaction
    const result = await walletService.updateTransactionStatus(
      transaction._id.toString(),
      'success',
      'system'
    );

    transaction.paymentVerified = true;
    transaction.verifiedBy = 'system';
    transaction.verifiedAt = new Date();
    if (bankReference) {
      transaction.bankReference = bankReference;
    }
    await transaction.save();

    return {
      verified: true,
      transaction: result.transaction,
      wallet: result.wallet,
      message: 'Payment verified from external API'
    };
  } catch (error) {
    Logger.error('Error verifying from external API', { errName: error.name });
    throw error;
  }
};

/**
 * Auto-verify payment from bank statement transaction
 * @param {string} utr - UTR number
 * @param {number} amount - Amount in INR
 * @param {string} bankStatementMatchId - Bank statement transaction ID
 * @returns {Promise<Object>} Verification result
 */
const autoVerifyFromBankStatement = async (utr, amount, bankStatementMatchId = null) => {
  const utrTrimmed = normalizeUTR(utr);

  try {
    // Find transaction with matching UTR and amount
    const transaction = await WalletHistory.findOne({
      utr: utrTrimmed,
      type: 'topup',
      status: 'fail',
      amountINR: {
        $gte: amount - PAYMENT.AMOUNT_TOLERANCE,
        $lte: amount + PAYMENT.AMOUNT_TOLERANCE
      }
    }).populate('userId', 'name email');

    if (!transaction) {
      return {
        verified: false,
        message: 'No matching transaction found',
        utr: utrTrimmed
      };
    }

    Logger.debug('TRANSACTION MATCH FOUND (AUTO-VERIFYING)', { utr: utrTrimmed, amount, transactionId: transaction._id });

    // Check for duplicate UTR in successful transactions
    const existingUTR = await WalletHistory.findOne({
      utr: utrTrimmed,
      _id: { $ne: transaction._id },
      status: 'success'
    });

    if (existingUTR) {
      // Flag for review - duplicate UTR
      transaction.flaggedForReview = true;
      transaction.verificationAttempts = (transaction.verificationAttempts || 0) + 1;
      await transaction.save();

      return {
        verified: false,
        transaction: transaction,
        message: 'Duplicate UTR detected - flagged for manual review',
        flagged: true
      };
    }

    // Check amount mismatch (beyond tolerance)
    const transactionAmount = transaction.amountINR;
    if (!isAmountMatch(amount, transactionAmount, PAYMENT.AMOUNT_TOLERANCE)) {
      // Flag for review - amount mismatch
      transaction.flaggedForReview = true;
      transaction.verificationAttempts = (transaction.verificationAttempts || 0) + 1;
      await transaction.save();

      return {
        verified: false,
        transaction: transaction,
        message: `Amount mismatch detected (expected: ₹${transaction.amountINR}, received: ₹${amount}) - flagged for manual review`,
        flagged: true
      };
    }

    // Verify transaction
    const result = await walletService.updateTransactionStatus(
      transaction._id.toString(),
      'success',
      'system'
    );

    transaction.paymentVerified = true;
    transaction.verifiedBy = 'system';
    transaction.verifiedAt = new Date();
    if (bankStatementMatchId) {
      transaction.bankStatementMatchId = bankStatementMatchId;
    }
    await transaction.save();

    Logger.info('Auto-verified payment from bank statement', { transactionId: transaction._id });

    return {
      verified: true,
      transaction: result.transaction,
      wallet: result.wallet,
      message: 'Payment auto-verified from bank statement'
    };
  } catch (error) {
    Logger.error('Error auto-verifying from bank statement:', error);
    throw error;
  }
};

/**
 * Match and verify pending transactions with bank statement transactions
 * @param {Object} [options] - Options
 * @param {boolean} [options.fromCron] - If true, only current day, UTR in last UTR_CRON_WINDOW_MINUTES, utrCronCheckCount < UTR_CRON_CHECK_LIMIT; increments utrCronCheckCount on check
 * @returns {Promise<Object>} Matching and verification results
 */
const matchAndVerifyPendingTransactions = async (options = {}) => {
  const { fromCron = false } = options;
  try {
    // Get unprocessed bank statement transactions
    const bankTransactions = await BankStatementTransaction.find({
      processed: false
    }).limit(100); // Process in batches

    if (bankTransactions.length === 0) {
      return {
        checked: 0,
        matched: 0,
        verified: 0,
        flagged: 0,
        errors: []
      };
    }

    const results = {
      checked: bankTransactions.length,
      matched: 0,
      verified: 0,
      flagged: 0,
      errors: []
    };

    // Get pending transactions with UTR (cron: only current day, last 30 min, <5 checks)
    const pendingQuery = fromCron
      ? getCronEligiblePendingQuery()
      : { type: 'topup', status: 'fail', utr: { $ne: null, $exists: true }, paymentVerified: false };
    const pendingTransactions = await WalletHistory.find(pendingQuery).lean();

    // Match bank transactions with pending transactions
    Logger.debug('MATCHING PROCESS STARTED', { bankCount: bankTransactions.length, pendingCount: pendingTransactions.length });

    for (const bankTxn of bankTransactions) {
      Logger.debug('CHECKING EMAIL UTR', { bankTxnId: bankTxn._id });

      try {
        // Find matching pending transaction
        const matchingTxn = pendingTransactions.find(ptxn => {
          const isUtrMatch = ptxn.utr === bankTxn.utr;
          const amount = ptxn.amountINR;
          const amountMatches = isAmountMatch(bankTxn.amount, amount, PAYMENT.AMOUNT_TOLERANCE);
          if (isUtrMatch && amountMatches) return true;
          return false;
        });

        if (matchingTxn) {
          results.matched++;
          // fromCron: utrCronCheckCount is incremented only in autoVerifyPending to avoid double-count in same run
          Logger.debug('MATCH CONFIRMED, auto-verifying', { matchingTxnId: matchingTxn._id, bankTxnId: bankTxn._id });

          // Auto-verify if enabled
          if (PAYMENT.AUTO_VERIFY_ENABLED) {
            const verifyResult = await autoVerifyFromBankStatement(
              bankTxn.utr,
              bankTxn.amount,
              bankTxn._id.toString()
            );

            if (verifyResult.verified) {
              results.verified++;
              // Mark bank statement transaction as processed
              bankTxn.processed = true;
              bankTxn.matchedTransactionId = matchingTxn._id;
              bankTxn.processedAt = new Date();
              await bankTxn.save();
            } else if (verifyResult.flagged) {
              results.flagged++;
              Logger.debug('Transaction flagged for review', { message: verifyResult.message });
              // Still mark as processed to avoid reprocessing
              bankTxn.processed = true;
              bankTxn.matchedTransactionId = matchingTxn._id;
              bankTxn.processedAt = new Date();
              await bankTxn.save();
            }
          } else {
            // Just mark as matched, don't verify
            Logger.debug('AUTO_VERIFY disabled - matched but not verified');
            bankTxn.processed = true;
            bankTxn.matchedTransactionId = matchingTxn._id;
            bankTxn.processedAt = new Date();
            await bankTxn.save();
          }
        } else {
          Logger.debug('NO MATCH FOUND for bank UTR', { bankTxnId: bankTxn._id });
        }
      } catch (error) {
        Logger.error('Error processing bank transaction', { bankTransactionId: bankTxn._id, errName: error.name });
        results.errors.push({
          bankTransactionId: bankTxn._id,
          error: error.message
        });
      }
    }

    return results;
  } catch (error) {
    Logger.error('Error in matchAndVerifyPendingTransactions:', error);
    throw error;
  }
};

/**
 * Process bank statement queue (called by scheduler)
 * @param {Object} [options] - Options
 * @param {boolean} [options.fromCron] - If true, only cron-eligible pendings (current day, UTR last 30 min, <5 checks)
 * @returns {Promise<Object>} Processing results
 */
const processBankStatementQueue = async (options = {}) => {
  try {
    const matchResults = await matchAndVerifyPendingTransactions(options);
    return matchResults;
  } catch (error) {
    Logger.error('Error processing bank statement queue:', error);
    throw error;
  }
};

module.exports = {
  autoVerifyByUTR,
  verifyFromWebhook,
  autoVerifyPending,
  verifyFromExternalAPI,
  autoVerifyFromBankStatement,
  matchAndVerifyPendingTransactions,
  processBankStatementQueue
};

