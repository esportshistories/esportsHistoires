/**
 * Admin Controller
 * Handles admin-only API requests
 */

const bcrypt = require('bcryptjs');
const { asyncHandler } = require('../utils/response.helper');
const { sanitizeSearchTerm } = require('../utils/sanitize.helper');
const { HTTP_STATUS, MESSAGES, GAME_MODES } = require('../constants');
const tournamentService = require('../services/tournament.service');
const walletService = require('../services/wallet.service');
const Tournament = require('../models/Tournament.model');
const Organization = require('../models/Organization.model');
const User = require('../models/User.model');
const HostApplication = require('../models/HostApplication.model');
const { normalizeUTR } = require('../utils/bankStatement.helper');
const Logger = require('../utils/logger');
const { buildAuthResponseData } = require('../utils/controller.helper');
const {
  normalizeWalletHistoryDoc,
  normalizeWalletHistoryList
} = require('../utils/walletHistoryResponse');

/**
 * Admin Login
 * Login endpoint specifically for admin users
 * Regular users will be rejected with "You are not authorized" error
 * POST /api/admin/login
 */
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!user) {
    return res.unauthorized(MESSAGES.ERROR.INVALID_CREDENTIALS);
  }

  // Check if user is admin - reject regular users immediately
  // This check happens BEFORE password verification to prevent information leakage
  if (user.role !== 'admin') {
    return res.forbidden('You are not authorized. Admin access required.');
  }

  // Check if user is blocked
  if (user.isBlocked) {
    return res.forbidden(MESSAGES.ERROR.USER_BLOCKED);
  }

  // Check if email is verified
  if (!user.isEmailVerified) {
    return res.forbidden(MESSAGES.ERROR.EMAIL_NOT_VERIFIED);
  }

  // Check if user has password-based auth
  if (user.authProvider === 'google' && !user.password) {
    return res.badRequest('This account uses Google login. Please use Google to sign in.');
  }

  // Check if password exists (user has set password)
  if (!user.password) {
    return res.badRequest(MESSAGES.ERROR.PASSWORD_NOT_SET);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  
  if (!isPasswordValid) {
    return res.unauthorized(MESSAGES.ERROR.INVALID_CREDENTIALS);
  }

  // Generate access and refresh token pair
  const { generateTokenPair } = require('../utils/jwt.service');
  const { accessToken, refreshToken } = generateTokenPair(user._id.toString(), user.email);
  
  // Decode refresh token to get tokenId
  const jwt = require('jsonwebtoken');
  const decodedRefresh = jwt.decode(refreshToken);
  const tokenId = decodedRefresh?.tokenId;

  // Save refresh token to user document
  // Helper function from auth controller (duplicated here for admin controller)
  const cleanupExpiredRefreshTokens = (user) => {
    const now = new Date();
    user.refreshTokens = user.refreshTokens.filter(token => {
      if (!token.expiresAt) return true; // Keep tokens without expiration (shouldn't happen, but safe)
      const expiresAt = new Date(token.expiresAt);
      return !isNaN(expiresAt.getTime()) && expiresAt > now;
    });
  };

  const saveRefreshToken = async (user, refreshToken, tokenId, deviceInfo = 'Unknown device') => {
    // Clean up expired tokens first
    cleanupExpiredRefreshTokens(user);

    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(refreshToken);
    let expiresAt;
    if (decoded && typeof decoded.exp === 'number' && !isNaN(decoded.exp)) {
      expiresAt = new Date(decoded.exp * 1000);
    } else {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    user.refreshTokens.push({
      token: refreshToken,
      tokenId: tokenId,
      expiresAt: expiresAt,
      deviceInfo: deviceInfo,
      createdAt: new Date()
    });

    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);
    }

    await user.save();
  };

  await saveRefreshToken(user, refreshToken, tokenId, req.headers['user-agent']);

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.LOGIN, buildAuthResponseData(user, accessToken, refreshToken));
});

/**
 * Generate next day lobbies
 * POST /api/admin/generate-next-day-lobbies
 */
const generateNextDayLobbies = asyncHandler(async (req, res) => {
  const tournaments = await tournamentService.generateNextDayLobbies();
  
  // Previously, new tournaments were broadcast only to admin via WebSocket.
  // For lobby list auto-update, we now also (or only) use SSE so clients on
  // /tournament/list can see newly created lobbies without reload.
  try {
    const { sendNewLobbyCreatedNotification } = require('../services/notification.service');
    const { calculateTeamStats } = require('../services/tournament.service');
    const { broadcastTournamentListUpdate } = require('./tournament.controller');

    tournaments.forEach((t) => {
      const { playersPerTeam, maxTeams } = calculateTeamStats(t.subMode, t.maxPlayers);

      broadcastTournamentListUpdate({
        type: 'created',
        tournamentId: t._id.toString(),
        game: t.game,
        mode: t.mode,
        subMode: t.subMode,
        date: t.date,
        startTime: t.startTime,
        entryFee: t.entryFee,
        maxPlayers: t.maxPlayers,
        maxTeams,
        playersPerTeam,
        status: t.status,
        region: t.region || 'Global',
        lobbyName: t.lobbyName || null,
        participantCount: (t.participants || []).length,
        prizePool: t.platformFees?.potentialWinnerPrizePool || 0
      });
    });

    sendNewLobbyCreatedNotification(tournaments);
    Logger.info('Broadcasted new tournament(s) via SSE for lobby list', { count: tournaments.length });
  } catch (err) {
    // Log error but don't fail the request
    Logger.error('Error broadcasting new tournaments via SSE', { errName: err.name });
  }
  
  res.success(HTTP_STATUS.CREATED, MESSAGES.SUCCESS.TOURNAMENTS_GENERATED, {
    tournaments: tournaments.map(t => ({
      id: t._id,
      game: t.game,
      mode: t.mode,
      subMode: t.subMode,
      date: t.date,
      startTime: t.startTime,
      entryFee: t.entryFee,
      maxPlayers: t.maxPlayers,
      region: t.region || 'Global',
      lobbyName: t.lobbyName || null
    })),
    total: tournaments.length
  });
});

/**
 * Generate lobbies with custom parameters
 * POST /api/admin/generate-lobbies
 * 
 * Request Body:
 * - date: Date in ISO format (YYYY-MM-DD) (required)
 * - timeSlots: Array of time slots ['12:00 PM', '3:00 PM', '6:00 PM', '9:00 PM'] (required, at least one)
 * - mode: 'CS', 'BR', or 'LW' (required)
 * - subModes: Array of sub-modes
 *   - For CS: ['clash'] (optional - 2 teams, max 4 per team, 1 match; 7/13 rounds host decides manually)
 *   - For BR: ['solo', 'duo', 'squad'] (required)
 *   - For LW: ['solo', 'duo', 'squad', '1v1', '2v2'] (optional - if not provided, defaults to ['1v1']. If '1v1' is selected, '2v2' is automatically included)
 * - price: Single entry fee value (optional, for single price)
 * - entryFees: Array of entry fees [25, 50, 75, 100, 200, 300] (optional, defaults to mode config)
 * - region: 'Asia' or 'Global' (optional, default: 'Global')
 */
const generateLobbies = asyncHandler(async (req, res) => {
  const { date, timeSlots, mode, subModes, price, entryFees, region } = req.body;
  
  // Support both 'price' (single value) and 'entryFees' (array) for backward compatibility
  // If 'price' is provided, convert it to 'entryFees' array
  let finalEntryFees = entryFees;
  if (price !== undefined && price !== null) {
    // Convert single price to array
    finalEntryFees = [Number(price)];
  }

  // Validate required fields
  if (!date) {
    return res.badRequest('date is required. Must be a valid date in ISO format (YYYY-MM-DD)');
  }

  if (!timeSlots || !Array.isArray(timeSlots) || timeSlots.length === 0) {
    return res.badRequest('timeSlots is required and must be a non-empty array');
  }

  if (!mode) {
    return res.badRequest('mode is required. Must be "CS", "BR", or "LW"');
  }

  // subModes is required for BR, but optional for CS and LW
  let finalSubModes = subModes;
  if (mode === 'BR') {
    if (!subModes || !Array.isArray(subModes) || subModes.length === 0) {
      return res.badRequest('subModes is required and must be a non-empty array for BR mode');
    }
  } else if (mode === 'CS') {
    // CS: only clash. Service will force clash; no need to send subModes from admin.
    finalSubModes = ['clash'];
  } else if (mode === 'LW') {
    // For LW, if subModes is not provided or empty, default to '1v1'
    if (!subModes || !Array.isArray(subModes) || subModes.length === 0) {
      finalSubModes = ['1v1'];
    } else {
      // If '1v1' is selected, automatically also include '2v2'
      if (subModes.includes('1v1') && !subModes.includes('2v2')) {
        finalSubModes = [...subModes, '2v2'];
      }
    }
  }

  try {
    const result = await tournamentService.generateLobbies({
      date,
      timeSlots,
      mode,
      subModes: finalSubModes,
      entryFees: finalEntryFees,
      region: region || 'Global'
    });

    const { tournaments, skippedTimeSlots } = result;

    // Use SSE to notify lobby list clients about newly created tournaments.
    try {
      const { sendNewLobbyCreatedNotification } = require('../services/notification.service');
      const { calculateTeamStats } = require('../services/tournament.service');
      const { broadcastTournamentListUpdate } = require('./tournament.controller');

      tournaments.forEach((t) => {
        const { playersPerTeam, maxTeams } = calculateTeamStats(t.subMode, t.maxPlayers);

        broadcastTournamentListUpdate({
          type: 'created',
          tournamentId: t._id.toString(),
          game: t.game,
          mode: t.mode,
          subMode: t.subMode,
          date: t.date,
          startTime: t.startTime,
          entryFee: t.entryFee,
          maxPlayers: t.maxPlayers,
          maxTeams,
          playersPerTeam,
          status: t.status,
          region: t.region || 'Global',
          lobbyName: t.lobbyName || null,
          participantCount: (t.participants || []).length,
          prizePool: t.platformFees?.potentialWinnerPrizePool || 0
        });
      });

      sendNewLobbyCreatedNotification(tournaments);
      Logger.info('Broadcasted new tournament(s) via SSE for lobby list', { count: tournaments.length });
    } catch (err) {
      // Log error but don't fail the request
      Logger.error('Error broadcasting new tournaments via SSE', { errName: err.name });
    }

    // Use stored potential prize pool values from tournament creation (already calculated and stored)
    // No need to recalculate - use the reusable functions to get team stats and use stored values
    const tournamentsWithPrizePool = tournaments.map(t => {
      // Get team stats using reusable function (tournamentService already required at top of file)
      const { playersPerTeam, maxTeams } = tournamentService.calculateTeamStats(t.subMode, t.maxPlayers);
      
      // Use stored potential prize pool from tournament creation (already calculated)
      const potentialPrizePoolBreakdown = {
        totalPrizePool: t.platformFees?.potentialTotalPrizePool || 0,
        platformFee: t.platformFees?.potentialPlatformFee || 0,
        hostFee: t.platformFees?.potentialHostFee || 0,
        casterFee: t.platformFees?.potentialCasterFee || 0,
        totalFees: t.platformFees?.potentialTotalFees || 0,
        winnerPrizePool: t.platformFees?.potentialWinnerPrizePool || 0
      };
      
      return {
        id: t._id,
        game: t.game,
        mode: t.mode,
        subMode: t.subMode,
        date: t.date,
        startTime: t.startTime,
        entryFee: t.entryFee,
        maxPlayers: t.maxPlayers,
        maxTeams: maxTeams,
        playersPerTeam: playersPerTeam,
        region: t.region || 'Global',
        lobbyName: t.lobbyName || null,
        prizePool: potentialPrizePoolBreakdown.winnerPrizePool, // Show potential prize pool
        potentialPrizePool: potentialPrizePoolBreakdown.winnerPrizePool,
        prizePoolBreakdown: potentialPrizePoolBreakdown
      };
    });

    res.success(HTTP_STATUS.CREATED, MESSAGES.SUCCESS.TOURNAMENTS_GENERATED, {
      tournaments: tournamentsWithPrizePool,
      total: tournaments.length,
      skippedTimeSlots: skippedTimeSlots.length > 0 ? skippedTimeSlots : undefined,
      message: skippedTimeSlots.length > 0 
        ? `${tournaments.length} tournaments created. ${skippedTimeSlots.length} time slot(s) skipped as they have already passed: ${skippedTimeSlots.join(', ')}`
        : undefined
    });
  } catch (error) {
    return res.badRequest(error.message);
  }
});

