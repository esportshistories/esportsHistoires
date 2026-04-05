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
const { resolveAnyGameTitle, maxTeamsPerSlotForGame } = require('../constants/gameCatalog');
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

const parseOptionalDate = (v) => {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const normalizeSponsors = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 30).map((s) => ({
    name: s && s.name != null ? String(s.name).trim().slice(0, 100) : '',
    logoUrl: s && s.logoUrl != null && String(s.logoUrl).trim()
      ? String(s.logoUrl).trim().slice(0, 500) : null,
    link: s && s.link != null && String(s.link).trim()
      ? String(s.link).trim().slice(0, 500) : null
  })).filter(s => s.name || s.logoUrl || s.link);
};

const buildRankBreakdownFromPercents = (pool, prizeDistribution) => {
  const list = (prizeDistribution || []).map(p => ({
    position: p.position,
    amount: roundInr((pool * (p.percent || 0)) / 100)
  }));
  list.sort((a, b) => a.position - b.position);
  return list;
};

/**
 * Admin sends fixed amounts per rank; derives percent rows for the same positions.
 */
const buildPrizeRowsFromRankRewards = (rankRewards, prizePool) => {
  const sorted = [...rankRewards].map(r => ({
    position: parseInt(r.position, 10),
    amount: Number(r.amount)
  })).filter(r => !Number.isNaN(r.position) && r.position >= 1 && !Number.isNaN(r.amount) && r.amount >= 0)
    .sort((a, b) => a.position - b.position);

  if (sorted.length === 0) {
    throw new Error('rankRewards must contain at least one { position, amount }');
  }
  const seen = new Set();
  for (const r of sorted) {
    if (seen.has(r.position)) throw new Error(`Duplicate position in rankRewards: ${r.position}`);
    seen.add(r.position);
  }
  const sum = sorted.reduce((s, r) => s + r.amount, 0);
  if (Math.abs(sum - prizePool) > 0.02) {
    throw new Error(`rankRewards total (${sum}) must equal prizePool (${prizePool})`);
  }
  const breakdown = sorted.map(r => ({ position: r.position, amount: roundInr(r.amount) }));
  const prizeDistribution = sorted.map(r => ({
    position: r.position,
    percent: prizePool > 0 ? (r.amount / prizePool) * 100 : 0
  }));
  return { prizeDistribution, rankRewardBreakdown: breakdown };
};

const syncRankRewardBreakdown = (tournament) => {
  const pool = Number(tournament.prizePool);
  const dist = tournament.prizeDistribution || [];
  if (!dist.length) {
    tournament.rankRewardBreakdown = [];
    return;
  }
  tournament.rankRewardBreakdown = buildRankBreakdownFromPercents(pool, dist);
};

/**
 * Plan multi-round BR slots from max registration and game lobby cap (FF 12, BGMI 16).
 * Each non-final round: ceil(teams/L) lobbies × top Q qualify. Stops at a single final lobby.
 *
 * @param {{ maxSlots: number, lobbySize: number, qualifyPerSlot: number, matchesPerSlot: number }} opts
 * @returns {Array<{ roundNumber: number, roundName: string, teamsPerSlot: number, matchesPerSlot: number, qualifyPerSlot: number }>}
 */
