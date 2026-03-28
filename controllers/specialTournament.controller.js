/**
 * Special Tournament Controller
 * Handles HTTP requests for sponsored/special multi-round tournaments
 */

const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS } = require('../constants');
const specialTournamentService = require('../services/specialTournament.service');

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

/**
 * Create a sponsored tournament
 * POST /api/special-tournament/create
 * Access: Admin only
 */
const createSpecialTournament = asyncHandler(async (req, res) => {
  const adminId = req.userId;
  const {
    title, game, mode, subMode, region, lobbyName,
    prizePool, prizeDistribution, maxSlots, rounds,
    scheduledDate, scheduledTime, scheduledEndDate, registrationDeadline, description,
    formatLabel, sponsorHandles
  } = req.body;

  const tournament = await specialTournamentService.createSpecialTournament(adminId, {
    title, game, mode, subMode, region, lobbyName,
    prizePool, prizeDistribution, maxSlots, rounds,
    scheduledDate, scheduledTime, scheduledEndDate, registrationDeadline, description,
    formatLabel, sponsorHandles
  });

  res.success(HTTP_STATUS.CREATED, 'Special tournament created successfully', { tournament });
});

/**
 * Open registration (draft → registration_open)
 * POST /api/special-tournament/:id/open-registration
 * Access: Admin only
 */
const openRegistration = asyncHandler(async (req, res) => {
  const adminId = req.userId;
  const { id } = req.params;
  const tournament = await specialTournamentService.openRegistration(adminId, id);
  res.success(HTTP_STATUS.OK, 'Registration opened successfully', { tournament });
});

/**
 * Cancel a special tournament
 * POST /api/special-tournament/:id/cancel
 * Access: Admin only
 */
const cancelSpecialTournament = asyncHandler(async (req, res) => {
  const adminId = req.userId;
  const { id } = req.params;
  const { reason } = req.body;
  const tournament = await specialTournamentService.cancelSpecialTournament(adminId, id, reason);
  res.success(HTTP_STATUS.OK, 'Tournament cancelled', { tournament });
});

/**
 * Start a round (auto-assign teams to slots)
 * POST /api/special-tournament/:id/round/:roundNum/start
 * Access: Admin only
 */
const startRound = asyncHandler(async (req, res) => {
  const adminId = req.userId;
  const { id, roundNum } = req.params;
  const roundNumber = parseInt(roundNum, 10);

  if (isNaN(roundNumber) || roundNumber < 1) {
    return res.badRequest('roundNum must be a positive integer');
  }

  const tournament = await specialTournamentService.startRound(adminId, id, roundNumber);
  const round = tournament.rounds.find(r => r.roundNumber === roundNumber);

  res.success(HTTP_STATUS.OK, `Round ${roundNumber} started. Teams assigned to ${round.slots.length} slot(s).`, {
    roundNumber,
    roundName: round.roundName,
    totalSlots: round.slots.length,
    teamsPerSlot: round.teamsPerSlot,
    matchesPerSlot: round.matchesPerSlot,
    qualifyPerSlot: round.qualifyPerSlot,
    slots: round.slots.map(s => ({
      slotIndex: s.slotIndex,
      teamCount: s.teams.length,
      teams: s.teams.map(t => ({ teamName: t.teamName }))
    }))
  });
});

/**
 * Assign host to a slot
 * POST /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/assign-host
 * Access: Admin only
 */
const assignSlotHost = asyncHandler(async (req, res) => {
  const adminId = req.userId;
  const { id, roundNum, slotIdx } = req.params;
  const { hostUserId } = req.body;
  const roundNumber = parseInt(roundNum, 10);
  const slotIndex = parseInt(slotIdx, 10);

  if (!hostUserId) return res.badRequest('hostUserId is required');

  const tournament = await specialTournamentService.assignSlotHost(adminId, id, roundNumber, slotIndex, hostUserId);
  res.success(HTTP_STATUS.OK, 'Host assigned to slot', { tournamentId: tournament._id, roundNumber, slotIndex, hostUserId });
});

/**
 * Update tournament configuration (maxSlots, prizePool, prizeDistribution, title, etc.)
 * PATCH /api/special-tournament/:id/config
 * Access: Admin only
 */
