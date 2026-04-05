/**
 * Special Tournament Routes
 * Sponsored/special multi-round tournaments (free entry, fixed prize pool)
 */

const express = require('express');
const { body, query, param } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { authenticateUserSse } = require('../middleware/sseUserAuth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const {
  createSpecialTournament,
  openRegistration,
  cancelSpecialTournament,
  updateTournamentConfig,
  sendSpecialTournamentNotification,
  startRound,
  addInviteTeamToSlot,
  assignSlotHost,
  distributeRewards,
  declareFinalRanking,
  updateSlotRoom,
  submitSlotMatchResult,
  submitSlotFinalResult,
  getSpecialTournamentList,
  getSpecialTournamentDetails,
  getSpecialTournamentAdminReport,
  getSpecialTournamentCapacityHints,
  getSlotLiveResults,
  joinSpecialTournament,
  updateSpecialTournamentTeamRoster,
  streamSpecialTournament
} = require('../controllers/specialTournament.controller');

const router = express.Router();

// ---------------------------------------------------------------------------
// Public / User routes
// ---------------------------------------------------------------------------

/** GET /api/special-tournament/list */
router.get(
  '/list',
  authenticate,
  [
    query('status').optional().isIn(['draft', 'registration_open', 'running', 'completed', 'cancelled'])
      .withMessage('Invalid status'),
    query('mode').optional().isIn(['BR', 'CS']).withMessage('mode must be BR or CS'),
    query('subMode').optional().isIn(['solo', 'duo', 'squad', '1v1', '2v2', '4v4'])
      .withMessage('Invalid subMode'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100')
  ],
  validate,
  getSpecialTournamentList
);

/** GET /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/live-results */
router.get(
  '/:id/round/:roundNum/slot/:slotIdx/live-results',
  authenticate,
  [
    param('roundNum').isInt({ min: 1 }).withMessage('roundNum must be a positive integer'),
    param('slotIdx').isInt({ min: 0 }).withMessage('slotIdx must be a non-negative integer')
  ],
  validate,
  getSlotLiveResults
);

/** GET /api/special-tournament/:id/capacity-hints — Admin: dynamic lobby cap, invite headroom, semifinal hint */
router.get(
  '/:id/capacity-hints',
  authenticate,
  isAdmin,
  getSpecialTournamentCapacityHints
);

/** GET /api/special-tournament/:id/admin-report — Admin only: full results, every lobby/slot */
router.get(
  '/:id/admin-report',
  authenticate,
  isAdmin,
  getSpecialTournamentAdminReport
);

/** GET /api/special-tournament/:id/stream — SSE: snapshot + update on each join (Bearer or ?access_token=) */
router.get('/:id/stream', authenticateUserSse, streamSpecialTournament);

/** GET /api/special-tournament/:id */
router.get(
  '/:id',
  authenticate,
  getSpecialTournamentDetails
);

// ---------------------------------------------------------------------------
// Admin routes (static paths must come before /:id parameterized routes)
// ---------------------------------------------------------------------------

/** POST /api/special-tournament/create */
router.post(
  '/create',
  authenticate,
  isAdmin,
  [
    body('title').notEmpty().withMessage('title is required').trim().isLength({ max: 100 }),
    body('mode').isIn(['BR', 'CS']).withMessage('mode must be BR or CS'),
    body('subMode').isIn(['solo', 'duo', 'squad', '1v1', '2v2', '4v4']).withMessage('Invalid subMode'),
    body('prizePool').isFloat({ min: 1 }).withMessage('prizePool must be at least 1 GC'),
    body('maxSlots').isInt({ min: 2 }).withMessage('maxSlots must be at least 2'),
    body('rounds').optional().isArray(),
    body('rounds.*.roundNumber').optional().isInt({ min: 1 }).withMessage('Each round must have roundNumber >= 1'),
    body('rounds.*.teamsPerSlot').optional().isInt({ min: 2 }).withMessage('Each round must have teamsPerSlot >= 2'),
    body('rounds.*.matchesPerSlot').optional().isInt({ min: 1 }).withMessage('Each round must have matchesPerSlot >= 1'),
    body('rounds.*.qualifyPerSlot').optional().isInt({ min: 1 }).withMessage('Each round must have qualifyPerSlot >= 1'),
    body('rounds.*.roundName').optional().trim().isLength({ max: 80 }),
    body('rounds.*.slotSizes').optional().isArray(),
    body('rounds.*.slotSizes.*').optional().isInt({ min: 2, max: 32 }),
    body('rounds.*.inviteSlotCaps').optional().isArray(),
    body('rounds.*.inviteSlotCaps.*').optional().isInt({ min: 0, max: 16 }),
    body('rounds.*.inviteSlotsPerSlot').optional().isInt({ min: 0, max: 16 }),
    body('bracketAuto').optional().isObject().withMessage('bracketAuto must be an object'),
    body('bracketAuto.qualifyPerSlot').optional().isInt({ min: 1, max: 30 }),
    body('bracketAuto.matchesPerSlot').optional().isInt({ min: 1, max: 99 }),
    body('game').optional().trim().isLength({ max: 80 }),
    body('region').optional().isIn(['Asia', 'Global']).withMessage('region must be Asia or Global'),
    body().custom((_, { req }) => {
      const hasRounds = Array.isArray(req.body.rounds) && req.body.rounds.length > 0;
      const ba = req.body.bracketAuto;
      const hasAuto = ba != null && typeof ba === 'object' && ba.qualifyPerSlot != null && ba.qualifyPerSlot !== '';
      if (hasRounds && hasAuto) {
        throw new Error('Send either rounds or bracketAuto, not both');
      }
      if (!hasRounds && !hasAuto) {
        throw new Error('Send rounds[] or bracketAuto: { qualifyPerSlot, matchesPerSlot? }');
      }
      if (hasAuto && req.body.mode !== 'BR') {
        throw new Error('bracketAuto requires mode BR');
      }
      if (hasAuto && (!req.body.game || !String(req.body.game).trim())) {
        throw new Error('game is required with bracketAuto (BGMI → 16/lobby, Free Fire → 12)');
      }
      return true;
    }),
    body().custom((_, { req }) => {
      const hasPd = Array.isArray(req.body.prizeDistribution) && req.body.prizeDistribution.length > 0;
      const hasRr = (Array.isArray(req.body.rankRewards) && req.body.rankRewards.length > 0)
        || (Array.isArray(req.body.prizeByRank) && req.body.prizeByRank.length > 0);
      if (!hasPd && !hasRr) {
        throw new Error('Provide prizeDistribution or rankRewards (or prizeByRank)');
      }
      return true;
    }),
    body('prizeDistribution').optional().isArray(),
    body('prizeDistribution.*.position').optional().isInt({ min: 1 }),
    body('prizeDistribution.*.percent').optional().isFloat({ min: 0, max: 100 }),
    body('rankRewards').optional().isArray(),
    body('rankRewards.*.position').optional().isInt({ min: 1 }),
    body('rankRewards.*.amount').optional().isFloat({ min: 0 }),
    body('prizeByRank').optional().isArray(),
    body('prizeByRank.*.position').optional().isInt({ min: 1 }),
    body('prizeByRank.*.amount').optional().isFloat({ min: 0 }),
    body('registrationPeriodStart').optional().isISO8601(),
    body('registrationPeriodEnd').optional().isISO8601(),
    body('registrationStartDate').optional().isISO8601(),
    body('registrationDeadline').optional().isISO8601(),
    body('tournamentStartDate').optional().isISO8601(),
    body('tournamentEndDate').optional().isISO8601(),
    body('scheduledDate').optional().isISO8601(),
    body('scheduledEndDate').optional().isISO8601().withMessage('scheduledEndDate must be valid ISO date'),
    body('scheduledTime').optional().trim().isLength({ max: 32 }),
    body('tournamentFormat').optional().trim().isLength({ max: 120 }),
    body('formatLabel').optional().trim().isLength({ max: 200 }).withMessage('formatLabel max 200 chars'),
    body('logoUrl').optional().trim().isLength({ max: 500 }),
    body('youtubeStreamUrl').optional().trim().isLength({ max: 500 }),
    body('lobbyName').optional().trim().isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 5000 }),
    body('sponsors').optional().isArray(),
    body('sponsors.*.name').optional().trim().isLength({ max: 100 }),
    body('sponsors.*.logoUrl').optional().trim().isLength({ max: 500 }),
    body('sponsors.*.link').optional().trim().isLength({ max: 500 }),
    body('sponsorHandles').optional().isObject().withMessage('sponsorHandles must be an object'),
    body('sponsorHandles.instagram').optional().trim().isLength({ max: 200 }),
    body('sponsorHandles.discord').optional().trim().isLength({ max: 200 }),
    body('sponsorHandles.youtube').optional().trim().isLength({ max: 200 }),
    body('sponsorHandles.telegram').optional().trim().isLength({ max: 200 }),
    body('sponsorHandles.whatsapp').optional().trim().isLength({ max: 200 })
  ],
  validate,
  createSpecialTournament
);

