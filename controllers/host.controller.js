/**
 * Host Controller
 * Handles host-only API requests
 */

const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS, MESSAGES } = require('../constants');
const { getFilteredRules } = require('../utils/lobbyRules.helper');
const Tournament = require('../models/Tournament.model');
const HostApplication = require('../models/HostApplication.model');
const tournamentService = require('../services/tournament.service');
const Logger = require('../utils/logger');

/**
 * List tournaments available for host to apply
 * GET /api/host/tournaments/available
 * Shows all tournaments that hosts can apply to, with application status
 */
const listAvailableTournaments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const status = req.query.status; // 'upcoming', 'locked'
  const skip = (page - 1) * limit;

  const hostId = req.userId;

  // Build query - show tournaments that are available for application
  // Only show upcoming or locked tournaments (not running, completed, etc.)
  const query = {};
  if (status) {
    query.status = status;
  } else {
    // Default: show upcoming and locked tournaments
    query.status = { $in: ['upcoming', 'locked'] };
  }

  // Get total count
  const total = await Tournament.countDocuments(query);

  // Get tournaments with pagination (DO NOT populate participants for performance)
  const tournaments = await Tournament.find(query)
    .populate('hostId', 'name email')
    .sort({ date: 1, startTime: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Get all host applications for these tournaments in one query
  const tournamentIds = tournaments.map(t => t._id);
  const hostApplications = await HostApplication.find({
    tournamentId: { $in: tournamentIds },
    hostId: hostId
  }).lean();

  // Create a map for quick lookup
  const applicationMap = {};
  hostApplications.forEach(app => {
    applicationMap[app.tournamentId.toString()] = {
      applicationId: app._id.toString(),
      status: app.status, // 'pending', 'approved', 'rejected'
      appliedAt: app.createdAt
    };
  });

  // Process tournaments with application status and prize pool info
  const tournamentsWithApplications = tournaments.map(tournament => {
    // Calculate team stats using reusable function
    const { playersPerTeam, maxTeams } = tournamentService.calculateTeamStats(tournament.subMode, tournament.maxPlayers);
    
    // Calculate joined teams based on subMode
    // Each participant entry = 1 team (team leader joins, other team members are optional)
    // For 1v1/solo: 1 participant = 1 team (1 player)
    // For 2v2/duo: 1 participant = 1 team (can have up to 2 players)
    // For 4v4/squad: 1 participant = 1 team (can have up to 4 players)
    const rawParticipantCount = Array.isArray(tournament.participants)
      ? tournament.participants.length
      : 0;
    const joinedTeams = rawParticipantCount;
    const availableTeams = maxTeams !== null ? (maxTeams - joinedTeams) : null;

    // Calculate current prize pool (only if participants joined) using reusable function
    let currentWinnerPrizePool = 0;
    if (joinedTeams > 0) {
      const currentTotalPrizePool = joinedTeams * tournament.entryFee;
      const currentBreakdown = tournamentService.calculatePrizePoolBreakdown(currentTotalPrizePool);
      currentWinnerPrizePool = currentBreakdown.winnerPrizePool;
    }

    // Use stored potential prize pool from tournament creation (no recalculation)
    const potentialPrizePoolBreakdown = {
      totalPrizePool: tournament.platformFees?.potentialTotalPrizePool || 0,
      platformFee: tournament.platformFees?.potentialPlatformFee || 0,
      hostFee: tournament.platformFees?.potentialHostFee || 0,
      casterFee: tournament.platformFees?.potentialCasterFee || 0,
      totalFees: tournament.platformFees?.potentialTotalFees || 0,
      winnerPrizePool: tournament.platformFees?.potentialWinnerPrizePool || 0
    };

    // Same behavior as user list: if no teams joined show potential, otherwise show current
    const displayPrizePool = joinedTeams > 0 ? currentWinnerPrizePool : potentialPrizePoolBreakdown.winnerPrizePool;

    // Remove unused platformFees field and create clean response
    const { platformFees, ...tournamentWithoutPlatformFees } = tournament;

    // Get application status for this tournament
    const application = applicationMap[tournament._id.toString()] || null;

    return {
      ...tournamentWithoutPlatformFees,
      prizePool: displayPrizePool,
      potentialPrizePool: potentialPrizePoolBreakdown,
      maxTeams,
      joinedTeams,
      availableTeams,
      playersPerTeam,
      lobbyName: tournament.lobbyName || null,
      // Room information (roomId and password) - visible to all users
      room: tournament.room || { roomId: null, password: null },
      // Attach lobby-specific rules so host sees exactly the same rules data as users
      rules: getFilteredRules(tournament.mode, tournament.subMode, tournament.game),
      // Application status - this is what frontend needs to show "Applied" button
      hasApplied: application !== null,
      applicationStatus: application ? application.status : null, // 'pending', 'approved', 'rejected', or null
      hostApplication: application // Full application object if exists, null otherwise
    };
  });

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENTS_RETRIEVED_HOST, {
    tournaments: tournamentsWithApplications,
    total,
    filters: {
      status: status || null,
      date: req.query.date || null,
      subMode: req.query.subMode || null,
      mode: req.query.mode || null
    },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

/**
 * Apply to host a tournament
 * POST /api/host/tournaments/:tournamentId/apply
 */
const applyForTournament = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;
  const { applicationDetails } = req.body;
  const hostId = req.userId;

  // Check if tournament exists
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }

  // Check if host has already applied for this tournament
  const existingApplication = await HostApplication.findOne({
    tournamentId: tournamentId,
    hostId: hostId
  });

  if (existingApplication) {
    return res.badRequest(MESSAGES.ERROR.HOST_APPLICATION_ALREADY_EXISTS);
  }

  // Create new application
  const application = new HostApplication({
    tournamentId: tournamentId,
    hostId: hostId,
    status: 'pending',
    applicationDetails: applicationDetails || {}
  });

  await application.save();

  // Populate tournament and host details for response
  await application.populate('tournamentId', 'game mode subMode date startTime');
  await application.populate('hostId', 'name email');

  try {
    const { broadcastHostApplicationSubmittedToAdmins } = require('../services/hostApplicationSse.service');
    const t = application.tournamentId;
    const h = application.hostId;
    broadcastHostApplicationSubmittedToAdmins({
      id: application._id.toString(),
      status: application.status,
      tournamentId: t && t._id ? t._id.toString() : application.tournamentId.toString(),
      tournament: t && typeof t === 'object' && t.game
        ? {
            game: t.game,
            mode: t.mode,
            subMode: t.subMode,
            date: t.date,
            startTime: t.startTime
          }
        : null,
      hostId: h && h._id ? h._id.toString() : application.hostId.toString(),
      host: h && typeof h === 'object' && h.name
        ? { name: h.name, email: h.email }
        : null,
      createdAt: application.createdAt,
      applicationDetails: application.applicationDetails || {}
    });
  } catch (sseErr) {
    Logger.error('Host application SSE: submit broadcast failed', { message: sseErr?.message });
  }

  res.success(HTTP_STATUS.CREATED, MESSAGES.SUCCESS.HOST_APPLICATION_SUBMITTED, {
    application: {
      id: application._id,
      tournament: application.tournamentId,
      host: application.hostId,
      status: application.status,
      applicationDetails: application.applicationDetails
    }
  });
});

