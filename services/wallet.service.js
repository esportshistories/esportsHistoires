  /**
 * Wallet Service
 * Handles wallet operations: add balance, deduct balance, add reward
 */

const mongoose = require('mongoose');
const Wallet = require('../models/Wallet.model');
const WalletHistory = require('../models/WalletHistory.model');
const User = require('../models/User.model');
const UserPaymentInfo = require('../models/UserPaymentInfo.model');
const { roundInr } = require('../utils/inr');
const { HTTP_STATUS } = require('../constants');
const Logger = require('../utils/logger');
const { runWithTransaction } = require('../utils/runWithTransaction');
const { transformTransactionStatus } = require('../utils/transaction.helper');
const { broadcastWalletUpdate, broadcastTransactionUpdate, broadcastWalletHistoryUpdate } = require('./websocket.service');

/** Wagering limit: user can withdraw only this percentage of total deposits (default 50%) */
const WITHDRAWAL_WAGERING_PERCENT = Math.min(100, Math.max(0, parseInt(process.env.WITHDRAWAL_WAGERING_PERCENT, 10) || 50));

/** Daily withdrawal limit: max count per day (default 3) */
const WITHDRAWAL_DAILY_MAX_COUNT = Math.max(1, parseInt(process.env.WITHDRAWAL_DAILY_MAX_COUNT, 10) || 3);

/** Daily withdrawal limit: max GC per day (default 500) */
const WITHDRAWAL_DAILY_MAX_GC = Math.max(1, parseInt(process.env.WITHDRAWAL_DAILY_MAX_GC, 10) || 500);

/** Host withdrawal: min GC per request (40), max GC per request (500), max 1 withdrawal per day */
const HOST_WITHDRAWAL_MIN_GC = Math.max(1, parseInt(process.env.HOST_WITHDRAWAL_MIN_GC, 10) || 40);
const HOST_WITHDRAWAL_MAX_GC = Math.max(1, parseInt(process.env.HOST_WITHDRAWAL_MAX_GC, 10) || 500);
const HOST_WITHDRAWAL_DAILY_MAX_COUNT = Math.max(1, parseInt(process.env.HOST_WITHDRAWAL_DAILY_MAX_COUNT, 10) || 1);

/** IST offset for daily limit (India) */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Format a UTC Date as ISO string in IST (e.g. 2026-02-21T21:00:00+05:30)
 * @param {Date|string} date - Date instance or ISO string
 * @returns {string|null} IST ISO string or null
 */
