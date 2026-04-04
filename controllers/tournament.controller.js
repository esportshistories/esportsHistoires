/**
 * Tournament Controller
 * Handles tournament-related API requests
 */

const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS, MESSAGES } = require('../constants');
const { getFilteredRules } = require('../utils/lobbyRules.helper');
const tournamentService = require('../services/tournament.service');
const walletService = require('../services/wallet.service');
const Logger = require('../utils/logger');
const { getSpecialTournamentsForList } = require('../services/tournament.service');
const {
  resolveAnyGameTitle,
  normalizeGameMatchKeysForDb,
  matchesGameName,
  assertUserFollowsGameForLobby
} = require('../constants/gameCatalog');
const { getUserSelectedGameGroups } = require('./profile.controller');

// SSE clients: each entry is { res, gameMatchKeys } — same scope rules as GET /api/tournament/list
const sseTournamentListClients = new Set();

/**
 * Push list patch events only to clients whose scope includes payload.game.
 * @param {Object} payload — must include tournamentId and game
 */
const broadcastTournamentListUpdate = (payload) => {
  if (!payload || !payload.tournamentId || !sseTournamentListClients.size) return;
  const payloadKeys =
    payload.game != null && String(payload.game).trim() !== ''
      ? normalizeGameMatchKeysForDb([payload.game])
      : [];
  const payloadKey = payloadKeys[0] || null;
  if (!payloadKey) return;

  const data = `event: update\ndata:${JSON.stringify(payload)}\n\n`;
  for (const client of sseTournamentListClients) {
    const { res, gameMatchKeys } = client;
    const keys = Array.isArray(gameMatchKeys) ? gameMatchKeys : [];
    if (!keys.length) continue;
    if (!keys.includes(payloadKey)) continue;
    try {
      res.write(data);
    } catch (err) {
      // Ignore individual write errors; connection cleanup happens on 'close'
    }
  }

  try {
    const { scheduleAdminDashboardSseBroadcastDebounced } = require('../services/adminDashboardSse.service');
    scheduleAdminDashboardSseBroadcastDebounced();
  } catch (e) {
    /* optional */
  }
};

/**
 * Get tournaments by status (upcoming, live, completed, pendingResult) with lobby rules
 * GET /api/tournament/list?status=upcoming|live|completed|pendingResult&subMode=solo|duo|squad&date=YYYY-MM-DD&mode=BR|CS|LW
 */
const getTournamentList = asyncHandler(async (req, res) => {
  const status = req.query.status || 'upcoming'; // Default to 'upcoming' for backward compatibility
  const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
  const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
  const date = req.query.date || null; // Specific date filter (YYYY-MM-DD)
  const subMode = req.query.subMode || null; // Filter by solo, duo, squad
  const mode = req.query.mode || null; // Optional: BR, CS, or LW – if sent, only that type; if not sent, all types
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  // Validate status
  if (!['upcoming', 'live', 'completed', 'pendingResult', 'cancelled'].includes(status)) {
    return res.badRequest('Invalid status. Must be: upcoming, live, completed, pendingResult, or cancelled');
  }
  
  // Validate date format if provided
  if (date) {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return res.badRequest('Invalid date format. Must be YYYY-MM-DD');
    }
  }

  // Run status check before fetching - ensures 11:30 tournaments move from upcoming to live/cancelled
  const { checkTournamentStatusImmediate } = require('../services/scheduler.service');
  try {
    await checkTournamentStatusImmediate(null);
  } catch (checkErr) {
    Logger.error('List: Status check failed (non-blocking)', { err: checkErr?.message });
  }

  // game query optional: falls back to profile followed games (same idea as GET /api/lobby/list).
  let gameScope;
  let parts;
  if (req.query.game != null && String(req.query.game).trim() !== '') {
    parts = String(req.query.game).split(',').map(s => s.trim()).filter(Boolean);
    gameScope = 'query';
  } else {
    const followed = getUserSelectedGameGroups(req.user);
    parts = [
      ...new Set(
        followed
          .map((s) => resolveAnyGameTitle(s.game) || String(s.game || '').trim())
          .filter(Boolean)
      )
    ];
    if (!parts.length) {
      return res.badRequest(
        'game is required (e.g. ?game=BGMI or ?game=Free+Fire), or add followed games in your profile'
      );
    }
    gameScope = 'followed';
  }

  const titles = [];
  for (const p of parts) {
    const t = resolveAnyGameTitle(p);
    if (!t) {
      return res.badRequest(`Invalid game: ${p}. Use a supported title or slug from game options.`);
    }
    titles.push(t);
  }
  const uniqueTitles = [...new Set(titles)];
  const gameMatchKeys = normalizeGameMatchKeysForDb(uniqueTitles);

  const specialTournaments =
    (mode === 'LW')
      ? []
      : await getSpecialTournamentsForList(status, mode, subMode, uniqueTitles);

  // Pagination across merged list (specials first)
  const specialTotal = specialTournaments.length;
  const specialPage =
    offset < specialTotal ? specialTournaments.slice(offset, offset + limit) : [];
  const remainingLimit = Math.max(0, limit - specialPage.length);
  const regularOffset = Math.max(0, offset - specialTotal);

  const regularPaged =
    remainingLimit > 0
      ? await tournamentService.getTournamentsByStatus(
          status,
          fromDate,
          toDate,
          date,
          subMode,
          mode,
          uniqueTitles,
          { limit: remainingLimit, offset: regularOffset, includeTotal: true }
        )
      : { tournaments: [], total: 0 };

  const allTournaments = [...specialPage, ...(regularPaged.tournaments || [])];
  const total = specialTotal + (regularPaged.total || 0);

  // Attach lobby-specific rules to each tournament and apply org-specific team visibility rule
  const tournamentsWithRules = allTournaments.map(tournament => {
    const t = { ...tournament };

    // Org BR squad: hide teams with less than 4 players from joinedTeamsList
    if (
      t.organizationId &&
      t.mode === 'BR' &&
      t.subMode === 'squad' &&
      Array.isArray(t.joinedTeamsList)
    ) {
      t.joinedTeamsList = t.joinedTeamsList.filter(team => {
        const count = typeof team.playerCount === 'number' ? team.playerCount : 0;
        return count >= 4;
      });
    }

    return {
      ...t,
      rules: getFilteredRules(t.mode, t.subMode, t.game)
    };
  });

  const appliedFollowedGames = undefined;
  const gameSummaries = undefined;

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENTS_RETRIEVED, {
    tournaments: tournamentsWithRules,
    total,
    limit,
    offset,
    appliedFollowedGames,
    gameSummaries,
    filters: {
      status,
      date: date || null,
      subMode: subMode || null,
      mode: mode || null,
      gameScope,
      game: req.query.game || null
    }
  });
});