// ---------------------------------------------------------------------------
// User routes
// ---------------------------------------------------------------------------

/** POST /api/special-tournament/:id/join */
router.post(
  '/:id/join',
  authenticate,
  [
    body('teamName')
      .notEmpty().withMessage('teamName is required')
      .isString().withMessage('teamName must be a string')
      .trim()
      .isLength({ max: 50 }).withMessage('teamName cannot exceed 50 characters'),
    body('players')
      .optional()
      .custom((val) => {
        const arr = val === undefined || val === null ? [] : val;
        if (!Array.isArray(arr)) throw new Error('players must be an array');
        if (arr.length > 4) {
          throw new Error('At most 4 teammate names (5 players including leader). Need ≥3 teammates for round 1 slot.');
        }
        return true;
      }),
    body('players.*')
      .optional()
      .isString().withMessage('Each player name must be a string')
      .trim()
      .isLength({ max: 50 }).withMessage('Player name cannot exceed 50 characters')
  ],
  validate,
  joinSpecialTournament
);

/** PATCH /api/special-tournament/:id/team — leader updates teammate names during registration (0–4 names) */
router.patch(
  '/:id/team',
  authenticate,
  [
    body('players')
      .optional()
      .custom((val) => {
        const arr = val === undefined || val === null ? [] : val;
        if (!Array.isArray(arr)) throw new Error('players must be an array');
        if (arr.length > 4) {
          throw new Error('At most 4 teammate names (5 including leader)');
        }
        return true;
      }),
    body('players.*')
      .optional()
      .isString().withMessage('Each player name must be a string')
      .trim()
      .isLength({ max: 50 }).withMessage('Player name cannot exceed 50 characters')
  ],
  validate,
  updateSpecialTournamentTeamRoster
);

