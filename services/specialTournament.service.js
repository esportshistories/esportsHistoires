/**
 * Special Tournament Service
 * Admin-created sponsored multi-round tournaments:
 * - Free entry (no GC deducted from users)
 * - Fixed prize pool (admin-sponsored)
 * - Multi-round bracket: each round → slots → BR matches → top N qualify
 * - Rewards distributed by admin after final round
 */

const mongoose = require('mongoose');
const SpecialTournament = require('../models/SpecialTournament.model');
const { addBalance } = require('./wallet.service');
const { POSITION_POINTS_TABLE } = require('../constants');
const { resolveAnyGameTitle } = require('../constants/gameCatalog');
const Logger = require('../utils/logger');
const { roundInr } = require('../utils/inr');
const orgWalletService = require('./orgWallet.service');

// ---------------------------------------------------------------------------
// WebSocket helper (lazy-loaded to avoid circular deps)
// ---------------------------------------------------------------------------
const getIO = () => {
  try {
    const { getIO: _getIO } = require('./websocket.service');
    return _getIO();
  } catch (e) {
    return null;
  }
};

/**
 * Broadcast a special-tournament event using EXISTING socket event names so the
 * frontend needs zero changes. Maps special events → regular event names:
 *   status-updated        → tournament:status-updated
 *   match-result-updated  → tournament:live-results-updated
 *   room-updated          → tournament:room-updated
 *   everything else       → also emitted as-is (special-tournament:<name>) for apps that want it
 *
 * @param {string} tournamentId
 * @param {string} event - internal event key
 * @param {Object} payload
 * @param {Object} opts - { participantIds, hostIds, adminOnly }
 */
const broadcastSpecialTournamentEvent = (tournamentId, event, payload, opts = {}) => {
  const io = getIO();
  if (!io) return;
  const data = { tournamentId, isSpecial: true, ...payload, timestamp: new Date().toISOString() };
  const { participantIds = [], hostIds = [], adminOnly = false } = opts;

  // Map to standard event names so frontend socket handlers work without changes
  const standardEventMap = {
    'special-tournament:status-updated':      'tournament:status-updated',
    'special-tournament:config-updated':      'tournament:status-updated',
    'special-tournament:round-started':       'tournament:status-updated',
    'special-tournament:match-result-updated':'tournament:live-results-updated',
    'special-tournament:slot-finalized':      'tournament:live-results-updated',
    'special-tournament:rewards-distributed': 'tournament:status-updated',
    'special-tournament:room-updated':        'tournament:room-updated'
  };
  const standardEvent = standardEventMap[event] || event;

  const emit = (target) => {
    // Emit both standard event (for existing frontend) + specific event (for new features)
    target.emit(standardEvent, data);
    if (standardEvent !== event) target.emit(event, data);
  };

  if (!adminOnly) {
    emit(io.to(`tournament:${tournamentId}`));
    participantIds.forEach(uid => {
      const id = uid && uid.toString ? uid.toString() : String(uid);
      if (id) emit(io.to(`user:${id}`));
    });
    hostIds.forEach(hid => {
      const id = hid && hid.toString ? hid.toString() : String(hid);
      if (id) emit(io.to(`host:${id}`));
    });
  }
  emit(io.to('admin:tournaments'));
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Calculate match points from position and kills
 * Reuses same formula as regular tournament: POSITION_POINTS_TABLE + kill points
 */
const calculateMatchPoints = (position, kills) => {
  const positionPoints = POSITION_POINTS_TABLE[position] ?? 0;
  const killPoints = typeof kills === 'number' ? Math.max(0, kills) : 0;
  return positionPoints + killPoints;
};

/**
 * Aggregate all match results inside a slot into team standings
 * Rankings: totalPoint desc → booyah desc → kills desc
 * @param {Array} matchResults - slot.matchResults array
 * @returns {Array} standings sorted by rank, each with { teamName, totalPoint, kills, booyah, totalPositionPoints, position }
 */
const aggregateSlotStandings = (matchResults) => {
  const byTeam = {};
  (matchResults || []).forEach(match => {
    (match.teams || []).forEach(t => {
      const name = (t.teamName || '').trim();
      if (!name) return;
      if (!byTeam[name]) {
        byTeam[name] = { teamName: name, totalPoint: 0, kills: 0, booyah: 0, totalPositionPoints: 0 };
      }
      const tp = typeof t.totalPoint === 'number' ? t.totalPoint : 0;
      const k = typeof t.kills === 'number' ? t.kills : 0;
      const pp = Math.max(0, tp - k);
      byTeam[name].totalPoint += tp;
      byTeam[name].kills += k;
      byTeam[name].totalPositionPoints += pp;
      byTeam[name].booyah += typeof t.booyah === 'number' ? t.booyah : (t.booyah ? 1 : 0);
    });
  });

  const list = Object.values(byTeam).sort((a, b) => {
    if (b.totalPoint !== a.totalPoint) return b.totalPoint - a.totalPoint;
    if (b.booyah !== a.booyah) return b.booyah - a.booyah;
    return b.kills - a.kills;
  });
  list.forEach((row, i) => { row.position = i + 1; });
  return list;
};

/**
 * Format match results with positionPoints breakdown for API response
 */
const formatSlotMatchResults = (matchResults) => {
  return (matchResults || []).map(m => ({
    matchIndex: m.matchIndex,
    teams: (m.teams || []).map(t => {
      const kills = typeof t.kills === 'number' ? t.kills : 0;
      const totalPoint = typeof t.totalPoint === 'number' ? t.totalPoint : 0;
      const positionPoints = Math.max(0, totalPoint - kills);
      return {
        teamName: t.teamName,
        position: t.position,
        kills,
        positionPoints,
        totalPoint,
        booyah: t.position === 1 ? 1 : 0
      };
    })
  }));
};

/**
 * Normalize sponsor handles object (trim, max 200 chars per key)
 * @param {Object} [handles]
 * @returns {Object}
 */
const normalizeSponsorHandles = (handles) => {
  if (!handles || typeof handles !== 'object') return {};
  const keys = ['instagram', 'discord', 'youtube', 'telegram', 'whatsapp'];
  const out = {};
  keys.forEach(k => {
    const v = handles[k];
    if (v != null && String(v).trim()) out[k] = String(v).trim().slice(0, 200);
  });
  return out;
};

// ---------------------------------------------------------------------------
// Admin: Create
// ---------------------------------------------------------------------------

/**
 * Create a new special/sponsored tournament
 * Admin provides rounds config, prize pool, and optional prize distribution.
 *
 * @param {string} adminId - Admin user ID
 * @param {Object} data - Tournament data
 * @param {string} data.title
 * @param {string} data.game
 * @param {string} data.mode - 'BR' | 'CS'
 * @param {string} data.subMode
 * @param {string} [data.region]
 * @param {string} [data.lobbyName]
 * @param {number} data.prizePool - Fixed prize pool in GC
 * @param {Array}  [data.prizeDistribution] - [{ position, percent }] sum must be <= 100
 * @param {number} data.maxSlots - Max total teams allowed to register
 * @param {Array}  data.rounds - [{ roundNumber, roundName?, teamsPerSlot, matchesPerSlot, qualifyPerSlot }]
 * @param {Date}   [data.scheduledDate]
 * @param {string} [data.scheduledTime]
 * @param {Date}   [data.scheduledEndDate]
 * @param {Date}   [data.registrationDeadline]
 * @param {string} [data.description]
 * @param {string} [data.formatLabel]
 * @param {Object} [data.sponsorHandles] - { instagram, discord, youtube, telegram, whatsapp }
 * @returns {Promise<Object>} Created tournament
 */
const createSpecialTournament = async (creatorUserId, data) => {
  const {
    title, game, mode, subMode, region, lobbyName,
    prizePool, prizeDistribution, maxSlots, rounds,
    scheduledDate, scheduledTime, scheduledEndDate, registrationDeadline, description,
    formatLabel, sponsorHandles,
    organizationId
  } = data;

  if (!title || !mode || !subMode) {
    throw new Error('title, mode, and subMode are required');
  }
  if (!['BR', 'CS'].includes(mode)) {
    throw new Error('mode must be BR or CS. LW mode is not supported for special tournaments.');
  }
  if (!prizePool || prizePool < 1) {
    throw new Error('prizePool must be at least 1 GC');
  }
  if (!maxSlots || maxSlots < 2) {
    throw new Error('maxSlots must be at least 2');
  }
  if (!rounds || !Array.isArray(rounds) || rounds.length === 0) {
    throw new Error('At least one round configuration is required');
  }

  // Validate rounds
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    if (!r.roundNumber || r.roundNumber < 1) throw new Error(`Round ${i + 1}: roundNumber must be >= 1`);
    if (!r.teamsPerSlot || r.teamsPerSlot < 2) throw new Error(`Round ${i + 1}: teamsPerSlot must be >= 2`);
    if (!r.matchesPerSlot || r.matchesPerSlot < 1) throw new Error(`Round ${i + 1}: matchesPerSlot must be >= 1`);
    if (!r.qualifyPerSlot || r.qualifyPerSlot < 1) throw new Error(`Round ${i + 1}: qualifyPerSlot must be >= 1`);
    if (r.qualifyPerSlot >= r.teamsPerSlot) {
      throw new Error(`Round ${i + 1}: qualifyPerSlot (${r.qualifyPerSlot}) must be less than teamsPerSlot (${r.teamsPerSlot})`);
    }
  }

  // Validate prizeDistribution if provided
  if (prizeDistribution && prizeDistribution.length > 0) {
    const totalPercent = prizeDistribution.reduce((sum, p) => sum + (p.percent || 0), 0);
    if (totalPercent > 100) {
      throw new Error(`prizeDistribution total percent (${totalPercent}%) exceeds 100%`);
    }
  }

  const roundDocs = rounds.map(r => ({
    roundNumber: r.roundNumber,
    roundName: r.roundName || `Round ${r.roundNumber}`,
    teamsPerSlot: r.teamsPerSlot,
    matchesPerSlot: r.matchesPerSlot,
    qualifyPerSlot: r.qualifyPerSlot,
    status: 'pending',
    slots: []
  }));

  // Sort rounds by roundNumber
  roundDocs.sort((a, b) => a.roundNumber - b.roundNumber);

  // Normalize game to canonical supported title if provided
  let resolvedGame = 'Free Fire';
  if (game !== undefined && game !== null && String(game).trim() !== '') {
    const r = resolveAnyGameTitle(game);
    if (!r) throw new Error(`Unknown or unsupported game: ${game}`);
    resolvedGame = r;
  }

  // If org-sponsored, validate org wallet can fund prize pool.
  if (organizationId) {
    await orgWalletService.lockOrgFundsForTournament(organizationId, Number(prizePool));
  }

  const tournament = await SpecialTournament.create({
    tournamentType: 'sponsored',
    title,
    game: resolvedGame,
    mode,
    subMode,
    region: region || 'Asia',
    lobbyName: lobbyName || title,
    prizePool,
    prizeDistribution: prizeDistribution || [],
    maxSlots,
    status: 'draft',
    createdBy: creatorUserId,
    organizationId: organizationId || null,
    rounds: roundDocs,
    scheduledDate: scheduledDate || null,
    scheduledTime: scheduledTime || null,
    scheduledEndDate: scheduledEndDate || null,
    registrationDeadline: registrationDeadline || null,
    description: description || null,
    formatLabel: formatLabel && String(formatLabel).trim() ? String(formatLabel).trim().slice(0, 200) : null,
    sponsorHandles: normalizeSponsorHandles(sponsorHandles)
  });

  return tournament;
};

