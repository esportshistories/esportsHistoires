/**
 * Admin dashboard metrics (single source for GET /admin/dashboard/stats and SSE).
 *
 * Semantics:
 * - totalDepositsINR / userSelfTopupsINR: successful wallet top-ups initiated by users (UPI/Cashfree etc., addedBy=user).
 * - adminManualTopupsINR: successful type=topup, addedBy=admin (manual credits).
 * - totalTopupsINR: userSelfTopupsINR + adminManualTopupsINR (excludes system host-fee lines).
 *
 * Profit (tournament economics):
 * - platformProfit, tournamentFeeProfitINR, netProfit: platform + caster fee summed from finished lobbies
 *   (users played → entry pool split; yeh platform/caster ka hissa = "fee se earn").
 * - walletNetFlowINR: userSelfTopupsINR − prizePoolDistributed (wallet cashflow metric, not fee profit).
 */

const User = require('../models/User.model');
const Tournament = require('../models/Tournament.model');
const WalletHistory = require('../models/WalletHistory.model');

const FINISHED_LOBBY_STATUSES = ['completed', 'result_published'];

async function fetchAdminDashboardStatsData() {
  const [
    totalUsers,
    userSelfTopupAgg,
    adminTopupAgg,
    totalRewardsData,
    totalHostFeePaidData,
    activeLobbyCount,
    completedFeesData,
    lobbiesTotalCount,
    lobbiesCompletedCount,
    lobbiesCancelledCount
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    WalletHistory.aggregate([
      { $match: { type: 'topup', status: 'success', addedBy: 'user' } },
      { $group: { _id: null, total: { $sum: '$amountINR' } } }
    ]),
    WalletHistory.aggregate([
      { $match: { type: 'topup', status: 'success', addedBy: 'admin' } },
      { $group: { _id: null, total: { $sum: '$amountINR' } } }
    ]),
    WalletHistory.aggregate([
      { $match: { type: 'reward' } },
      { $group: { _id: null, total: { $sum: '$amountINR' } } }
    ]),
    WalletHistory.aggregate([
      { $match: { type: 'topup', status: 'success', addedBy: 'system' } },
      { $group: { _id: null, total: { $sum: '$amountINR' } } }
    ]),
    Tournament.countDocuments({ status: 'running' }),
    // All-time: no date filter — every finished lobby (completed / result_published) with stored platformFees
    Tournament.aggregate([
      { $match: { status: { $in: FINISHED_LOBBY_STATUSES } } },
      {
        $group: {
          _id: null,
          platformFee: { $sum: { $ifNull: ['$platformFees.platformFee', 0] } },
          casterFee: { $sum: { $ifNull: ['$platformFees.casterFee', 0] } },
          hostFee: { $sum: { $ifNull: ['$platformFees.hostFee', 0] } },
          winnerPool: { $sum: { $ifNull: ['$platformFees.winnerPrizePool', 0] } }
        }
      }
    ]),
    Tournament.countDocuments({}),
    Tournament.countDocuments({ status: { $in: FINISHED_LOBBY_STATUSES } }),
    Tournament.countDocuments({ status: 'cancelled' })
  ]);

  const userSelfTopupsINR = userSelfTopupAgg[0]?.total || 0;
  const adminManualTopupsINR = adminTopupAgg[0]?.total || 0;
  const totalTopupsINR = userSelfTopupsINR + adminManualTopupsINR;
  const prizePoolDistributed = totalRewardsData[0]?.total || 0;
  const totalHostFeePaid = totalHostFeePaidData[0]?.total || 0;
  const completedFees = completedFeesData[0] || {};
  const platformFeeCollected = completedFees.platformFee || 0;
  const casterFeeCollected = completedFees.casterFee || 0;
  const totalHostFeeFromLobbies = completedFees.hostFee || 0;
  const winnerPoolFromLobbies = completedFees.winnerPool || 0;
  const tournamentFeeProfitINR = platformFeeCollected + casterFeeCollected;
  const platformProfit = tournamentFeeProfitINR;
  const totalFeesFromCompletedLobbies =
    platformFeeCollected + casterFeeCollected + totalHostFeeFromLobbies;
  const walletNetFlowINR = userSelfTopupsINR - prizePoolDistributed;

  return {
    totalUsers,
    /** @deprecated use userSelfTopupsINR — same value; kept for older clients */
    totalDepositsINR: userSelfTopupsINR,
    userSelfTopupsINR,
    adminManualTopupsINR,
    totalTopupsINR,
    activeLobbyCount,
    lobbyStats: {
      totalCreated: lobbiesTotalCount,
      finishedSuccessful: lobbiesCompletedCount,
      cancelled: lobbiesCancelledCount,
      running: activeLobbyCount
    },
    prizePoolDistributed,
    totalHostFeePaid,
    platformFeeCollected,
    casterFeeCollected,
    platformProfit,
    /** Same as platformProfit — explicit name for API consumers */
    tournamentFeeProfitINR,
    feesBreakdown: {
      platformFeeINR: platformFeeCollected,
      casterFeeINR: casterFeeCollected,
      hostFeeINR: totalHostFeeFromLobbies,
      totalFeesINR: totalFeesFromCompletedLobbies,
      winnerPoolPaidINR: winnerPoolFromLobbies
    },
    totalDeposits: userSelfTopupsINR,
    totalRewards: prizePoolDistributed,
    /** Tournament se fee share (platform + caster); NOT wallet top-up minus rewards */
    netProfit: tournamentFeeProfitINR,
    walletNetFlowINR
  };
}

module.exports = {
  fetchAdminDashboardStatsData,
  FINISHED_LOBBY_STATUSES
};