// ---------------------------------------------------------------------------
// Admin routes (parameterized — after static /create)
// ---------------------------------------------------------------------------

/** PATCH /api/special-tournament/:id/config */
router.patch(
  '/:id/config',
  authenticate,
  isAdmin,
  [
    body('maxSlots').optional().isInt({ min: 2 }).withMessage('maxSlots must be at least 2'),
    body('prizePool').optional().isFloat({ min: 1 }).withMessage('prizePool must be at least 1 GC'),
    body('prizeDistribution').optional().isArray(),
    body('prizeDistribution.*.position').optional().isInt({ min: 1 }),
    body('prizeDistribution.*.percent').optional().isFloat({ min: 0, max: 100 }),
    body('title').optional().trim().isLength({ max: 100 }),
    body('lobbyName').optional().trim().isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('scheduledEndDate').optional().isISO8601().withMessage('scheduledEndDate must be valid ISO date'),
    body('formatLabel').optional().trim().isLength({ max: 200 }).withMessage('formatLabel max 200 chars'),
    body('sponsorHandles').optional().isObject().withMessage('sponsorHandles must be an object'),
    body('sponsorHandles.instagram').optional().trim().isLength({ max: 200 }),
    body('sponsorHandles.discord').optional().trim().isLength({ max: 200 }),
    body('sponsorHandles.youtube').optional().trim().isLength({ max: 200 }),
    body('sponsorHandles.telegram').optional().trim().isLength({ max: 200 }),
    body('sponsorHandles.whatsapp').optional().trim().isLength({ max: 200 }),
    body('rounds').optional().isArray().withMessage('rounds must be an array'),
    body('rounds.*.roundNumber').optional().isInt({ min: 1 }).withMessage('roundNumber must be >= 1'),
    body('rounds.*.roundName').optional().trim().isLength({ max: 100 }),
    body('rounds.*.teamsPerSlot').optional().isInt({ min: 2 }).withMessage('teamsPerSlot must be >= 2'),
    body('rounds.*.matchesPerSlot').optional().isInt({ min: 1 }).withMessage('matchesPerSlot must be >= 1'),
    body('rounds.*.qualifyPerSlot').optional().isInt({ min: 1 }).withMessage('qualifyPerSlot must be >= 1')
  ],
  validate,
  updateTournamentConfig
);

/** POST /api/special-tournament/:id/notify */
router.post(
  '/:id/notify',
  authenticate,
  isAdmin,
  [
    body('title').optional().isString().trim().isLength({ max: 100 }),
    body('message').optional().isString().trim().isLength({ max: 500 }),
    body('type').optional().isString().trim()
  ],
  validate,
  sendSpecialTournamentNotification
);

/** POST /api/special-tournament/:id/open-registration */
router.post(
  '/:id/open-registration',
  authenticate,
  isAdmin,
  openRegistration
);

/** POST /api/special-tournament/:id/cancel */
router.post(
  '/:id/cancel',
  authenticate,
  isAdmin,
  [
    body('reason').optional().isString().trim().isLength({ max: 500 })
  ],
  validate,
  cancelSpecialTournament
);