/**
 * Get hosts list for tournament assignment with assignments and time conflicts
 * GET /api/admin/tournaments/:tournamentId/hosts
 */
const getHostsForTournament = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;
  
  if (!tournamentId) {
    return res.badRequest('tournamentId is required');
  }

  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }

  // Get all hosts
  const hosts = await User.find({ role: 'host', isBlocked: false })
    .select('_id name email')
    .lean();

  // Get tournament date and startTime for conflict checking
  const tournamentDate = new Date(tournament.date);
  const tournamentStartTime = tournament.startTime;
  
  // Helper function to check if two times are the same
  const isSameTime = (time1, time2) => {
    return time1 === time2;
  };

  // Helper function to check if two dates are the same day
  const isSameDay = (date1, date2) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  // Get hosts with their assignments, applications, and conflicts
  const hostsWithAssignments = await Promise.all(
    hosts.map(async (host) => {
      // Find all tournaments assigned to this host (only existing tournaments)
      // Exclude current tournament and only get active tournaments
      const assignedTournaments = await Tournament.find({
        hostId: host._id,
        _id: { $ne: tournamentId } // Exclude current tournament
      })
        .select('_id game mode subMode date startTime entryFee status')
        .lean();

      // Get host applications for the CURRENT tournament only
      // This shows if host has applied for this specific tournament
      // IMPORTANT: Only show applications for the current tournament, not old/deleted ones
      // CRITICAL: Use exact ObjectId match to prevent showing applications from other tournaments
      const mongoose = require('mongoose');
      const currentTournamentId = mongoose.Types.ObjectId.isValid(tournamentId) 
        ? new mongoose.Types.ObjectId(tournamentId) 
        : tournamentId;
      
      // Query with explicit ObjectId to ensure exact match (no string/ObjectId confusion)
      const hostApplication = await HostApplication.findOne({
        tournamentId: currentTournamentId, // Only current tournament - explicit ObjectId match
        hostId: host._id
      })
        .populate('adminId', 'name email')
        .lean();

      // CRITICAL: Verify application belongs to current tournament and tournament still exists
      // This prevents showing applications from deleted tournaments or wrong tournaments
      let applicationInfo = null;
      if (hostApplication) {
        // Extract tournamentId from application
        // In lean() mode, tournamentId is just the ObjectId (not populated unless explicitly populated)
        let applicationTournamentId = null;
        if (hostApplication.tournamentId) {
          // tournamentId is not populated in our query, so it's just the ObjectId
          applicationTournamentId = hostApplication.tournamentId.toString();
        }
        
        const currentTournamentIdStr = currentTournamentId.toString();
        
        // STRICT CHECK: Only show if tournamentId matches exactly AND tournament exists
        // This ensures we never show applications from other tournaments (even if they were deleted)
        if (applicationTournamentId && applicationTournamentId === currentTournamentIdStr) {
          // Verify tournament still exists (not deleted) and matches exactly
          const applicationTournament = await Tournament.findById(applicationTournamentId).lean();
          if (applicationTournament && 
              applicationTournament._id.toString() === currentTournamentIdStr &&
              applicationTournament._id.toString() === tournament._id.toString()) {
            // All checks passed - this application is valid for current tournament
            applicationInfo = {
              applicationId: hostApplication._id,
              status: hostApplication.status, // 'pending', 'approved', 'rejected'
              appliedAt: hostApplication.createdAt,
              adminNotes: hostApplication.adminNotes || null,
              approvedBy: hostApplication.adminId ? {
                name: hostApplication.adminId.name,
                email: hostApplication.adminId.email
              } : null
            };
          }
        }
        // If tournament doesn't exist, doesn't match, or was deleted - don't show application
        // This prevents showing old applications from deleted tournaments
      }

      // Check for time conflicts (only with existing assigned tournaments)
      const timeConflicts = assignedTournaments.filter(assignedTournament => {
        const assignedDate = new Date(assignedTournament.date);
        return isSameDay(assignedDate, tournamentDate) && 
               isSameTime(assignedTournament.startTime, tournamentStartTime);
      });

      // Format assigned tournaments (only existing ones - query already filters deleted)
      const formattedAssignments = assignedTournaments.map(t => ({
        tournamentId: t._id,
        game: t.game,
        mode: t.mode,
        subMode: t.subMode,
        date: t.date,
        startTime: t.startTime,
        entryFee: t.entryFee,
        status: t.status,
        lobbyName: t.lobbyName || null
      }));

      return {
        hostId: host._id,
        name: host.name,
        email: host.email,
        assignedLobbies: formattedAssignments, // Only existing tournaments
        totalLobbies: assignedTournaments.length, // Count of existing assigned tournaments
        hasTimeConflict: timeConflicts.length > 0,
        timeConflictDetails: timeConflicts.length > 0 ? {
          warning: `This host already has a lobby at ${tournamentStartTime} on ${tournamentDate.toLocaleDateString()}`,
          conflictingTournaments: timeConflicts.map(t => ({
            tournamentId: t._id,
            game: t.game,
            mode: t.mode,
            subMode: t.subMode,
            date: t.date,
            startTime: t.startTime,
            lobbyName: t.lobbyName || null
          }))
        } : null,
        // Application info for CURRENT tournament only
        application: applicationInfo
      };
    })
  );

  res.success(HTTP_STATUS.OK, 'Hosts list retrieved successfully', {
    tournament: {
      tournamentId: tournament._id,
      date: tournament.date,
      startTime: tournament.startTime,
      game: tournament.game,
      mode: tournament.mode,
      subMode: tournament.subMode
    },
    hosts: hostsWithAssignments,
    total: hostsWithAssignments.length
  });
});

/**
 * Assign host to tournament
 * POST /api/admin/assign-host
 * 
 * IMPORTANT: Each lobby requires a separate host assignment. 
 * Hosts must apply for each tournament individually - no automatic assignment from previous lobbies.
 */
const assignHost = asyncHandler(async (req, res) => {
  const { tournamentId, hostId, forceAssign } = req.body;
  
  if (!tournamentId || !hostId) {
    return res.badRequest('tournamentId and hostId are required');
  }

  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }
  
  // Check if tournament already has a different host assigned
  // IMPORTANT: Each lobby requires a separate host application - no automatic assignment from previous lobbies
  if (tournament.hostId && tournament.hostId.toString() !== hostId.toString() && !forceAssign) {
    return res.badRequest('Tournament already has a different host assigned. Each lobby requires a separate host application. Use forceAssign=true to reassign.');
  }

  // Check for time conflicts
  const tournamentDate = new Date(tournament.date);
  const tournamentStartTime = tournament.startTime;

  // Helper functions
  const isSameTime = (time1, time2) => time1 === time2;
  const isSameDay = (date1, date2) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  // Find conflicting tournaments
  const conflictingTournaments = await Tournament.find({
    hostId: hostId,
    _id: { $ne: tournamentId }
  }).lean();

  const timeConflicts = conflictingTournaments.filter(conflictTournament => {
    const conflictDate = new Date(conflictTournament.date);
    return isSameDay(conflictDate, tournamentDate) && 
           isSameTime(conflictTournament.startTime, tournamentStartTime);
  });

  // If there are time conflicts and forceAssign is not true, return warning
  if (timeConflicts.length > 0 && !forceAssign) {
    return res.success(HTTP_STATUS.OK, 'Time conflict detected. Please confirm assignment.', {
      tournamentId,
      hostId,
      hasTimeConflict: true,
      warning: `This host already has ${timeConflicts.length} lobby/lobbies at ${tournamentStartTime} on ${tournamentDate.toLocaleDateString()}`,
      conflictingTournaments: timeConflicts.map(t => ({
        tournamentId: t._id,
        game: t.game,
        mode: t.mode,
        subMode: t.subMode,
        date: t.date,
        startTime: t.startTime,
        status: t.status,
        lobbyName: t.lobbyName || null
      })),
      message: 'To proceed with assignment despite time conflict, set forceAssign to true'
    });
  }

  // Assign host
  tournament.hostId = hostId;
  await tournament.save();
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.HOST_ASSIGNED, {
    tournamentId,
    hostId,
    hasTimeConflict: timeConflicts.length > 0,
    warning: timeConflicts.length > 0 ? `Host assigned despite time conflict at ${tournamentStartTime}` : null
  });
});