/**
 * Server-Sent Events stream for tournament list updates.
 *
 * Frontend flow:
 *  1. Call GET /api/tournament/list for initial data (same filters as you want live)
 *  2. Open EventSource with auth: `GET /api/tournament/list/stream?game=BGMI&access_token=<JWT>` (browser cannot set Bearer on EventSource).
 *
 * Events are only delivered when `payload.game` matches this connection's scope (same as list API).
 */
const streamTournamentList = asyncHandler(async (req, res) => {
  // game is required for the stream endpoint too (routes enforce).
  const parts = String(req.query.game).split(',').map(s => s.trim()).filter(Boolean);
  const titles = [];
  for (const p of parts) {
    const t = resolveAnyGameTitle(p);
    if (!t) {
      return res.badRequest(`Invalid game: ${p}. Use a supported title or slug from game options.`);
    }
    titles.push(t);
  }
  const gameMatchKeys = normalizeGameMatchKeysForDb(titles);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write(': connected\n\n');

  const client = { res, gameMatchKeys };
  sseTournamentListClients.add(client);
  Logger.info('SSE: tournament list client connected', {
    clientCount: sseTournamentListClients.size,
    scopeSize: gameMatchKeys.length
  });

  req.on('close', () => {
    sseTournamentListClients.delete(client);
    try {
      res.end();
    } catch (e) {
      // ignore
    }
    Logger.info('SSE: tournament list client disconnected', { clientCount: sseTournamentListClients.size });
  });
});

/**
 * Get tournaments joined by user
 * GET /api/tournament/joined
 */
const getJoinedTournaments = asyncHandler(async (req, res) => {
  const userId = req.userId;
  
  const tournaments = await tournamentService.getJoinedTournaments(userId);

  const now = new Date();
  const isAdmin = req.user && req.user.role === 'admin';

  // Attach lobby-specific rules, apply org-specific team visibility rule, and filter room info based on 10-minute rule
  const tournamentsWithRules = tournaments.map(tournament => {
    const startDateTime = tournamentService.calculateStartDateTime(tournament.date, tournament.startTime);
    const tenMinutesBeforeStart = new Date(startDateTime.getTime() - 10 * 60 * 1000);
    const isWithinPublicationWindow = now >= tenMinutesBeforeStart;
    const isTournamentLive = tournament.status === 'running';

    const shouldSeeRoomInfo = isAdmin || isWithinPublicationWindow || isTournamentLive;

    const t = {
      ...tournament
    };

    // Org BR squad: hide teams with less than 4 players from joinedTeamsList
    if (
      t.organizationId &&
      t.mode === 'BR' &&
      t.subMode === 'squad' &&
      Array.isArray(t.joinedTeamsList)
    ) {
      t.joinedTeamsList = t.joinedTeamsList.filter(team => {
        const count = typeof team.playerCount === 'number' ? team.playerCount : 0;
        return count >= 4;
      });
    }

    t.rules = getFilteredRules(t.mode, t.subMode, t.game);

    if (!shouldSeeRoomInfo && t.room) {
      t.room = {
        roomId: null,
        password: null,
        roomNotificationSent: tournament.room.roomNotificationSent,
        liveStreamUrl: null
      };
    }
    return t;
  });
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENTS_RETRIEVED, {
    tournaments: tournamentsWithRules,
    total: tournaments.length
  });
});

/**
 * Get user's tournament history - only user's ranking/result for tournaments they participated in
 * Filters: date range (fromDate, toDate), mode (BR, CS, LW), win (top 3 = got reward)
 * GET /api/tournament/userHistory?limit=50&offset=0&fromDate=2026-01-01&toDate=2026-01-31&mode=BR&win=true
 */
const getTournamentHistory = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const fromDate = req.query.fromDate ? String(req.query.fromDate).trim() : null;
  const toDate = req.query.toDate ? String(req.query.toDate).trim() : null;
  const mode = req.query.mode ? String(req.query.mode).trim() : null;
  const win = req.query.win === 'true' || req.query.win === '1';

  if (fromDate && toDate && fromDate > toDate) {
    return res.badRequest('fromDate must be before or equal to toDate');
  }

  const { history, total } = await tournamentService.getTournamentHistory(userId, {
    limit,
    offset,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    mode: mode || undefined,
    win
  });

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENT_HISTORY_RETRIEVED, {
    history,
    total,
    limit,
    offset,
    fromDate: fromDate || null,
    toDate: toDate || null,
    mode: mode || null,
    win
  });
});

/**
 * Get user's lobbies (joined tournaments) - Lobby section
 * GET /api/tournament/my-lobbies
 * Returns tournaments grouped by status: upcoming, live, completed
 * Room ID/pass appears at exact start time (9:00) when tournament goes live
 */