// ---------------------------------------------------------------------------
// Host routes (slot room and match result submission)
// ---------------------------------------------------------------------------

/** POST /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/room */
router.post(
  '/:id/round/:roundNum/slot/:slotIdx/room',
  authenticate,
  [
    param('roundNum').isInt({ min: 1 }).withMessage('roundNum must be a positive integer'),
    param('slotIdx').isInt({ min: 0 }).withMessage('slotIdx must be a non-negative integer'),
    body('roomId').notEmpty().withMessage('roomId is required').trim(),
    body('password').optional().isString().trim()
  ],
  validate,
  updateSlotRoom
);

/** POST /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/match-result */
router.post(
  '/:id/round/:roundNum/slot/:slotIdx/match-result',
  authenticate,
  [
    param('roundNum').isInt({ min: 1 }).withMessage('roundNum must be a positive integer'),
    param('slotIdx').isInt({ min: 0 }).withMessage('slotIdx must be a non-negative integer'),
    body('matchIndex').isInt({ min: 0 }).withMessage('matchIndex must be a non-negative integer'),
    body('teams').isArray({ min: 1 }).withMessage('teams must be a non-empty array'),
    body('teams.*.teamName').notEmpty().trim().isLength({ max: 50 })
      .withMessage('Each team must have teamName (max 50 chars)'),
    body('teams.*.position').isInt({ min: 1 }).withMessage('Each team must have position (min: 1)'),
    body('teams.*.kills').isInt({ min: 0 }).withMessage('Each team must have kills (min: 0)')
  ],
  validate,
  submitSlotMatchResult
);

/** POST /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/final-result */
router.post(
  '/:id/round/:roundNum/slot/:slotIdx/final-result',
  authenticate,
  [
    param('roundNum').isInt({ min: 1 }).withMessage('roundNum must be a positive integer'),
    param('slotIdx').isInt({ min: 0 }).withMessage('slotIdx must be a non-negative integer')
  ],
  validate,
  submitSlotFinalResult
);

/** POST /api/special-tournament/:id/round/:roundNum/start */
router.post(
  '/:id/round/:roundNum/start',
  authenticate,
  isAdmin,
  [
    param('roundNum').isInt({ min: 1 }).withMessage('roundNum must be a positive integer')
  ],
  validate,
  startRound
);

/** POST /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/add-invite-team */
router.post(
  '/:id/round/:roundNum/slot/:slotIdx/add-invite-team',
  authenticate,
  isAdmin,
  [
    param('roundNum').isInt({ min: 1 }).withMessage('roundNum must be a positive integer'),
    param('slotIdx').isInt({ min: 0 }).withMessage('slotIdx must be a non-negative integer'),
    body('leaderUserId').notEmpty().withMessage('leaderUserId is required'),
    body('teamName').notEmpty().trim().isLength({ max: 50 }).withMessage('teamName is required (max 50)'),
    body('players')
      .optional()
      .custom((val) => {
        const arr = val === undefined || val === null ? [] : val;
        if (!Array.isArray(arr)) throw new Error('players must be an array');
        if (arr.length > 4) throw new Error('At most 4 teammate names per invite team');
        return true;
      }),
    body('players.*').optional().isString().withMessage('Each player name must be a string')
  ],
  validate,
  addInviteTeamToSlot
);

/** POST /api/special-tournament/:id/round/:roundNum/slot/:slotIdx/assign-host */
router.post(
  '/:id/round/:roundNum/slot/:slotIdx/assign-host',
  authenticate,
  isAdmin,
  [
    param('roundNum').isInt({ min: 1 }).withMessage('roundNum must be a positive integer'),
    param('slotIdx').isInt({ min: 0 }).withMessage('slotIdx must be a non-negative integer'),
    body('hostUserId').notEmpty().withMessage('hostUserId is required')
  ],
  validate,
  assignSlotHost
);

/** POST /api/special-tournament/:id/declare-final-ranking */
router.post(
  '/:id/declare-final-ranking',
  authenticate,
  isAdmin,
  [
    body('ranking').isArray({ min: 1 }).withMessage('ranking must be a non-empty array'),
    body('ranking.*.position').isInt({ min: 1 }).withMessage('Each entry must have position >= 1'),
    body('ranking.*.teamName').notEmpty().trim().isLength({ max: 50 }).withMessage('Each entry must have teamName (max 50 chars)')
  ],
  validate,
  declareFinalRanking
);

/** POST /api/special-tournament/:id/distribute-rewards */
router.post(
  '/:id/distribute-rewards',
  authenticate,
  isAdmin,
  distributeRewards
);

module.exports = router;
