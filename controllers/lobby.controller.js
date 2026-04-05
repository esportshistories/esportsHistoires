/**
 * Lobby Controller
 * Unified API surface for:
 * - Paid lobbies (regular Tournament model, wallet deduction on join)
 * - Sponsored tournaments (SpecialTournament model, free entry)
 *
 * This is additive and does not change existing /api/tournament or /api/special-tournament flows.
 */

const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS } = require('../constants');
const tournamentService = require('../services/tournament.service');
const specialTournamentService = require('../services/specialTournament.service');
const Logger = require('../utils/logger');

/**
 * GET /api/lobby/list
 * Query:
 *  - type: paid|sponsored|all (default: all)
 *  - status: upcoming|live|completed|pendingResult|cancelled (default: upcoming)
 *  - mode: BR|CS|LW (optional) — sponsored supports BR/CS only, LW yields empty for sponsored
 *  - subMode: (optional)
 *  - date/fromDate/toDate (optional)
 *  - game: canonical title or slug, comma-separated (optional; same behavior as /api/tournament/list)
 *  - limit/offset (optional; defaults aligned with /api/tournament/list)
 *
 * Response is in the SAME list-item shape already used by /api/tournament/list
 * (special tournaments are mapped via mapSpecialTournamentToListFormat).
 */
const getLobbyList = asyncHandler(async (req, res) => {
  const type = (req.query.type || 'all').toString().trim().toLowerCase();
  if (!['paid', 'sponsored', 'all'].includes(type)) {
    return res.badRequest('type must be paid, sponsored, or all');
  }

  const status = req.query.status || 'upcoming';
  const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
  const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
  const date = req.query.date || null;
  const subMode = req.query.subMode || null;
  const mode = req.query.mode || null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  // Game scoping matches /api/tournament/list behavior (followed games if no query)
  const { getUserSelectedGameGroups } = require('./profile.controller');
  const { resolveAnyGameTitle, normalizeGameMatchKeysForDb } = require('../constants/gameCatalog');

  const selectedFollowedGames = getUserSelectedGameGroups(req.user);
  let gameMatchKeys;
  /** Canonical titles for DB `game` field (no aggregation operators — works on older MongoDB). */
  let resolvedGameTitles = [];
  let gameScope;

  if (req.query.game) {
    const parts = String(req.query.game).split(',').map(s => s.trim()).filter(Boolean);
    const titles = [];
    for (const p of parts) {
      const t = resolveAnyGameTitle(p);
      if (!t) {
        return res.badRequest(`Invalid game: ${p}. Use a supported title or slug from game options.`);
      }
      titles.push(t);
    }
    resolvedGameTitles = [...new Set(titles)];
    gameMatchKeys = normalizeGameMatchKeysForDb(titles);
    gameScope = 'query';
  } else if (selectedFollowedGames.length) {
    resolvedGameTitles = [
      ...new Set(
        selectedFollowedGames
          .map((s) => resolveAnyGameTitle(s.game) || String(s.game || '').trim())
          .filter(Boolean)
      )
    ];
    gameMatchKeys = normalizeGameMatchKeysForDb(selectedFollowedGames.map(s => s.game));
    gameScope = 'followed';
  } else {
    gameMatchKeys = [];
    gameScope = 'none';
  }

  const includePaid = type === 'all' || type === 'paid';
  const includeSponsored = type === 'all' || type === 'sponsored';

  const isAdmin = req.user && req.user.role === 'admin';
  const [sponsoredAll, paidPaged] = await Promise.all([
    includeSponsored && mode !== 'LW'
      ? tournamentService.getSpecialTournamentsForList(status, mode, subMode, resolvedGameTitles, {
          forAdmin: isAdmin
        })
      : [],
    includePaid
      ? tournamentService.getTournamentsByStatus(
          status,
          fromDate,
          toDate,
          date,
          subMode,
          mode,
          resolvedGameTitles,
          { limit, offset, includeTotal: true }
        )
      : { tournaments: [], total: 0 }
  ]);

  if (type === 'paid') {
    return res.success(HTTP_STATUS.OK, 'Paid lobbies retrieved', {
      type: 'paid',
      tournaments: paidPaged.tournaments || [],
      total: paidPaged.total || 0,
      limit,
      offset,
      filters: { status, date: date || null, subMode: subMode || null, mode: mode || null, gameScope, game: req.query.game || null }
    });
  }

  if (type === 'sponsored') {
    const total = Array.isArray(sponsoredAll) ? sponsoredAll.length : 0;
    const page = Array.isArray(sponsoredAll) ? sponsoredAll.slice(offset, offset + limit) : [];
    return res.success(HTTP_STATUS.OK, 'Sponsored tournaments retrieved', {
      type: 'sponsored',
      tournaments: page,
      total,
      limit,
      offset,
      filters: { status, date: date || null, subMode: subMode || null, mode: mode || null, gameScope, game: req.query.game || null }
    });
  }

  // all: keep the same merged-order semantics as /api/tournament/list (specials first),
  // but apply paging across the merged list.
  const specials = Array.isArray(sponsoredAll) ? sponsoredAll : [];
  const paid = Array.isArray(paidPaged.tournaments) ? paidPaged.tournaments : [];

  const allMerged = [...specials, ...paid];
  const total = specials.length + (paidPaged.total || 0);
  const mergedPage = allMerged.slice(offset, offset + limit);

  return res.success(HTTP_STATUS.OK, 'Lobbies retrieved', {
    type: 'all',
    tournaments: mergedPage,
    total,
    limit,
    offset,
    filters: { status, date: date || null, subMode: subMode || null, mode: mode || null, gameScope, game: req.query.game || null }
  });
});

