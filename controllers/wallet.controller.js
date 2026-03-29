/**
 * Wallet Controller
 * Handles wallet-related API requests
 */

const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS, MESSAGES } = require('../constants');
const walletService = require('../services/wallet.service');
const User = require('../models/User.model');
const { transformTransactionStatuses } = require('../utils/transaction.helper');

/**
 * Get wallet balance, max withdrawable (balance + daily caps; host per-request limits), and deposit/withdraw totals.
 * GET /api/wallet/balance
 */
const getBalance = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const user = await User.findById(userId).select('role').lean();
  const isHost = user && user.role === 'host';

  const [wallet, withdrawLimit] = await Promise.all([
    walletService.getWalletBalance(userId),
    walletService.getMaxWithdrawable(userId, isHost)
  ]);

  const payload = {
    balanceINR: wallet.balanceINR,
    updatedAt: wallet.updatedAt,
    maxWithdrawableINR: withdrawLimit.maxWithdrawableINR,
    totalDepositsINR: withdrawLimit.totalDepositsINR,
    totalWithdrawnINR: withdrawLimit.totalWithdrawnINR,
    dailyLimit: withdrawLimit.dailyLimit
  };
  if (withdrawLimit.isHost) {
    payload.hostWithdrawalLimit = {
      minINR: withdrawLimit.hostMinINR,
      maxINR: withdrawLimit.hostMaxINR,
      maxPerDay: withdrawLimit.dailyLimit.maxCount
    };
  }

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.WALLET_BALANCE_RETRIEVED, payload);
});

/**
 * Request withdrawal (cash-out). Cashfree Payout enabled → UPI transfer; else pending for admin.
 * Optional body `upiId` overrides profile payout UPI for this request.
 * POST /api/wallet/withdraw
 */
const requestWithdraw = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { amountINR, description, upiId } = req.body;

  if (!amountINR || amountINR <= 0) {
    return res.badRequest('amountINR is required and must be greater than 0');
  }

  const desc = (description && typeof description === 'string' && description.trim()) ? description.trim() : 'Withdrawal request';

  try {
    const result = await walletService.withdrawBalance(userId, amountINR, desc, {
      upiId: upiId != null ? String(upiId).trim() : undefined
    });

    const msg =
      result.mode === 'automatic'
        ? 'Withdrawal completed. UPI payout processed.'
        : result.mode === 'pending_payout'
          ? 'Withdrawal submitted. Payout is processing; you will be updated when it completes.'
          : 'Withdrawal request submitted. An admin will process it.';

    res.success(HTTP_STATUS.OK, msg, {
      balanceINR: result.wallet.balanceINR,
      updatedAt: result.wallet.updatedAt,
      mode: result.mode,
      cashfreePayout: result.cashfreePayout || undefined,
      transaction: {
        _id: result.transaction._id,
        type: result.transaction.type,
        amountINR: result.transaction.amountINR,
        description: result.transaction.description,
        status: result.transaction.status || 'pending',
        upiId: result.transaction.upiId || undefined,
        bankReference: result.transaction.bankReference || undefined,
        createdAt: result.transaction.createdAt
      }
    });
  } catch (error) {
    if (error.message && error.message.includes('Amount must be greater than 0')) {
      return res.badRequest(error.message);
    }
    if (error.message && error.message.includes('Insufficient balance')) {
      return res.badRequest(error.message);
    }
    if (error.message && error.message.includes('Daily withdrawal')) {
      return res.badRequest(error.message);
    }
    if (error.message && (error.message.includes('UPI ID is required') || error.message.includes('not available'))) {
      return res.badRequest(error.message);
    }
    if (
      error.message &&
      (error.message.includes('Minimum withdrawal') || error.message.includes('Maximum withdrawal'))
    ) {
      return res.badRequest(error.message);
    }
    if (Number(error.statusCode) >= 400 && (error.cashfree || error.statusCode === 502)) {
      return res.error(
        HTTP_STATUS.BAD_GATEWAY,
        error.message || 'Payout failed. Your balance has been refunded.',
        { code: 'WITHDRAW_PAYOUT_FAILED' },
        error
      );
    }
    throw error;
  }
});

/**
 * Get wallet history
 * GET /api/wallet/history
 * Tournament-related only: join (entry fee), reward (winning), refund (tournament cancelled).
 */
const getHistory = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const limit = parseInt(req.query.limit) || 50;
  const skip = parseInt(req.query.skip) || 0;
  const type = req.query.type || null; // Optional filter: join, reward, refund

  if (type && !['join', 'reward', 'refund'].includes(type)) {
    return res.badRequest('Invalid type. Use: join, reward, or refund');
  }

  const history = await walletService.getWalletHistory(userId, limit, skip, type);
  
  // Transform response: For topup transactions, if status='fail' but not verified by admin, show as 'pending'
  const transformedHistory = transformTransactionStatuses(history);
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.WALLET_HISTORY_RETRIEVED, {
    history: transformedHistory,
    total: transformedHistory.length,
    limit,
    skip
  });
});