const getMyLobbies = asyncHandler(async (req, res) => {
  const userId = req.userId;

  // Run status check so at exact time (9:00) room appears in joined lobbies
  const { checkTournamentStatusImmediate } = require('../services/scheduler.service');
  try {
    await checkTournamentStatusImmediate(null);
  } catch (checkErr) {
    Logger.error('MyLobbies: Status check failed (non-blocking)', { err: checkErr?.message });
  }
  
  const tournaments = await tournamentService.getJoinedTournaments(userId);

  const now = new Date();
  const isAdmin = req.user && req.user.role === 'admin';

  // Attach lobby-specific rules, apply org-specific team visibility rule, and group by status (filtered by 10-minute rule)
  const tournamentsWithRules = tournaments.map(tournament => {
    const startDateTime = tournamentService.calculateStartDateTime(tournament.date, tournament.startTime);
    const tenMinutesBeforeStart = new Date(startDateTime.getTime() - 10 * 60 * 1000);
    const isWithinPublicationWindow = now >= tenMinutesBeforeStart;
    const isTournamentLive = tournament.status === 'running';

    const shouldSeeRoomInfo = isAdmin || isWithinPublicationWindow || isTournamentLive;

    const t = {
      ...tournament
    };

    // Org BR squad: hide teams with less than 4 players from joinedTeamsList
    if (
      t.organizationId &&
      t.mode === 'BR' &&
      t.subMode === 'squad' &&
      Array.isArray(t.joinedTeamsList)
    ) {
      t.joinedTeamsList = t.joinedTeamsList.filter(team => {
        const count = typeof team.playerCount === 'number' ? team.playerCount : 0;
        return count >= 4;
      });
    }

    t.rules = getFilteredRules(t.mode, t.subMode, t.game);

    if (!shouldSeeRoomInfo && t.room) {
      t.room = {
        roomId: null,
        password: null,
        roomNotificationSent: tournament.room.roomNotificationSent,
        liveStreamUrl: null
      };
    }
    return t;
  });

  // Group tournaments by status for lobby section
  const lobbies = {
    upcoming: tournamentsWithRules.filter(t => ['upcoming', 'locked'].includes(t.status)),
    live: tournamentsWithRules.filter(t => t.status === 'running'),
    resultPending: tournamentsWithRules.filter(t => t.status === 'result_pending'),
    completed: tournamentsWithRules.filter(t => ['completed', 'result_published'].includes(t.status)),
    cancelled: tournamentsWithRules.filter(t => t.status === 'cancelled')
  };
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENTS_RETRIEVED, {
    lobbies,
    total: tournaments.length,
    counts: {
      upcoming: lobbies.upcoming.length,
      live: lobbies.live.length,
      resultPending: lobbies.resultPending.length,
      completed: lobbies.completed.length,
      cancelled: lobbies.cancelled.length
    }
  });
});

/**
 * Get tournament details
 * GET /api/tournament/:tournamentId
 * Works for both regular and special (sponsored) tournaments
 */