const buildAutoRoundsFromBracket = ({ maxSlots, lobbySize, qualifyPerSlot, matchesPerSlot }) => {
  const L = lobbySize;
  const Q = qualifyPerSlot;
  const M = matchesPerSlot != null && matchesPerSlot >= 1 ? matchesPerSlot : 3;

  if (Q >= L) {
    throw new Error(`bracketAuto.qualifyPerSlot (${Q}) must be less than lobby size (${L}) for this game`);
  }
  if (maxSlots < 2) {
    throw new Error('maxSlots must be at least 2');
  }

  let T = maxSlots;
  const planned = [];
  let roundNumber = 1;
  const maxIterations = 64;

  while (roundNumber <= maxIterations) {
    const numSlots = Math.ceil(T / L);

    if (numSlots <= 1) {
      const qFinal = Math.min(Q, Math.max(1, T - 1));
      planned.push({
        roundNumber,
        roundName: `Round ${roundNumber} (Final)`,
        teamsPerSlot: L,
        matchesPerSlot: M,
        qualifyPerSlot: qFinal
      });
      break;
    }

    const nextT = numSlots * Q;
    if (nextT >= T) {
      throw new Error(
        `bracketAuto: bracket does not shrink (${T} teams, ${numSlots} lobbies × top ${Q} → ${nextT}). Lower qualifyPerSlot or change maxSlots.`
      );
    }

    planned.push({
      roundNumber,
      roundName: `Round ${roundNumber}`,
      teamsPerSlot: L,
      matchesPerSlot: M,
      qualifyPerSlot: Q
    });
    T = nextT;
    roundNumber += 1;
  }

  if (roundNumber > maxIterations) {
    throw new Error('bracketAuto: too many rounds; adjust maxSlots or qualifyPerSlot');
  }

  return planned;
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
 * @param {Array}  [data.rounds] - manual rounds (omit if using bracketAuto)
 * @param {Object} [data.bracketAuto] - { qualifyPerSlot, matchesPerSlot? } — builds rounds from maxSlots + game lobby size (12 FF / 16 BGMI); mode must be BR
 * @param {Date}   [data.scheduledDate]
 * @param {string} [data.scheduledTime]
 * @param {Date}   [data.scheduledEndDate]
 * @param {Date}   [data.registrationDeadline]
 * @param {string} [data.description]
 * @param {string} [data.formatLabel]
 * @param {Object} [data.sponsorHandles] - { instagram, discord, youtube, telegram, whatsapp }
 * @returns {Promise<Object>} Created tournament (status registration_open; join allowed when registrationStartDate has passed if set)
 */
const createSpecialTournament = async (creatorUserId, data) => {
  const {
    title, game, mode, subMode, region, lobbyName,
    prizePool, prizeDistribution, maxSlots, rounds, bracketAuto,
    scheduledDate, scheduledTime, scheduledEndDate, registrationDeadline, description,
    formatLabel, tournamentFormat, sponsorHandles,
    organizationId,
    rankRewards,
    prizeByRank,
    sponsors,
    logoUrl,
    youtubeStreamUrl,
    registrationPeriodStart,
    registrationPeriodEnd,
    registrationStartDate,
    tournamentStartDate,
    tournamentEndDate
  } = data;

  const rankRewardInput = rankRewards || prizeByRank;

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

  const poolNum = Number(prizePool);

  const useBracketAuto = bracketAuto != null && typeof bracketAuto === 'object'
    && bracketAuto.qualifyPerSlot != null && String(bracketAuto.qualifyPerSlot).trim() !== '';

  if (useBracketAuto && mode !== 'BR') {
    throw new Error('bracketAuto is only supported when mode is BR');
  }
  if (useBracketAuto && (game == null || !String(game).trim())) {
    throw new Error('game is required when using bracketAuto (Free Fire → 12 teams/lobby, BGMI → 16)');
  }

  let resolvedGame = 'Free Fire';
  if (game !== undefined && game !== null && String(game).trim() !== '') {
    const r = resolveAnyGameTitle(game);
    if (!r) throw new Error(`Unknown or unsupported game: ${game}`);
    resolvedGame = r;
  }

  const slotCap = maxTeamsPerSlotForGame(resolvedGame);

  let roundsEffective;
  let autoQualify = null;
  if (useBracketAuto) {
    if (rounds && Array.isArray(rounds) && rounds.length > 0) {
      throw new Error('Do not send rounds[] when using bracketAuto');
    }
    autoQualify = parseInt(bracketAuto.qualifyPerSlot, 10);
    const autoMatches = bracketAuto.matchesPerSlot != null
      ? parseInt(bracketAuto.matchesPerSlot, 10)
      : 3;
    if (Number.isNaN(autoQualify) || autoQualify < 1) {
      throw new Error('bracketAuto.qualifyPerSlot must be a positive integer');
    }
    if (Number.isNaN(autoMatches) || autoMatches < 1) {
      throw new Error('bracketAuto.matchesPerSlot must be at least 1');
    }
    roundsEffective = buildAutoRoundsFromBracket({
      maxSlots,
      lobbySize: slotCap,
      qualifyPerSlot: autoQualify,
      matchesPerSlot: autoMatches
    });
  } else {
    if (!rounds || !Array.isArray(rounds) || rounds.length === 0) {
      throw new Error('Provide rounds[] or bracketAuto { qualifyPerSlot, matchesPerSlot? }');
    }
    roundsEffective = rounds;
  }

  for (let i = 0; i < roundsEffective.length; i++) {
    const r = roundsEffective[i];
    if (!r.roundNumber || r.roundNumber < 1) throw new Error(`Round ${i + 1}: roundNumber must be >= 1`);
    const hasSlotSizes = Array.isArray(r.slotSizes) && r.slotSizes.length > 0;
    if (hasSlotSizes) {
      const sizes = r.slotSizes.map(x => parseInt(x, 10));
      for (let k = 0; k < sizes.length; k++) {
        const sz = sizes[k];
        if (Number.isNaN(sz) || sz < 2) {
          throw new Error(`Round ${i + 1}: slotSizes[${k}] must be an integer >= 2`);
        }
        if (sz > slotCap) {
          throw new Error(
            `Round ${i + 1}: slotSizes[${k}] (${sz}) exceeds lobby cap ${slotCap} for ${resolvedGame}`
          );
        }
      }
      const minSz = Math.min(...sizes);
      if (!r.qualifyPerSlot || r.qualifyPerSlot < 1) {
        throw new Error(`Round ${i + 1}: qualifyPerSlot must be >= 1`);
      }
      if (r.qualifyPerSlot >= minSz) {
        throw new Error(
          `Round ${i + 1}: qualifyPerSlot (${r.qualifyPerSlot}) must be < smallest slot size (${minSz})`
        );
      }
      if (Array.isArray(r.inviteSlotCaps) && r.inviteSlotCaps.length > 0) {
        if (r.inviteSlotCaps.length !== sizes.length) {
          throw new Error(`Round ${i + 1}: inviteSlotCaps length must match slotSizes length`);
        }
        for (let j = 0; j < sizes.length; j++) {
          const inv = Math.max(0, parseInt(r.inviteSlotCaps[j], 10) || 0);
          if (sizes[j] + inv > slotCap) {
            throw new Error(
              `Round ${i + 1}: slot ${j + 1} qualified (${sizes[j]}) + invites (${inv}) exceeds lobby cap ${slotCap} for ${resolvedGame}`
            );
          }
        }
      }
    } else {
      if (!r.teamsPerSlot || r.teamsPerSlot < 2) throw new Error(`Round ${i + 1}: teamsPerSlot must be >= 2`);
      if (r.teamsPerSlot > slotCap) {
        throw new Error(
          `Round ${i + 1}: teamsPerSlot (${r.teamsPerSlot}) exceeds max ${slotCap} for ${resolvedGame} (BGMI: 16 per match, Free Fire: 12)`
        );
      }
      if (!r.qualifyPerSlot || r.qualifyPerSlot < 1) throw new Error(`Round ${i + 1}: qualifyPerSlot must be >= 1`);
      if (r.qualifyPerSlot >= r.teamsPerSlot) {
        throw new Error(`Round ${i + 1}: qualifyPerSlot (${r.qualifyPerSlot}) must be less than teamsPerSlot (${r.teamsPerSlot})`);
      }
      const invU = r.inviteSlotsPerSlot != null ? parseInt(r.inviteSlotsPerSlot, 10) : 0;
      if (!Number.isNaN(invU) && invU > 0 && r.teamsPerSlot + invU > slotCap) {
        throw new Error(
          `Round ${i + 1}: teamsPerSlot + inviteSlotsPerSlot exceeds lobby cap ${slotCap} for ${resolvedGame}`
        );
      }
    }
    if (!r.matchesPerSlot || r.matchesPerSlot < 1) throw new Error(`Round ${i + 1}: matchesPerSlot must be >= 1`);
  }

  let finalPrizeDistribution;
  let rankRewardBreakdown;
  if (rankRewardInput && rankRewardInput.length > 0) {
    const built = buildPrizeRowsFromRankRewards(rankRewardInput, poolNum);
    finalPrizeDistribution = built.prizeDistribution;
    rankRewardBreakdown = built.rankRewardBreakdown;
  } else if (prizeDistribution && prizeDistribution.length > 0) {
    const totalPercent = prizeDistribution.reduce((sum, p) => sum + (p.percent || 0), 0);
    if (totalPercent > 100) {
      throw new Error(`prizeDistribution total percent (${totalPercent}%) exceeds 100%`);
    }
    finalPrizeDistribution = prizeDistribution;
    rankRewardBreakdown = buildRankBreakdownFromPercents(poolNum, prizeDistribution);
  } else {
    throw new Error('Provide prizeDistribution (percent per rank) or rankRewards (amount per rank; must sum to prizePool)');
  }

  const roundDocs = roundsEffective.map((r) => {
    const hasSlotSizes = Array.isArray(r.slotSizes) && r.slotSizes.length > 0;
    const slotSizes = hasSlotSizes ? r.slotSizes.map(x => parseInt(x, 10)) : [];
    const inviteSlotCaps = Array.isArray(r.inviteSlotCaps) && r.inviteSlotCaps.length
      ? r.inviteSlotCaps.map(x => Math.max(0, parseInt(x, 10) || 0))
      : [];
    const tps = hasSlotSizes ? Math.max(...slotSizes) : r.teamsPerSlot;
    return {
      roundNumber: r.roundNumber,
      roundName: r.roundName || `Round ${r.roundNumber}`,
      teamsPerSlot: tps,
      matchesPerSlot: r.matchesPerSlot,
      qualifyPerSlot: r.qualifyPerSlot,
      slotSizes: hasSlotSizes ? slotSizes : [],
      inviteSlotCaps: hasSlotSizes && inviteSlotCaps.length ? inviteSlotCaps : [],
      inviteSlotsPerSlot: hasSlotSizes ? 0 : Math.max(0, parseInt(r.inviteSlotsPerSlot, 10) || 0),
      status: 'pending',
      slots: []
    };
  });

  roundDocs.sort((a, b) => a.roundNumber - b.roundNumber);

  let finalFormatLabel = formatLabel && String(formatLabel).trim() ? String(formatLabel).trim().slice(0, 200) : null;
  let finalTournamentFormat = tournamentFormat && String(tournamentFormat).trim()
    ? String(tournamentFormat).trim().slice(0, 120) : null;
  if (useBracketAuto && autoQualify != null) {
    if (!finalFormatLabel) {
      finalFormatLabel =
        `${slotCap} per lobby · top ${autoQualify} qualify · ${roundDocs.length} rounds (auto)`.slice(0, 200);
    }
    if (!finalTournamentFormat) {
      finalTournamentFormat = `BR auto · ${resolvedGame} · ${slotCap}-team lobbies`.slice(0, 120);
    }
  }

  if (organizationId) {
    await orgWalletService.lockOrgFundsForTournament(organizationId, poolNum);
  }

  const regStart = parseOptionalDate(registrationPeriodStart ?? registrationStartDate);
  const regEnd = parseOptionalDate(registrationPeriodEnd ?? registrationDeadline);
  const tStart = parseOptionalDate(tournamentStartDate ?? scheduledDate);
  const tEnd = parseOptionalDate(tournamentEndDate ?? scheduledEndDate);

  const resolvedRegion = (region === 'Asia' || region === 'Global') ? region : 'Global';

  const tournament = await SpecialTournament.create({
    tournamentType: 'sponsored',
    title,
    game: resolvedGame,
    mode,
    subMode,
    region: resolvedRegion,
    lobbyName: lobbyName || title,
    prizePool: poolNum,
    prizeDistribution: finalPrizeDistribution,
    rankRewardBreakdown,
    maxSlots,
    status: 'registration_open',
    createdBy: creatorUserId,
    organizationId: organizationId || null,
    rounds: roundDocs,
    scheduledDate: tStart,
    scheduledTime: scheduledTime != null && String(scheduledTime).trim() ? String(scheduledTime).trim().slice(0, 32) : null,
    scheduledEndDate: tEnd,
    registrationStartDate: regStart,
    registrationDeadline: regEnd,
    description: description || null,
    formatLabel: finalFormatLabel,
    tournamentFormat: finalTournamentFormat,
    logoUrl: logoUrl && String(logoUrl).trim() ? String(logoUrl).trim().slice(0, 500) : null,
    youtubeStreamUrl: youtubeStreamUrl && String(youtubeStreamUrl).trim()
      ? String(youtubeStreamUrl).trim().slice(0, 500) : null,
    sponsors: normalizeSponsors(sponsors),
    sponsorHandles: normalizeSponsorHandles(sponsorHandles)
  });

  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:status-updated',
    {
      status: 'registration_open',
      title: tournament.title,
      prizePool: tournament.prizePool,
      maxSlots: tournament.maxSlots
    }
  );

  try {
    await tryAutoAdvanceSpecialTournament(tournament._id.toString());
  } catch (advErr) {
    Logger.warn('SpecialTournament tryAutoAdvance after create', {
      tournamentId: tournament._id.toString(),
      err: advErr.message
    });
  }

  return SpecialTournament.findById(tournament._id);
};