/**
 * Get top-up history for user
 * GET /api/wallet/topup-history
 * Transforms pending transactions (status='fail' but verifiedBy != 'admin') to show status='pending'
 *
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - type: 'topup' | 'withdrawal' - filter by type (omit for both)
 * - date: Single date YYYY-MM-DD - filter by that day
 * - fromDate, toDate: Date range YYYY-MM-DD - filter between dates (use together or combine with date)
 */
const getTopupHistory = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const type = req.query.type || null;
  const date = req.query.date || null;
  const fromDate = req.query.fromDate || null;
  const toDate = req.query.toDate || null;

  // Validate pagination
  if (page < 1) {
    return res.badRequest('Page must be at least 1');
  }
  if (limit < 1 || limit > 100) {
    return res.badRequest('Limit must be between 1 and 100');
  }

  // Validate type
  if (type && !['topup', 'withdrawal'].includes(type)) {
    return res.badRequest('Invalid type. Use: topup or withdrawal');
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (date && !dateRegex.test(date)) {
    return res.badRequest('Invalid date format. Must be YYYY-MM-DD');
  }
  if (fromDate && !dateRegex.test(fromDate)) {
    return res.badRequest('Invalid fromDate format. Must be YYYY-MM-DD');
  }
  if (toDate && !dateRegex.test(toDate)) {
    return res.badRequest('Invalid toDate format. Must be YYYY-MM-DD');
  }

  const skip = (page - 1) * limit;
  const filters = { type, date, fromDate, toDate };

  const result = await walletService.getTopupHistory(userId, limit, skip, filters);
  
  // Transform response: If status='fail' but not verified by admin, show as 'pending'
  const transformedHistory = transformTransactionStatuses(result.history);
  
  // Calculate pagination metadata
  const totalPages = Math.ceil(result.total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOPUP_HISTORY_RETRIEVED, {
    history: transformedHistory,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: result.total,
      itemsPerPage: limit,
      hasNextPage,
      hasPrevPage
    },
    filters: { type: type || null, date: date || null, fromDate: fromDate || null, toDate: toDate || null }
  });
});

/**
 * Cancel a pending withdrawal request (User only)
 * POST /api/wallet/withdraw/:transactionId/cancel
 */
const cancelWithdraw = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { transactionId } = req.params;

  if (!transactionId) {
    return res.badRequest('transactionId is required');
  }

  const { wallet, transaction } = await walletService.cancelWithdraw(userId, transactionId);

  res.success(HTTP_STATUS.OK, 'Withdrawal request cancelled successfully. Amount has been refunded to your wallet.', {
    balanceINR: wallet.balanceINR,
    updatedAt: wallet.updatedAt,
    transaction: {
      _id: transaction._id,
      type: transaction.type,
      amountINR: transaction.amountINR,
      description: transaction.description,
      status: transaction.status,
      verifiedAt: transaction.verifiedAt
    }
  });
});

/**
 * Add balance (Admin only - can be used for topup)
 * POST /api/wallet/add-balance
 */
const addBalance = asyncHandler(async (req, res) => {
  const { userId, amountINR, description } = req.body;
  const adminId = req.userId; // Admin who is adding the balance
  
  if (!userId || !amountINR || !description) {
    return res.badRequest('userId, amountINR, and description are required');
  }

  if (amountINR <= 0) {
    return res.badRequest('Amount must be greater than 0');
  }

  // Add 'admin' as addedBy to distinguish manual admin addition
  const finalDescription = description || `Manual balance addition by admin`;
  const wallet = await walletService.addBalance(userId, amountINR, finalDescription, 'success', 'admin');
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.BALANCE_ADDED, {
    balanceINR: wallet.balanceINR,
    updatedAt: wallet.updatedAt
  });
});

/**
 * Add balance to multiple users at once (Admin only - Bulk top-up)
 * POST /api/wallet/add-balance-bulk
 */
const addBalanceBulk = asyncHandler(async (req, res) => {
  const { userIds, amountINR, description } = req.body;
  
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.badRequest('userIds must be a non-empty array');
  }

  if (!amountINR || !description) {
    return res.badRequest('amountINR and description are required');
  }

  if (amountINR <= 0) {
    return res.badRequest('Amount must be greater than 0');
  }

  const result = await walletService.addBalanceBulk(userIds, amountINR, description);
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.BALANCE_ADDED_BULK, {
    totalProcessed: result.totalProcessed,
    totalSuccessful: result.totalSuccessful,
    totalFailed: result.totalFailed,
    successful: result.successful,
    failed: result.failed.length > 0 ? result.failed : undefined
  });
});

module.exports = {
  getBalance,
  requestWithdraw,
  cancelWithdraw,
  getHistory,
  getTopupHistory,
  addBalance,
  addBalanceBulk
};