/**
 * List users with pagination and search
 * GET /api/admin/users
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10)
 * - role: Filter by role - 'user', 'host', 'admin', 'org_manager' (optional; if omitted, all roles)
 * - search: Search by name or email (optional)
 * 
 * Behavior:
 * - If role is provided: Filters users by that role, then searches within that role
 * - If role is NOT provided (ALL): Searches in entire database without role filter
 * - Search works on both name and email fields (case-insensitive)
 * - Role filter and search can be combined
 */
const listUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  // Support both 'search' and 'query' parameters (query is alias for search)
  const search = req.query.search || req.query.query || '';
  const role = req.query.role; // 'user', 'host', 'admin', 'org_manager', or undefined for ALL
  const skip = (page - 1) * limit;

  // Build search query
  const searchQuery = {};
  
  // Add role filter if provided (if role is not provided, search in ALL users)
  if (role) {
    // Validate role value
    const validRoles = ['user', 'host', 'admin', 'org_manager'];
    if (!validRoles.includes(role.toLowerCase())) {
      return res.badRequest(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }
    searchQuery.role = role.toLowerCase();
  }
  
  // Add search filter for email or name (works within selected role if role is provided)
  // If role is not provided, searches in entire database
  if (search && search.trim()) {
    const searchTerm = sanitizeSearchTerm(search);
    if (searchTerm) {
      searchQuery.$or = [
        { email: { $regex: searchTerm, $options: 'i' } },
        { name: { $regex: searchTerm, $options: 'i' } }
      ];
    }
  }

  // Get total count
  const total = await User.countDocuments(searchQuery);

  // Get users with pagination
  const users = await User.find(searchQuery)
    .select('-password -otp -refreshTokens')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Fetch wallet balances for all users in one go to avoid N+1 queries
  const userIds = users.map(u => u._id.toString());
  const balanceMap = await walletService.getWalletsBalance(userIds);

  // Orgs where these users are owner or listed manager (so admin sees who manages what)
  const orgsByUserId = new Map();
  if (users.length > 0) {
    const userObjectIds = users.map((u) => u._id);
    const orgs = await Organization.find({
      $or: [
        { ownerUserId: { $in: userObjectIds } },
        { managerIds: { $in: userObjectIds } }
      ]
    })
      .select('_id name slug ownerUserId managerIds isActive')
      .lean();

    const ensureUserOrgs = (uidStr) => {
      if (!orgsByUserId.has(uidStr)) orgsByUserId.set(uidStr, new Map());
      return orgsByUserId.get(uidStr);
    };

    for (const org of orgs) {
      const orgIdStr = org._id.toString();
      const ownerIdStr = org.ownerUserId.toString();
      const base = {
        _id: org._id,
        name: org.name,
        slug: org.slug || null,
        isActive: org.isActive
      };
      ensureUserOrgs(ownerIdStr).set(orgIdStr, { ...base, relationship: 'owner' });
      for (const mid of org.managerIds || []) {
        const mStr = mid.toString();
        if (mStr === ownerIdStr) continue;
        const row = ensureUserOrgs(mStr);
        if (!row.has(orgIdStr)) row.set(orgIdStr, { ...base, relationship: 'manager' });
      }
    }
  }

  const usersWithBalance = users.map((user) => {
    const uid = user._id.toString();
    const orgRows = orgsByUserId.get(uid);
    const managedOrganizations = orgRows ? Array.from(orgRows.values()) : [];
    return {
      ...user,
      balanceINR: balanceMap.get(uid) || 0,
      managedOrganizations
    };
  });

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.USERS_RETRIEVED, {
    users: usersWithBalance,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

/**
 * Create organization (Admin only)
 * POST /api/admin/organizations
 * Body: { name, ownerUserId, slug? }
 */
const createOrganization = asyncHandler(async (req, res) => {
  const { name, ownerUserId, slug } = req.body;

  if (!name || !ownerUserId) {
    return res.badRequest('name and ownerUserId are required');
  }

  const owner = await User.findById(ownerUserId);
  if (!owner) {
    return res.notFound('Owner user not found');
  }

  // Ensure owner has org_manager role (unless already admin)
  if (owner.role !== 'admin' && owner.role !== 'org_manager') {
    owner.role = 'org_manager';
    await owner.save();
  }

  // Generate slug if not provided
  let finalSlug = slug;
  if (!finalSlug) {
    finalSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  const existingByName = await Organization.findOne({ name: name.trim() });
  if (existingByName) {
    return res.badRequest('Organization with this name already exists');
  }

  const existingBySlug = await Organization.findOne({ slug: finalSlug });
  if (existingBySlug) {
    finalSlug = `${finalSlug}-${Date.now()}`;
  }

  const org = await Organization.create({
    name: name.trim(),
    slug: finalSlug,
    ownerUserId: owner._id,
    managerIds: [owner._id],
    isActive: true
  });

  res.success(HTTP_STATUS.CREATED, 'Organization created successfully', {
    organization: {
      id: org._id,
      name: org.name,
      slug: org.slug,
      ownerUserId: org.ownerUserId,
      managerIds: org.managerIds,
      isActive: org.isActive,
      createdAt: org.createdAt
    }
  });
});

/**
 * List organizations (Admin only)
 * GET /api/admin/organizations
 */
const listOrganizations = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const search = (req.query.search || '').trim();

  const query = {};
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { name: { $regex: regex } },
      { slug: { $regex: regex } }
    ];
  }

  const [total, orgs] = await Promise.all([
    Organization.countDocuments(query),
    Organization.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('ownerUserId', 'name email')
      .populate('managerIds', 'name email')
      .lean()
  ]);

  res.success(HTTP_STATUS.OK, 'Organizations retrieved successfully', {
    organizations: orgs.map(o => ({
      id: o._id,
      name: o.name,
      slug: o.slug,
      owner: o.ownerUserId ? { id: o.ownerUserId._id, name: o.ownerUserId.name, email: o.ownerUserId.email } : null,
      managers: (o.managerIds || []).map(m => ({
        id: m._id,
        name: m.name,
        email: m.email
      })),
      isActive: o.isActive,
      createdAt: o.createdAt
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

/**
 * Add organization manager (Admin only)
 * POST /api/admin/organizations/:orgId/managers
 * Body: { userId }
 */
const addOrgManager = asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.body;

  if (!orgId || !userId) {
    return res.badRequest('orgId and userId are required');
  }

  const org = await Organization.findById(orgId);
  if (!org || !org.isActive) {
    return res.notFound('Organization not found');
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.notFound('User not found');
  }

  // Promote to org_manager unless already admin
  if (user.role !== 'admin' && user.role !== 'org_manager') {
    user.role = 'org_manager';
    await user.save();
  }

  const userIdStr = user._id.toString();
  const exists = (org.managerIds || []).some(id => id.toString() === userIdStr);
  if (!exists) {
    org.managerIds.push(user._id);
    await org.save();
  }

  res.success(HTTP_STATUS.OK, 'Organization manager added successfully', {
    organizationId: org._id,
    manager: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

/**
 * Remove organization manager (Admin only)
 * DELETE /api/admin/organizations/:orgId/managers/:userId
 */
const removeOrgManager = asyncHandler(async (req, res) => {
  const { orgId, userId } = req.params;

  if (!orgId || !userId) {
    return res.badRequest('orgId and userId are required');
  }

  const org = await Organization.findById(orgId);
  if (!org || !org.isActive) {
    return res.notFound('Organization not found');
  }

  const isOwner = org.ownerUserId && org.ownerUserId.toString() === userId.toString();
  if (isOwner) {
    return res.badRequest('Cannot remove organization owner as manager. Transfer ownership first.');
  }

  org.managerIds = (org.managerIds || []).filter(id => id.toString() !== userId.toString());
  await org.save();

  res.success(HTTP_STATUS.OK, 'Organization manager removed successfully', {
    organizationId: org._id,
    removedUserId: userId
  });
});

/**
 * Block multiple users
 * POST /api/admin/users/block
 * Note: Admin users cannot be blocked
 */
const blockUsers = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.badRequest('userIds array is required');
  }

  // Check if any of the users are admins (admins cannot be blocked)
  const adminUsers = await User.find({
    _id: { $in: userIds },
    role: 'admin'
  }).select('_id email name role');

  if (adminUsers.length > 0) {
    return res.badRequest('Admin users cannot be blocked. Please remove admin users from the list.');
  }

  // Update users to set isBlocked to true (excluding admins)
  const result = await User.updateMany(
    { 
      _id: { $in: userIds },
      role: { $ne: 'admin' } // Explicitly exclude admins
    },
    { $set: { isBlocked: true } }
  );

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.USERS_BLOCKED, {
    blockedCount: result.modifiedCount,
    userIds: userIds.filter(id => {
      // Filter out admin user IDs from response
      return !adminUsers.some(admin => admin._id.toString() === id.toString());
    })
  });
});

/**
 * Unblock multiple users
 * POST /api/admin/users/unblock
 * Note: Admin users cannot be unblocked (they are never blocked)
 */
const unblockUsers = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.badRequest('userIds array is required');
  }

  // Check if any of the users are admins (admins cannot be blocked/unblocked)
  const adminUsers = await User.find({
    _id: { $in: userIds },
    role: 'admin'
  }).select('_id email name role');

  if (adminUsers.length > 0) {
    return res.badRequest('Admin users cannot be unblocked. Admin users are never blocked.');
  }

  // Update users to set isBlocked to false (excluding admins)
  const result = await User.updateMany(
    { 
      _id: { $in: userIds },
      role: { $ne: 'admin' } // Explicitly exclude admins
    },
    { $set: { isBlocked: false } }
  );

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.USERS_UNBLOCKED, {
    unblockedCount: result.modifiedCount,
    userIds: userIds.filter(id => {
      // Filter out admin user IDs from response
      return !adminUsers.some(admin => admin._id.toString() === id.toString());
    })
  });
});

/**
 * Create host account
 * POST /api/admin/hosts/create
 */