const getTournamentDetails = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;
  const userId = req.userId;

  // Check if this is a special tournament first
  try {
    const SpecialTournament = require('../models/SpecialTournament.model');
    const special = await SpecialTournament.findById(tournamentId)
      .populate('createdBy', 'name ign')
      .lean();

    if (special) {
      const { mapSpecialTournamentToListFormat } = require('../services/tournament.service');
      const isAdmin = req.user && req.user.role === 'admin';
      const isParticipant = (special.participants || []).some(p => p.toString() === userId.toString());

      // Find user's current slot info
      let userSlotInfo = null;
      for (const round of (special.rounds || [])) {
        if (round.status !== 'running') continue;
        for (const slot of (round.slots || [])) {
          const inSlot = (slot.teams || []).some(t => t.leaderUserId.toString() === userId.toString());
          if (inSlot) {
            userSlotInfo = {
              roundNumber: round.roundNumber,
              roundName: round.roundName,
              slotIndex: slot.slotIndex,
              room: slot.room,
              matchesPerSlot: round.matchesPerSlot,
              qualifyPerSlot: round.qualifyPerSlot,
              slotTeams: slot.teams.map(t => ({ teamName: t.teamName })),
              status: slot.status
            };
            break;
          }
        }
        if (userSlotInfo) break;
      }

      const base = mapSpecialTournamentToListFormat(special);

      // Admin sees all rounds + slots; users see safe view
      const safeRounds = isAdmin
        ? special.rounds
        : (special.rounds || []).map(r => ({
            roundNumber: r.roundNumber,
            roundName: r.roundName,
            teamsPerSlot: r.teamsPerSlot,
            matchesPerSlot: r.matchesPerSlot,
            qualifyPerSlot: r.qualifyPerSlot,
            status: r.status,
            slotCount: (r.slots || []).length
          }));

      return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENT_DETAILS_RETRIEVED, {
        tournament: {
          ...base,
          rounds: safeRounds,
          isParticipant,
          userSlotInfo,
          winners: special.rewardsDistributed ? special.winners : undefined,
          description: special.description
        }
      });
    }
  } catch (specialErr) {
    // Not a special tournament or lookup failed — fall through to regular
    Logger.error('Special tournament lookup failed', { tournamentId, errName: specialErr.name });
  }

  const tournament = await tournamentService.getTournamentDetails(tournamentId);
  
  // Calculate prize pool dynamically (consistent with list endpoints)
  const { calculateTeamStats, calculatePrizePoolBreakdown } = require('../services/tournament.service');
  const { playersPerTeam, maxTeams } = calculateTeamStats(
    tournament.subMode,
    tournament.maxPlayers,
    tournament.game
  );
  const rawParticipantCount = tournament.participants ? tournament.participants.length : 0;
  const joinedTeams = rawParticipantCount; // Each participant = 1 team
  
  // Calculate current prize pool (based on joined teams) - only if participants joined
  let currentWinnerPrizePool = 0;
  if (joinedTeams > 0) {
    const currentTotalPrizePool = joinedTeams * tournament.entryFee;
    const currentBreakdown = calculatePrizePoolBreakdown(currentTotalPrizePool);
    currentWinnerPrizePool = currentBreakdown.winnerPrizePool;
  }
  
  // Use stored potential prize pool from tournament creation
  const potentialPrizePool = tournament.platformFees?.potentialWinnerPrizePool || 0;
  
  // Show potential prize pool if no players joined, otherwise show current
  const displayPrizePool = joinedTeams > 0 ? currentWinnerPrizePool : potentialPrizePool;
  
  // Check if user is a participant or host
  const isParticipant = tournament.participants.some(
    p => p._id && p._id.toString() === userId
  );
  const isHost = tournament.hostId && tournament.hostId._id && 
    tournament.hostId._id.toString() === userId;
  const isAdmin = req.user && req.user.role === 'admin';
  
  // ✅ 10-MINUTE RULE: Users get room details ONLY 10 minutes before start or when live.
  const startDateTime = tournamentService.calculateStartDateTime(tournament.date, tournament.startTime);
  const now = new Date();
  const tenMinutesBeforeStart = new Date(startDateTime.getTime() - 10 * 60 * 1000);
  const isWithinPublicationWindow = now >= tenMinutesBeforeStart;
  const isTournamentLive = tournament.status === 'running';

  const shouldSeeRoomInfo = isAdmin || ((isParticipant || isHost) && (isWithinPublicationWindow || isTournamentLive));

  if (!isParticipant && !isHost && !isAdmin) {
    // Return limited data for non-participants (public information only)
    return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENT_DETAILS_RETRIEVED, {
      tournament: {
        _id: tournament._id,
        game: tournament.game,
        mode: tournament.mode,
        subMode: tournament.subMode,
        entryFee: tournament.entryFee,
        maxPlayers: tournament.maxPlayers,
        date: tournament.date,
        startTime: tournament.startTime,
        lockTime: tournament.lockTime,
        participantCount: tournament.participants.length,
        prizePool: displayPrizePool, // Use calculated winner prize pool (after fees)
        status: tournament.status,
        lobbyName: tournament.lobbyName || null
      }
    });
  }
  
  // Full data for participants/host (filtered if before publication window)
  const tournamentResponse = {
    ...tournament,
    prizePool: displayPrizePool // Use calculated winner prize pool (after fees)
  };

  if (!shouldSeeRoomInfo) {
    // Filter out room info even for participants/hosts if too early
    if (tournamentResponse.room) {
      tournamentResponse.room = {
        roomId: null,
        password: null,
        roomNotificationSent: tournament.room.roomNotificationSent,
        liveStreamUrl: null
      };
    }
  }
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENT_DETAILS_RETRIEVED, {
    tournament: tournamentResponse
  });
});

/**
 * Join tournament (team leader – same flow as BR)
 * POST /api/tournament/join
 *
 * - CS: max 2 teams. BR/LW: per mode. Adding player names (bando) is optional, same as BR.
 * - Teammates (bando) do not join via this API. After 2 leaders have joined, use
 *   POST /api/tournament/join-team (same keys: tournamentId, teamName, players) so leaders can add bando to the lobby.
 *
 * IMPORTANT: Uses MongoDB transaction to ensure atomicity
 * - Wallet deduction and tournament join happen in single transaction
 * - If either fails, both operations are rolled back
 * - Prevents money loss bugs
 */