/**
 * List host's own applications
 * GET /api/host/applications
 */
const listMyApplications = asyncHandler(async (req, res) => {
  const hostId = req.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const status = req.query.status; // 'pending', 'approved', 'rejected'
  const date = req.query.date; // Filter by tournament date (YYYY-MM-DD)
  const skip = (page - 1) * limit;

  // Build query
  const query = { hostId: hostId };
  if (status) {
    query.status = status;
  }

  // If date filter is provided, first get tournament IDs for that date
  let tournamentIds = null;
  if (date) {
    // Validate date format
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return res.badRequest('Invalid date format. Must be YYYY-MM-DD');
    }
    
    // Create date range for exact date match (UTC)
    const dateRange = createDateRange(date);
    const tournamentsForDate = await Tournament.find({
      date: { $gte: dateRange.start, $lt: dateRange.end }
    }).select('_id').lean();
    
    tournamentIds = tournamentsForDate.map(t => t._id);
    
    // If no tournaments found for this date, return empty result
    if (tournamentIds.length === 0) {
      return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.HOST_APPLICATIONS_RETRIEVED, {
        applications: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        },
        filters: {
          status: status || null,
          date: date || null
        }
      });
    }
    
    // Add tournament date filter to query
    query.tournamentId = { $in: tournamentIds };
  }

  // Get total count
  const total = await HostApplication.countDocuments(query);

  // Get applications with pagination
  const applications = await HostApplication.find(query)
    .populate('tournamentId', 'game mode subMode date startTime entryFee maxPlayers status')
    .populate('adminId', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Enrich each application's tournament with prize pool / team info (using tournamentService)
  const applicationsWithTournamentDetails = applications.map(app => {
    const t = app.tournamentId;

    if (!t) {
      return app;
    }

    const { playersPerTeam, maxTeams } = tournamentService.calculateTeamStats(t.subMode, t.maxPlayers);
    const joinedTeams = 0; // From applications view, treat as not yet filled
    const availableTeams = maxTeams !== null ? maxTeams : null;

    const currentTotalPrizePool = joinedTeams * t.entryFee;
    const currentBreakdown = tournamentService.calculatePrizePoolBreakdown(currentTotalPrizePool);

    const potentialTotalPrizePool = maxTeams * t.entryFee;
    const potentialBreakdown = tournamentService.calculatePrizePoolBreakdown(potentialTotalPrizePool);

    const displayPrizePool = joinedTeams > 0 ? currentBreakdown.winnerPrizePool : potentialBreakdown.winnerPrizePool;

    return {
      ...app,
      tournamentId: {
        ...t,
        joinedTeams,
        availableTeams,
        prizePool: displayPrizePool,
        lobbyName: t.lobbyName || null,
        currentPrizePool: {
          totalPrizePool: currentBreakdown.totalPrizePool,
          platformFee: currentBreakdown.platformFee,
          hostFee: currentBreakdown.hostFee,
          casterFee: currentBreakdown.casterFee,
          totalFees: currentBreakdown.totalFees,
          winnerPrizePool: currentBreakdown.winnerPrizePool
        },
        potentialPrizePool: {
          totalPrizePool: potentialBreakdown.totalPrizePool,
          platformFee: potentialBreakdown.platformFee,
          hostFee: potentialBreakdown.hostFee,
          casterFee: potentialBreakdown.casterFee,
          totalFees: potentialBreakdown.totalFees,
          winnerPrizePool: potentialBreakdown.winnerPrizePool
        },
        maxTeams,
        joinedTeams,
        availableTeams,
        playersPerTeam
      }
    };
  });

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.HOST_APPLICATIONS_RETRIEVED, {
    applications: applicationsWithTournamentDetails,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

// updateRoom: Use POST /api/host/tournaments/:tournamentId/update-room (imported from tournament.controller)

/**
 * Mark tournament as ended (Host only)
 * POST /api/host/tournaments/:tournamentId/end
 * Moves tournament from 'running' to 'result_pending' status
 */
const endTournament = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;
  const hostId = req.userId;

  if (!tournamentId) {
    return res.badRequest('tournamentId is required');
  }

  const tournament = await Tournament.findById(tournamentId);
  
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }

  // Check if user is the assigned host
  if (!tournament.hostId || tournament.hostId.toString() !== hostId) {
    return res.forbidden('Only the assigned host can end the tournament');
  }

  // Only allow ending if tournament is currently running
  if (tournament.status !== 'running') {
    return res.badRequest(`Cannot end tournament. Current status is: ${tournament.status}. Only running tournaments can be ended.`);
  }

  // Mark tournament as ended (result_pending)
  tournament.status = 'result_pending';
  await tournament.save();
  
  // Broadcast status change via WebSocket
  const { broadcastTournamentUpdate } = require('../services/websocket.service');
  try {
    await tournament.populate('participants', '_id');
    const participantIds = tournament.participants.map(p => p._id.toString());
    const hostIdStr = tournament.hostId ? tournament.hostId.toString() : null;
    
    broadcastTournamentUpdate(tournamentId.toString(), {
      status: 'result_pending',
      tournamentId: tournamentId.toString(),
      date: tournament.date,
      startTime: tournament.startTime,
      mode: tournament.mode,
      subMode: tournament.subMode,
      message: 'Tournament ended. Waiting for results to be published.'
    }, {
      userId: null,
      hostId: hostIdStr,
      broadcastToAll: true
    });
  } catch (error) {
    Logger.error('Error broadcasting tournament end status', error);
  }
  
  res.success(HTTP_STATUS.OK, 'Tournament marked as ended. Please publish results.', {
    tournamentId,
    status: tournament.status
  });
});