// ---------------------------------------------------------------------------
// Admin: Open / Cancel registration
// ---------------------------------------------------------------------------

/**
 * Open registration for the tournament (draft → registration_open)
 * @param {string} adminId
 * @param {string} tournamentId
 * @returns {Promise<Object>}
 */
const openRegistration = async (adminId, tournamentId) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (tournament.status !== 'draft') {
    throw new Error(`Cannot open registration. Current status: ${tournament.status}`);
  }
  tournament.status = 'registration_open';
  await tournament.save();

  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:status-updated',
    { status: 'registration_open', title: tournament.title, prizePool: tournament.prizePool, maxSlots: tournament.maxSlots }
  );

  return tournament;
};

/**
 * Cancel a special tournament (refunds nothing since entry is free)
 * @param {string} adminId
 * @param {string} tournamentId
 * @param {string} [reason]
 * @returns {Promise<Object>}
 */
const cancelSpecialTournament = async (adminId, tournamentId, reason) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (['completed', 'cancelled'].includes(tournament.status)) {
    throw new Error(`Tournament is already ${tournament.status}`);
  }
  tournament.status = 'cancelled';
  if (reason) tournament.description = `[CANCELLED: ${reason}] ${tournament.description || ''}`.trim();
  await tournament.save();

  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:status-updated',
    { status: 'cancelled', title: tournament.title, reason: reason || null },
    { participantIds: tournament.participants }
  );

  return tournament;
};

// ---------------------------------------------------------------------------
// Admin: Update tournament config (maxSlots, prizePool, prizeDistribution, etc.)
// ---------------------------------------------------------------------------

/**
 * Update tournament configuration. Admin can change most settings anytime before rewards.
 * Round config (matchesPerSlot, teamsPerSlot, qualifyPerSlot, roundName) can be updated
 * only for rounds that are still 'pending' (not yet started).
 *
 * Allowed fields:
 *   - maxSlots, prizePool, prizeDistribution, title, lobbyName, description, schedule, formatLabel, sponsorHandles
 *   - rounds: [{ roundNumber, roundName?, teamsPerSlot?, matchesPerSlot?, qualifyPerSlot? }] — only pending rounds
 *
 * @param {string} adminId
 * @param {string} tournamentId
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated tournament
 */