const toISTISOString = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const t = d.getTime();
  const ist = new Date(t + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const h = String(ist.getUTCHours()).padStart(2, '0');
  const min = String(ist.getUTCMinutes()).padStart(2, '0');
  const s = String(ist.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}:${s}+05:30`;
};

/**
 * Get start and end of current day in IST (for daily withdrawal limits)
 * @returns {{ start: Date, end: Date }} UTC dates for MongoDB query
 */
const getTodayISTRange = () => {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - IST_OFFSET_MS);
  return { start, end };
};

/**
 * Get or create wallet for user
 * @param {string} userId - User ID
 * @param {mongoose.ClientSession|null} session - Optional MongoDB session for transactions
 * @returns {Promise<Object>} Wallet document
 */
const getOrCreateWallet = async (userId, session = null) => {
  const opts = session ? { session } : {};
  let wallet = await Wallet.findOne({ userId }, null, opts);
  if (!wallet) {
    // Mongoose 9+: options (e.g. session) only apply when docs is an array — otherwise
    // the second argument is treated as a second document (empty {} caused ValidationError).
    const created = await Wallet.create([{ userId, balanceINR: 0 }], opts);
    wallet = Array.isArray(created) ? created[0] : created;
  }
  return wallet;
};

/**
 * Add balance to user wallet
 * @param {string} userId - User ID
 * @param {number} amountINR - Amount to add
 * @param {string} description - Transaction description
 * @param {string} status - Transaction status (success/fail), default: success
 * @param {string} addedBy - Source of addition: 'user' (self topup) or 'admin' (manual admin addition), default: 'user'
 * @returns {Promise<Object>} Updated wallet
 */
const addBalance = async (userId, amountINR, description, status = 'success', addedBy = 'user') => {
  const amt = roundInr(amountINR);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  if (status === 'success') {
    const { wallet, transaction } = await runWithTransaction(async (session) => {
      const w = await getOrCreateWallet(userId, session);
      w.balanceINR = roundInr((w.balanceINR || 0) + amt);
      await w.save({ session });
      const t = await WalletHistory.create([{ userId, type: 'topup', amountINR: amt, description, status: 'success', addedBy }], { session });
      return { wallet: w, transaction: Array.isArray(t) ? t[0] : t };
    });
    // Emit balance update so user UI updates immediately without refresh (topup/admin add)
    broadcastWalletUpdateHelper(userId.toString(), wallet, transaction, 'balance');
    broadcastWalletUpdateHelper(userId.toString(), wallet, transaction, 'history');
    return wallet;
  }

  // status !== 'success': only create history (single write, no transaction needed)
  await WalletHistory.create({ userId, type: 'topup', amountINR: amt, description, status, addedBy });
  return await getOrCreateWallet(userId);
};

/**
 * Deduct balance from user wallet
 * @param {string} userId - User ID
 * @param {number} amountINR - Amount to deduct
 * @param {string} description - Transaction description
 * @param {string} tournamentId - Optional tournament ID
 * @returns {Promise<Object>} Updated wallet
 */
const deductBalance = async (userId, amountINR, description, tournamentId = null) => {
  const amt = roundInr(amountINR);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  const { wallet, transaction } = await runWithTransaction(async (session) => {
    const w = await getOrCreateWallet(userId, session);
    if (w.balanceINR < amt) throw new Error('Insufficient balance');
    w.balanceINR = roundInr(w.balanceINR - amt);
    await w.save({ session });
    const t = await WalletHistory.create([{ userId, type: 'join', amountINR: amt, description, tournamentId }], { session });
    return { wallet: w, transaction: Array.isArray(t) ? t[0] : t };
  });
  broadcastWalletUpdateHelper(userId.toString(), wallet, transaction, 'balance');
  return wallet;
};

/**
 * Add reward to user wallet (auto-credited on submit-final-result)
 * @param {string} userId - User ID
 * @param {number} rewardGC - Reward amount
 * @param {string} description - Transaction description
 * @param {string} tournamentId - Tournament ID
 * @param {Object} metadata - Optional { position, participantCount } for history display
 * @returns {Promise<Object>} Updated wallet
 */
const addReward = async (userId, rewardGC, description, tournamentId, metadata = {}) => {
  const rAmt = roundInr(rewardGC);
  if (!Number.isFinite(rAmt) || rAmt <= 0) {
    throw new Error('Reward amount must be greater than 0');
  }

  const rewardData = {
    userId,
    type: 'reward',
    amountINR: rAmt,
    description,
    tournamentId
  };
  if (typeof metadata.position === 'number' && metadata.position >= 1) {
    rewardData.position = metadata.position;
  }
  if (typeof metadata.participantCount === 'number' && metadata.participantCount >= 0) {
    rewardData.tournamentParticipantCount = metadata.participantCount;
  }

  const { wallet, transaction } = await runWithTransaction(async (session) => {
    const w = await getOrCreateWallet(userId, session);
    w.balanceINR = roundInr((w.balanceINR || 0) + rAmt);
    await w.save({ session });
    const t = await WalletHistory.create([rewardData], { session });
    return { wallet: w, transaction: Array.isArray(t) ? t[0] : t };
  });
  broadcastWalletUpdateHelper(userId.toString(), wallet, transaction, 'history');
  return wallet;
};

/**
 * Refund entry fee to user wallet (when tournament is deleted)
 * @param {string} userId - User ID
 * @param {number} amountINR - Refund amount (entry fee)
 * @param {string} description - Transaction description
 * @param {string} tournamentId - Tournament ID
 * @returns {Promise<Object>} Updated wallet
 */
const refundEntryFee = async (userId, amountINR, description, tournamentId) => {
  const amount = roundInr(amountINR);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Refund amount must be greater than 0');
  }

  // Idempotency guard: prevent double-refund for same user + tournament
  if (tournamentId) {
    const existing = await WalletHistory.findOne({ userId, type: 'refund', tournamentId });
    if (existing) {
      Logger.warn('Refund already issued for this user and tournament — skipping duplicate', { userId, tournamentId });
      return await getOrCreateWallet(userId);
    }
  }

  const { wallet, transaction } = await runWithTransaction(async (session) => {
    const w = await getOrCreateWallet(userId, session);
    w.balanceINR = roundInr((w.balanceINR || 0) + amount);
    await w.save({ session });
    const t = await WalletHistory.create(
      [{ userId, type: 'refund', amountINR: amount, description, tournamentId }],
      { session }
    );
    return { wallet: w, transaction: Array.isArray(t) ? t[0] : t };
  });
  broadcastWalletUpdateHelper(userId.toString(), wallet, transaction, 'balance');
  broadcastWalletUpdateHelper(userId.toString(), wallet, transaction, 'history');
  return wallet;
};

/**
 * Get wallet balance for user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Wallet document
 */
const getWalletBalance = async (userId) => {
  return await getOrCreateWallet(userId);
};

/**
 * Get wallet balances for multiple users (Bulk fetch)
 * Useful for admin dashboard to avoid N+1 queries
 * @param {Array<string>} userIds - Array of User IDs
 * @returns {Promise<Map<string, number>>} Map of userId to balanceINR
 */
const getWalletsBalance = async (userIds) => {
  if (!userIds || userIds.length === 0) return new Map();

  const wallets = await Wallet.find({ 
    userId: { $in: userIds.map(id => new mongoose.Types.ObjectId(id)) } 
  }).lean();

  const balanceMap = new Map();
  wallets.forEach(w => {
    balanceMap.set(w.userId.toString(), w.balanceINR || 0);
  });

  return balanceMap;
};

/**
 * Get total amount user has deposited (successful topups only)
 * @param {string} userId - User ID
 * @returns {Promise<number>} Total deposit amount in GC
 */
const getTotalDeposits = async (userId) => {
  const result = await WalletHistory.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), type: 'topup', status: 'success' } },
    { $group: { _id: null, total: { $sum: '$amountINR' } } }
  ]);
  return (result[0] && result[0].total) ? result[0].total : 0;
};

/**
 * Get total amount user has withdrawn (only completed/success withdrawals count toward limit)
 * @param {string} userId - User ID
 * @returns {Promise<number>} Total withdrawn amount in GC
 */
const getTotalWithdrawn = async (userId) => {
  const result = await WalletHistory.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), type: 'withdrawal', status: 'success' } },
    { $group: { _id: null, total: { $sum: '$amountINR' } } }
  ]);
  return (result[0] && result[0].total) ? result[0].total : 0;
};

/**
 * Get today's withdrawal stats (count and total) - used for daily limits
 * Counts only pending and success withdrawals (fail/cancelled = refunded, slot is freed)
 * @param {string} userId - User ID
 * @returns {Promise<{ count: number, totalINR: number }>}
 */
const getTodayWithdrawalStats = async (userId) => {
  const { start, end } = getTodayISTRange();
  const result = await WalletHistory.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        type: 'withdrawal',
        status: { $in: ['pending', 'success'] },
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalINR: { $sum: '$amountINR' }
      }
    }
  ]);
  if (!result[0]) return { count: 0, totalINR: 0 };
  return { count: result[0].count, totalINR: result[0].totalINR };
};

/**
 * Get maximum amount user is allowed to withdraw using consolidated aggregation
 * @param {string} userId - User ID
 * @param {boolean} isHost - If true, apply host withdrawal limits (1 per day, min 40 max 500 per request)
 * @returns {Promise<Object>}
 */
const getMaxWithdrawable = async (userId, isHost = false) => {
  const { start, end } = getTodayISTRange();
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const dailyMaxCount = isHost ? HOST_WITHDRAWAL_DAILY_MAX_COUNT : WITHDRAWAL_DAILY_MAX_COUNT;
  const dailyMaxINR = isHost ? HOST_WITHDRAWAL_MAX_GC : WITHDRAWAL_DAILY_MAX_GC;

  const [wallet, stats] = await Promise.all([
    getOrCreateWallet(userId),
    WalletHistory.aggregate([
      { $match: { userId: userObjectId } },
      {
        $facet: {
          totalDeposits: [
            { $match: { type: 'topup', status: 'success' } },
            { $group: { _id: null, total: { $sum: '$amountINR' } } }
          ],
          totalWithdrawn: [
            { $match: { type: 'withdrawal', status: 'success' } },
            { $group: { _id: null, total: { $sum: '$amountINR' } } }
          ],
          todayStats: [
            { 
              $match: { 
                type: 'withdrawal', 
                status: { $in: ['pending', 'success'] },
                createdAt: { $gte: start, $lte: end }
              } 
            },
            { $group: { _id: null, count: { $sum: 1 }, totalINR: { $sum: '$amountINR' } } }
          ]
        }
      }
    ])
  ]);

  const totalDeposits = stats[0].totalDeposits[0]?.total || 0;
  const totalWithdrawn = stats[0].totalWithdrawn[0]?.total || 0;
  const todayCount = stats[0].todayStats[0]?.count || 0;
  const todayTotalINR = stats[0].todayStats[0]?.totalINR || 0;

  const balanceINR = wallet.balanceINR || 0;
  const limitFromDeposits = (totalDeposits * WITHDRAWAL_WAGERING_PERCENT) / 100;
  const remainingWagering = Math.max(0, limitFromDeposits - totalWithdrawn);
  const remainingDailyINR = Math.max(0, dailyMaxINR - todayTotalINR);
  const canWithdrawMoreToday = todayCount < dailyMaxCount;
  
  let maxWithdrawableINR = Math.min(balanceINR, remainingWagering);
  if (canWithdrawMoreToday) {
    maxWithdrawableINR = Math.min(maxWithdrawableINR, remainingDailyINR);
  } else {
    maxWithdrawableINR = 0; // Daily count limit reached
  }
  if (isHost && maxWithdrawableINR > HOST_WITHDRAWAL_MAX_GC) {
    maxWithdrawableINR = HOST_WITHDRAWAL_MAX_GC;
  }

  return {
    maxWithdrawableINR,
    totalDepositsINR: totalDeposits,
    totalWithdrawnINR: totalWithdrawn,
    balanceINR,
    dailyLimit: {
      count: todayCount,
      totalINR: todayTotalINR,
      maxCount: dailyMaxCount,
      maxINR: dailyMaxINR
    },
    isHost: isHost || undefined,
    hostMinINR: isHost ? HOST_WITHDRAWAL_MIN_GC : undefined,
    hostMaxINR: isHost ? HOST_WITHDRAWAL_MAX_GC : undefined
  };
};

/**
 * Withdraw balance (user cash-out). Enforces wagering limit: user can only withdraw up to
 * WITHDRAWAL_WAGERING_PERCENT of their total deposits (minus already withdrawn).
 * @param {string} userId - User ID
 * @param {number} amountINR - Amount to withdraw
 * @param {string} description - Transaction description (e.g. payout reference)
 * @returns {Promise<Object>} Updated wallet and transaction
 */
const withdrawBalance = async (userId, amountINR, description) => {
  const amt = roundInr(amountINR);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  const user = await User.findById(userId).select('role').lean();
  const isHost = user && user.role === 'host';

  if (isHost) {
    if (amt < HOST_WITHDRAWAL_MIN_GC) {
      throw new Error(`Minimum withdrawal for host is ₹${HOST_WITHDRAWAL_MIN_GC}.`);
    }
    if (amt > HOST_WITHDRAWAL_MAX_GC) {
      throw new Error(`Maximum withdrawal for host is ₹${HOST_WITHDRAWAL_MAX_GC} per request.`);
    }
  }

  const { maxWithdrawableINR, balanceINR, dailyLimit } = await getMaxWithdrawable(userId, isHost);
  if (balanceINR < amt) {
    throw new Error('Insufficient balance');
  }
  const dailyMaxCount = isHost ? HOST_WITHDRAWAL_DAILY_MAX_COUNT : WITHDRAWAL_DAILY_MAX_COUNT;
  const dailyMaxCap = isHost ? HOST_WITHDRAWAL_MAX_GC : WITHDRAWAL_DAILY_MAX_GC;
  if (dailyLimit.count >= dailyMaxCount) {
    throw new Error(
      `Daily withdrawal limit reached. You can make at most ${dailyMaxCount} withdrawal per day. Try again tomorrow.`
    );
  }
  if (dailyLimit.totalINR + amt > dailyMaxCap) {
    throw new Error(
      `Daily withdrawal limit exceeded. You can withdraw at most ₹${dailyMaxCap} per day. Already withdrawn ₹${dailyLimit.totalINR} today.`
    );
  }
  if (amt > maxWithdrawableINR) {
    throw new Error(
      `Withdrawal limit exceeded. You can withdraw at most ₹${maxWithdrawableINR} (${WITHDRAWAL_WAGERING_PERCENT}% of total deposits minus already withdrawn).`
    );
  }

  // Fetch user's UPI ID from profile so admin knows where to send the payment
  const paymentInfo = await UserPaymentInfo.findOne({ userId }).lean();
  const upiId = paymentInfo?.upiId || null;

  const { wallet, transaction } = await runWithTransaction(async (session) => {
    const w = await getOrCreateWallet(userId, session);
    if (w.balanceINR < amt) throw new Error('Insufficient balance');
    w.balanceINR = roundInr(w.balanceINR - amt);
    await w.save({ session });
    const t = await WalletHistory.create(
      [{ userId, type: 'withdrawal', amountINR: amt, description, status: 'pending', upiId }],
      { session }
    );
    return { wallet: w, transaction: Array.isArray(t) ? t[0] : t };
  });
  broadcastWalletUpdateHelper(userId.toString(), wallet, transaction, 'history');
  return { wallet, transaction };
};


/**
 * Get wallet history for user – tournament-related only (join, reward, refund).
 * Join = entry fee, reward = winning, refund = tournament cancelled.
 * @param {string} userId - User ID
 * @param {number} limit - Number of records to return
 * @param {number} skip - Number of records to skip
 * @param {string} type - Optional filter by type (join, reward, refund)
 * @returns {Promise<Array>} Wallet history records
 */
const getWalletHistory = async (userId, limit = 50, skip = 0, type = null) => {
  const query = { userId, type: { $in: ['join', 'reward', 'refund'] } };
  if (type && ['join', 'reward', 'refund'].includes(type)) {
    query.type = type;
  }

  const history = await WalletHistory.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('tournamentId', 'game mode subMode date startTime lobbyName')
    .lean();

  return history.map(record => {
    const enriched = transformTransactionStatus(record);

    if (enriched.type === 'reward' && typeof enriched.amountINR === 'number') {
      enriched.rewardINR = enriched.amountINR;
      enriched.winning = enriched.amountINR;
    }

    if (enriched.tournamentId && typeof enriched.tournamentId === 'object') {
      const t = enriched.tournamentId;
      const lobbyName = t.lobbyName || `${t.game || ''} ${t.mode || ''} ${t.subMode || ''}`.trim();
      enriched.tournament = {
        _id: t._id,
        game: t.game,
        mode: t.mode,
        subMode: t.subMode,
        date: t.date,
        startTime: t.startTime,
        name: lobbyName,
        lobbyName
      };
    }

    // For all types (join, reward, refund): lobbyName, date, time, amountINR
    enriched.lobbyName = null;
    enriched.date = null;
    enriched.time = null;
    if (enriched.tournament) {
      enriched.lobbyName = enriched.tournament.lobbyName || enriched.tournament.name;
      enriched.date = enriched.tournament.date ?? null;
      enriched.time = enriched.tournament.startTime ?? null;
    }
    if (!enriched.date && record.createdAt) {
      enriched.date = record.createdAt;
    }
    if (!enriched.time && record.createdAt) {
      const d = new Date(record.createdAt);
      enriched.time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    // amountINR (kitna cut/add) - already from record

    // Reward history: lobby time, participant count, position, winning amount
    if (enriched.type === 'reward') {
      enriched.position = record.position ?? null;
      enriched.participantCount = record.tournamentParticipantCount ?? null;
      if (enriched.tournament) {
        enriched.lobbyTime = enriched.tournament.startTime ?? null;
        enriched.lobbyDate = enriched.tournament.date ?? null;
      }
    }

    // Return createdAt in IST for display (e.g. 2026-02-21T21:00:00+05:30)
    enriched.createdAt = toISTISOString(record.createdAt) ?? record.createdAt;

    return enriched;
  });
};

/**
 * Create date range for createdAt filter (UTC)
 * @param {string} dateString - YYYY-MM-DD
 * @returns {{ start: Date, end: Date }}
 */
const createDateRangeForQuery = (dateString) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`Invalid date format. Expected YYYY-MM-DD, got: ${dateString}`);
  }
  const [year, month, day] = dateString.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  return { start, end };
};

/**
 * Get top-up and withdrawal history for user (deposit/withdraw only – no tournament)
 * Returns only type: topup and type: withdrawal.
 * @param {string} userId - User ID
 * @param {number} limit - Number of records to return
 * @param {number} skip - Number of records to skip
 * @param {Object} filters - Optional filters
 * @param {string} filters.date - Single date YYYY-MM-DD
 * @param {string} filters.fromDate - Start of date range YYYY-MM-DD
 * @param {string} filters.toDate - End of date range YYYY-MM-DD
 * @param {string} filters.type - 'topup' | 'withdrawal' | omit for both
 * @returns {Promise<Object>} Object with history array and total count
 */
const getTopupHistory = async (userId, limit = 20, skip = 0, filters = {}) => {
  const { date, fromDate, toDate, type } = filters;

  const baseOr = [
    { type: 'topup', status: 'success' },
    { type: 'topup', status: 'fail', utr: { $ne: null, $exists: true } },
    { type: 'withdrawal' }
  ];

  const query = {
    userId,
    $or: type === 'topup'
      ? baseOr.filter(c => c.type === 'topup')
      : type === 'withdrawal'
        ? [{ type: 'withdrawal' }]
        : baseOr
  };

  // Date filters: single date OR date range
  if (date) {
    const { start, end } = createDateRangeForQuery(date);
    query.createdAt = { $gte: start, $lt: end };
  } else if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) {
      const { start } = createDateRangeForQuery(fromDate);
      query.createdAt.$gte = start;
    }
    if (toDate) {
      const [y, m, d] = toDate.split('-').map(Number);
      query.createdAt.$lte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    }
  }

  const [history, total] = await Promise.all([
    WalletHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean(),
    WalletHistory.countDocuments(query)
  ]);

  const enrichedHistory = history.map(record => {
    const enriched = transformTransactionStatus(record);
    enriched.createdAt = toISTISOString(record.createdAt) ?? record.createdAt;
    return enriched;
  });

  return {
    history: enrichedHistory,
    total
  };
};

/**
 * Helper function to broadcast wallet updates via WebSocket
 * @param {string} userId - User ID
 * @param {Object} wallet - Wallet object
 * @param {Object} transaction - Optional transaction object
 * @param {string} updateType - Update type: 'balance', 'transaction', 'history'
 * @param {number} amountINR - Optional manual amount (e.g. for bulk)
 */
const broadcastWalletUpdateHelper = (userId, wallet, transaction = null, updateType = 'balance', amountINR = null) => {
  try {
    if (updateType === 'balance') {
      broadcastWalletUpdate(userId, {
        balanceINR: wallet.balanceINR,
        updatedAt: wallet.updatedAt
      }, transaction, amountINR);
    } else if (updateType === 'transaction' && transaction) {
      // Determine action based on status and verifiedBy
      let action = 'updated';
      if (transaction.status === 'success' && transaction.verifiedBy === 'admin') {
        action = 'approved';
      } else if (transaction.status === 'fail' && transaction.verifiedBy === 'admin') {
        action = 'rejected';
      }
      broadcastTransactionUpdate(userId, transaction, wallet, action);
    } else if (updateType === 'history' && transaction) {
      broadcastWalletHistoryUpdate(userId, transaction, wallet);
    }
  } catch (wsError) {
    // Log error but don't fail the request
    Logger.error('Error broadcasting wallet update via WebSocket', { errName: wsError.name });
  }
};

/**
 * Update transaction status (Admin or System)
 * When status is updated to 'success', balance is added to wallet
 * When status is updated to 'fail', balance is not added (or removed if already added)
 * @param {string} transactionId - WalletHistory transaction ID
 * @param {string} status - New status: 'success' or 'fail'
 * @param {string} verifiedBy - Who verified it: 'admin' or 'system', default: 'admin'
 * @returns {Promise<Object>} Updated transaction and wallet
 */
const updateTransactionStatus = async (transactionId, status, verifiedBy = 'admin') => {
  if (!['success', 'fail'].includes(status)) {
    throw new Error('Status must be either "success" or "fail"');
  }

  // Find transaction (outside tx to validate before starting)
  const existingTx = await WalletHistory.findById(transactionId);
  if (!existingTx) {
    throw new Error('Transaction not found');
  }
  if (existingTx.type !== 'topup') {
    throw new Error('Can only update status for top-up transactions');
  }

  const userId = existingTx.userId.toString();
  const previousStatus = existingTx.status;
  const previousVerifiedBy = existingTx.verifiedBy;

  await runWithTransaction(async (session) => {
    const transaction = await WalletHistory.findById(transactionId).session(session);
    if (!transaction) throw new Error('Transaction not found');

    const wallet = await getOrCreateWallet(userId, session);

    // Handle balance changes based on status transition
    if (previousStatus === 'success' && status === 'fail') {
      const lineAmt = roundInr(transaction.amountINR);
      if (wallet.balanceINR >= lineAmt) {
        wallet.balanceINR = roundInr(wallet.balanceINR - lineAmt);
        await wallet.save({ session });
      } else {
        Logger.warn('Insufficient balance to deduct for transaction', { transactionId });
      }
    } else if (previousStatus === 'fail' && status === 'success') {
      if ((previousVerifiedBy !== 'admin' && previousVerifiedBy !== 'system') || !transaction.paymentVerified) {
        wallet.balanceINR = roundInr((wallet.balanceINR || 0) + roundInr(transaction.amountINR));
        await wallet.save({ session });
      } else {
        Logger.warn('Transaction was already verified, skipping balance addition', { transactionId });
      }
    }

    transaction.status = status;
    if (status === 'success') {
      transaction.paymentVerified = true;
      transaction.verifiedBy = verifiedBy;
      transaction.verifiedAt = new Date();
    } else if (status === 'fail') {
      transaction.paymentVerified = false;
      transaction.verifiedBy = verifiedBy;
      transaction.verifiedAt = new Date();
    }
    await transaction.save({ session });
  });

  // After commit: reload, broadcast, return
  let transaction = await WalletHistory.findById(transactionId).lean();
  if (!transaction) {
    throw new Error('Failed to reload transaction after update');
  }
  const wallet = await getOrCreateWallet(userId);

  // Extract userId from transaction (handle ObjectId, populated object, or string)
  let transactionUserId = userId; // Use the userId we already extracted earlier
  if (transaction.userId) {
    if (typeof transaction.userId === 'object' && transaction.userId._id) {
      // Populated user object
      transactionUserId = transaction.userId._id.toString();
    } else if (typeof transaction.userId === 'object' && transaction.userId.toString) {
      // ObjectId
      transactionUserId = transaction.userId.toString();
    } else {
      // String
      transactionUserId = String(transaction.userId);
    }
  }

  // Ensure transaction object has all required fields for broadcast
  // Add missing fields if needed (lean object might not have all virtual fields)
  const transactionForBroadcast = {
    ...transaction,
    type: transaction.type || 'topup',
    status: transaction.status || status,
    paymentVerified: transaction.paymentVerified !== undefined ? transaction.paymentVerified : (status === 'success'),
    verifiedBy: transaction.verifiedBy || (status === 'success' ? 'admin' : null),
    verifiedAt: transaction.verifiedAt || (status === 'success' ? new Date() : null)
  };

  // Broadcast wallet update via WebSocket with fresh transaction data
  // Use try-catch to prevent WebSocket errors from breaking the update
  try {
    broadcastWalletUpdateHelper(transactionUserId, wallet, transactionForBroadcast, 'balance');
    broadcastWalletUpdateHelper(transactionUserId, wallet, transactionForBroadcast, 'transaction');
  } catch (broadcastError) {
    // Log error but don't fail the transaction update
    Logger.error('Error broadcasting transaction update via WebSocket', { errName: broadcastError.name });
  }

  // Return fresh transaction object (convert to document if needed by caller)
  // Reload as document for consistency with existing code that might expect mongoose document
  const freshTransaction = await WalletHistory.findById(transactionId);

  return {
    transaction: freshTransaction,
    wallet
  };
};

/**
 * Get all top-up transactions (Admin only)
 * @param {number} limit - Number of records to return
 * @param {number} skip - Number of records to skip
 * @param {string} status - Optional filter by status (success/fail)
 * @param {string} email - Optional filter by user email
 * @param {Date} startDate - Optional filter by start date
 * @param {Date} endDate - Optional filter by end date
 * @returns {Promise<Object>} Top-up transactions with total count
 */
const getAllTopupTransactions = async (limit = 50, skip = 0, status = null, email = null, startDate = null, endDate = null) => {
  const query = { type: 'topup' };
  
  if (status) {
    query.status = status;
  }
  
  // If email is provided, find user by email first
  if (email) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Return empty result if user not found
      return {
        transactions: [],
        total: 0,
        limit,
        skip
      };
    }
    query.userId = user._id;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }
  
  const [transactions, total] = await Promise.all([
    WalletHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('userId', 'name email ign')
      .lean(),
    WalletHistory.countDocuments(query)
  ]);
  
  return {
    transactions,
    total,
    limit,
    skip
  };
};

/**
 * Get pending payment requests (Admin only)
 * Returns transactions that are pending admin verification (not yet reviewed by admin)
 * Excludes transactions that admin has already rejected (verifiedBy: 'admin' and status: 'fail')
 * CRITICAL: Only shows transactions where user has submitted UTR (excludes abandoned QR codes)
 * @param {number} limit - Number of records to return
 * @param {number} skip - Number of records to skip
 * @param {string} email - Optional filter by user email
 * @param {Date} startDate - Optional filter by start date
 * @param {Date} endDate - Optional filter by end date
 * @returns {Promise<Object>} Pending payment transactions with total count
 */
const getPendingTopupTransactions = async (limit = 50, skip = 0, email = null, startDate = null, endDate = null) => {
  // Pending payments: status='fail' but NOT verified by admin (not rejected)
  // Exclude transactions where verifiedBy='admin' (admin has already reviewed/rejected)
  // $ne will match null, undefined, 'user', or any value except 'admin'
  // IMPORTANT: Only show transactions where user has submitted UTR (exclude abandoned QR codes)
  const query = { 
    type: 'topup',
    status: 'fail',
    verifiedBy: { $ne: 'admin' }, // Not verified by admin (includes null and 'user')
    utr: { $ne: null, $exists: true } // User must have submitted UTR (exclude abandoned QR codes)
  };
  
  // If email is provided, find user by email first
  if (email) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Return empty result if user not found
      return {
        transactions: [],
        total: 0,
        limit,
        skip
      };
    }
    query.userId = user._id;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }
  
  const [transactions, total] = await Promise.all([
    WalletHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('userId', 'name email ign')
      .lean(),
    WalletHistory.countDocuments(query)
  ]);
  
  return {
    transactions,
    total,
    limit,
    skip
  };
};

/**
 * Get withdrawal requests (Admin only)
 * Lists user withdrawal requests with user info and current balance (so admin can verify user had sufficient balance).
 * upiId is included in each request — stored at time of withdrawal (new records), or fetched from UserPaymentInfo (older records).
 * @param {number} limit - Number of records to return
 * @param {number} skip - Number of records to skip
 * @param {string} status - Optional filter by status (pending, success, fail)
 * @param {string} email - Optional filter by user email
 * @returns {Promise<Object>} Withdrawal requests with total count
 */
const getWithdrawalRequests = async (limit = 50, skip = 0, status = null, email = null) => {
  const query = { type: 'withdrawal' };
  if (status) query.status = status;
  if (email) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return { requests: [], total: 0, limit, skip };
    }
    query.userId = user._id;
  }

  const [requests, total] = await Promise.all([
    WalletHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('userId', 'name email ign')
      .lean(),
    WalletHistory.countDocuments(query)
  ]);

  const userIds = [...new Set(
    requests
      .map(r => r.userId && (r.userId._id || r.userId))
      .filter(Boolean)
      .map(id => id.toString())
  )];

  // Fetch wallets and payment info in parallel
  const [wallets, paymentInfos] = await Promise.all([
    Wallet.find({ userId: { $in: userIds } }).lean(),
    UserPaymentInfo.find({ userId: { $in: userIds } }).lean()
  ]);

  const walletByUser = Object.fromEntries(wallets.map(w => [w.userId.toString(), w]));
  // Map userId -> upiId for fallback (older records that don't have upiId stored)
  const upiByUser = Object.fromEntries(paymentInfos.map(p => [p.userId.toString(), p.upiId || null]));

  const enriched = requests.map(r => {
    const uid = (r.userId && (r.userId._id || r.userId)).toString();
    const wallet = walletByUser[uid];
    // Use upiId stored in transaction (new records); fall back to UserPaymentInfo for older records
    const upiId = r.upiId || upiByUser[uid] || null;
    return {
      ...r,
      upiId,
      userBalanceINR: wallet ? wallet.balanceINR : 0
    };
  });

  return { requests: enriched, total, limit, skip };
};


/**
 * Update withdrawal request status (Admin only)
 * success = admin has made manual payment to user; fail = reject and refund amount to user wallet.
 * @param {string} transactionId - WalletHistory (withdrawal) transaction ID
 * @param {string} status - New status: 'success' (paid) or 'fail' (rejected, refund)
 * @param {string} verifiedBy - Who verified: 'admin' or 'system', default: 'admin'
 * @returns {Promise<Object>} Updated transaction and wallet
 */
const updateWithdrawalStatus = async (transactionId, status, verifiedBy = 'admin') => {
  if (!['success', 'fail'].includes(status)) {
    throw new Error('Status must be "success" or "fail"');
  }
  const existing = await WalletHistory.findById(transactionId);
  if (!existing) throw new Error('Transaction not found');
  if (existing.type !== 'withdrawal') throw new Error('Can only update status for withdrawal transactions');
  if (existing.status !== 'pending') {
    throw new Error(`Withdrawal is already ${existing.status}; only pending withdrawals can be updated`);
  }

  const userId = existing.userId.toString();
  const amountINR = existing.amountINR;

  await runWithTransaction(async (session) => {
    const t = await WalletHistory.findById(transactionId).session(session);
    if (!t || t.status !== 'pending') throw new Error('Withdrawal no longer pending');
    if (status === 'fail') {
      const w = await getOrCreateWallet(userId, session);
      w.balanceINR = roundInr((w.balanceINR || 0) + amountINR);
      await w.save({ session });
    }
    t.status = status;
    t.verifiedBy = verifiedBy;
    t.verifiedAt = new Date();
    if (status === 'success') t.paymentVerified = true;
    await t.save({ session });
  });

  const transaction = await WalletHistory.findById(transactionId).lean();
  const wallet = await getOrCreateWallet(userId);
  broadcastWalletUpdateHelper(userId, wallet, transaction, 'history');
  return { transaction, wallet };
};

/**
 * Cancel a pending withdrawal request (User only)
 * Refunds the withdrawn amount back to user's wallet.
 * Only pending withdrawals can be cancelled - once admin processes it (success/fail), it cannot be cancelled.
 * @param {string} userId - User ID (must match transaction owner)
 * @param {string} transactionId - WalletHistory transaction ID
 * @returns {Promise<Object>} Updated transaction and wallet
 */
const cancelWithdraw = async (userId, transactionId) => {
  const existing = await WalletHistory.findById(transactionId);
  if (!existing) throw new Error('Transaction not found');
  if (existing.type !== 'withdrawal') throw new Error('This transaction is not a withdrawal request');
  if (existing.userId.toString() !== userId.toString()) throw new Error('Unauthorized. This withdrawal does not belong to you');
  if (existing.status !== 'pending') {
    throw new Error(`Cannot cancel. Withdrawal is already ${existing.status}`);
  }

  const amountINR = existing.amountINR;

  await runWithTransaction(async (session) => {
    const t = await WalletHistory.findById(transactionId).session(session);
    if (!t || t.status !== 'pending') throw new Error('Withdrawal is no longer pending');
    // Refund amount back to wallet
    const w = await getOrCreateWallet(userId, session);
    w.balanceINR = roundInr((w.balanceINR || 0) + amountINR);
    await w.save({ session });
    // Mark as cancelled
    t.status = 'cancelled';
    t.verifiedBy = 'user';
    t.verifiedAt = new Date();
    await t.save({ session });
  });

  const transaction = await WalletHistory.findById(transactionId).lean();
  const wallet = await getOrCreateWallet(userId);
  broadcastWalletUpdateHelper(userId.toString(), wallet, transaction, 'history');
  return { transaction, wallet };
};

/**
 * Add balance to multiple users at once (Bulk top-up)
 * @param {Array<string>} userIds - Array of User IDs
 * @param {number} amountINR - Amount to add to each user
 * @param {string} description - Transaction description
 * @returns {Promise<Object>} Result with successful and failed top-ups
 */
const addBalanceBulk = async (userIds, amountINR, description) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new Error('userIds must be a non-empty array');
  }

  const amt = roundInr(amountINR);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  const results = {
    successful: [],
    failed: [],
    totalProcessed: 0,
    totalSuccessful: 0,
    totalFailed: 0
  };

  // Use bulk operations for high performance
  const historyData = userIds.map(userId => ({
    userId,
    type: 'topup',
    amountINR: amt,
    description,
    status: 'success',
    addedBy: 'admin'
  }));

  const walletOperations = userIds.map(userId => ({
    updateOne: {
      filter: { userId },
      update: { $inc: { balanceINR: amt } },
      upsert: true
    }
  }));

  try {
    await runWithTransaction(async (session) => {
      await WalletHistory.insertMany(historyData, { session });
      await Wallet.bulkWrite(walletOperations, { session });
    });

    // After commit: prepare results and broadcast (WebSocket still needs individual emitters)
    const updatedWallets = await Wallet.find({ userId: { $in: userIds } }).lean();

    for (const wallet of updatedWallets) {
      results.successful.push({
        userId: wallet.userId,
        balanceINR: wallet.balanceINR,
        updatedAt: wallet.updatedAt
      });
      results.totalSuccessful++;
      broadcastWalletUpdateHelper(wallet.userId.toString(), wallet, null, 'balance', amt);
    }

    results.totalProcessed = userIds.length;
  } catch (error) {
    Logger.error('Bulk top-up failed', { errName: error.name });
    results.totalFailed = userIds.length;
    throw error;
  }

  return results;
};

module.exports = {
  getOrCreateWallet,
  addBalance,
  addBalanceBulk,
  deductBalance,
  addReward,
  refundEntryFee,
  getWalletBalance,
  getWalletsBalance,
  getTotalDeposits,
  getTotalWithdrawn,
  getMaxWithdrawable,
  withdrawBalance,
  getWalletHistory,
  getTopupHistory,
  getAllTopupTransactions,
  getPendingTopupTransactions,
  getWithdrawalRequests,
  updateWithdrawalStatus,
  cancelWithdraw,
  updateTransactionStatus,
  WITHDRAWAL_WAGERING_PERCENT
};