const joinTournament = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { tournamentId, teamName, players } = req.body;
  
  if (!tournamentId) {
    return res.badRequest('tournamentId is required');
  }

  // Get tournament to check entry fee (non-lean for methods)
  const Tournament = require('../models/Tournament.model');
  const User = require('../models/User.model');
  const Wallet = require('../models/Wallet.model');
  const WalletHistory = require('../models/WalletHistory.model');
  const mongoose = require('mongoose');
  
  const tournament = await Tournament.findById(tournamentId);
  
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }
  
  // Validate tournament status - only allow joining if status is 'upcoming' or 'locked'
  if (!['upcoming', 'locked'].includes(tournament.status)) {
    return res.badRequest(`Cannot join tournament. Tournament status is: ${tournament.status}. Only upcoming or locked tournaments can be joined.`);
  }
  
  // User can join until 11:29:59 (1 sec before start). Block at 11:30 (start time).
  const tournamentService = require('../services/tournament.service');
  const startDateTime = tournamentService.calculateStartDateTime(tournament.date, tournament.startTime);
  const now = new Date();
  if (now >= startDateTime) {
    return res.badRequest('Cannot join tournament. Tournament has gone live. Join option is now closed.');
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.unauthorized(MESSAGES.ERROR.USER_NOT_FOUND);
  }
  try {
    assertUserFollowsGameForLobby(getUserSelectedGameGroups(user), tournament.game);
  } catch (e) {
    return res.badRequest(e.message);
  }

  // Validate tournament date - check if tournament date is in the past
  const tournamentDate = new Date(tournament.date);
  tournamentDate.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  
  if (tournamentDate < today) {
    return res.badRequest('Cannot join tournament. Tournament date has passed.');
  }
  
  // Check if user has enough balance (read-only check before transaction)
  let wallet;
  try {
    wallet = await walletService.getWalletBalance(userId);
  } catch (walletError) {
    return res.serverError('Failed to retrieve wallet balance. Please try again.');
  }
  
  if (wallet.balanceINR < tournament.entryFee) {
    return res.badRequest(MESSAGES.ERROR.INSUFFICIENT_BALANCE);
  }

  // Check if tournament is locked
  if (tournament.isLocked()) {
    return res.badRequest(MESSAGES.ERROR.TOURNAMENT_LOCKED);
  }

  // Check if user is already a participant
  if (tournament.isParticipant(userId)) {
    return res.badRequest(MESSAGES.ERROR.ALREADY_JOINED);
  }

  // Check if slots are available (uses tournament.maxPlayers)
  if (!tournament.hasAvailableSlots()) {
    return res.badRequest(MESSAGES.ERROR.TOURNAMENT_FULL);
  }

  if (
    tournament.mode === 'CS' &&
    (tournament.participants?.length || 0) >= tournament.maxPlayers
  ) {
    return res.badRequest(MESSAGES.ERROR.TOURNAMENT_FULL);
  }

  // Prepare team data (optional for backward compatibility)
  let teamData = null;
  try {
    const finalTeamName = (teamName && String(teamName).trim().length > 0)
      ? String(teamName).trim()
      : (user && (user.ign || user.name)) || 'Team';

    const maxPlayersPerTeam = tournament.mode === 'CS' ? 4 : 5;
    let playerNames = [];
    if (Array.isArray(players)) {
      playerNames = players
        .map(p => (typeof p === 'string' ? p.trim() : ''))
        .filter(p => p)
        .slice(0, maxPlayersPerTeam);
    }

    const selfName = user && (user.ign || user.name);
    if (selfName && !playerNames.includes(selfName) && playerNames.length < maxPlayersPerTeam) {
      playerNames.unshift(selfName);
    }

    // Org-specific rule: for org BR squad tournaments, team size must be between 4 and 5.
    if (
      tournament.organizationId &&
      tournament.mode === 'BR' &&
      tournament.subMode === 'squad'
    ) {
      const teamSize = playerNames.length;
      if (teamSize < 4 || teamSize > 5) {
        throw new Error('Team must have between 4 and 5 players for organization tournaments');
      }
    }

    teamData = {
      teamName: finalTeamName,
      players: playerNames
    };
  } catch (e) {
    // If validation fails explicitly, surface the message to client
    if (e && e.message && e.message.includes('Team must have between 4 and 5 players')) {
      return res.badRequest(e.message);
    }
    teamData = null;
  }

  // Atomic when MongoDB is a replica set; on standalone dev, same steps run without a transaction.
  const { runWithTransaction } = require('../utils/runWithTransaction');

  let resultTournament;
  try {
    await runWithTransaction(async (session) => {
      let wq = Wallet.findOne({ userId });
      if (session) wq = wq.session(session);
      const w = await wq;
      if (!w) {
        throw new Error('Wallet not found');
      }
      if (w.balanceINR < tournament.entryFee) {
        throw new Error('Insufficient balance');
      }
      w.balanceINR -= tournament.entryFee;
      await w.save(session ? { session } : {});

      await WalletHistory.create(
        [
          {
            userId,
            type: 'join',
            amountINR: tournament.entryFee,
            description: `Joined tournament: ${tournament.game} ${tournament.mode} ${tournament.subMode}`,
            tournamentId
          }
        ],
        session ? { session } : {}
      );

      const updateQuery = {
        $addToSet: { participants: userId },
        $set: { updatedAt: now }
      };

      if (teamData && teamData.teamName) {
        updateQuery.$push = {
          teams: {
            leaderUserId: userId,
            teamName: teamData.teamName,
            players: Array.isArray(teamData.players)
              ? teamData.players.map(name => ({ name }))
              : []
          }
        };
      }

      const findOpts = { returnDocument: 'after', runValidators: true };
      if (session) findOpts.session = session;

      resultTournament = await Tournament.findOneAndUpdate(
        {
          _id: tournamentId,
          status: { $in: ['upcoming', 'locked'] },
          participants: { $ne: userId },
          $expr: {
            $and: [
              { $lt: [{ $size: { $ifNull: ['$participants', []] } }, '$maxPlayers'] },
              { $gt: ['$lockTime', now] }
            ]
          }
        },
        updateQuery,
        findOpts
      );

      if (!resultTournament) {
        throw new Error('Tournament is locked, full, or cannot be joined');
      }
    });
    
    // Prize pool is automatically updated by Tournament pre-save hook (no need for explicit call)
    
    // Get filtered rules for this tournament type
    const filteredRules = getFilteredRules(
      resultTournament.mode,
      resultTournament.subMode,
      resultTournament.game
    );
    
    // Broadcast update for dynamic joinedTeams count on public API
    // NOTE: Previously we also broadcasted via WebSocket for lobby list updates.
    // That responsibility is now handled by SSE to reduce socket load for this use-case.
    // const { broadcastTournamentUpdate } = require('../services/websocket.service');
    // const joinedTeams = resultTournament.participants?.length || 0;
    // broadcastTournamentUpdate(tournamentId.toString(), { status: resultTournament.status, joinedTeams });

    const joinedTeams = resultTournament.participants?.length || 0;

    // SSE broadcast for tournament list UI – minimal payload so frontend
    // can patch the specific card without re-fetching the full list.
    try {
      broadcastTournamentListUpdate({
        type: 'slots',
        tournamentId: resultTournament._id.toString(),
        game: resultTournament.game,
        participantCount: joinedTeams,
        maxPlayers: resultTournament.maxPlayers
      });
    } catch (e) {
      Logger.error('SSE: failed to broadcast tournament join update', {
        tournamentId: resultTournament?._id?.toString?.() || null,
        errName: e.name
      });
    }

    res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENT_JOINED, {
      tournamentId,
      entryFee: tournament.entryFee,
      rules: filteredRules
    });
    
  } catch (error) {
    Logger.error('Tournament join failed', { error: error.message, userId, tournamentId });
    return res.badRequest(error.message || 'Failed to join tournament. Please try again.');
  }
});