const createHost = asyncHandler(async (req, res) => {
  const { email, name, password } = req.body;

  if (!email || !name || !password) {
    return res.badRequest('email, name, and password are required');
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.badRequest(MESSAGES.ERROR.HOST_ALREADY_EXISTS);
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create host user
  const host = new User({
    email: email.toLowerCase(),
    name: name.trim(),
    password: hashedPassword,
    role: 'host',
    isEmailVerified: true
  });

  await host.save();

  // Create wallet for host
  const walletService = require('../services/wallet.service');
  try {
    await walletService.getOrCreateWallet(host._id.toString());
  } catch (walletError) {
    Logger.error('Error creating wallet for host', { errName: walletError.name });
    // Continue even if wallet creation fails
  }

  res.success(HTTP_STATUS.CREATED, MESSAGES.SUCCESS.HOST_CREATED, {
    host: {
      id: host._id,
      email: host.email,
      name: host.name,
      role: host.role
    }
  });
});

/**
 * List host applications
 * GET /api/admin/host-applications
 */
const listHostApplications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const status = req.query.status; // 'pending', 'approved', 'rejected'
  const skip = (page - 1) * limit;

  // Build query
  const query = {};
  if (status) {
    query.status = status;
  }

  // Get total count
  const total = await HostApplication.countDocuments(query);

  // Get applications with pagination
  // IMPORTANT: Filter out applications for deleted tournaments (tournamentId will be null if tournament was deleted)
  const applications = await HostApplication.find(query)
    .populate('tournamentId', 'game mode subMode date startTime entryFee maxPlayers')
    .populate('hostId', 'name email')
    .populate('adminId', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  
  // Filter out applications for deleted tournaments (tournamentId will be null after populate if tournament was deleted)
  const validApplications = applications.filter(app => app.tournamentId !== null);

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.HOST_APPLICATIONS_RETRIEVED, {
    applications: validApplications, // Only applications for existing tournaments
    pagination: {
      page,
      limit,
      total: validApplications.length, // Use filtered count
      totalPages: Math.ceil(validApplications.length / limit)
    }
  });
});

/**
 * Approve host application
 * POST /api/admin/host-applications/:applicationId/approve
 */
const approveHostApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const adminId = req.userId;

  const application = await HostApplication.findById(applicationId);
  if (!application) {
    return res.notFound(MESSAGES.ERROR.HOST_APPLICATION_NOT_FOUND);
  }

  if (application.status !== 'pending') {
    return res.badRequest('Application is not pending');
  }

  // Update application status
  application.status = 'approved';
  application.adminId = adminId;
  await application.save();

  // ✅ AUTO-REJECT: Reject all other pending applications for the same tournament
  // When one application is approved, all other pending applications are automatically rejected
  const rejectedCount = await HostApplication.updateMany(
    {
      tournamentId: application.tournamentId,
      _id: { $ne: application._id }, // Exclude the approved application
      status: 'pending' // Only reject pending applications
    },
    {
      $set: {
        status: 'rejected',
        adminId: adminId,
        adminNotes: 'Automatically rejected: Another host application was approved for this tournament.'
      }
    }
  );

  // Assign host to tournament
  // IMPORTANT: Each lobby requires a separate host application. Hosts must apply for each tournament individually.
  const tournament = await Tournament.findById(application.tournamentId);
  if (tournament) {
    // Check if tournament already has a host assigned (should not happen, but safety check)
    if (tournament.hostId && tournament.hostId.toString() !== application.hostId.toString()) {
      return res.badRequest('Tournament already has a different host assigned. Each lobby requires a separate host application.');
    }
    
    // Only assign if tournament doesn't have a host or if it's the same host (re-approval scenario)
    if (!tournament.hostId || tournament.hostId.toString() === application.hostId.toString()) {
      tournament.hostId = application.hostId;
      await tournament.save();

      // Notify host via WebSocket so they see the lobby in my-lobbies immediately
      try {
        const { broadcastTournamentUpdate } = require('../services/websocket.service');
        const hostIdStr = application.hostId.toString();
        broadcastTournamentUpdate(tournament._id.toString(), {
          type: 'host-assigned',
          status: tournament.status,
          tournamentId: tournament._id.toString(),
          message: 'You have been assigned as host. Refresh my-lobbies to see this lobby.'
        }, {
          userId: null,
          hostId: hostIdStr,
          broadcastToAll: false
        });
      } catch (wsError) {
        Logger.error('Error broadcasting host assignment', { errName: wsError?.name });
      }
    }
  }

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.HOST_APPLICATION_APPROVED, {
    applicationId: application._id,
    tournamentId: application.tournamentId,
    hostId: application.hostId,
    rejectedApplicationsCount: rejectedCount.modifiedCount // Number of applications auto-rejected
  });
});

/**
 * Reject host application
 * POST /api/admin/host-applications/:applicationId/reject
 */
const rejectHostApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { adminNotes } = req.body;
  const adminId = req.userId;

  const application = await HostApplication.findById(applicationId);
  if (!application) {
    return res.notFound(MESSAGES.ERROR.HOST_APPLICATION_NOT_FOUND);
  }

  if (application.status !== 'pending') {
    return res.badRequest('Application is not pending');
  }

  // Update application status
  application.status = 'rejected';
  application.adminId = adminId;
  if (adminNotes) {
    application.adminNotes = adminNotes;
  }
  await application.save();

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.HOST_APPLICATION_REJECTED, {
    applicationId: application._id,
    tournamentId: application.tournamentId,
    hostId: application.hostId
  });
});

// updateRoom: Use POST /api/admin/tournaments/:tournamentId/update-room (imported from tournament.controller in admin.routes)

/**
 * List tournaments (Admin only)
 * GET /api/admin/tournaments?status=upcoming|live|completed|pendingResult&subMode=solo|duo|squad&date=YYYY-MM-DD&mode=BR|CS|LW
 */
const listTournaments = asyncHandler(async (req, res) => {
  const status = req.query.status || 'upcoming'; // Default to 'upcoming'
  const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
  const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
  const date = req.query.date || null; // Specific date filter (YYYY-MM-DD)
  const subMode = req.query.subMode || null; // Filter by solo, duo, squad
  const mode = req.query.mode || null; // Filter by CS, BR, LW
  
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
  
  // ✅ AUTO-CHECK: Cancel tournaments that passed start time with insufficient teams
  try {
    await tournamentService.checkAndCancelInsufficientTeams();
  } catch (error) {
    Logger.error('Error checking and cancelling insufficient teams tournaments', error);
  }
  
  const tournaments = await tournamentService.getTournamentsByStatus(status, fromDate, toDate, date, subMode, mode);
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOURNAMENTS_RETRIEVED, {
    tournaments,
    total: tournaments.length,
    filters: {
      status,
      date: date || null,
      subMode: subMode || null,
      mode: mode || null
    }
  });
});

/**
 * Edit tournament (Admin only)
 * PUT /api/admin/tournaments/:tournamentId
 * Can only edit tournaments that are upcoming or locked (not started yet)
 */
const editTournament = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;
  const { date, startTime, entryFee, maxPlayers, region, mode, subMode } = req.body;

  if (!tournamentId) {
    return res.badRequest('tournamentId is required');
  }

  const tournament = await Tournament.findById(tournamentId);
  
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }

  // Only allow editing if tournament hasn't started (upcoming or locked)
  if (!['upcoming', 'locked'].includes(tournament.status)) {
    return res.badRequest('Cannot edit tournament that has already started or completed');
  }

  // Check if players have joined - if yes, restrict some edits
  const hasParticipants = tournament.participants && tournament.participants.length > 0;

  // Update fields if provided
  if (date !== undefined) {
    const newDate = new Date(date);
    if (isNaN(newDate.getTime())) {
      return res.badRequest('Invalid date format');
    }
    newDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDate < today) {
      return res.badRequest('Date cannot be in the past');
    }
    tournament.date = newDate;
  }

  if (startTime !== undefined) {
    const TIME_SLOT_REGEX = /^([1-9]|1[0-2]):([0-5][0-9])\s(AM|PM)$/i;
    if (typeof startTime !== 'string' || !TIME_SLOT_REGEX.test(startTime)) {
      return res.badRequest(`Invalid startTime format: ${startTime}. Must be in format "HH:MM AM/PM" (e.g., "5:00 PM", "12:00 PM", "9:30 AM")`);
    }
    tournament.startTime = startTime;
  }

  if (entryFee !== undefined) {
    const VALID_ENTRY_FEES = [25, 50, 75, 100, 150, 200, 300];
    if (!VALID_ENTRY_FEES.includes(Number(entryFee))) {
      return res.badRequest(`Invalid entryFee. Must be one of: ${VALID_ENTRY_FEES.join(', ')}`);
    }
    if (hasParticipants) {
      return res.badRequest('Cannot change entry fee when players have already joined');
    }
    tournament.entryFee = Number(entryFee);
  }

  if (maxPlayers !== undefined) {
    const maxPlayersNum = Number(maxPlayers);
    if (hasParticipants && maxPlayersNum < tournament.participants.length) {
      return res.badRequest(`Cannot set maxPlayers less than current participants (${tournament.participants.length})`);
    }
    if (maxPlayersNum < 1) {
      return res.badRequest('maxPlayers must be at least 1');
    }
    // Clash Squad: only 2 teams allowed
    if (tournament.mode === 'CS' && maxPlayersNum !== 2) {
      return res.badRequest('Clash Squad allows only 2 teams. maxPlayers must be 2.');
    }
    tournament.maxPlayers = maxPlayersNum;
  }

  if (region !== undefined) {
    if (!['Asia', 'Global'].includes(region)) {
      return res.badRequest('Invalid region. Must be "Asia" or "Global"');
    }
    tournament.region = region;
  }

  if (mode !== undefined) {
    if (!['CS', 'BR', 'LW'].includes(mode)) {
      return res.badRequest('Invalid mode. Must be "CS", "BR", or "LW"');
    }
    if (hasParticipants) {
      return res.badRequest('Cannot change mode when players have already joined');
    }
    tournament.mode = mode;
    if (mode === 'CS') {
      tournament.maxPlayers = 2;
    }
  }

  if (subMode !== undefined) {
    const validSubModesByMode = {
      'CS': ['clash'],
      'BR': ['solo', 'duo', 'squad'],
      'LW': ['solo', 'duo', 'squad', '1v1', '2v2']
    };
    const validSubModes = validSubModesByMode[tournament.mode] || [];
    if (!validSubModes.includes(subMode)) {
      return res.badRequest(`Invalid subMode for mode ${tournament.mode}. Must be one of: ${validSubModes.join(', ')}`);
    }
    if (hasParticipants) {
      return res.badRequest('Cannot change subMode when players have already joined');
    }
    tournament.subMode = subMode;
    if (tournament.mode === 'CS' && subMode === 'clash') {
      tournament.maxPlayers = 2;
    }
  }

  // Recalculate lockTime if date or startTime changed
  if (date !== undefined || startTime !== undefined) {
    const tournamentService = require('../services/tournament.service');
    tournament.lockTime = tournamentService.calculateLockTime(tournament.date, tournament.startTime);
  }

  await tournament.save();
  
  res.success(HTTP_STATUS.OK, 'Tournament updated successfully', {
    tournament: {
      id: tournament._id,
      game: tournament.game,
      mode: tournament.mode,
      subMode: tournament.subMode,
      entryFee: tournament.entryFee,
      maxPlayers: tournament.maxPlayers,
      lobbyName: tournament.lobbyName || null,
      date: tournament.date,
      startTime: tournament.startTime,
      lockTime: tournament.lockTime,
      region: tournament.region,
      status: tournament.status
    }
  });
});