const updateTournamentConfig = asyncHandler(async (req, res) => {
  const adminId = req.userId;
  const { id } = req.params;
  const updates = req.body;

  const tournament = await specialTournamentService.updateTournamentConfig(adminId, id, updates);

  res.success(HTTP_STATUS.OK, 'Tournament configuration updated', {
    tournamentId: tournament._id,
    title: tournament.title,
    prizePool: tournament.prizePool,
    maxSlots: tournament.maxSlots,
    participantCount: tournament.participants.length,
    prizeDistribution: tournament.prizeDistribution,
    status: tournament.status
  });
});

/**
 * Send push notification to all connected users about this tournament
 * POST /api/special-tournament/:id/notify
 * Access: Admin only
 */
const sendSpecialTournamentNotification = asyncHandler(async (req, res) => {
  const adminId = req.userId;
  const { id } = req.params;
  const { title, message, type } = req.body;

  const { sent, tournament } = await specialTournamentService.sendSpecialTournamentNotification(
    adminId, id, { title, message, type }
  );

  res.success(HTTP_STATUS.OK, 'Push notification sent to all connected users', {
    sent,
    tournamentId: tournament._id,
    notificationTitle: title || `${tournament.title}`,
    notificationMessage: message || null
  });
});

/**
 * Distribute rewards after final round is completed
 * POST /api/special-tournament/:id/distribute-rewards
 * Access: Admin only
 */
const distributeRewards = asyncHandler(async (req, res) => {
  const adminId = req.userId;
  const { id } = req.params;
  const { tournament, winners } = await specialTournamentService.distributeRewards(adminId, id);

  res.success(HTTP_STATUS.OK, 'Rewards distributed successfully', {
    tournamentId: tournament._id,
    title: tournament.title,
    prizePool: tournament.prizePool,
    winners: winners.map(w => ({
      userId: w.userId,
      teamName: w.teamName,
      position: w.position,
      rewardINR: w.rewardINR
    }))
  });
});

// ---------------------------------------------------------------------------
// Host endpoints
// ---------------------------------------------------------------------------

/**
 * Update room info for a slot
 * POST /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/room
 * Access: Assigned host for the slot OR Admin
 */
const updateSlotRoom = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { id, roundNum, slotIdx } = req.params;
  const { roomId, password } = req.body;
  const roundNumber = parseInt(roundNum, 10);
  const slotIndex = parseInt(slotIdx, 10);

  if (!roomId) return res.badRequest('roomId is required');

  const isAdmin = req.user && req.user.role === 'admin';
  const tournament = await specialTournamentService.updateSlotRoom(userId, id, roundNumber, slotIndex, roomId, password, { isAdmin });
  const round = tournament.rounds.find(r => r.roundNumber === roundNumber);
  const slot = round && round.slots.find(s => s.slotIndex === slotIndex);

  res.success(HTTP_STATUS.OK, 'Room info updated', {
    roundNumber,
    slotIndex,
    room: slot ? slot.room : null
  });
});

/**
 * Submit one match result for a slot
 * POST /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/match-result
 * Access: Assigned host for the slot
 */
const submitSlotMatchResult = asyncHandler(async (req, res) => {
  const hostUserId = req.userId;
  const { id, roundNum, slotIdx } = req.params;
  const { matchIndex, teams } = req.body;
  const roundNumber = parseInt(roundNum, 10);
  const slotIndex = parseInt(slotIdx, 10);

  if (typeof matchIndex !== 'number' && isNaN(parseInt(matchIndex, 10))) {
    return res.badRequest('matchIndex must be a non-negative integer');
  }
  if (!teams || !Array.isArray(teams) || teams.length === 0) {
    return res.badRequest('teams must be a non-empty array');
  }

  const parsedMatchIndex = typeof matchIndex === 'number' ? matchIndex : parseInt(matchIndex, 10);

  const { standings, matchResults } = await specialTournamentService.submitSlotMatchResult(
    hostUserId, id, roundNumber, slotIndex, parsedMatchIndex, teams
  );

  res.success(HTTP_STATUS.OK, `Match ${parsedMatchIndex + 1} result submitted`, {
    roundNumber, slotIndex, matchIndex: parsedMatchIndex,
    matchResults, standings
  });
});

/**
 * Submit final result for a slot (auto-qualifies top N teams)
 * POST /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/final-result
 * Access: Assigned host for the slot
 */