/**
 * Update room information (Host or Admin only)
 * POST /api/host/tournaments/:tournamentId/update-room (Host)
 * POST /api/admin/tournaments/:tournamentId/update-room (Admin)
 * Host can update room for upcoming, locked, and running tournaments (e.g. when approved after lobby went live)
 */
const updateRoom = asyncHandler(async (req, res) => {
  const tournamentId = req.params.tournamentId || req.body.tournamentId;
  const { roomId, password, liveStreamUrl } = req.body;
  
  if (!tournamentId) {
    return res.badRequest('tournamentId is required');
  }

  const Tournament = require('../models/Tournament.model');
  const User = require('../models/User.model');
  const tournamentService = require('../services/tournament.service');
  const tournament = await Tournament.findById(tournamentId);
  
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }
  
  // Get user to check role
  const user = await User.findById(req.userId);
  if (!user) {
    return res.unauthorized(MESSAGES.ERROR.USER_NOT_FOUND);
  }
  
  // Check if user is admin
  const isAdmin = user.role === 'admin';
  
  // Check if user is the assigned host
  const isHost = tournament.hostId && tournament.hostId.toString() === req.userId;
  
  // Allow only admin or assigned host
  if (!isAdmin && !isHost) {
    return res.forbidden('Only the assigned host or admin can update room information');
  }

  // For hosts (not admin): allow room update for upcoming, locked, AND running tournaments
  // Host may be approved after tournament went live - they need to add/update room ID
  // Admin can always update regardless of status

  // ✅ Check if room ID or password is actually changing
  // If room details change, reset notification flag so users get notified again
  const currentRoomId = tournament.room?.roomId || null;
  const currentPassword = tournament.room?.password || null;
  const roomIdChanged = roomId !== undefined && roomId !== currentRoomId;
  const passwordChanged = password !== undefined && password !== currentPassword;
  const roomDetailsChanged = roomIdChanged || passwordChanged;

  // Update room ID, password, and optional live stream link (only if provided, preserve existing if undefined)
  if (roomId !== undefined) {
    tournament.room.roomId = roomId;
  }
  if (password !== undefined) {
    tournament.room.password = password;
  }
  if (liveStreamUrl !== undefined) {
    tournament.room.liveStreamUrl = liveStreamUrl && String(liveStreamUrl).trim() ? String(liveStreamUrl).trim() : null;
  }
  
  // ✅ Reset notification flag if room details changed, so users get notified again
  if (roomDetailsChanged && tournament.room) {
    tournament.room.roomNotificationSent = false;
  }
  
  await tournament.save();
  
  // ✅ EVENT-DRIVEN: Transition to live if room details added at start time
  const { broadcastTournamentUpdate } = require('../services/websocket.service');
  const { sendRoomUpdateNotification } = require('../services/notification.service');
  
  try {
    // Reload tournament to get latest data and populate participants for notification
    await tournament.populate('hostId', 'name email');
    await tournament.populate('participants', 'name email');
    
    // 1. Try to transition to live status (if it's start time and room is present)
    // autoUpdateTournamentStatus now returns the count of updated tournaments and handles its own notification.
    const updatedCount = await tournamentService.autoUpdateTournamentStatus(tournamentId);
    
    let notificationResult = { delayed: false };
    
    // 2. If it didn't transition to live (meaning it was already live or it's still too early),
    // we manually call notification service. It will handle the 10-min rule (send or delay).
    // Note: sendRoomUpdateNotification already handles WebSocket broadcasts and FCM notifications internally
    if (updatedCount === 0) {
      notificationResult = await sendRoomUpdateNotification(tournament, tournament.room, 'room-updated');
    }
    
    // Don't call broadcastTournamentUpdate here - sendRoomUpdateNotification already handles all notifications
    // This prevents duplicate notifications (WebSocket + FCM)

    return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.ROOM_UPDATED, {
      tournamentId,
      room: tournament.room,
      delayed: notificationResult?.delayed || false
    });
  } catch (error) {
    Logger.error('Error checking/broadcasting tournament status', error);
  }
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.ROOM_UPDATED, {
    tournamentId,
    room: tournament.room,
    delayed: false
  });
});

/**
 * Notify all users that lobby is filling up (attract users to join)
 * Admin or Host only. Sends push notification to all connected clients.
 * POST /api/admin/tournaments/:tournamentId/notify-lobby-filling
 * POST /api/host/tournaments/:tournamentId/notify-lobby-filling
 */
const notifyLobbyFilling = asyncHandler(async (req, res) => {
  const tournamentId = req.params.tournamentId;
  if (!tournamentId) {
    return res.badRequest('tournamentId is required');
  }

  const Tournament = require('../models/Tournament.model');
  const User = require('../models/User.model');
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }

  const user = await User.findById(req.userId);
  if (!user) {
    return res.unauthorized(MESSAGES.ERROR.USER_NOT_FOUND);
  }
  const isAdmin = user.role === 'admin';
  const isHost = tournament.hostId && tournament.hostId.toString() === req.userId;
  if (!isAdmin && !isHost) {
    return res.forbidden('Only admin or the assigned host can send lobby filling notification');
  }

  const { sendLobbyFillingNotification } = require('../services/notification.service');
  const result = sendLobbyFillingNotification(tournament);
  if (!result.success) {
    return res.badRequest(result.message || 'Failed to send notification');
  }

  res.success(HTTP_STATUS.OK, 'Lobby filling notification sent to all users', {
    tournamentId,
    lobbyName: tournament.lobbyName || null,
    participantCount: tournament.participants?.length ?? 0,
    maxPlayers: tournament.maxPlayers
  });
});