const updateTournamentConfig = async (adminId, tournamentId, updates) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (tournament.status === 'cancelled') throw new Error('Cannot update a cancelled tournament');
  if (tournament.rewardsDistributed) throw new Error('Rewards already distributed; tournament is locked');

  const allowed = ['maxSlots', 'prizePool', 'prizeDistribution', 'title', 'lobbyName', 'description',
    'scheduledDate', 'scheduledTime', 'scheduledEndDate', 'registrationDeadline', 'formatLabel', 'sponsorHandles', 'rounds'];

  let changed = false;
  for (const key of allowed) {
    if (updates[key] === undefined) continue;

    if (key === 'rounds') {
      if (!Array.isArray(updates.rounds) || updates.rounds.length === 0) {
        throw new Error('rounds must be a non-empty array of { roundNumber, roundName?, teamsPerSlot?, matchesPerSlot?, qualifyPerSlot? }');
      }
      for (const ru of updates.rounds) {
        const rn = parseInt(ru.roundNumber, 10);
        if (isNaN(rn) || rn < 1) throw new Error(`Invalid roundNumber: ${ru.roundNumber}`);
        const round = tournament.rounds.find(r => r.roundNumber === rn);
        if (!round) throw new Error(`Round ${rn} not found`);
        if (round.status !== 'pending') {
          throw new Error(`Round ${rn} has already started (status: ${round.status}). Only pending rounds can be updated.`);
        }
        if (ru.roundName != null) round.roundName = String(ru.roundName).trim() || `Round ${rn}`;
        if (ru.teamsPerSlot != null) {
          const v = parseInt(ru.teamsPerSlot, 10);
          if (isNaN(v) || v < 2) throw new Error(`Round ${rn}: teamsPerSlot must be >= 2`);
          round.teamsPerSlot = v;
        }
        if (ru.matchesPerSlot != null) {
          const v = parseInt(ru.matchesPerSlot, 10);
          if (isNaN(v) || v < 1) throw new Error(`Round ${rn}: matchesPerSlot must be >= 1`);
          round.matchesPerSlot = v;
        }
        if (ru.qualifyPerSlot != null) {
          const v = parseInt(ru.qualifyPerSlot, 10);
          if (isNaN(v) || v < 1) throw new Error(`Round ${rn}: qualifyPerSlot must be >= 1`);
          if (v >= (round.teamsPerSlot || 2)) throw new Error(`Round ${rn}: qualifyPerSlot must be less than teamsPerSlot`);
          round.qualifyPerSlot = v;
        }
      }
      changed = true;
    } else if (key === 'maxSlots') {
      const newMax = parseInt(updates.maxSlots, 10);
      if (isNaN(newMax) || newMax < 2) throw new Error('maxSlots must be at least 2');
      if (newMax < tournament.participants.length) {
        throw new Error(
          `Cannot set maxSlots to ${newMax} — ${tournament.participants.length} teams are already registered`
        );
      }
      tournament.maxSlots = newMax;
      changed = true;
    } else if (key === 'prizePool') {
      const newPrize = Number(updates.prizePool);
      if (isNaN(newPrize) || newPrize < 1) throw new Error('prizePool must be at least 1 GC');
      tournament.prizePool = newPrize;
      changed = true;
    } else if (key === 'prizeDistribution') {
      if (!Array.isArray(updates.prizeDistribution)) throw new Error('prizeDistribution must be an array');
      const totalPercent = updates.prizeDistribution.reduce((s, p) => s + (p.percent || 0), 0);
      if (totalPercent > 100) throw new Error(`prizeDistribution total percent (${totalPercent}%) exceeds 100%`);
      tournament.prizeDistribution = updates.prizeDistribution;
      changed = true;
    } else if (key === 'sponsorHandles') {
      tournament.sponsorHandles = normalizeSponsorHandles(updates.sponsorHandles);
      changed = true;
    } else if (key === 'formatLabel') {
      tournament.formatLabel = updates.formatLabel != null && String(updates.formatLabel).trim()
        ? String(updates.formatLabel).trim().slice(0, 200) : null;
      changed = true;
    } else {
      tournament[key] = updates[key];
      changed = true;
    }
  }

  if (!changed) throw new Error('No valid fields provided to update');

  await tournament.save();

  // Broadcast config update to admin + subscribers (include rounds when changed so UI can show match counts)
  const payload = {
    title: tournament.title,
    prizePool: tournament.prizePool,
    maxSlots: tournament.maxSlots,
    status: tournament.status
  };
  if (changed && updates.rounds) {
    payload.rounds = tournament.rounds.map(r => ({
      roundNumber: r.roundNumber,
      roundName: r.roundName,
      teamsPerSlot: r.teamsPerSlot,
      matchesPerSlot: r.matchesPerSlot,
      qualifyPerSlot: r.qualifyPerSlot,
      status: r.status
    }));
  }
  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:config-updated',
    payload,
    {
      participantIds: tournament.participants,
      adminOnly: false
    }
  );

  return tournament;
};

// ---------------------------------------------------------------------------
// Admin: Send push notification to all connected users about this tournament
// ---------------------------------------------------------------------------

/**
 * Broadcast a push notification to ALL connected socket clients about a special tournament.
 * Admin can use this to announce the tournament or remind users to join.
 *
 * @param {string} adminId
 * @param {string} tournamentId
 * @param {Object} notifData - { title, message, type? }
 * @returns {Promise<{ sent: true, tournament: Object }>}
 */
const sendSpecialTournamentNotification = async (adminId, tournamentId, notifData) => {
  const tournament = await SpecialTournament.findById(tournamentId)
    .select('title mode subMode prizePool status maxSlots participants')
    .lean();
  if (!tournament) throw new Error('Special tournament not found');
  if (tournament.status === 'cancelled') throw new Error('Cannot notify for a cancelled tournament');

  const { broadcastPushNotification } = require('./websocket.service');

  const payload = {
    type: notifData.type || 'special_tournament',
    title: notifData.title || `🏆 ${tournament.title}`,
    message: notifData.message || `Join now! ${tournament.mode} ${tournament.subMode} — Prize: ${tournament.prizePool} GC. Free entry!`,
    tournamentId: tournament._id.toString(),
    tournament: {
      _id: tournament._id,
      title: tournament.title,
      mode: tournament.mode,
      subMode: tournament.subMode,
      prizePool: tournament.prizePool,
      status: tournament.status,
      participantCount: tournament.participants.length,
      maxSlots: tournament.maxSlots
    },
    timestamp: new Date().toISOString()
  };

  broadcastPushNotification(payload);
  Logger.info('Special tournament push notification broadcasted', {
    tournamentId, title: payload.title, sentBy: adminId
  });

  return { sent: true, tournament };
};