/**
 * POST /api/lobby/join
 * Body: { lobbyId, lobbyType: 'paid'|'sponsored', teamName, players? }
 *
 * - paid: delegates to existing paid join flow (wallet deduction + atomic transaction)
 * - sponsored: registers user for special tournament (free entry)
 */
const joinLobby = asyncHandler(async (req, res) => {
  const lobbyType = (req.body?.lobbyType || '').toString().trim().toLowerCase();
  const lobbyId = (req.body?.lobbyId || '').toString().trim();
  const teamName = req.body?.teamName;
  const players = req.body?.players;

  if (!lobbyId) return res.badRequest('lobbyId is required');
  if (!['paid', 'sponsored'].includes(lobbyType)) {
    return res.badRequest('lobbyType must be paid or sponsored');
  }
  if (!teamName || typeof teamName !== 'string' || !teamName.trim()) {
    return res.badRequest('teamName is required');
  }

  if (lobbyType === 'paid') {
    // Delegate to existing paid tournament join handler for exact behavior/backward-compat.
    // We re-shape request body to match /api/tournament/join
    req.body = {
      tournamentId: lobbyId,
      teamName,
      players
    };
    const tournamentController = require('./tournament.controller');
    return tournamentController.joinTournament(req, res);
  }

  // sponsored (free entry)
  const userId = req.userId;
  try {
    // SpecialTournament: 0–4 teammate names on join; ≥3 for round 1 eligibility
    const arr = Array.isArray(players) ? players : [];
    const tournament = await specialTournamentService.joinSpecialTournament(userId, lobbyId, teamName, arr);
    return res.success(HTTP_STATUS.OK, 'Successfully registered (free entry)', {
      lobbyType: 'sponsored',
      tournamentId: tournament._id,
      title: tournament.title,
      status: tournament.status,
      participantCount: tournament.participants.length,
      maxSlots: tournament.maxSlots
    });
  } catch (e) {
    Logger.error('Sponsored lobby join failed', { lobbyId, userId, errName: e.name, message: e.message });
    return res.badRequest(e.message || 'Failed to join sponsored tournament');
  }
});

module.exports = {
  getLobbyList,
  joinLobby
};