/**
 * Helper: Map tournament to details (prize pool, teams, etc.)
 */
const mapTournamentToDetails = (tournament) => {
  const { playersPerTeam, maxTeams } = tournamentService.calculateTeamStats(tournament.subMode, tournament.maxPlayers);
  const rawParticipantCount = Array.isArray(tournament.participants) ? tournament.participants.length : 0;
  const joinedTeams = Math.floor(rawParticipantCount / playersPerTeam);
  const availableTeams = maxTeams !== null ? (maxTeams - joinedTeams) : null;

  let currentWinnerPrizePool = 0;
  if (joinedTeams > 0) {
    const currentTotalPrizePool = joinedTeams * tournament.entryFee;
    const currentBreakdown = tournamentService.calculatePrizePoolBreakdown(currentTotalPrizePool);
    currentWinnerPrizePool = currentBreakdown.winnerPrizePool;
  }

  const potentialPrizePoolBreakdown = {
    totalPrizePool: tournament.platformFees?.potentialTotalPrizePool || 0,
    platformFee: tournament.platformFees?.potentialPlatformFee || 0,
    hostFee: tournament.platformFees?.potentialHostFee || 0,
    casterFee: tournament.platformFees?.potentialCasterFee || 0,
    totalFees: tournament.platformFees?.potentialTotalFees || 0,
    winnerPrizePool: tournament.platformFees?.potentialWinnerPrizePool || 0
  };

  const displayPrizePool = joinedTeams > 0 ? currentWinnerPrizePool : potentialPrizePoolBreakdown.winnerPrizePool;
  const { platformFees, ...tournamentWithoutPlatformFees } = tournament;

  return {
    ...tournamentWithoutPlatformFees,
    prizePool: displayPrizePool,
    potentialPrizePool: potentialPrizePoolBreakdown,
    maxTeams,
    joinedTeams,
    availableTeams,
    playersPerTeam,
    lobbyName: tournament.lobbyName || null,
    room: tournament.room || { roomId: null, password: null },
    rules: getFilteredRules(tournament.mode, tournament.subMode, tournament.game)
  };
};