// ---------------------------------------------------------------------------
// User: Join (free)
// ---------------------------------------------------------------------------

/** Team size: 4 compulsory (leader + 3 players), max 5 (leader + 4 players). Only complete teams appear in list/round 1. */
const TEAM_PLAYERS_MIN = 3;
const TEAM_PLAYERS_MAX = 4;

/** Returns only teams with at least 4 members (leader + 3 in players). Incomplete teams do not appear in list/round 1. */
const getEligibleTeams = (registeredTeams) => {
  return (registeredTeams || []).filter(t => (t.players || []).length >= TEAM_PLAYERS_MIN);
};

/**
 * Join a special tournament (free — no wallet deduction).
 * Team must have 4–5 players (leader + 3 or 4 in players array). Only complete teams count for the list and round 1.
 * @param {string} userId
 * @param {string} tournamentId
 * @param {string} teamName
 * @param {Array}  [players] - Array of player name strings (3 or 4 required = 4 or 5 total with leader)
 * @returns {Promise<Object>} Updated tournament
 */
const joinSpecialTournament = async (userId, tournamentId, teamName, players = []) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (tournament.status !== 'registration_open') {
    throw new Error(`Registration is not open. Tournament status: ${tournament.status}`);
  }
  if (tournament.registrationDeadline && new Date() > new Date(tournament.registrationDeadline)) {
    throw new Error('Registration deadline has passed. You cannot join this tournament.');
  }
  if (tournament.isParticipant(userId)) {
    throw new Error('You have already registered for this tournament');
  }
  if (!tournament.hasAvailableSlots()) {
    throw new Error(`Tournament is full. Maximum ${tournament.maxSlots} teams allowed.`);
  }
  if (!teamName || typeof teamName !== 'string' || !teamName.trim()) {
    throw new Error('teamName is required');
  }

  const playerList = (players || []).map(n => ({ name: String(n).trim() })).filter(p => p.name);
  if (playerList.length < TEAM_PLAYERS_MIN || playerList.length > TEAM_PLAYERS_MAX) {
    throw new Error(`Team must have 4 or 5 players (you provided ${playerList.length + 1} including you). 4 compulsory, max 5.`);
  }

  // Check duplicate team name
  const nameTaken = tournament.registeredTeams.some(
    t => t.teamName.trim().toLowerCase() === teamName.trim().toLowerCase()
  );
  if (nameTaken) throw new Error(`Team name "${teamName}" is already taken`);

  tournament.participants.push(userId);
  tournament.registeredTeams.push({
    leaderUserId: userId,
    teamName: teamName.trim(),
    players: playerList
  });

  await tournament.save();
  return tournament;
};

// ---------------------------------------------------------------------------
// Admin: Start a round (auto-assign teams to slots)
// ---------------------------------------------------------------------------

/**
 * Start a round: auto-assign teams into slots of `teamsPerSlot`.
 * Round 1 uses all registered participants.
 * Subsequent rounds use qualifiedTeams from all slots of the previous round.
 *
 * @param {string} adminId
 * @param {string} tournamentId
 * @param {number} roundNumber - 1-based round number to start
 * @returns {Promise<Object>} Updated tournament
 */
const startRound = async (adminId, tournamentId, roundNumber) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (!['registration_open', 'running'].includes(tournament.status)) {
    throw new Error(`Cannot start round. Tournament status: ${tournament.status}`);
  }

  const round = tournament.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found in this tournament`);
  if (round.status !== 'pending') {
    throw new Error(`Round ${roundNumber} has already been started (status: ${round.status})`);
  }

  // Collect teams for this round
  let teamsForRound = []; // array of { leaderUserId, teamName, players }

  if (roundNumber === 1) {
    // First round: use only complete teams (4+ members). Incomplete teams do not appear in the list.
    const eligible = getEligibleTeams(tournament.registeredTeams);
    if (eligible.length === 0) {
      throw new Error('No complete teams (4+ players) found. At registration end only complete teams are eligible.');
    }
    teamsForRound = eligible.map(t => ({
      leaderUserId: t.leaderUserId,
      teamName: t.teamName,
      players: t.players || []
    }));
  } else {
    // Subsequent rounds: collect qualifiedTeams from all completed slots of the previous round
    const prevRound = tournament.rounds.find(r => r.roundNumber === roundNumber - 1);
    if (!prevRound) throw new Error(`Previous round ${roundNumber - 1} not found`);
    if (prevRound.status !== 'completed') {
      throw new Error(`Round ${roundNumber - 1} is not completed yet. Cannot start round ${roundNumber}.`);
    }

    // Gather all qualified userIds from previous round's slots
    const qualifiedUserIds = new Set();
    prevRound.slots.forEach(slot => {
      (slot.qualifiedTeams || []).forEach(uid => qualifiedUserIds.add(uid.toString()));
    });

    // Map back to team info from registeredTeams
    teamsForRound = tournament.registeredTeams
      .filter(t => qualifiedUserIds.has(t.leaderUserId.toString()))
      .map(t => ({
        leaderUserId: t.leaderUserId,
        teamName: t.teamName,
        players: t.players || []
      }));
  }

  if (teamsForRound.length === 0) {
    throw new Error(`No teams available for round ${roundNumber}`);
  }

  const { teamsPerSlot } = round;

  // Shuffle teams for fair distribution
  const shuffled = [...teamsForRound].sort(() => Math.random() - 0.5);

  // Split into slots of teamsPerSlot
  const slots = [];
  for (let i = 0; i < shuffled.length; i += teamsPerSlot) {
    const chunk = shuffled.slice(i, i + teamsPerSlot);
    slots.push({
      slotIndex: slots.length,
      teams: chunk.map(t => ({
        leaderUserId: t.leaderUserId,
        teamName: t.teamName,
        players: t.players
      })),
      matchResults: [],
      qualifiedTeams: [],
      status: 'pending',
      room: { roomId: null, password: null },
      hostId: null
    });
  }

  round.slots = slots;
  round.status = 'running';

  if (tournament.status !== 'running') {
    tournament.status = 'running';
  }

  await tournament.save();

  // Notify all participants about round start + their slot assignment
  const allParticipantIds = tournament.participants || [];
  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:round-started',
    {
      roundNumber,
      roundName: round.roundName,
      totalSlots: slots.length,
      teamsPerSlot: round.teamsPerSlot,
      matchesPerSlot: round.matchesPerSlot,
      qualifyPerSlot: round.qualifyPerSlot,
      status: tournament.status
    },
    { participantIds: allParticipantIds }
  );

  // Send each participant their specific slot assignment
  // Uses tournament:status-updated (standard) so existing frontend handler picks it up
  const io = getIO();
  if (io) {
    slots.forEach(slot => {
      const slotPayload = {
        tournamentId: tournament._id.toString(),
        isSpecial: true,
        type: 'slot-assigned',
        status: 'running',
        roundNumber,
        roundName: round.roundName,
        slotIndex: slot.slotIndex,
        matchesPerSlot: round.matchesPerSlot,
        qualifyPerSlot: round.qualifyPerSlot,
        slotTeams: slot.teams.map(t => ({ teamName: t.teamName })),
        room: slot.room || { roomId: null, password: null },
        timestamp: new Date().toISOString()
      };
      slot.teams.forEach(team => {
        const uid = team.leaderUserId && team.leaderUserId.toString
          ? team.leaderUserId.toString()
          : String(team.leaderUserId);
        // Standard event so frontend handles it
        io.to(`user:${uid}`).emit('tournament:status-updated', slotPayload);
        // Specific event for apps that want granular control
        io.to(`user:${uid}`).emit('special-tournament:slot-assigned', slotPayload);
      });
    });
  }

  return tournament;
};

// ---------------------------------------------------------------------------
// Admin/Host: Assign host to a slot
// ---------------------------------------------------------------------------

/**
 * Assign a host to a specific slot in a round
 * @param {string} adminId
 * @param {string} tournamentId
 * @param {number} roundNumber
 * @param {number} slotIndex
 * @param {string} hostUserId
 * @returns {Promise<Object>}
 */
const assignSlotHost = async (adminId, tournamentId, roundNumber, slotIndex, hostUserId) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');

  const round = tournament.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found`);

  const slot = round.slots.find(s => s.slotIndex === slotIndex);
  if (!slot) throw new Error(`Slot ${slotIndex} not found in round ${roundNumber}`);

  slot.hostId = hostUserId;
  await tournament.save();
  return tournament;
};