const submitSlotFinalResult = asyncHandler(async (req, res) => {
  const hostUserId = req.userId;
  const { id, roundNum, slotIdx } = req.params;
  const roundNumber = parseInt(roundNum, 10);
  const slotIndex = parseInt(slotIdx, 10);

  const { standings, qualifiedTeams, qualifiedCount } = await specialTournamentService.submitSlotFinalResult(
    hostUserId, id, roundNumber, slotIndex
  );

  res.success(HTTP_STATUS.OK, `Slot ${slotIndex} finalized. ${qualifiedCount} team(s) qualified.`, {
    roundNumber, slotIndex, standings, qualifiedCount,
    qualifiedTeamUserIds: qualifiedTeams.map(uid => uid.toString())
  });
});

// ---------------------------------------------------------------------------
// Public / User endpoints
// ---------------------------------------------------------------------------

/**
 * List special tournaments
 * GET /api/special-tournament/list
 * Access: Authenticated users
 */
const getSpecialTournamentList = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const { status, mode, subMode } = req.query;

  const { tournaments, total } = await specialTournamentService.getSpecialTournamentList(
    { status, mode, subMode },
    limit,
    skip
  );

  const totalPages = Math.ceil(total / limit);
  res.success(HTTP_STATUS.OK, 'Special tournaments retrieved', {
    tournaments,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
});

/**
 * Get tournament details (admin: full details, user: safe view)
 * GET /api/special-tournament/:id
 * Access: Authenticated users
 */
const getSpecialTournamentDetails = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const isAdmin = req.user && req.user.role === 'admin';
  const { id } = req.params;

  let tournament;
  if (isAdmin) {
    tournament = await specialTournamentService.getSpecialTournamentDetails(id);
  } else {
    tournament = await specialTournamentService.getSpecialTournamentDetailsForUser(id, userId);
  }

  res.success(HTTP_STATUS.OK, 'Special tournament details retrieved', { tournament });
});

/**
 * Admin-only: Full results report — every round, every slot (lobby), match results, standings, qualified teams
 * GET /api/special-tournament/:id/admin-report
 */
const getSpecialTournamentAdminReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const report = await specialTournamentService.getSpecialTournamentAdminReport(id);
  res.success(HTTP_STATUS.OK, 'Special tournament admin report retrieved', report);
});

/**
 * Admin (or host): Declare final ranking by position. Use before distribute-rewards.
 * POST /api/special-tournament/:id/declare-final-ranking
 */
const declareFinalRanking = asyncHandler(async (req, res) => {
  const adminId = req.userId;
  const { id } = req.params;
  const { ranking } = req.body;
  const tournament = await specialTournamentService.declareFinalRanking(adminId, id, ranking);
  res.success(HTTP_STATUS.OK, 'Final ranking declared', { tournament });
});

/**
 * Get live results for a specific slot
 * GET /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/live-results
 * Access: Authenticated users
 */
const getSlotLiveResults = asyncHandler(async (req, res) => {
  const { id, roundNum, slotIdx } = req.params;
  const roundNumber = parseInt(roundNum, 10);
  const slotIndex = parseInt(slotIdx, 10);

  const data = await specialTournamentService.getSlotLiveResults(id, roundNumber, slotIndex);
  res.success(HTTP_STATUS.OK, 'Slot live results retrieved', data);
});

/**
 * Join a special tournament (free — no GC deducted)
 * POST /api/special-tournament/:id/join
 * Access: Authenticated users
 */
const joinSpecialTournament = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const { teamName, players } = req.body;

  if (!teamName || typeof teamName !== 'string' || !teamName.trim()) {
    return res.badRequest('teamName is required');
  }

  const tournament = await specialTournamentService.joinSpecialTournament(userId, id, teamName, players);

  // Broadcast update for dynamic joinedTeams count on public API
  const { broadcastTournamentUpdate } = require('../services/websocket.service');
  broadcastTournamentUpdate(tournament._id.toString(), {
    status: tournament.status,
    joinedTeams: tournament.participants?.length || 0
  });

  res.success(HTTP_STATUS.OK, 'Successfully registered for the special tournament (free entry)', {
    tournamentId: tournament._id,
    title: tournament.title,
    status: tournament.status,
    participantCount: tournament.participants.length,
    maxSlots: tournament.maxSlots
  });
});

module.exports = {
  createSpecialTournament,
  openRegistration,
  cancelSpecialTournament,
  updateTournamentConfig,
  sendSpecialTournamentNotification,
  startRound,
  assignSlotHost,
  distributeRewards,
  updateSlotRoom,
  submitSlotMatchResult,
  submitSlotFinalResult,
  getSpecialTournamentList,
  getSpecialTournamentDetails,
  getSpecialTournamentAdminReport,
  getSlotLiveResults,
  joinSpecialTournament,
  declareFinalRanking
};