/**
 * Delete tournament (Admin only)
 * DELETE /api/admin/tournaments/:tournamentId
 * Can only delete tournaments that are upcoming or locked (not started yet)
 * If participants have joined, their entry fees will be refunded
 */
const deleteTournament = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;

  if (!tournamentId) {
    return res.badRequest('tournamentId is required');
  }

  const tournament = await Tournament.findById(tournamentId).populate('participants', '_id');
  
  if (!tournament) {
    return res.notFound(MESSAGES.ERROR.TOURNAMENT_NOT_FOUND);
  }

  // Only allow deletion if tournament hasn't started
  if (!['upcoming', 'locked'].includes(tournament.status)) {
    return res.badRequest('Cannot delete tournament that has already started or completed');
  }

  // Refund entry fees to all participants if any have joined
  const participants = tournament.participants || [];
  const refundedUsers = [];
  const refundErrors = [];

  if (participants.length > 0) {
    for (const participant of participants) {
      const participantId = participant._id ? participant._id.toString() : participant.toString();

      try {
        // Validate participant ID
        if (!participantId) {
          throw new Error('Invalid participant ID');
        }

        const entryFeeNum = Number(tournament.entryFee) || 0;
        if (entryFeeNum <= 0) {
          throw new Error(`Invalid entry fee: ${tournament.entryFee}`);
        }

        await walletService.refundEntryFee(
          participantId,
          entryFeeNum,
          `Refund for deleted tournament: ${tournament.game} ${tournament.mode} ${tournament.subMode} - ${tournament.date.toISOString().split('T')[0]} ${tournament.startTime}`,
          tournamentId
        );
        
        refundedUsers.push(participantId);
      } catch (error) {
        Logger.error('Error refunding entry fee to user', { participantId, errName: error.name });
        refundErrors.push({
          userId: participantId,
          error: error.message
        });
      }
    }
  }

  // Delete the tournament
  await Tournament.findByIdAndDelete(tournamentId);

  res.success(HTTP_STATUS.OK, 'Tournament deleted successfully', {
    tournamentId,
    refundedCount: refundedUsers.length,
    totalParticipants: participants.length,
    refundedUsers: refundedUsers.length > 0 ? refundedUsers : undefined,
    refundErrors: refundErrors.length > 0 ? refundErrors : undefined,
    message: participants.length > 0 
      ? `Tournament deleted. ${refundedUsers.length} participant(s) refunded ₹${tournament.entryFee} each.${refundErrors.length > 0 ? ` ${refundErrors.length} refund(s) failed - check refundErrors for details.` : ''}`
      : 'Tournament deleted successfully.'
  });
});

/**
 * List all hosts (Admin only)
 * GET /api/admin/hosts
 * 
 * Returns simple list of all hosts with basic information
 */
const listHosts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const search = req.query.search || req.query.query || '';
  const skip = (page - 1) * limit;

  // Build query
  const query = {
    role: 'host'
  };

  // Add search filter for email or name
  if (search && search.trim()) {
    const trimmedSearch = search.trim();
    const isEmailSearch = trimmedSearch.includes('@');
    
    if (isEmailSearch) {
      // For email searches, do exact match (emails are stored in lowercase in DB)
      // Direct string assignment ensures exact match - prevents "host@gmail.com" from matching "host2@gmail.com"
      const emailLower = trimmedSearch.toLowerCase();
      query.email = emailLower;
      // Debug: log the query to verify it's correct
      Logger.debug('Email search', { trimmedSearch, emailLower, query: JSON.stringify(query) });
    } else {
      // For non-email searches, do substring match for both email and name
      const searchTerm = sanitizeSearchTerm(trimmedSearch);
      if (searchTerm) {
        query.$or = [
          { email: { $regex: searchTerm, $options: 'i' } },
          { name: { $regex: searchTerm, $options: 'i' } }
        ];
      }
    }
  }

  // Get total count
  const total = await User.countDocuments(query);

  // Get hosts with pagination
  const hosts = await User.find(query)
    .select('_id name email isBlocked createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  res.success(HTTP_STATUS.OK, 'Hosts list retrieved successfully', {
    hosts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

/**
 * Get host statistics and daily records (Admin only)
 * GET /api/admin/hosts/statistics
 * 
 * Query Parameters:
 * - date: Filter by specific date (YYYY-MM-DD) (optional)
 * - fromDate: Filter from this date onwards (optional)
 * - toDate: Filter up to this date (optional)
 * - hostId: Filter by specific host ID (optional, use email instead)
 * - email: Filter by host email (preferred over hostId) (optional)
 * 
 * Returns:
 * - Total hosts count
 * - For each host: name, email, total lobbies, lobbies grouped by date and time
 * - Daily records with full tournament details
 */
const getHostStatistics = asyncHandler(async (req, res) => {
  const { date, fromDate, toDate, hostId, email } = req.query;

  // Build query for tournaments
  const tournamentQuery = {
    hostId: { $ne: null } // Only tournaments with assigned hosts
  };

  // Filter by specific host - support both hostId and email
  let actualHostId = hostId;
  if (email && !hostId) {
    // If email is provided, find host by email first
    const host = await User.findOne({ 
      email: email.toLowerCase().trim(),
      role: 'host'
    });
    if (!host) {
      // Return empty result if host not found
      return res.success(HTTP_STATUS.OK, 'Host statistics retrieved successfully', {
        totalHosts: 0,
        totalLobbies: 0,
        filters: {
          date: date || null,
          fromDate: fromDate || null,
          toDate: toDate || null,
          hostId: null,
          email: email || null
        },
        hosts: []
      });
    }
    actualHostId = host._id.toString();
  }

  // Filter by specific host if provided
  if (actualHostId) {
    tournamentQuery.hostId = actualHostId;
  }

  // Filter by date if provided
  if (date) {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return res.badRequest('Invalid date format. Must be YYYY-MM-DD');
    }
    dateObj.setHours(0, 0, 0, 0);
    const nextDay = new Date(dateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    tournamentQuery.date = {
      $gte: dateObj,
      $lt: nextDay
    };
  } else if (fromDate || toDate) {
    tournamentQuery.date = {};
    if (fromDate) {
      const fromDateObj = new Date(fromDate);
      if (isNaN(fromDateObj.getTime())) {
        return res.badRequest('Invalid fromDate format. Must be YYYY-MM-DD');
      }
      fromDateObj.setHours(0, 0, 0, 0);
      tournamentQuery.date.$gte = fromDateObj;
    }
    if (toDate) {
      const toDateObj = new Date(toDate);
      if (isNaN(toDateObj.getTime())) {
        return res.badRequest('Invalid toDate format. Must be YYYY-MM-DD');
      }
      toDateObj.setHours(23, 59, 59, 999);
      tournamentQuery.date.$lte = toDateObj;
    }
  }

  // Get all tournaments with assigned hosts (include platformFees for hostFee)
  const tournaments = await Tournament.find(tournamentQuery)
    .select('_id game mode subMode date startTime entryFee maxPlayers status hostId participants region platformFees')
    .populate('hostId', 'name email _id')
    .sort({ date: 1, startTime: 1 })
    .lean();

  // Get all unique hosts
  const hostIds = [...new Set(tournaments.map(t => t.hostId?._id?.toString()).filter(Boolean))];
  const hosts = await User.find({ 
    _id: { $in: hostIds },
    role: 'host'
  })
    .select('_id name email')
    .lean();

  // Get host statistics: per-lobby hostFee, totalHostFeeEarned per host
  const hostStatistics = await Tournament.aggregate([
    { $match: tournamentQuery },
    {
      $group: {
        _id: {
          hostId: "$hostId",
          date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
        },
        totalLobbies: { $sum: 1 },
        hostFeeEarnedInGroup: {
          $sum: {
            $cond: [
              { $eq: ["$status", "completed"] },
              { $ifNull: ["$platformFees.hostFee", 0] },
              0
            ]
          }
        },
        tournaments: {
          $push: {
            tournamentId: "$_id",
            game: "$game",
            mode: "$mode",
            subMode: "$subMode",
            startTime: "$startTime",
            entryFee: "$entryFee",
            maxPlayers: "$maxPlayers",
            currentPlayers: { $size: { $ifNull: ["$participants", []] } },
            status: "$status",
            region: { $ifNull: ["$region", "Global"] },
            lobbyName: { $ifNull: ["$lobbyName", null] },
            hostFee: { $ifNull: ["$platformFees.hostFee", 0] },
            prizePool: { $ifNull: ["$prizePool", 0] }
          }
        }
      }
    },
    {
      $group: {
        _id: "$_id.hostId",
        totalLobbies: { $sum: "$totalLobbies" },
        totalHostFeeEarned: { $sum: "$hostFeeEarnedInGroup" },
        dailyRecords: {
          $push: {
            date: "$_id.date",
            totalLobbies: "$totalLobbies",
            hostFeeEarned: "$hostFeeEarnedInGroup",
            tournaments: "$tournaments"
          }
        }
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, email: 1 } }],
        as: "hostInfo"
      }
    },
    { $unwind: "$hostInfo" },
    {
      $project: {
        _id: 0,
        hostId: "$_id",
        name: "$hostInfo.name",
        email: "$hostInfo.email",
        totalLobbies: 1,
        dailyRecords: 1
      }
    },
    { $sort: { totalLobbies: -1 } }
  ]);

  // Sort hosts by total lobbies (descending)
  hostStatistics.sort((a, b) => b.totalLobbies - a.totalLobbies);

  res.success(HTTP_STATUS.OK, 'Host statistics retrieved successfully', {
    totalHosts: hostStatistics.length,
    totalLobbies: tournaments.length,
    filters: {
      date: date || null,
      fromDate: fromDate || null,
      toDate: toDate || null,
      hostId: actualHostId || null,
      email: email || null
    },
    hosts: hostStatistics
  });
});