// ---------------------------------------------------------------------------
// Admin/Host: Update room info for a slot
// ---------------------------------------------------------------------------

/**
 * Set room ID and password for a slot
 * @param {string} userId - Admin or assigned host
 * @param {string} tournamentId
 * @param {number} roundNumber
 * @param {number} slotIndex
 * @param {string} roomId
 * @param {string} password
 * @returns {Promise<Object>}
 */
const updateSlotRoom = async (userId, tournamentId, roundNumber, slotIndex, roomId, password, opts = {}) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');

  const round = tournament.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found`);
  if (round.status !== 'running') throw new Error(`Round ${roundNumber} is not running`);

  const slot = round.slots.find(s => s.slotIndex === slotIndex);
  if (!slot) throw new Error(`Slot ${slotIndex} not found in round ${roundNumber}`);

  // Must be assigned host (admin check is done at route level via isAdmin middleware on admin route,
  // or host can call this if they are the slot host)
  const isHost = slot.hostId && slot.hostId.toString() === userId.toString();
  const callerIsAdmin = opts && opts.isAdmin;
  if (!isHost && !callerIsAdmin) {
    throw new Error('Only the assigned host or admin can update room info');
  }

  slot.room.roomId = roomId || null;
  slot.room.password = password || null;
  if (slot.status === 'pending') slot.status = 'running';

  await tournament.save();

  // Broadcast room info to slot participants
  const slotParticipantIds = (slot.teams || []).map(t => t.leaderUserId);
  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:room-updated',
    {
      roundNumber,
      slotIndex,
      room: slot.room
    },
    { participantIds: slotParticipantIds, hostIds: slot.hostId ? [slot.hostId] : [] }
  );

  return tournament;
};

// ---------------------------------------------------------------------------
// Host: Submit one match result inside a slot
// ---------------------------------------------------------------------------

/**
 * Submit one match result for a slot (partial, per BR match).
 * Host sends: matchIndex (0-based), teams: [{ teamName, position, kills }]
 *
 * @param {string} hostUserId
 * @param {string} tournamentId
 * @param {number} roundNumber
 * @param {number} slotIndex
 * @param {number} matchIndex - 0-based match index
 * @param {Array}  teams - [{ teamName, position, kills }]
 * @returns {Promise<{ tournament, standings, matchResults }>}
 */
const submitSlotMatchResult = async (hostUserId, tournamentId, roundNumber, slotIndex, matchIndex, teams) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');

  const round = tournament.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found`);
  if (round.status !== 'running') throw new Error(`Round ${roundNumber} is not running`);

  const slot = round.slots.find(s => s.slotIndex === slotIndex);
  if (!slot) throw new Error(`Slot ${slotIndex} not found in round ${roundNumber}`);
  if (slot.status === 'completed') throw new Error(`Slot ${slotIndex} is already completed`);

  // Verify host
  if (!slot.hostId || slot.hostId.toString() !== hostUserId.toString()) {
    throw new Error('Only the assigned host for this slot can submit match results');
  }

  if (typeof matchIndex !== 'number' || matchIndex < 0) {
    throw new Error('matchIndex must be a non-negative integer');
  }
  if (matchIndex >= round.matchesPerSlot) {
    throw new Error(`matchIndex ${matchIndex} is out of range. This slot has ${round.matchesPerSlot} matches (0-based: 0 to ${round.matchesPerSlot - 1})`);
  }

  const normalized = (teams || []).map(t => {
    const position = typeof t.position === 'number' ? Math.max(1, t.position) : 1;
    const kills = typeof t.kills === 'number' ? Math.max(0, t.kills) : 0;
    const totalPoint = calculateMatchPoints(position, kills);
    return {
      teamName: typeof t.teamName === 'string' ? t.teamName.trim() : String(t.teamName || '').trim(),
      booyah: position === 1 ? 1 : 0,
      kills,
      position,
      totalPoint
    };
  });

  if (!slot.matchResults) slot.matchResults = [];
  const existing = slot.matchResults.find(m => m.matchIndex === matchIndex);
  if (existing) {
    existing.teams = normalized;
  } else {
    slot.matchResults.push({ matchIndex, teams: normalized });
    slot.matchResults.sort((a, b) => a.matchIndex - b.matchIndex);
  }

  if (slot.status === 'pending') slot.status = 'running';

  await tournament.save();

  const standings = aggregateSlotStandings(slot.matchResults);
  const matchResults = formatSlotMatchResults(slot.matchResults);

  // Broadcast live standings to all teams in this slot
  const slotParticipantIds = (slot.teams || []).map(t => t.leaderUserId);
  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:match-result-updated',
    {
      roundNumber,
      slotIndex,
      matchIndex,
      matchResults,
      standings,
      matchResultsCount: slot.matchResults.length,
      matchesPerSlot: round.matchesPerSlot
    },
    { participantIds: slotParticipantIds, hostIds: slot.hostId ? [slot.hostId] : [] }
  );

  return { tournament, standings, matchResults };
};