/**
 * Submit one match result – Host only.
 * BR: call per match (6 matches). Body: teamName, position, kills. Backend sets totalPoint.
 * CS: one match (matchIndex 0). Host declares in one go: teamName, position (1=winner, 2=loser), kills=0, roundScore (e.g. 7 and 6) for display. Same endpoint.
 * POST /api/tournament/submit-match-result
 * Body: { tournamentId, matchIndex, teams: [ { teamName, position, kills?, roundScore? } ] }
 */
const submitMatchResult = asyncHandler(async (req, res) => {
  const { tournamentId, matchIndex, teams } = req.body;
  const hostUserId = req.userId;

  if (!tournamentId) return res.badRequest('tournamentId is required');
  if (matchIndex === undefined || matchIndex === null) return res.badRequest('matchIndex is required');
  if (!Number.isInteger(matchIndex) || matchIndex < 0) return res.badRequest('matchIndex must be a non-negative integer');
  if (!teams || !Array.isArray(teams)) return res.badRequest('teams array is required');
  if (teams.length === 0) return res.badRequest('teams array cannot be empty');

  for (const t of teams) {
    if (!t.teamName || typeof t.teamName !== 'string' || !t.teamName.trim()) {
      return res.badRequest('Each team must have teamName');
    }
    if (t.position !== undefined && (typeof t.position !== 'number' || t.position < 1)) {
      return res.badRequest('Each team must have position (min: 1)');
    }
    if (t.kills !== undefined && (typeof t.kills !== 'number' || t.kills < 0)) {
      return res.badRequest('Each team must have kills (min: 0)');
    }
    if (t.roundScore !== undefined && (typeof t.roundScore !== 'number' || t.roundScore < 0)) {
      return res.badRequest('Each team roundScore must be a non-negative number');
    }
  }

  try {
    const { tournament, standings, matchResults } = await tournamentService.submitMatchResult(tournamentId, matchIndex, teams, hostUserId);
    res.success(HTTP_STATUS.OK, 'Match result submitted', {
      tournamentId: tournament._id.toString(),
      matchIndex,
      matchResultsCount: (tournament.matchResults || []).length,
      matchResults,
      standings
    });
  } catch (error) {
    if (error.message === 'Tournament not found') return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
    if (error.message.includes('Only the assigned host')) return res.forbidden(error.message);
    return res.badRequest(error.message);
  }
});

/**
 * Pre-check if host can submit final result (for UI to enable/disable button and show reason).
 * GET /api/tournament/:tournamentId/can-submit-final-result
 */
const getCanSubmitFinalResult = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;
  const hostUserId = req.userId;
  if (!tournamentId) return res.badRequest('tournamentId is required');
  try {
    const data = await tournamentService.getCanSubmitFinalResult(tournamentId, hostUserId);
    res.success(HTTP_STATUS.OK, data.canSubmit ? 'Ready to submit final result' : data.reason || 'Not ready', data);
  } catch (error) {
    if (error.message === 'Tournament not found') return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
    return res.error(HTTP_STATUS.INTERNAL_SERVER_ERROR, error.message);
  }
});

/**
 * Submit final result – Host only. Call after all 6 matches submitted and disputes resolved.
 * POST /api/tournament/submit-final-result
 * Body: { tournamentId }
 */
const submitFinalResult = asyncHandler(async (req, res) => {
  const { tournamentId } = req.body;
  const hostUserId = req.userId;

  if (!tournamentId) return res.badRequest('tournamentId is required');

  try {
    await tournamentService.submitFinalResult(tournamentId, hostUserId);
    res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.RESULT_SUBMITTED, { tournamentId });
  } catch (error) {
    if (error.message === 'Tournament not found') return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
    if (error.message.includes('Only the assigned host')) return res.forbidden(error.message);
    return res.badRequest(error.message);
  }
});

/**
 * Get live match results and standings for a tournament (for users to see participant results).
 * GET /api/tournament/:tournamentId/live-results
 */
const getLiveResults = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;
  if (!tournamentId) return res.badRequest('tournamentId is required');

  try {
    await tournamentService.assertUserCanViewLiveResults(tournamentId, req.userId, req.user);
    const data = await tournamentService.getLiveResults(tournamentId);
    res.success(HTTP_STATUS.OK, 'Live results retrieved', data);
  } catch (error) {
    if (error.code === 'TOURNAMENT_NOT_FOUND' || error.message === 'Tournament not found') {
      return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
    }
    if (error.code === 'FORBIDDEN_LIVE_RESULTS') {
      return res.forbidden(error.message);
    }
    return res.error(HTTP_STATUS.INTERNAL_SERVER_ERROR, error.message);
  }
});

/**
 * SSE: live standings / match results for one tournament (same data as GET …/live-results).
 * Host ke har match / final submit par `event: update` — payload WebSocket `tournament:live-results-updated` jaisa.
 * GET /api/tournament/:tournamentId/live-results/stream?access_token=…
 */
const streamTournamentLiveResults = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;
  try {
    await tournamentService.assertUserCanViewLiveResults(tournamentId, req.userId, req.user);
  } catch (error) {
    const deny = (status, msg) => {
      if (!res.headersSent) {
        res.status(status);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end(msg);
      }
    };
    if (error.code === 'TOURNAMENT_NOT_FOUND' || error.message === 'Tournament not found') {
      return deny(404, 'Tournament not found');
    }
    if (error.code === 'FORBIDDEN_LIVE_RESULTS') {
      return deny(403, error.message);
    }
    return deny(500, error.message || 'Internal error');
  }
  const { attachTournamentLiveResultsSse } = require('../services/tournamentLiveResultsSse.service');
  await attachTournamentLiveResultsSse(req, res, tournamentId);
});