/**
 * Lobby financial history (Admin only)
 * GET /api/admin/history/lobbies
 * Completed lobbies with financial breakdown: prize pool, host fee, platform fee, caster fee, host name.
 * Query: limit, skip, fromDate, toDate, hostId (optional).
 */
const getLobbyFinancialHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const skip = parseInt(req.query.skip, 10) || 0;
  const fromDate = req.query.fromDate || null;
  const toDate = req.query.toDate || null;
  const hostId = req.query.hostId || null;

  const query = { status: 'completed', hostId: { $ne: null } };
  if (fromDate) {
    const d = new Date(fromDate);
    if (!Number.isNaN(d.getTime())) query.date = { $gte: d };
  }
  if (toDate) {
    const d = new Date(toDate);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      query.date = query.date || {};
      query.date.$lte = d;
    }
  }
  if (hostId) query.hostId = hostId;

  const [lobbies, total] = await Promise.all([
    Tournament.find(query)
      .select('_id game mode subMode date startTime lobbyName entryFee participants platformFees prizePool')
      .populate('hostId', 'name email _id')
      .sort({ date: -1, startTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Tournament.countDocuments(query)
  ]);

  const items = lobbies.map((t) => ({
    tournamentId: t._id,
    game: t.game,
    mode: t.mode,
    subMode: t.subMode,
    date: t.date,
    startTime: t.startTime,
    lobbyName: t.lobbyName || null,
    entryFee: t.entryFee,
    joinedTeams: (t.participants || []).length,
    prizePool: t.prizePool || 0,
    hostFee: (t.platformFees && t.platformFees.hostFee) ? t.platformFees.hostFee : 0,
    platformFee: (t.platformFees && t.platformFees.platformFee) ? t.platformFees.platformFee : 0,
    casterFee: (t.platformFees && t.platformFees.casterFee) ? t.platformFees.casterFee : 0,
    winnerPrizePool: (t.platformFees && t.platformFees.winnerPrizePool) ? t.platformFees.winnerPrizePool : 0,
    host: t.hostId ? { _id: t.hostId._id, name: t.hostId.name, email: t.hostId.email } : null
  }));

  res.success(HTTP_STATUS.OK, 'Lobby financial history retrieved', {
    items,
    total,
    limit,
    skip
  });
});

/**
 * Get all top-up transactions (Admin only)
 * GET /api/admin/topup-transactions
 */
const getTopupTransactions = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const skip = parseInt(req.query.skip) || 0;
  const status = req.query.status || null; // Optional filter: success/fail
  const email = req.query.email || null; // Optional filter by user email
  const startDate = req.query.startDate || null; // Optional filter by start date
  const endDate = req.query.endDate || null; // Optional filter by end date
  
  const result = await walletService.getAllTopupTransactions(limit, skip, status, email, startDate, endDate);
  
  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.TOPUP_TRANSACTIONS_RETRIEVED, {
    transactions: result.transactions,
    total: result.total,
    limit: result.limit,
    skip: result.skip
  });
});

/**
 * Get pending payment requests (Admin only)
 * GET /api/admin/payments/pending
 * Returns all pending payment requests that need admin approval
 * Excludes transactions that admin has already rejected
 */
const getPendingPayments = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const skip = parseInt(req.query.skip) || 0;
  const email = req.query.email || null; // Optional filter by user email
  const startDate = req.query.startDate || null; // Optional filter by start date
  const endDate = req.query.endDate || null; // Optional filter by end date
  
  // Get pending transactions (status = 'fail' but NOT verified by admin)
  // This excludes admin-rejected transactions (verifiedBy: 'admin')
  const result = await walletService.getPendingTopupTransactions(limit, skip, email, startDate, endDate);
  
  res.success(HTTP_STATUS.OK, 'Pending payment requests retrieved successfully', {
    pendingPayments: result.transactions,
    total: result.total,
    limit: result.limit,
    skip: result.skip,
    message: `Found ${result.total} pending payment request(s) awaiting admin approval`
  });
});

/**
 * Update top-up transaction status (Admin only)
 * POST /api/admin/topup-transactions/:transactionId/update-status
 * Admin can mark transaction as 'success' or 'fail'
 * When marked as 'success', balance is added to user wallet
 * When marked as 'fail', balance is not added (or removed if already added)
 */
const updateTransactionStatus = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { status } = req.body;
  
  if (!transactionId) {
    return res.badRequest('transactionId is required');
  }

  if (!status) {
    return res.badRequest('status is required');
  }

  if (!['success', 'fail'].includes(status)) {
    return res.badRequest('status must be either "success" or "fail"');
  }

  try {
    const result = await walletService.updateTransactionStatus(transactionId, status);
    
    res.success(HTTP_STATUS.OK, `Transaction status updated to ${status}`, {
      transaction: {
        _id: result.transaction._id,
        userId: result.transaction.userId,
        type: result.transaction.type,
        amountINR: result.transaction.amountINR,
        description: result.transaction.description,
        status: result.transaction.status,
        addedBy: result.transaction.addedBy,
        utr: result.transaction.utr,
        bankReference: result.transaction.bankReference,
        createdAt: result.transaction.createdAt,
        updatedAt: result.transaction.updatedAt
      },
      wallet: {
        balanceINR: result.wallet.balanceINR,
        updatedAt: result.wallet.updatedAt
      },
      message: status === 'success' 
        ? 'Transaction approved. Balance has been added to user wallet.'
        : 'Transaction rejected. Balance has not been added.'
    });
  } catch (error) {
    if (error.message === 'Transaction not found') {
      return res.notFound('Transaction not found');
    }
    if (error.message === 'Can only update status for top-up transactions') {
      return res.badRequest(error.message);
    }
    return res.error(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to update transaction status', null, error);
  }
});

/**
 * Get withdrawal requests (Admin only)
 * GET /api/admin/withdrawals
 * Lists user withdrawal requests with user info and current balance (so admin can verify user had sufficient balance).
 * Admin does manual payment to user, then updates status to success.
 */
const getWithdrawalRequests = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const skip = parseInt(req.query.skip) || 0;
  const status = req.query.status || null; // pending | success | fail
  const email = req.query.email || null;

  const result = await walletService.getWithdrawalRequests(limit, skip, status, email);

  res.success(HTTP_STATUS.OK, 'Withdrawal requests retrieved successfully', {
    requests: result.requests,
    total: result.total,
    limit: result.limit,
    skip: result.skip
  });
});

/**
 * Update withdrawal request status (Admin only)
 * PATCH /api/admin/withdrawals/:transactionId/status
 * **pending** only: success = you paid the user manually (wallet already debited on request); fail = refund user.
 */
const updateWithdrawalStatus = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { status } = req.body;

  if (!transactionId) {
    return res.badRequest('transactionId is required');
  }
  if (!status || !['success', 'fail'].includes(status)) {
    return res.badRequest('status is required and must be "success" or "fail"');
  }

  try {
    const result = await walletService.updateWithdrawalStatus(transactionId, status, 'admin');

    const payload = {
      transaction: {
        _id: result.transaction._id,
        userId: result.transaction.userId,
        type: result.transaction.type,
        amountINR: result.transaction.amountINR,
        description: result.transaction.description,
        status: result.transaction.status,
        verifiedBy: result.transaction.verifiedBy,
        verifiedAt: result.transaction.verifiedAt,
        bankReference: result.transaction.bankReference || undefined,
        createdAt: result.transaction.createdAt,
        updatedAt: result.transaction.updatedAt
      },
      wallet: {
        balanceINR: result.wallet.balanceINR,
        updatedAt: result.wallet.updatedAt
      },
      message:
        status === 'fail'
          ? 'Withdrawal rejected. Amount refunded to user wallet.'
          : 'Withdrawal marked paid (manual settlement; user wallet was already debited on request).'
    };

    res.success(HTTP_STATUS.OK, `Withdrawal status updated to ${status}`, payload);
  } catch (error) {
    if (error.message === 'Transaction not found') return res.notFound(error.message);
    if (error.message === 'Can only update status for withdrawal transactions') return res.badRequest(error.message);
    if (error.message.includes('already') || error.message === 'Withdrawal no longer pending') return res.badRequest(error.message);
    return res.error(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to update withdrawal status', null, error);
  }
});

/**
 * Search transaction by UTR (Admin only)
 * GET /api/admin/transactions/search-by-utr?utr=UTR_NUMBER
 * Helps admin find transaction when verifying from bank statement
 */