// ---------------------------------------------------------------------------
// Host: Submit final result for a slot (auto-qualify top N teams)
// ---------------------------------------------------------------------------

/**
 * Submit final result for a slot after all matches are done.
 * Aggregates all match results, ranks teams, auto-qualifies top `qualifyPerSlot` teams.
 * If this is the last slot in the last round, marks tournament as completed.
 *
 * @param {string} hostUserId
 * @param {string} tournamentId
 * @param {number} roundNumber
 * @param {number} slotIndex
 * @returns {Promise<{ tournament, standings, qualifiedTeams }>}
 */
const submitSlotFinalResult = async (hostUserId, tournamentId, roundNumber, slotIndex) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');

  const round = tournament.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found`);
  if (round.status !== 'running') throw new Error(`Round ${roundNumber} is not running`);

  const slot = round.slots.find(s => s.slotIndex === slotIndex);
  if (!slot) throw new Error(`Slot ${slotIndex} not found in round ${roundNumber}`);
  if (slot.status === 'completed') throw new Error(`Slot ${slotIndex} is already finalized`);

  // Verify host
  if (!slot.hostId || slot.hostId.toString() !== hostUserId.toString()) {
    throw new Error('Only the assigned host for this slot can submit the final result');
  }

  // Verify all matches submitted
  const submittedIndices = new Set((slot.matchResults || []).map(m => m.matchIndex));
  const missingMatches = [];
  for (let i = 0; i < round.matchesPerSlot; i++) {
    if (!submittedIndices.has(i)) missingMatches.push(i + 1);
  }
  if (missingMatches.length > 0) {
    throw new Error(`Submit all ${round.matchesPerSlot} match results first. Missing match(es): ${missingMatches.join(', ')}`);
  }

  // Compute standings
  const standings = aggregateSlotStandings(slot.matchResults);

  // Map team name → leaderUserId from slot.teams
  const teamToUser = {};
  (slot.teams || []).forEach(t => {
    const key = (t.teamName || '').trim().toLowerCase();
    if (key && t.leaderUserId) teamToUser[key] = t.leaderUserId;
  });

  // Qualify top N teams
  const qualifyCount = Math.min(round.qualifyPerSlot, standings.length);
  const qualifiedUserIds = [];
  for (let i = 0; i < qualifyCount; i++) {
    const row = standings[i];
    const key = (row.teamName || '').trim().toLowerCase();
    const uid = teamToUser[key];
    if (uid) {
      qualifiedUserIds.push(uid);
    } else {
      Logger.warn('SpecialTournament: qualified team not found in slot teams', {
        tournamentId, roundNumber, slotIndex, teamName: row.teamName
      });
    }
  }

  slot.qualifiedTeams = qualifiedUserIds;
  slot.status = 'completed';

  // Check if all slots in this round are completed
  const allSlotsCompleted = round.slots.every(s => s.status === 'completed');
  if (allSlotsCompleted) {
    round.status = 'completed';
    Logger.info('SpecialTournament: round completed', { tournamentId, roundNumber });

    // Check if this was the last round
    const maxRoundNumber = Math.max(...tournament.rounds.map(r => r.roundNumber));
    if (roundNumber === maxRoundNumber) {
      tournament.status = 'completed';
      Logger.info('SpecialTournament: all rounds completed, tournament completed', { tournamentId });
    }
  }

  await tournament.save();

  // Notify slot participants of final standings + qualification
  const slotParticipantIds = (slot.teams || []).map(t => t.leaderUserId);
  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:slot-finalized',
    {
      roundNumber,
      roundName: round.roundName,
      slotIndex,
      standings,
      qualifiedCount: qualifiedUserIds.length,
      qualifiedTeamUserIds: qualifiedUserIds.map(uid => uid && uid.toString ? uid.toString() : String(uid)),
      roundCompleted: round.status === 'completed',
      tournamentCompleted: tournament.status === 'completed'
    },
    { participantIds: slotParticipantIds, hostIds: slot.hostId ? [slot.hostId] : [] }
  );

  // Personal notifications for qualified / eliminated users
  const io = getIO();
  if (io) {
    qualifiedUserIds.forEach(uid => {
      const id = uid && uid.toString ? uid.toString() : String(uid);
      const qualPayload = {
        tournamentId: tournament._id.toString(),
        isSpecial: true,
        type: 'qualified',
        status: 'running',
        title: tournament.title,
        roundNumber,
        roundName: round.roundName,
        slotIndex,
        message: `You qualified for the next round! (${round.roundName} → Round ${roundNumber + 1})`,
        timestamp: new Date().toISOString()
      };
      io.to(`user:${id}`).emit('tournament:status-updated', qualPayload);
      io.to(`user:${id}`).emit('special-tournament:you-qualified', qualPayload);
    });

    const eliminatedIds = slotParticipantIds
      .filter(uid => !qualifiedUserIds.some(q => q.toString() === uid.toString()));
    eliminatedIds.forEach(uid => {
      const id = uid && uid.toString ? uid.toString() : String(uid);
      const elimPayload = {
        tournamentId: tournament._id.toString(),
        isSpecial: true,
        type: 'eliminated',
        title: tournament.title,
        roundNumber,
        roundName: round.roundName,
        slotIndex,
        message: `You did not qualify from ${round.roundName} Slot ${slotIndex + 1}. Better luck next time!`,
        timestamp: new Date().toISOString()
      };
      io.to(`user:${id}`).emit('tournament:status-updated', elimPayload);
      io.to(`user:${id}`).emit('special-tournament:you-eliminated', elimPayload);
    });
  }

  return {
    tournament,
    standings,
    qualifiedTeams: qualifiedUserIds,
    qualifiedCount: qualifiedUserIds.length
  };
};

// ---------------------------------------------------------------------------
// Admin: Distribute rewards after final round
// ---------------------------------------------------------------------------

/**
 * Distribute prize pool to winners based on final round results.
 * Uses the final slot standings to determine overall winners.
 * For single-slot finals: straightforward top N.
 * For multi-slot finals: admin should ensure final round has 1 slot, or
 * this aggregates across all final slots' top teams.
 *
 * @param {string} adminId
 * @param {string} tournamentId
 * @returns {Promise<{ tournament, winners }>}
 */
const distributeRewards = async (adminId, tournamentId) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (tournament.status !== 'completed') {
    throw new Error(`Rewards can only be distributed after all rounds are completed. Current status: ${tournament.status}`);
  }
  if (tournament.rewardsDistributed) {
    throw new Error('Rewards have already been distributed for this tournament');
  }
  if (!tournament.prizeDistribution || tournament.prizeDistribution.length === 0) {
    throw new Error('No prize distribution configured. Please set prizeDistribution on the tournament.');
  }

  // Org-sponsored tournaments must still be fundable at payout time.
  if (tournament.organizationId) {
    await orgWalletService.lockOrgFundsForTournament(tournament.organizationId, Number(tournament.prizePool));
  }

  // Get the final round (highest roundNumber that is completed)
  const finalRound = tournament.rounds
    .filter(r => r.status === 'completed')
    .sort((a, b) => b.roundNumber - a.roundNumber)[0];

  if (!finalRound) throw new Error('No completed round found');

  // Collect all match results from final round slots and aggregate standings
  // We merge all final slot results to get overall winners
  const allFinalMatchResults = [];
  finalRound.slots.forEach(slot => {
    (slot.matchResults || []).forEach(mr => {
      // Prefix matchIndex to avoid collisions across slots
      allFinalMatchResults.push({
        matchIndex: slot.slotIndex * 1000 + mr.matchIndex,
        teams: mr.teams
      });
    });
  });

  const finalStandings = aggregateSlotStandings(allFinalMatchResults);

  // Map team name → leaderUserId from registeredTeams (only eligible teams)
  const teamToUser = {};
  tournament.registeredTeams.forEach(t => {
    const key = (t.teamName || '').trim().toLowerCase();
    if (key && t.leaderUserId) teamToUser[key] = t.leaderUserId;
  });

  const winners = [];
  const prizePool = tournament.prizePool;

  // Use admin/host-declared final ranking if set; otherwise use aggregated standings
  const rankingSource = (tournament.declaredFinalRanking && tournament.declaredFinalRanking.length > 0)
    ? tournament.declaredFinalRanking
    : finalStandings.map((s, i) => ({ position: i + 1, teamName: s.teamName }));

  for (const dist of tournament.prizeDistribution) {
    const positionEntry = rankingSource.find(r => r.position === dist.position);
    const teamName = positionEntry && positionEntry.teamName ? positionEntry.teamName.trim() : null;
    if (!teamName) continue;

    const key = teamName.toLowerCase();
    const userId = teamToUser[key];
    if (!userId) {
      Logger.warn('SpecialTournament distributeRewards: winner team not found in registeredTeams', {
        tournamentId, teamName
      });
      continue;
    }

    const rewardINR = roundInr((prizePool * dist.percent) / 100);
    if (rewardINR <= 0) continue;

    try {
      await addBalance(
        userId.toString(),
        rewardINR,
        `Special Tournament reward: ${tournament.title} - Position ${dist.position}`,
        'success',
        'admin'
      );
      winners.push({
        userId,
        position: dist.position,
        rewardINR,
        teamName
      });
      Logger.info('SpecialTournament: reward credited', {
        tournamentId, userId: userId.toString(), position: dist.position, rewardINR
      });
    } catch (err) {
      Logger.error('SpecialTournament: failed to credit reward', {
        tournamentId, userId: userId.toString(), position: dist.position, errName: err.name, errMsg: err.message
      });
      throw new Error(`Failed to credit reward to position ${dist.position}: ${err.message}`);
    }
  }

  // Deduct org wallet after successful credits.
  if (tournament.organizationId) {
    const totalPaid = winners.reduce((sum, w) => sum + (Number(w.rewardINR) || 0), 0);
    if (totalPaid > 0) {
      await orgWalletService.spendLockedOrgFunds(tournament.organizationId, totalPaid);
    }
  }

  tournament.winners = winners;
  tournament.rewardsDistributed = true;
  await tournament.save();

  // Notify winners — also emit wallet:balance-updated so wallet refreshes on frontend
  const io = getIO();
  if (io) {
    winners.forEach(w => {
      const uid = w.userId && w.userId.toString ? w.userId.toString() : String(w.userId);
      const rewardPayload = {
        tournamentId: tournament._id.toString(),
        isSpecial: true,
        type: 'reward-credited',
        title: tournament.title,
        position: w.position,
        rewardINR: w.rewardINR,
        teamName: w.teamName,
        message: `Congratulations! You won ₹${w.rewardINR} for finishing #${w.position} in ${tournament.title}!`,
        timestamp: new Date().toISOString()
      };
      // Standard event — frontend already listens to this for wallet updates
      io.to(`wallet:${uid}`).emit('wallet:balance-updated', { userId: uid, rewardINR: w.rewardINR, ...rewardPayload });
      // Specific event for granular handling
      io.to(`user:${uid}`).emit('special-tournament:reward-credited', rewardPayload);
    });
  }

  // Broadcast to admin + tournament room
  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:rewards-distributed',
    {
      prizePool: tournament.prizePool,
      winners: winners.map(w => ({
        teamName: w.teamName,
        position: w.position,
        rewardINR: w.rewardINR
      }))
    },
    { participantIds: tournament.participants }
  );

  return { tournament, winners };
};