/**
 * Helper: Create date range for exact date match (UTC)
 * @param {string} dateString - YYYY-MM-DD
 * @returns {{ start: Date, end: Date }}
 */
const createDateRange = (dateString) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`Invalid date format. Expected YYYY-MM-DD, got: ${dateString}`);
  }
  const [year, month, day] = dateString.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  return { start, end };
};

/**
 * Get host's assigned lobbies
 * GET /api/host/my-lobbies
 * Query: status (optional) - Filter by status. When omitted: returns upcoming + live grouped.
 *        When status=completed|cancelled|result_pending: returns history with pagination, date filters.
 *        Also supports: date, fromDate, toDate, page, limit (for history mode)
 */
const getMyLobbies = asyncHandler(async (req, res) => {
  const hostId = req.userId;
  const status = req.query.status;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const date = req.query.date;
  const fromDate = req.query.fromDate;
  const toDate = req.query.toDate;

  // History mode: status filter for past lobbies (completed, cancelled, result_pending)
  const isHistoryMode = status && ['completed', 'cancelled', 'result_pending'].includes(status);

  if (isHistoryMode) {
    // --- History response: paginated past lobbies ---
    const skip = (page - 1) * limit;
    const query = {
      hostId,
      status: status === 'completed' ? { $in: ['completed', 'result_published'] }
        : status === 'cancelled' ? 'cancelled'
        : 'result_pending'
    };

    if (date) {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        return res.badRequest('Invalid date format. Must be YYYY-MM-DD');
      }
      const { start, end } = createDateRange(date);
      query.date = { $gte: start, $lt: end };
    } else if (fromDate || toDate) {
      query.date = {};
      if (fromDate) {
        const fromDateObj = new Date(fromDate);
        if (isNaN(fromDateObj.getTime())) {
          return res.badRequest('Invalid fromDate format. Must be YYYY-MM-DD');
        }
        fromDateObj.setUTCHours(0, 0, 0, 0);
        query.date.$gte = fromDateObj;
      }
      if (toDate) {
        const toDateObj = new Date(toDate);
        if (isNaN(toDateObj.getTime())) {
          return res.badRequest('Invalid toDate format. Must be YYYY-MM-DD');
        }
        toDateObj.setUTCHours(23, 59, 59, 999);
        query.date.$lte = toDateObj;
      }
    }

    const total = await Tournament.countDocuments(query);
    const tournaments = await Tournament.find(query)
      .populate('hostId', 'name email')
      .sort({ date: -1, startTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const lobbies = tournaments.map(mapTournamentToDetails);

    return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.HOST_LOBBY_HISTORY_RETRIEVED, {
      lobbies,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      filters: { date: date || null, fromDate: fromDate || null, toDate: toDate || null, status }
    });
  }

  // --- Active lobbies: upcoming + live (no status or invalid status) ---
  if (status && !['upcoming', 'live', 'running'].includes(status)) {
    return res.badRequest('Invalid status. Use: upcoming, live, completed, cancelled, or result_pending');
  }

  // AUTO-CHECK: Cancel tournaments that passed start time with insufficient teams
  try {
    await tournamentService.checkAndCancelInsufficientTeams();
  } catch (error) {
    Logger.error('Error checking and cancelling insufficient teams tournaments', error);
  }

  try {
    await tournamentService.markExpiredTournaments();
  } catch (error) {
    Logger.error('Error marking expired tournaments', error);
  }

  const tournaments = await Tournament.find({ hostId })
    .populate('hostId', 'name email')
    .sort({ date: 1, startTime: 1 })
    .lean();

  const tournamentsWithDetails = tournaments.map(mapTournamentToDetails);

  const now = new Date();
  const lobbies = {
    upcoming: tournamentsWithDetails.filter(t =>
      ['upcoming', 'locked'].includes(t.status) &&
      tournamentService.calculateStartDateTime(t.date, t.startTime) >= now
    ),
    live: tournamentsWithDetails.filter(t => t.status === 'running'),
  };

  const total = lobbies.upcoming.length + lobbies.live.length;

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENTS_RETRIEVED_HOST, {
    lobbies,
    total,
    counts: { upcoming: lobbies.upcoming.length, live: lobbies.live.length }
  });
});

/**
 * SSE: own host application status updates (host role only).
 * GET /api/host/applications/stream
 */
const streamHostApplicationEvents = asyncHandler(async (req, res) => {
  const { attachHostApplicationEventsSse } = require('../services/hostApplicationSse.service');
  attachHostApplicationEventsSse(req, res);
});

module.exports = {
  listAvailableTournaments,
  applyForTournament,
  listMyApplications,
  streamHostApplicationEvents,
  endTournament,
  getMyLobbies
};