const searchTransactionByUTR = asyncHandler(async (req, res) => {
  const { utr } = req.query;
  
  if (!utr) {
    return res.badRequest('UTR is required');
  }

  const utrTrimmed = normalizeUTR(utr);

  try {
    const WalletHistory = require('../models/WalletHistory.model');
    
    // Search for transaction with this UTR
    const transaction = await WalletHistory.findOne({
      utr: utrTrimmed,
      type: 'topup'
    })
    .populate('userId', 'name email ign')
    .lean();

    if (!transaction) {
      return res.success(HTTP_STATUS.OK, 'No transaction found with this UTR', {
        utr: utrTrimmed,
        transaction: null,
        message: 'No transaction found. Please check the UTR number or create a new transaction.'
      });
    }

    const amountINR = transaction.amountINR != null ? transaction.amountINR : transaction.amountGC;
    res.success(HTTP_STATUS.OK, 'Transaction found', {
      utr: utrTrimmed,
      transaction: {
        _id: transaction._id,
        userId: transaction.userId,
        user: transaction.userId ? {
          name: transaction.userId.name,
          email: transaction.userId.email,
          ign: transaction.userId.ign
        } : null,
        amountINR,
        status: transaction.status,
        paymentVerified: transaction.paymentVerified,
        qrCodeId: transaction.qrCodeId,
        receiptCode: transaction.receiptCode,
        bankReference: transaction.bankReference,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }
    });
  } catch (error) {
    Logger.error('Error searching transaction by UTR', { errName: error.name });
    return res.error(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to search transaction', null, error);
  }
});

/**
 * Verify payment by UTR and amount (Admin only)
 * POST /api/admin/transactions/verify-by-utr
 * Admin provides UTR and amount from bank statement, system automatically matches and verifies
 */
const verifyPaymentByUTR = asyncHandler(async (req, res) => {
  const { utr, amountINR, bankReference } = req.body;
  
  if (!utr) {
    return res.badRequest('UTR is required');
  }

  if (!amountINR || amountINR <= 0) {
    return res.badRequest('amountINR is required and must be greater than 0');
  }

  const utrTrimmed = normalizeUTR(utr);

  try {
    const WalletHistory = require('../models/WalletHistory.model');
    
    // Find transaction with matching UTR and amount (with small tolerance for rounding)
    const transaction = await WalletHistory.findOne({
      utr: utrTrimmed,
      type: 'topup',
      amountINR: {
        $gte: amountINR - 0.01, // Allow 1 paisa tolerance
        $lte: amountINR + 0.01
      }
    })
    .populate('userId', 'name email ign');

    if (!transaction) {
      return res.notFound('No transaction found with matching UTR and amount. Please verify the UTR and amount from bank statement.');
    }

    // Check if already verified
    if (transaction.status === 'success') {
      return res.badRequest('This transaction is already verified and processed.');
    }

    // Update bank reference BEFORE status update (if provided)
    if (bankReference) {
      transaction.bankReference = bankReference.trim();
      await transaction.save();
    }

    // Update transaction - verify and approve (this handles status, verification fields, balance, and WebSocket broadcast)
    const result = await walletService.updateTransactionStatus(transaction._id.toString(), 'success');
    
    // If bankReference was provided and not already saved, update it on the fresh transaction
    if (bankReference) {
      const freshTransactionDoc = await WalletHistory.findById(transaction._id);
      if (freshTransactionDoc && freshTransactionDoc.bankReference !== bankReference.trim()) {
        freshTransactionDoc.bankReference = bankReference.trim();
        await freshTransactionDoc.save();
      }
    }

    // Reload transaction with populated userId for response
    const freshTransaction = await WalletHistory.findById(transaction._id)
      .populate('userId', 'name email ign');
    
    if (!freshTransaction) {
      throw new Error('Failed to reload transaction after update');
    }

    res.success(HTTP_STATUS.OK, 'Payment verified successfully by UTR match', {
      transaction: {
        _id: freshTransaction._id,
        userId: freshTransaction.userId,
        user: freshTransaction.userId ? {
          name: freshTransaction.userId.name,
          email: freshTransaction.userId.email,
          ign: freshTransaction.userId.ign
        } : null,
        
        utr: freshTransaction.utr,
        bankReference: freshTransaction.bankReference,
        status: freshTransaction.status,
        paymentVerified: freshTransaction.paymentVerified,
        verifiedBy: freshTransaction.verifiedBy,
        verifiedAt: freshTransaction.verifiedAt,
        qrCodeId: freshTransaction.qrCodeId,
        receiptCode: freshTransaction.receiptCode,
        createdAt: freshTransaction.createdAt,
        updatedAt: freshTransaction.updatedAt
      },
      wallet: {
        balanceINR: result.wallet.balanceINR,
        updatedAt: result.wallet.updatedAt
      },
      message: 'Payment verified and balance added to user wallet successfully.'
    });
  } catch (error) {
    Logger.error('Error verifying payment by UTR', { errName: error.name });
    if (error.message === 'Transaction not found') {
      return res.notFound('Transaction not found');
    }
    return res.error(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to verify payment', null, error);
  }
});

/**
 * Add bank reference to transaction (Admin only)
 * POST /api/admin/transactions/:transactionId/add-bank-reference
 * Admin can add bank reference number from bank statement
 */
const addBankReference = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { bankReference } = req.body;
  
  if (!transactionId) {
    return res.badRequest('transactionId is required');
  }

  if (!bankReference) {
    return res.badRequest('bankReference is required');
  }

  try {
    const WalletHistory = require('../models/WalletHistory.model');
    const transaction = await WalletHistory.findById(transactionId);

    if (!transaction) {
      return res.notFound('Transaction not found');
    }

    if (transaction.type !== 'topup') {
      return res.badRequest('Can only add bank reference to top-up transactions');
    }

    transaction.bankReference = bankReference.trim();
    await transaction.save();

    res.success(HTTP_STATUS.OK, 'Bank reference added successfully', {
      transaction: {
        _id: transaction._id,
        utr: transaction.utr,
        bankReference: transaction.bankReference,
        amountINR: transaction.amountINR,
        status: transaction.status
      }
    });
  } catch (error) {
    Logger.error('Error adding bank reference', { errName: error.name });
    return res.error(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to add bank reference', null, error);
  }
});

/**
 * Bulk verify payments from bank statement file (Admin only)
 * POST /api/admin/transactions/bulk-verify-from-statement
 * Upload bank statement CSV/Excel file, system automatically matches and verifies payments
 */
const bulkVerifyFromStatement = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.badRequest('Bank statement file is required. Please upload a CSV or Excel file.');
  }

  const filePath = req.file.path;
  const { autoVerify = false } = req.body; // If true, automatically verify matched transactions

  try {
    const bankStatementParser = require('../services/bankStatementParser.service');
    const WalletHistory = require('../models/WalletHistory.model');
    const fs = require('fs');

    // Parse bank statement file
    const bankTransactions = await bankStatementParser.parseBankStatement(filePath);
    
    if (bankTransactions.length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      return res.badRequest('No valid transactions found in bank statement. Please check file format.');
    }

    // Get all pending transactions with UTR
    const pendingTransactions = await WalletHistory.find({
      type: 'topup',
      status: 'fail', // Only pending transactions
      utr: { $ne: null, $exists: true } // Must have UTR
    })
    .populate('userId', 'name email ign')
    .lean();

    // Match bank transactions with pending payments
    const matchResults = bankStatementParser.matchTransactions(
      bankTransactions,
      pendingTransactions.map(txn => ({
        ...txn,
        amountINR: txn.amountINR
      }))
    );

    const verifiedTransactions = [];
    const errors = [];

    // If autoVerify is true, automatically verify matched transactions
    if (autoVerify === 'true' || autoVerify === true) {
      for (const match of matchResults.matches) {
        try {
          const transaction = await WalletHistory.findById(match.pendingTransaction._id);
          
          if (transaction && transaction.status !== 'success') {
            // Update bank reference BEFORE status update (if provided)
            if (match.bankTransaction.description) {
              transaction.bankReference = match.bankTransaction.description.substring(0, 100).trim();
              await transaction.save();
            }

            // Verify transaction (this handles status, verification fields, balance, and WebSocket broadcast)
            const result = await walletService.updateTransactionStatus(
              transaction._id.toString(),
              'success'
            );

            // If bank reference was provided, update it on the fresh transaction
            if (match.bankTransaction.description) {
              const freshTransaction = result.transaction;
              if (freshTransaction.bankReference !== match.bankTransaction.description.substring(0, 100).trim()) {
                freshTransaction.bankReference = match.bankTransaction.description.substring(0, 100).trim();
                await freshTransaction.save();
              }
            }

            // Use fresh transaction from result for response
            const freshTransaction = result.transaction;

            verifiedTransactions.push({
              transactionId: freshTransaction._id,
              utr: freshTransaction.utr,
              amountINR: freshTransaction.amountINR,
              status: freshTransaction.status,
              paymentVerified: freshTransaction.paymentVerified,
              user: match.pendingTransaction.userId ? {
                name: match.pendingTransaction.userId.name,
                email: match.pendingTransaction.userId.email
              } : null
            });
          }
        } catch (error) {
          Logger.error('Error verifying transaction', { errName: error.name });
          errors.push({
            utr: match.pendingTransaction.utr,
            error: error.message
          });
        }
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.success(HTTP_STATUS.OK, 'Bank statement processed successfully', {
      summary: {
        totalBankTransactions: bankTransactions.length,
        totalPendingTransactions: pendingTransactions.length,
        matched: matchResults.matches.length,
        unmatchedBank: matchResults.unmatchedBank.length,
        unmatchedPending: matchResults.unmatchedPending.length,
        verified: verifiedTransactions.length,
        errors: errors.length
      },
      matches: matchResults.matches.map(match => ({
        utr: match.bankTransaction.utr,
        amount: match.bankTransaction.amount,
        date: match.bankTransaction.date,
        transactionId: match.pendingTransaction._id,
        user: match.pendingTransaction.userId ? {
          name: match.pendingTransaction.userId.name,
          email: match.pendingTransaction.userId.email
        } : null,
        verified: autoVerify === 'true' || autoVerify === true
      })),
      unmatchedBank: matchResults.unmatchedBank.map(txn => ({
        utr: txn.utr,
        amount: txn.amount,
        date: txn.date,
        description: txn.description
      })),
      unmatchedPending: matchResults.unmatchedPending.map(txn => ({
        transactionId: txn._id,
        utr: txn.utr,
        amountINR: txn.amountINR,
        user: txn.userId ? {
          name: txn.userId.name,
          email: txn.userId.email
        } : null,
        createdAt: txn.createdAt
      })),
      verifiedTransactions: verifiedTransactions,
      errors: errors,
      message: autoVerify === 'true' || autoVerify === true
        ? `${verifiedTransactions.length} transactions verified automatically. ${matchResults.matches.length - verifiedTransactions.length} matches need manual review.`
        : `Found ${matchResults.matches.length} matches. Set autoVerify=true to automatically verify them.`
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      const fs = require('fs');
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        Logger.error('Error deleting uploaded file', { errName: unlinkError.name });
      }
    }

    Logger.error('Error processing bank statement', { errName: error.name });
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      `Failed to process bank statement: ${error.message}`,
      null,
      error
    );
  }
});

/**
 * Verify payment from external API/service (for automated bank integration)
 * POST /api/admin/transactions/verify-from-api
 * This endpoint can be called by external services/cron jobs that fetch bank data
 */