/**
 * Admin (or host) declares final ranking for the tournament. Used when host/admin declares
 * winner list by rank instead of using auto-aggregated standings. Call before distribute-rewards.
 * @param {string} adminId
 * @param {string} tournamentId
 * @param {Array} ranking - [{ position: 1, teamName: "Team A" }, { position: 2, teamName: "Team B" }, ...]
 * @returns {Promise<Object>} Updated tournament
 */
const declareFinalRanking = async (adminId, tournamentId, ranking) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (tournament.status !== 'completed') {
    throw new Error(`Can only declare final ranking when tournament is completed. Current status: ${tournament.status}`);
  }
  if (tournament.rewardsDistributed) {
    throw new Error('Rewards already distributed; cannot change final ranking.');
  }
  if (!Array.isArray(ranking) || ranking.length === 0) {
    throw new Error('ranking must be a non-empty array of { position, teamName }');
  }
  const normalized = ranking.map(r => ({
    position: parseInt(r.position, 10),
    teamName: String(r.teamName || '').trim()
  })).filter(r => r.position >= 1 && r.teamName);
  if (normalized.length === 0) throw new Error('ranking must contain at least one valid { position, teamName }');
  tournament.declaredFinalRanking = normalized;
  await tournament.save();

  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:config-updated',
    { declaredFinalRanking: tournament.declaredFinalRanking }
  );
  return tournament;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get list of special tournaments with optional filters
 * @param {Object} filters
 * @param {string} [filters.status]
 * @param {string} [filters.mode]
 * @param {string} [filters.subMode]
 * @param {number} [limit=20]
 * @param {number} [skip=0]
 * @returns {Promise<{ tournaments, total }>}
 */
const getSpecialTournamentList = async (filters = {}, limit = 20, skip = 0) => {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.mode) query.mode = filters.mode;
  if (filters.subMode) query.subMode = filters.subMode;

  const [tournaments, total] = await Promise.all([
    SpecialTournament.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .select('-rounds.slots.matchResults -registeredTeams')
      .lean(),
    SpecialTournament.countDocuments(query)
  ]);

  return { tournaments, total };
};

/**
 * Get full details of a special tournament (all rounds, slots, results)
 * @param {string} tournamentId
 * @returns {Promise<Object>}
 */