/**
 * Claim reward (Merged endpoint - checks eligibility and claims in one call)
 * POST /api/tournament/claim-reward
 * 
 * This endpoint replaces the old two-step process:
 * - Old: GET claim-status → POST claim-reward
 * - New: POST claim-reward (checks eligibility internally)
 */
const claimReward = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { tournamentId } = req.body;
  
  if (!tournamentId) {
    return res.badRequest('tournamentId is required');
  }

  // Get tournament first
  const Tournament = require('../models/Tournament.model');
  const tournament = await Tournament.findById(tournamentId);
  
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }

  // Check if results are published
  if (tournament.status !== 'completed' && tournament.status !== 'result_published') {
    return res.badRequest('Results not published yet. Please wait for tournament completion.');
  }

  // Find user's result
  const result = tournament.results.find(r => r.userId.toString() === userId.toString());
  
  if (!result) {
    return res.badRequest('You are not eligible for rewards. You did not place in the top 3.');
  }

  // Check if already claimed
  if (result.claimed) {
    return res.badRequest(MESSAGES.ERROR.REWARD_ALREADY_CLAIMED);
  }

  // Check if user has a valid reward
  if (!result.rewardGC || result.rewardGC <= 0) {
    return res.badRequest('No reward available for your position.');
  }
  
  // Add reward to wallet
  await walletService.addReward(
    userId,
    result.rewardGC,
    `Reward for ${tournament.game} ${tournament.mode} ${tournament.subMode} - Position ${result.position}`,
    tournamentId
  );

  // Mark as claimed
  result.claimed = true;
  await tournament.save();
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.REWARD_CLAIMED, {
    tournamentId,
    rewardGC: result.rewardGC,
    position: result.position,
    kills: result.kills || 0
  });
});

/**
 * Get lobby chat history – sirf participants aur host ke liye, jab lobby live ho
 * Jab tournament completed/cancelled ho jayega tab chat DB se clear ho jata hai
 * GET /api/tournament/:tournamentId/chat?limit=50&skip=0
 */
const getLobbyChatHistory = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { tournamentId } = req.params;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

  const Tournament = require('../models/Tournament.model');
  const LobbyChatMessage = require('../models/LobbyChatMessage.model');

  const tournament = await Tournament.findById(tournamentId).select('status participants hostId');
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }
  const userIdStr = userId.toString();
  const isParticipant = tournament.participants?.some(p => p.toString() === userIdStr);
  const isHost = tournament.hostId && tournament.hostId.toString() === userIdStr;
  if (!isParticipant && !isHost) {
    return res.forbidden('Only participants and host can view lobby chat');
  }
  if (tournament.status !== 'running') {
    return res.badRequest('Chat history is only available when lobby is live');
  }

  const messages = await LobbyChatMessage.find({ tournamentId })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .select('userId senderName role message createdAt')
    .lean();

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.LOBBY_CHAT_RETRIEVED, {
    tournamentId,
    messages,
    limit,
    skip
  });
});

/**
 * Join / update team (bando) in lobby.
 * POST /api/tournament/join-team
 * Same keys as BR join: tournamentId, teamName, players (optional).
 * Use case: After leaders have joined via POST /join, leaders update their bando list.
 */
const joinTeam = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { tournamentId, teamName, players } = req.body;

  if (!tournamentId) {
    return res.badRequest('tournamentId is required');
  }

  const Tournament = require('../models/Tournament.model');
  const User = require('../models/User.model');

  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }

  // Only allow updates before tournament ends
  if (!['upcoming', 'locked', 'running'].includes(tournament.status)) {
    return res.badRequest(`Cannot update team. Tournament status is: ${tournament.status}`);
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.unauthorized(MESSAGES.ERROR.USER_NOT_FOUND);
  }

  const userIdStr = userId.toString();
  const team = (tournament.teams || []).find(
    t => t.leaderUserId && t.leaderUserId.toString() === userIdStr &&
      (!teamName || (t.teamName && t.teamName === teamName))
  );

  if (!team) {
    return res.badRequest('No team found for this user in the tournament');
  }

  const maxPlayersPerTeam = tournament.mode === 'CS' ? 4 : 5;
  let playerNames = [];
  if (Array.isArray(players)) {
    playerNames = players
      .map(p => (typeof p === 'string' ? p.trim() : ''))
      .filter(p => p)
      .slice(0, maxPlayersPerTeam);
  }

  const selfName = user && (user.ign || user.name);
  if (selfName && !playerNames.includes(selfName) && playerNames.length < maxPlayersPerTeam) {
    playerNames.unshift(selfName);
  }

  // Org-specific rule: for org BR squad tournaments, team size must be between 4 and 5.
  if (
    tournament.organizationId &&
    tournament.mode === 'BR' &&
    tournament.subMode === 'squad'
  ) {
    const teamSize = playerNames.length;
    if (teamSize < 4 || teamSize > 5) {
      return res.badRequest('Team must have between 4 and 5 players for organization tournaments');
    }
  }

  team.players = playerNames.map(name => ({ name }));
  await tournament.save();

  res.success(HTTP_STATUS.OK, 'Team updated successfully', {
    tournamentId,
    teamName: team.teamName,
    playerCount: team.players.length
  });
});

module.exports = {
  broadcastTournamentListUpdate,
  getTournamentList,
  streamTournamentList,
  getJoinedTournaments,
  getMyLobbies,
  getTournamentHistory,
  getTournamentDetails,
  joinTournament,
  joinTeam,
  updateRoom,
  notifyLobbyFilling,
  submitMatchResult,
  submitFinalResult,
  getCanSubmitFinalResult,
  getLiveResults,
  streamTournamentLiveResults,
  claimReward,
  getLobbyChatHistory
};