const verifyFromExternalAPI = asyncHandler(async (req, res) => {
  const { utr, amountINR, bankReference } = req.body;

  if (!utr || !amountINR) {
    return res.badRequest('UTR and amountINR are required');
  }

  try {
    const paymentVerificationService = require('../services/paymentVerification.service');
    const result = await paymentVerificationService.verifyFromExternalAPI(
      utr,
      amountINR,
      bankReference
    );

    if (result.verified) {
      const txPlain =
        result.transaction && typeof result.transaction.toObject === 'function'
          ? result.transaction.toObject()
          : result.transaction;
      res.success(HTTP_STATUS.OK, 'Payment verified from external API', {
        verified: true,
        transaction: normalizeWalletHistoryDoc(txPlain),
        wallet: result.wallet,
        message: 'Payment verified and balance added successfully'
      });
    } else {
      res.success(HTTP_STATUS.OK, 'No matching transaction found', {
        verified: false,
        utr: utr,
        message: result.message
      });
    }
  } catch (error) {
    Logger.error('Error verifying from external API', { errName: error.name });
    return res.error(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to verify payment', null, error);
  }
});

/**
 * Get payment verification statistics (Admin only)
 * GET /api/admin/payments/verification-stats
 */
const getVerificationStats = asyncHandler(async (req, res) => {
  try {
    const WalletHistory = require('../models/WalletHistory.model');
    const BankStatementTransaction = require('../models/BankStatementTransaction.model');

    // Get stats for last 24 hours, 7 days, and 30 days
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [stats24h, stats7d, stats30d, flaggedCount, pendingCount, bankStatements] = await Promise.all([
      // Last 24 hours
      WalletHistory.aggregate([
        {
          $match: {
            type: 'topup',
            createdAt: { $gte: last24Hours }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amountINR' }
          }
        }
      ]),
      // Last 7 days
      WalletHistory.aggregate([
        {
          $match: {
            type: 'topup',
            createdAt: { $gte: last7Days }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amountINR' }
          }
        }
      ]),
      // Last 30 days
      WalletHistory.aggregate([
        {
          $match: {
            type: 'topup',
            createdAt: { $gte: last30Days }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amountINR' }
          }
        }
      ]),
      // Flagged transactions count
      WalletHistory.countDocuments({
        type: 'topup',
        flaggedForReview: true,
        status: 'fail'
      }),
      // Pending transactions count
      WalletHistory.countDocuments({
        type: 'topup',
        status: 'fail',
        utr: { $ne: null, $exists: true },
        paymentVerified: false,
        verifiedBy: { $ne: 'admin' }
      }),
      // Bank statement transactions
      BankStatementTransaction.aggregate([
        {
          $group: {
            _id: '$processed',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ])
    ]);

    // Format stats
    const formatStats = (stats) => {
      const result = { success: 0, fail: 0, totalAmount: 0 };
      stats.forEach(stat => {
        result[stat._id] = stat.count;
        result.totalAmount += stat.totalAmount || 0;
      });
      return result;
    };

    res.success(HTTP_STATUS.OK, 'Verification statistics retrieved successfully', {
      last24Hours: formatStats(stats24h),
      last7Days: formatStats(stats7d),
      last30Days: formatStats(stats30d),
      flaggedTransactions: flaggedCount,
      pendingTransactions: pendingCount,
      bankStatements: {
        processed: bankStatements.find(s => s._id === true)?.count || 0,
        unprocessed: bankStatements.find(s => s._id === false)?.count || 0,
        totalAmount: bankStatements.reduce((sum, s) => sum + (s.totalAmount || 0), 0)
      },
      autoVerificationEnabled: process.env.AUTO_VERIFY_PAYMENTS === 'true'
    });
  } catch (error) {
    Logger.error('Error getting verification stats:', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to get verification statistics',
      null,
      error
    );
  }
});

/**
 * Get flagged transactions for review (Admin only)
 * GET /api/admin/payments/flagged
 */
const getFlaggedTransactions = asyncHandler(async (req, res) => {
  try {
    const WalletHistory = require('../models/WalletHistory.model');
    const { limit = 50, skip = 0 } = req.query;

    const transactions = await WalletHistory.find({
      type: 'topup',
      flaggedForReview: true,
      status: 'fail'
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('userId', 'name email ign')
      .lean();

    const total = await WalletHistory.countDocuments({
      type: 'topup',
      flaggedForReview: true,
      status: 'fail'
    });

    res.success(HTTP_STATUS.OK, 'Flagged transactions retrieved successfully', {
      transactions: normalizeWalletHistoryList(transactions),
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    Logger.error('Error getting flagged transactions:', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to get flagged transactions',
      null,
      error
    );
  }
});

/**
 * Manually trigger email processing (Admin only)
 * POST /api/admin/payments/process-email
 */
const processEmailManually = asyncHandler(async (req, res) => {
  try {
    const bankStatementEmailParser = require('../services/bankStatementEmailParser.service');
    const { maxEmails = 50 } = req.body;

    const result = await bankStatementEmailParser.processEmails({
      maxEmails: parseInt(maxEmails),
      markAsRead: true
    });

    res.success(HTTP_STATUS.OK, 'Email processing completed', {
      processed: result.processed,
      transactions: result.transactions,
      skipped: result.skipped,
      errors: result.errors
    });
  } catch (error) {
    Logger.error('Error processing emails manually:', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      `Failed to process emails: ${error.message}`,
      null,
      error
    );
  }
});

/**
 * Get processed bank statements (Admin only)
 * GET /api/admin/payments/bank-statements
 */
const getBankStatements = asyncHandler(async (req, res) => {
  try {
    const BankStatementTransaction = require('../models/BankStatementTransaction.model');
    const { limit = 50, skip = 0, processed = null } = req.query;

    const query = {};
    if (processed !== null) {
      query.processed = processed === 'true';
    }

    const [transactions, total] = await Promise.all([
      BankStatementTransaction.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .populate('matchedTransactionId', 'userId amountINR utr')
        .lean(),
      BankStatementTransaction.countDocuments(query)
    ]);

    res.success(HTTP_STATUS.OK, 'Bank statements retrieved successfully', {
      transactions: normalizeWalletHistoryList(transactions),
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    Logger.error('Error getting bank statements:', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to get bank statements',
      null,
      error
    );
  }
});

/**
 * Send custom push notification to all users (Admin only)
 * POST /api/admin/notifications/send
 * Body: { title, message }
 */
const sendCustomNotification = asyncHandler(async (req, res) => {
  const { title, message } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.badRequest('Title is required');
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.badRequest('Message is required');
  }
  const { sendCustomNotification: sendNotification } = require('../services/notification.service');
  const result = sendNotification(title.trim(), message.trim());
  if (!result.success) {
    return res.badRequest(result.message || 'Failed to send notification');
  }
  res.success(HTTP_STATUS.OK, result.message, { title: title.trim(), message: message.trim() });
});

/**
 * Get overall dashboard statistics (Admin only)
 * GET /api/admin/dashboard/stats
 *
 * See services/adminDashboardStats.service.js for field meanings (deposits vs top-ups, lobbyStats).
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  const { fetchAdminDashboardStatsData } = require('../services/adminDashboardStats.service');
  const data = await fetchAdminDashboardStatsData();
  res.success(HTTP_STATUS.OK, 'Dashboard statistics retrieved successfully', data);
});

/**
 * Server-Sent Events: push dashboard stats periodically + right after connect (Admin only).
 * GET /api/admin/dashboard/stream
 * Auth: Authorization: Bearer … or ?access_token=… (for browser EventSource)
 */
const streamAdminDashboard = asyncHandler(async (req, res) => {
  const { attachAdminDashboardSse } = require('../services/adminDashboardSse.service');
  attachAdminDashboardSse(req, res);
});

/**
 * Get financial analytics (Admin only)
 * GET /api/admin/analytics?period=daily|weekly|monthly
 */
const getAnalytics = asyncHandler(async (req, res) => {
  const { period = 'daily' } = req.query;
  const WalletHistory = require('../models/WalletHistory.model');

  let groupBy = {};
  let daysToLookBack = 7; // Default for daily

  if (period === 'daily') {
    groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    daysToLookBack = 7;
  } else if (period === 'weekly') {
    // Group by start of week (Sunday)
    groupBy = { $dateToString: { format: '%Y-%U', date: '$createdAt' } };
    daysToLookBack = 30; // ~4 weeks
  } else if (period === 'monthly') {
    groupBy = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
    daysToLookBack = 180; // ~6 months
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysToLookBack);
  startDate.setHours(0, 0, 0, 0);

  const analytics = await WalletHistory.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        type: { $in: ['topup', 'reward'] },
        status: { $ne: 'fail' } // Exclude failed topups
      }
    },
    {
      $group: {
        _id: groupBy,
        deposits: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$type', 'topup'] }, { $eq: ['$status', 'success'] }] },
              '$amountINR',
              0
            ]
          }
        },
        rewards: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'reward'] },
              '$amountINR',
              0
            ]
          }
        }
      }
    },
    {
      $project: {
        date: '$_id',
        deposits: 1,
        rewards: 1,
        profit: { $subtract: ['$deposits', '$rewards'] }
      }
    },
    { $sort: { date: 1 } }
  ]);

  // Handle gaps: create a map for easy lookup
  const statsMap = new Map();
  analytics.forEach(stat => statsMap.set(stat.date, stat));

  const result = [];
  const current = new Date(startDate);
  const now = new Date();

  while (current <= now) {
    let dateStr = '';
    if (period === 'daily') {
      dateStr = current.toISOString().split('T')[0];
      current.setDate(current.getDate() + 1);
    } else if (period === 'weekly') {
      // Very simplistic weekly grouping for now
      const year = current.getFullYear();
      const week = Math.floor((current.getDate() + 6) / 7); // Not perfect but consistent with aggregation $U logic-ish
      // Actually aggregation $U is week number of year. 
      // Let's just use the aggregation date labels for now and not fill gaps for weekly/monthly to keep it simple,
      // OR just return the aggregation result.
      break; 
    } else {
      break;
    }

    if (period === 'daily') {
      const stat = statsMap.get(dateStr) || { date: dateStr, deposits: 0, rewards: 0, profit: 0 };
      result.push(stat);
    }
  }

  // If we broke out (weekly/monthly) or just return the aggregation if result is empty
  const finalData = result.length > 0 ? result : analytics;

  res.success(HTTP_STATUS.OK, `Analytics (${period}) retrieved successfully`, {
    period,
    data: finalData
  });
});

module.exports = {
  adminLogin,
  generateNextDayLobbies,
  generateLobbies,
  getHostsForTournament,
  assignHost,
  listUsers,
  blockUsers,
  unblockUsers,
  createHost,
  listHostApplications,
  approveHostApplication,
  rejectHostApplication,
  listTournaments,
  editTournament,
  deleteTournament,
  listHosts,
  getHostStatistics,
  getTopupTransactions,
  getPendingPayments,
  updateTransactionStatus,
  getWithdrawalRequests,
  updateWithdrawalStatus,
  searchTransactionByUTR,
  verifyPaymentByUTR,
  addBankReference,
  bulkVerifyFromStatement,
  verifyFromExternalAPI,
  getVerificationStats,
  getFlaggedTransactions,
  processEmailManually,
  getBankStatements,
  sendCustomNotification,
  getDashboardStats,
  streamAdminDashboard,
  getAnalytics,
  getLobbyFinancialHistory,
  createOrganization,
  listOrganizations,
  addOrgManager,
  removeOrgManager
};