const getSpecialTournamentDetails = async (tournamentId) => {
  const tournament = await SpecialTournament.findById(tournamentId)
    .populate('createdBy', 'name email')
    .populate('participants', 'name ign')
    .lean();

  if (!tournament) throw new Error('Special tournament not found');
  return tournament;
};

/**
 * Admin-only: Full results report for dashboard — every round, every slot (lobby),
 * match results, standings, and qualified teams. So admin can see "har lobby ka result".
 * @param {string} tournamentId
 * @returns {Promise<Object>}
 */
const getSpecialTournamentAdminReport = async (tournamentId) => {
  const tournament = await SpecialTournament.findById(tournamentId)
    .populate('createdBy', 'name email')
    .lean();

  if (!tournament) throw new Error('Special tournament not found');

  const roundsReport = (tournament.rounds || []).map(round => ({
    roundNumber: round.roundNumber,
    roundName: round.roundName,
    teamsPerSlot: round.teamsPerSlot,
    matchesPerSlot: round.matchesPerSlot,
    qualifyPerSlot: round.qualifyPerSlot,
    status: round.status,
    slots: (round.slots || []).map(slot => {
      const standings = aggregateSlotStandings(slot.matchResults || []);
      const qualifiedTeamNames = (slot.qualifiedTeams || []).length > 0
        ? standings.slice(0, round.qualifyPerSlot || 0).map(s => s.teamName)
        : [];
      return {
        slotIndex: slot.slotIndex,
        status: slot.status,
        teamCount: (slot.teams || []).length,
        hostId: slot.hostId,
        room: slot.room,
        matchResults: formatSlotMatchResults(slot.matchResults || []),
        matchResultsCount: (slot.matchResults || []).length,
        standings,
        qualifiedTeams: slot.qualifiedTeams || [],
        qualifiedTeamNames
      };
    })
  }));

  return {
    tournament: {
      _id: tournament._id,
      title: tournament.title,
      game: tournament.game,
      mode: tournament.mode,
      subMode: tournament.subMode,
      region: tournament.region,
      status: tournament.status,
      prizePool: tournament.prizePool,
      prizeDistribution: tournament.prizeDistribution,
      maxSlots: tournament.maxSlots,
      participantCount: (tournament.participants || []).length,
      eligibleTeamCount: getEligibleTeams(tournament.registeredTeams || []).length,
      declaredFinalRanking: tournament.declaredFinalRanking || null,
      scheduledDate: tournament.scheduledDate,
      scheduledTime: tournament.scheduledTime,
      scheduledEndDate: tournament.scheduledEndDate,
      registrationDeadline: tournament.registrationDeadline,
      formatLabel: tournament.formatLabel,
      sponsorHandles: tournament.sponsorHandles,
      rewardsDistributed: tournament.rewardsDistributed,
      winners: tournament.winners,
      createdBy: tournament.createdBy,
      createdAt: tournament.createdAt,
      updatedAt: tournament.updatedAt
    },
    roundsReport,
    registeredTeams: (tournament.registeredTeams || []).map(t => ({
      teamName: t.teamName,
      leaderUserId: t.leaderUserId,
      playerCount: 1 + (t.players || []).length,
      isEligible: (t.players || []).length >= TEAM_PLAYERS_MIN
    }))
  };
};

/**
 * Get details visible to a specific user (includes their slot/room info if in a running round)
 * @param {string} tournamentId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getSpecialTournamentDetailsForUser = async (tournamentId, userId) => {
  const tournament = await SpecialTournament.findById(tournamentId).lean();
  if (!tournament) throw new Error('Special tournament not found');

  const isParticipant = tournament.participants.some(p => p.toString() === userId.toString());

  // Find user's current slot across all running rounds
  let userSlotInfo = null;
  for (const round of (tournament.rounds || [])) {
    if (round.status !== 'running') continue;
    for (const slot of (round.slots || [])) {
      const inSlot = (slot.teams || []).some(t => t.leaderUserId.toString() === userId.toString());
      if (inSlot) {
        userSlotInfo = {
          roundNumber: round.roundNumber,
          roundName: round.roundName,
          slotIndex: slot.slotIndex,
          room: slot.room,
          teams: slot.teams,
          status: slot.status
        };
        break;
      }
    }
    if (userSlotInfo) break;
  }

  // Only expose match results and sensitive data for participants
  const safeRounds = (tournament.rounds || []).map(round => ({
    roundNumber: round.roundNumber,
    roundName: round.roundName,
    teamsPerSlot: round.teamsPerSlot,
    matchesPerSlot: round.matchesPerSlot,
    qualifyPerSlot: round.qualifyPerSlot,
    status: round.status,
    slotCount: (round.slots || []).length
  }));

  const eligibleCount = getEligibleTeams(tournament.registeredTeams || []).length;
  return {
    ...tournament,
    rounds: safeRounds,
    isParticipant,
    userSlotInfo,
    participantCount: tournament.participants.length,
    eligibleTeamCount: eligibleCount
  };
};

/**
 * Get live standings for a specific slot (for participants to watch)
 * @param {string} tournamentId
 * @param {number} roundNumber
 * @param {number} slotIndex
 * @returns {Promise<Object>}
 */
const getSlotLiveResults = async (tournamentId, roundNumber, slotIndex) => {
  const tournament = await SpecialTournament.findById(tournamentId)
    .select('title rounds status')
    .lean();
  if (!tournament) throw new Error('Special tournament not found');

  const round = tournament.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found`);

  const slot = round.slots.find(s => s.slotIndex === slotIndex);
  if (!slot) throw new Error(`Slot ${slotIndex} not found in round ${roundNumber}`);

  const standings = aggregateSlotStandings(slot.matchResults || []);
  const matchResults = formatSlotMatchResults(slot.matchResults || []);

  return {
    tournamentId,
    title: tournament.title,
    roundNumber,
    roundName: round.roundName,
    slotIndex,
    matchesPerSlot: round.matchesPerSlot,
    qualifyPerSlot: round.qualifyPerSlot,
    slotStatus: slot.status,
    teams: (slot.teams || []).map(t => ({ teamName: t.teamName })),
    matchResultsCount: (slot.matchResults || []).length,
    matchResults,
    standings
  };
};

module.exports = {
  createSpecialTournament,
  openRegistration,
  cancelSpecialTournament,
  updateTournamentConfig,
  sendSpecialTournamentNotification,
  joinSpecialTournament,
  startRound,
  assignSlotHost,
  updateSlotRoom,
  submitSlotMatchResult,
  submitSlotFinalResult,
  distributeRewards,
  getSpecialTournamentList,
  getSpecialTournamentDetails,
  getSpecialTournamentDetailsForUser,
  getSpecialTournamentAdminReport,
  getSlotLiveResults,
  aggregateSlotStandings,
  formatSlotMatchResults,
  getEligibleTeams,
  declareFinalRanking
};
