/**
 * Org Controller
 * Org-manager specific APIs. These are new and do not modify existing host/admin flows.
 */

const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS } = require('../constants');
const { resolveAnyGameTitle } = require('../constants/gameCatalog');
const Tournament = require('../models/Tournament.model');
const Organization = require('../models/Organization.model');
const orgWalletService = require('../services/orgWallet.service');
const specialTournamentService = require('../services/specialTournament.service');

/**
 * Deposit GC from logged-in user's wallet into org wallet.
 * POST /api/orgs/:orgId/deposit
 * Access: org_manager of that org (or admin)
 */
const depositToOrg = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { orgId } = req.params;
  const { amount } = req.body;

  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount <= 0) {
    return res.badRequest('Amount must be greater than zero');
  }

  await orgWalletService.depositToOrgFromUser(orgId, userId, numericAmount);
  const organization = await Organization.findById(orgId);

  res.success(HTTP_STATUS.OK, 'Amount deposited to organization wallet', {
    organizationId: organization._id,
    walletBalance: organization.walletBalance,
    lockedBalance: organization.lockedBalance
  });
});

/**
 * Create an org-owned tournament (basic version).
 * POST /api/orgs/:orgId/tournaments
 * Access: org_manager of that org (or admin)
 *
 * NOTE: This creates a regular Tournament lobby with organizationId set,
 * without touching existing generation/join logic.
 */
const createOrgTournament = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { orgId } = req.params;
  const {
    game,
    mode,
    subMode,
    entryFee,
    maxPlayers,
    date,
    startTime,
    region,
    lobbyName,
    prizePool
  } = req.body;

  const organization = await Organization.findById(orgId);
  if (!organization || !organization.isActive) {
    return res.notFound('Organization not found');
  }

  // If org wants to create a special free-entry tournament with fixed prizePool,
  // we lock that prizePool from org wallet at creation time.
  if (Number(entryFee) === 0 && Number(prizePool) > 0) {
    await orgWalletService.lockOrgFundsForTournament(orgId, Number(prizePool));
  }

  let resolvedGame = 'Free Fire';
  if (game !== undefined && game !== null && String(game).trim() !== '') {
    const r = resolveAnyGameTitle(game);
    if (!r) return res.badRequest(`Unknown or unsupported game: ${game}`);
    resolvedGame = r;
  }

  const tournament = await Tournament.create({
    game: resolvedGame,
    mode,
    subMode,
    entryFee,
    maxPlayers,
    date,
    startTime,
    lockTime: require('../services/tournament.service').calculateLockTime(date, startTime),
    participants: [],
    hostId: null,
    room: {
      roomId: null,
      password: null
    },
    prizePool: prizePool || 0,
    platformFees: {
      totalPrizePool: 0,
      platformFee: 0,
      hostFee: 0,
      casterFee: 0,
      totalFees: 0,
      winnerPrizePool: 0,
      potentialTotalPrizePool: 0,
      potentialPlatformFee: 0,
      potentialHostFee: 0,
      potentialCasterFee: 0,
      potentialTotalFees: 0,
      potentialWinnerPrizePool: 0
    },
    status: 'upcoming',
    region: region || 'Global',
    lobbyName: lobbyName || `Org Lobby - ${organization.name}`,
    teams: [],
    results: [],
    matchResults: [],
    totalMatches: mode === 'CS' ? 1 : 6,
    organizationId: orgId,
    createdBy: userId
  });

  res.success(HTTP_STATUS.CREATED, 'Organization tournament created successfully', {
    tournament
  });
});

/**
 * List tournaments owned by an organization.
 * GET /api/orgs/:orgId/tournaments
 * Access: org_manager of that org (or admin)
 */
const listOrgTournaments = asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  const { status } = req.query;

  const match = { organizationId: orgId };
  if (status) {
    match.status = status;
  }

  const tournaments = await Tournament.find(match)
    .sort({ date: -1, startTime: -1 });

  res.success(HTTP_STATUS.OK, 'Organization tournaments retrieved', {
    tournaments
  });
});

/**
 * Create an org-owned sponsored (free-entry) special tournament.
 * POST /api/orgs/:orgId/special-tournaments
 * Access: org_manager of that org (or admin)
 */
const createOrgSpecialTournament = asyncHandler(async (req, res) => {
  const creatorUserId = req.userId;
  const { orgId } = req.params;

  const {
    title,
    game,
    mode,
    subMode,
    region,
    lobbyName,
    prizePool,
    prizeDistribution,
    maxSlots,
    rounds,
    scheduledDate,
    scheduledTime,
    scheduledEndDate,
    registrationDeadline,
    description,
    formatLabel,
    sponsorHandles
  } = req.body;

  const organization = await Organization.findById(orgId);
  if (!organization || !organization.isActive) {
    return res.notFound('Organization not found');
  }

  const tournament = await specialTournamentService.createSpecialTournament(creatorUserId, {
    title,
    game,
    mode,
    subMode,
    region,
    lobbyName,
    prizePool,
    prizeDistribution,
    maxSlots,
    rounds,
    scheduledDate,
    scheduledTime,
    scheduledEndDate,
    registrationDeadline,
    description,
    formatLabel,
    sponsorHandles,
    organizationId: orgId
  });

  res.success(HTTP_STATUS.CREATED, 'Organization sponsored tournament created successfully', { tournament });
});

module.exports = {
  depositToOrg,
  createOrgTournament,
  listOrgTournaments,
  createOrgSpecialTournament
};