// ---------------------------------------------------------------------------
// Admin: Open / Cancel registration
// ---------------------------------------------------------------------------

/**
 * Legacy: draft → registration_open. New tournaments are created already open; this is only for old draft rows or manual fixes.
 * Idempotent if already registration_open.
 * @param {string} adminId
 * @param {string} tournamentId
 * @returns {Promise<Object>}
 */
const openRegistration = async (adminId, tournamentId) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (tournament.status === 'registration_open') {
    return tournament;
  }
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

  try {
    await tryAutoAdvanceSpecialTournament(tournament._id.toString());
  } catch (advErr) {
    Logger.warn('SpecialTournament tryAutoAdvance after openRegistration', {
      tournamentId: tournament._id.toString(),
      err: advErr.message
    });
  }

  return SpecialTournament.findById(tournamentId);
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
    'scheduledDate', 'scheduledTime', 'scheduledEndDate', 'registrationDeadline', 'registrationStartDate',
    'formatLabel', 'tournamentFormat', 'sponsorHandles', 'sponsors', 'logoUrl', 'youtubeStreamUrl', 'region', 'rounds'];

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
        const cap = maxTeamsPerSlotForGame(tournament.game);
        if (ru.slotSizes != null) {
          if (!Array.isArray(ru.slotSizes) || ru.slotSizes.length === 0) {
            round.slotSizes = [];
            round.inviteSlotCaps = [];
          } else {
            const sizes = ru.slotSizes.map(x => parseInt(x, 10));
            for (let j = 0; j < sizes.length; j++) {
              const sz = sizes[j];
              if (isNaN(sz) || sz < 2) throw new Error(`Round ${rn}: slotSizes[${j}] invalid`);
              if (sz > cap) throw new Error(`Round ${rn}: slotSizes[${j}] exceeds lobby cap ${cap}`);
            }
            round.slotSizes = sizes;
            round.teamsPerSlot = Math.max(...sizes);
            if (ru.inviteSlotCaps != null) {
              if (!Array.isArray(ru.inviteSlotCaps) || ru.inviteSlotCaps.length !== sizes.length) {
                throw new Error(`Round ${rn}: inviteSlotCaps length must match slotSizes`);
              }
              const capsArr = ru.inviteSlotCaps.map(x => Math.max(0, parseInt(x, 10) || 0));
              for (let j = 0; j < sizes.length; j++) {
                if (sizes[j] + capsArr[j] > cap) {
                  throw new Error(`Round ${rn}: slot ${j + 1} qualified + invites exceeds lobby cap ${cap}`);
                }
              }
              round.inviteSlotCaps = capsArr;
            }
          }
        }
        if (ru.inviteSlotsPerSlot != null && (!round.slotSizes || round.slotSizes.length === 0)) {
          const inv = Math.max(0, parseInt(ru.inviteSlotsPerSlot, 10) || 0);
          const tps = round.teamsPerSlot || 2;
          if (tps + inv > cap) {
            throw new Error(`Round ${rn}: teamsPerSlot + inviteSlotsPerSlot exceeds lobby cap ${cap}`);
          }
          round.inviteSlotsPerSlot = inv;
        }
        if (ru.teamsPerSlot != null && (!round.slotSizes || round.slotSizes.length === 0)) {
          const v = parseInt(ru.teamsPerSlot, 10);
          if (isNaN(v) || v < 2) throw new Error(`Round ${rn}: teamsPerSlot must be >= 2`);
          if (v > cap) throw new Error(`Round ${rn}: teamsPerSlot max is ${cap} for ${tournament.game}`);
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
          const minSz = (round.slotSizes && round.slotSizes.length)
            ? Math.min(...round.slotSizes.map(x => Number(x)))
            : (round.teamsPerSlot || 2);
          if (v >= minSz) throw new Error(`Round ${rn}: qualifyPerSlot must be less than smallest slot / teamsPerSlot (${minSz})`);
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
      syncRankRewardBreakdown(tournament);
      changed = true;
    } else if (key === 'prizeDistribution') {
      if (!Array.isArray(updates.prizeDistribution)) throw new Error('prizeDistribution must be an array');
      const totalPercent = updates.prizeDistribution.reduce((s, p) => s + (p.percent || 0), 0);
      if (totalPercent > 100) throw new Error(`prizeDistribution total percent (${totalPercent}%) exceeds 100%`);
      tournament.prizeDistribution = updates.prizeDistribution;
      syncRankRewardBreakdown(tournament);
      changed = true;
    } else if (key === 'sponsorHandles') {
      tournament.sponsorHandles = normalizeSponsorHandles(updates.sponsorHandles);
      changed = true;
    } else if (key === 'sponsors') {
      tournament.sponsors = normalizeSponsors(updates.sponsors);
      changed = true;
    } else if (key === 'formatLabel') {
      tournament.formatLabel = updates.formatLabel != null && String(updates.formatLabel).trim()
        ? String(updates.formatLabel).trim().slice(0, 200) : null;
      changed = true;
    } else if (key === 'tournamentFormat') {
      tournament.tournamentFormat = updates.tournamentFormat != null && String(updates.tournamentFormat).trim()
        ? String(updates.tournamentFormat).trim().slice(0, 120) : null;
      changed = true;
    } else if (key === 'logoUrl') {
      tournament.logoUrl = updates.logoUrl != null && String(updates.logoUrl).trim()
        ? String(updates.logoUrl).trim().slice(0, 500) : null;
      changed = true;
    } else if (key === 'youtubeStreamUrl') {
      tournament.youtubeStreamUrl = updates.youtubeStreamUrl != null && String(updates.youtubeStreamUrl).trim()
        ? String(updates.youtubeStreamUrl).trim().slice(0, 500) : null;
      changed = true;
    } else if (key === 'registrationStartDate') {
      tournament.registrationStartDate = parseOptionalDate(updates.registrationStartDate);
      changed = true;
    } else if (key === 'region') {
      if (updates.region !== 'Asia' && updates.region !== 'Global') {
        throw new Error('region must be Asia or Global');
      }
      tournament.region = updates.region;
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

/** Min teammate names in `players` array for round-1 eligibility: leader + 3 = 4 total. Join may send 0–4; fill via PATCH /team before round 1. */
const TEAM_PLAYERS_MIN = 3;
const TEAM_PLAYERS_MAX = 4;

/** True when registration is open to join (no start date or start time has passed). */
const registrationPublicWindowStarted = (tournament, now = new Date()) => {
  const st = tournament.registrationStartDate;
  if (st == null) return true;
  const d = new Date(st);
  return !Number.isNaN(d.getTime()) && d <= now;
};

/**
 * Whether a normal user should see this tournament in browse/list (not admin).
 * Draft hidden; registration_open hidden until registrationPublicWindowStarted.
 */
const isSpecialTournamentDiscoverableByUsers = (tournament, now = new Date()) => {
  const s = tournament.status;
  if (s === 'draft') return false;
  if (s === 'registration_open') return registrationPublicWindowStarted(tournament, now);
  return ['running', 'completed', 'cancelled'].includes(s);
};

/**
 * Non-admin: hide draft; hide registration_open before registrationStartDate unless user is already a participant.
 */
const assertSpecialTournamentVisibleToViewer = (tournament, { userId, isAdmin }) => {
  if (isAdmin) return;
  if (tournament.status === 'draft') {
    throw new Error('Special tournament not found');
  }
  if (tournament.status === 'registration_open' && !registrationPublicWindowStarted(tournament)) {
    const isParticipant = (tournament.participants || []).some(
      (p) => p.toString() === String(userId)
    );
    if (!isParticipant) throw new Error('Special tournament not found');
  }
};

/**
 * Public bracket summary: total rounds + phase label (semifinal / final) per round for UI.
 */
const buildBracketOutline = (rounds) => {
  const sorted = [...(rounds || [])].sort((a, b) => a.roundNumber - b.roundNumber);
  const n = sorted.length;
  return {
    totalRounds: n,
    rounds: sorted.map((r, index) => {
      const isLast = index === n - 1;
      const isSecondToLast = n >= 2 && index === n - 2;
      const phase = isLast ? 'final' : isSecondToLast ? 'semifinal' : 'bracket';
      const phaseLabel = isLast
        ? 'Final'
        : isSecondToLast
          ? 'Semifinal'
          : `Round ${index + 1}`;
      return {
        roundNumber: r.roundNumber,
        roundName: r.roundName,
        status: r.status,
        phase,
        phaseLabel
      };
    })
  };
};


/** Returns only teams with at least 4 members (leader + 3 in players). Incomplete teams do not appear in list/round 1. */
const getEligibleTeams = (registeredTeams) => {
  return (registeredTeams || []).filter(t => (t.players || []).length >= TEAM_PLAYERS_MIN);
};

/**
 * Join a special tournament (free — no wallet deduction).
 * Leader may register with 0–4 teammate names; round 1 slots use only teams with ≥3 names (4+ total with leader).
 * @param {string} userId
 * @param {string} tournamentId
 * @param {string} teamName
 * @param {Array}  [players] - Teammate name strings (0–4); use updateSpecialTournamentTeamRoster to complete before round 1.
 * @returns {Promise<Object>} Updated tournament
 */
const joinSpecialTournament = async (userId, tournamentId, teamName, players = []) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (tournament.status === 'draft') {
    throw new Error('Special tournament not found');
  }
  if (tournament.status !== 'registration_open') {
    throw new Error('This tournament is not accepting registrations right now.');
  }
  const now = new Date();
  if (tournament.registrationStartDate && now < new Date(tournament.registrationStartDate)) {
    throw new Error('Registration has not started yet.');
  }
  if (tournament.registrationDeadline && now > new Date(tournament.registrationDeadline)) {
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
  if (playerList.length > TEAM_PLAYERS_MAX) {
    throw new Error(
      `At most ${TEAM_PLAYERS_MAX} teammate names (${TEAM_PLAYERS_MAX + 1} players including you).`
    );
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

  try {
    await tryAutoAdvanceSpecialTournament(tournamentId);
  } catch (advErr) {
    Logger.warn('SpecialTournament tryAutoAdvance after join', { tournamentId, err: advErr.message });
  }

  return SpecialTournament.findById(tournamentId);
};

/**
 * Leader updates teammate names while registration is open (0–4 names; need ≥3 for round-1 eligibility).
 */
const updateSpecialTournamentTeamRoster = async (userId, tournamentId, players = []) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (tournament.status === 'draft') {
    throw new Error('Special tournament not found');
  }
  if (tournament.status !== 'registration_open') {
    throw new Error('You cannot update your roster for this tournament right now.');
  }
  const now = new Date();
  if (tournament.registrationStartDate && now < new Date(tournament.registrationStartDate)) {
    throw new Error('Registration has not started yet.');
  }
  if (tournament.registrationDeadline && now > new Date(tournament.registrationDeadline)) {
    throw new Error('Registration deadline has passed. You cannot change your roster.');
  }

  const uid = userId.toString();
  const team = tournament.registeredTeams.find((t) => t.leaderUserId.toString() === uid);
  if (!team) {
    throw new Error('You are not registered as a team leader in this tournament');
  }

  const playerList = (players || []).map((n) => ({ name: String(n).trim() })).filter((p) => p.name);
  if (playerList.length > TEAM_PLAYERS_MAX) {
    throw new Error(
      `At most ${TEAM_PLAYERS_MAX} teammate names (${TEAM_PLAYERS_MAX + 1} players including you).`
    );
  }

  team.players = playerList;
  tournament.markModified('registeredTeams');
  await tournament.save();

  return SpecialTournament.findById(tournamentId);
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
      throw new Error(
        'No eligible teams (each team needs the leader plus at least 3 teammate names). Incomplete rosters cannot enter round 1.'
      );
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

  const lobbyCap = maxTeamsPerSlotForGame(tournament.game);
  const { teamsPerSlot } = round;
  const sizesFromRound = round.slotSizes && round.slotSizes.length > 0
    ? round.slotSizes.map(s => parseInt(s, 10))
    : null;

  // Shuffle teams for fair distribution
  const shuffled = [...teamsForRound].sort(() => Math.random() - 0.5);

  const slots = [];

  if (sizesFromRound && sizesFromRound.length > 0) {
    const sum = sizesFromRound.reduce((a, b) => a + b, 0);
    if (sum !== shuffled.length) {
      throw new Error(
        `Round ${roundNumber}: slotSizes sum (${sum}) must equal team count for this round (${shuffled.length}). ` +
          'Edit round slotSizes via PATCH config or wait until qualifiers match the plan.'
      );
    }
    let offset = 0;
    for (let si = 0; si < sizesFromRound.length; si++) {
      const sz = sizesFromRound[si];
      const chunk = shuffled.slice(offset, offset + sz);
      offset += sz;
      let inviteCap = 0;
      if (round.inviteSlotCaps && round.inviteSlotCaps.length === sizesFromRound.length) {
        inviteCap = Math.max(0, parseInt(round.inviteSlotCaps[si], 10) || 0);
      }
      slots.push({
        slotIndex: slots.length,
        teams: chunk.map(t => ({
          leaderUserId: t.leaderUserId,
          teamName: t.teamName,
          players: t.players || [],
          isInvite: false
        })),
        matchResults: [],
        qualifiedTeams: [],
        status: 'pending',
        room: { roomId: null, password: null },
        hostId: null,
        maxInvites: inviteCap
      });
    }
  } else {
    const uniformInviteCap = Math.max(0, parseInt(round.inviteSlotsPerSlot, 10) || 0);
    for (let i = 0; i < shuffled.length; i += teamsPerSlot) {
      const chunk = shuffled.slice(i, i + teamsPerSlot);
      slots.push({
        slotIndex: slots.length,
        teams: chunk.map(t => ({
          leaderUserId: t.leaderUserId,
          teamName: t.teamName,
          players: t.players || [],
          isInvite: false
        })),
        matchResults: [],
        qualifiedTeams: [],
        status: 'pending',
        room: { roomId: null, password: null },
        hostId: null,
        maxInvites: uniformInviteCap
      });
    }
  }

  for (const s of slots) {
    if (s.teams.length > lobbyCap) {
      throw new Error(`Round ${roundNumber} slot ${s.slotIndex}: ${s.teams.length} teams exceeds lobby cap ${lobbyCap}`);
    }
    if (s.teams.length + s.maxInvites > lobbyCap) {
      throw new Error(
        `Round ${roundNumber} slot ${s.slotIndex}: qualified (${s.teams.length}) + max invites (${s.maxInvites}) exceeds lobby cap ${lobbyCap}`
      );
    }
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

/**
 * Auto-advance without requiring POST /round/:n/start:
 * - registration_open + registrationDeadline passed → start first pending round (publish Round 1 groups).
 * - running + previous round completed → start next pending round.
 * Function declaration so join/list/detail can call it before this line in the file.
 */
async function tryAutoAdvanceSpecialTournament(tournamentId) {
  let tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) return null;
  if (['draft', 'cancelled'].includes(tournament.status)) return tournament;

  if (tournament.status === 'registration_open' && tournament.registrationDeadline) {
    const deadline = new Date(tournament.registrationDeadline);
    if (!Number.isNaN(deadline.getTime()) && new Date() >= deadline) {
      const sorted = [...tournament.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
      const first = sorted[0];
      if (first && first.status === 'pending') {
        try {
          await startRound(null, tournamentId, first.roundNumber);
        } catch (err) {
          Logger.warn('SpecialTournament tryAutoAdvance: first round start failed', {
            tournamentId,
            err: err.message
          });
        }
        tournament = await SpecialTournament.findById(tournamentId);
      }
    }
  }

  if (tournament && tournament.status === 'running') {
    const sorted = [...tournament.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].status === 'completed' && sorted[i + 1].status === 'pending') {
        try {
          await startRound(null, tournamentId, sorted[i + 1].roundNumber);
        } catch (err) {
          Logger.warn('SpecialTournament tryAutoAdvance: next round start failed', {
            tournamentId,
            nextRound: sorted[i + 1].roundNumber,
            err: err.message
          });
        }
        break;
      }
    }
  }

  return SpecialTournament.findById(tournamentId);
}

/**
 * Admin adds a wildcard/invite team to a running round slot (before any match result is posted for that slot).
 * Leader must not already be in the tournament; 0–4 names in players (same as join).
 */
const addInviteTeamToSlot = async (adminId, tournamentId, roundNumber, slotIndex, { leaderUserId, teamName, players = [] }) => {
  const tournament = await SpecialTournament.findById(tournamentId);
  if (!tournament) throw new Error('Special tournament not found');
  if (['cancelled', 'completed'].includes(tournament.status)) {
    throw new Error(`Cannot add invite. Tournament status: ${tournament.status}`);
  }

  const round = tournament.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found`);
  if (round.status !== 'running') {
    throw new Error(`Round ${roundNumber} is not running (status: ${round.status}). Start the round first.`);
  }

  const slot = round.slots.find(s => s.slotIndex === slotIndex);
  if (!slot) throw new Error(`Slot ${slotIndex} not found in round ${roundNumber}`);

  if ((slot.matchResults || []).length > 0) {
    throw new Error('Cannot add invites after match results have been submitted for this slot');
  }

  const lobbyCap = maxTeamsPerSlotForGame(tournament.game);
  const inviteUsed = (slot.teams || []).filter(t => t.isInvite === true).length;
  const maxInv = slot.maxInvites != null ? slot.maxInvites : 0;
  if (maxInv <= 0) {
    throw new Error(
      'This slot does not accept invite teams. Configure inviteSlotCaps (with slotSizes) or inviteSlotsPerSlot on the round.'
    );
  }
  if (inviteUsed >= maxInv) {
    throw new Error(`Invite cap reached for this slot (${maxInv})`);
  }
  if (slot.teams.length >= lobbyCap) {
    throw new Error(`Slot is full (${lobbyCap} max for ${tournament.game})`);
  }

  if (!teamName || typeof teamName !== 'string' || !teamName.trim()) {
    throw new Error('teamName is required');
  }

  if (!mongoose.Types.ObjectId.isValid(leaderUserId)) {
    throw new Error('Invalid leaderUserId');
  }
  const leaderOid = new mongoose.Types.ObjectId(leaderUserId);

  if (tournament.isParticipant(leaderOid)) {
    throw new Error('This user is already registered in the tournament');
  }

  const nameTaken = tournament.registeredTeams.some(
    t => t.teamName.trim().toLowerCase() === teamName.trim().toLowerCase()
  );
  if (nameTaken) throw new Error(`Team name "${teamName}" is already taken`);

  const playerList = (players || []).map(n => ({ name: String(n).trim() })).filter(p => p.name);
  if (playerList.length > TEAM_PLAYERS_MAX) {
    throw new Error(
      `Invite team: at most ${TEAM_PLAYERS_MAX} teammate names (${TEAM_PLAYERS_MAX + 1} including leader).`
    );
  }

  slot.teams.push({
    leaderUserId: leaderOid,
    teamName: teamName.trim(),
    players: playerList,
    isInvite: true
  });

  tournament.participants.push(leaderOid);
  tournament.registeredTeams.push({
    leaderUserId: leaderOid,
    teamName: teamName.trim(),
    players: playerList,
    isInvite: true
  });

  await tournament.save();

  broadcastSpecialTournamentEvent(
    tournament._id.toString(),
    'special-tournament:config-updated',
    {
      type: 'invite-added',
      roundNumber,
      slotIndex,
      teamName: teamName.trim(),
      leaderUserId: leaderOid.toString()
    },
    { participantIds: tournament.participants }
  );

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

  try {
    await tryAutoAdvanceSpecialTournament(tournamentId);
  } catch (advErr) {
    Logger.warn('SpecialTournament tryAutoAdvance after slot final result', {
      tournamentId,
      err: advErr.message
    });
  }

  const tournamentAfterAdvance = await SpecialTournament.findById(tournamentId);

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
    tournament: tournamentAfterAdvance || tournament,
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

  const breakdownByPos = {};
  (tournament.rankRewardBreakdown || []).forEach((row) => {
    breakdownByPos[row.position] = row.amount;
  });

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

    const rewardINR = breakdownByPos[dist.position] != null
      ? roundInr(breakdownByPos[dist.position])
      : roundInr((prizePool * dist.percent) / 100);
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
const getSpecialTournamentList = async (filters = {}, limit = 20, skip = 0, options = {}) => {
  const forAdmin = Boolean(options.forAdmin);
  const now = new Date();

  const query = {};
  if (filters.mode) query.mode = filters.mode;
  if (filters.subMode) query.subMode = filters.subMode;

  if (forAdmin) {
    if (filters.status) query.status = filters.status;
  } else if (filters.status === 'draft') {
    query._id = { $in: [] };
  } else if (filters.status === 'registration_open') {
    query.status = 'registration_open';
    query.$and = [
      {
        $or: [
          { registrationStartDate: null },
          { registrationStartDate: { $exists: false } },
          { registrationStartDate: { $lte: now } }
        ]
      }
    ];
  } else if (filters.status) {
    query.status = filters.status;
  } else {
    query.$or = [
      { status: 'running' },
      { status: 'completed' },
      { status: 'cancelled' },
      {
        status: 'registration_open',
        $or: [
          { registrationStartDate: null },
          { registrationStartDate: { $exists: false } },
          { registrationStartDate: { $lte: now } }
        ]
      }
    ];
  }

  let [tournaments, total] = await Promise.all([
    SpecialTournament.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .select('-rounds.slots.matchResults -registeredTeams')
      .lean(),
    SpecialTournament.countDocuments(query)
  ]);

  await Promise.all((tournaments || []).map(t => tryAutoAdvanceSpecialTournament(t._id.toString())));
  [tournaments, total] = await Promise.all([
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
  await tryAutoAdvanceSpecialTournament(tournamentId);
  const tournament = await SpecialTournament.findById(tournamentId)
    .populate('createdBy', 'name email')
    .populate('participants', 'name ign')
    .lean();

  if (!tournament) throw new Error('Special tournament not found');
  return {
    ...tournament,
    bracketOutline: buildBracketOutline(tournament.rounds)
  };
};

/**
 * Admin: dynamic lobby cap + per-round invite headroom (no hardcoded game advice).
 * Marks second-to-last round as typical semifinal stage for UI copy.
 * @param {string} tournamentId
 * @returns {Promise<Object>}
 */
const getSpecialTournamentCapacityHints = async (tournamentId) => {
  await tryAutoAdvanceSpecialTournament(tournamentId);
  const tournament = await SpecialTournament.findById(tournamentId).lean();
  if (!tournament) throw new Error('Special tournament not found');

  const lobbyCap = maxTeamsPerSlotForGame(tournament.game);
  const sorted = [...(tournament.rounds || [])].sort((a, b) => a.roundNumber - b.roundNumber);
  const total = sorted.length;

  const rounds = sorted.map((r, index) => {
    const isLast = index === total - 1;
    const isSecondToLast = total >= 2 && index === total - 2;
    const phaseHint = isLast
      ? { kind: 'final_round', label: 'Last configured round (typically final)' }
      : isSecondToLast
        ? {
            kind: 'semi_final_stage',
            label: 'Second-to-last round — commonly semifinals; invite wildcards use headroom below'
          }
        : { kind: 'bracket_round', label: `Round ${index + 1} of ${total}` };

    const slotSizes = r.slotSizes && r.slotSizes.length > 0 ? r.slotSizes.map(x => Number(x)) : null;
    const slotHints = [];

    if (slotSizes) {
      slotSizes.forEach((qualifiedCount, si) => {
        const maxInvitesAllowed = Math.max(0, lobbyCap - qualifiedCount);
        const configured = (r.inviteSlotCaps && r.inviteSlotCaps[si] != null)
          ? Math.max(0, Number(r.inviteSlotCaps[si]) || 0)
          : 0;
        slotHints.push({
          slotIndex: si,
          qualifiedTeamsInPlan: qualifiedCount,
          lobbyCapForGame: lobbyCap,
          maxInvitesAllowed,
          inviteCapConfigured: configured,
          configOk: configured <= maxInvitesAllowed,
          adminMessage: configured > maxInvitesAllowed
            ? `inviteSlotCaps[${si}] is ${configured} but only ${maxInvitesAllowed} invite(s) fit (lobby cap ${lobbyCap} − ${qualifiedCount} qualified in this bucket). Lower invites or lower qualified count in this slot.`
            : maxInvitesAllowed > 0
              ? `After this round starts, up to ${maxInvitesAllowed} invite team(s) can be added here (you configured cap ${configured}).`
              : 'No invite headroom: qualified teams already fill this game’s lobby cap for this bucket.'
        });
      });
    } else {
      const tps = Number(r.teamsPerSlot) || 0;
      const maxInv = Math.max(0, lobbyCap - tps);
      const configured = Math.max(0, Number(r.inviteSlotsPerSlot) || 0);
      slotHints.push({
        layout: 'uniform_chunks',
        teamsPerSlot: tps,
        lobbyCapForGame: lobbyCap,
        maxInvitesPerFullSlot: maxInv,
        inviteSlotsPerSlotConfigured: configured,
        configOk: configured <= maxInv,
        adminMessage: configured > maxInv
          ? `inviteSlotsPerSlot (${configured}) is above allowed ${maxInv} for full groups (cap ${lobbyCap} − teamsPerSlot ${tps}).`
          : maxInv > 0
            ? `Uniform groups: up to ${maxInv} invite(s) per full slot possible; configured ${configured}. The last group may be smaller — check live counts after start.`
            : 'No invite headroom for standard full slots at current teamsPerSlot.'
      });
    }

    let liveSlots = null;
    if (r.status === 'running' && r.slots && r.slots.length > 0) {
      liveSlots = r.slots.map(s => {
        const teams = s.teams || [];
        const n = teams.length;
        const invUsed = teams.filter(t => t.isInvite === true).length;
        const maxI = s.maxInvites != null ? s.maxInvites : 0;
        const matchStarted = (s.matchResults || []).length > 0;
        const addableNow = Math.max(0, Math.min(maxI - invUsed, lobbyCap - n));
        return {
          slotIndex: s.slotIndex,
          currentTeamCount: n,
          lobbyCapForGame: lobbyCap,
          invitesUsed: invUsed,
          inviteCap: maxI,
          invitesRemaining: Math.max(0, maxI - invUsed),
          seatsFreeBeforeCap: Math.max(0, lobbyCap - n),
          canAddInviteNow: !matchStarted && addableNow > 0,
          addableInviteCount: addableNow,
          adminMessage: matchStarted
            ? 'Match results started — invites locked for this slot.'
            : (addableNow > 0
              ? `You can add ${addableNow} invite team(s) here now (under invite cap and lobby cap).`
              : 'No invite slots left or lobby is full for this group.')
        };
      });
    }

    return {
      roundNumber: r.roundNumber,
      roundName: r.roundName,
      status: r.status,
      matchesPerSlot: r.matchesPerSlot,
      qualifyPerSlot: r.qualifyPerSlot,
      phaseHint,
      slots: slotHints,
      liveSlots
    };
  });

  return {
    tournamentId: tournament._id.toString(),
    title: tournament.title,
    game: tournament.game,
    lobbyCapForGame: lobbyCap,
    totalRounds: total,
    summaryForAdmin: `This tournament uses game "${tournament.game}" → in-match lobby cap ${lobbyCap} teams per group. Invite counts are computed from that cap minus qualified teams per slot.`,
    rounds
  };
};

/**
 * Admin-only: Full results report for dashboard — every round, every slot (lobby),
 * match results, standings, and qualified teams. So admin can see "har lobby ka result".
 * @param {string} tournamentId
 * @returns {Promise<Object>}
 */
const getSpecialTournamentAdminReport = async (tournamentId) => {
  await tryAutoAdvanceSpecialTournament(tournamentId);
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
  await tryAutoAdvanceSpecialTournament(tournamentId);
  const tournament = await SpecialTournament.findById(tournamentId).lean();
  if (!tournament) throw new Error('Special tournament not found');

  assertSpecialTournamentVisibleToViewer(tournament, { userId, isAdmin: false });

  const bracketOutline = buildBracketOutline(tournament.rounds);

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

  let myTeam = null;
  if (isParticipant) {
    const rt = (tournament.registeredTeams || []).find(
      (t) => t.leaderUserId.toString() === userId.toString()
    );
    if (rt) {
      const tc = (rt.players || []).length;
      myTeam = {
        teamName: rt.teamName,
        players: (rt.players || []).map((p) => p.name),
        teammateNamesCount: tc,
        isEligibleForRound1: tc >= TEAM_PLAYERS_MIN,
        teammatesNeededForRound1: Math.max(0, TEAM_PLAYERS_MIN - tc)
      };
    }
  }

  return {
    ...tournament,
    rounds: safeRounds,
    bracketOutline,
    isParticipant,
    myTeam,
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
  buildAutoRoundsFromBracket,
  createSpecialTournament,
  openRegistration,
  cancelSpecialTournament,
  updateTournamentConfig,
  sendSpecialTournamentNotification,
  joinSpecialTournament,
  updateSpecialTournamentTeamRoster,
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
  getSpecialTournamentCapacityHints,
  getSlotLiveResults,
  aggregateSlotStandings,
  formatSlotMatchResults,
  getEligibleTeams,
  declareFinalRanking,
  addInviteTeamToSlot,
  registrationPublicWindowStarted,
  isSpecialTournamentDiscoverableByUsers,
  assertSpecialTournamentVisibleToViewer
};
