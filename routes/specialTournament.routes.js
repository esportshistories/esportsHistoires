/**
 * Special Tournament Routes
 * Sponsored/special multi-round tournaments (free entry, fixed prize pool)
 */

const express = require('express');
const { body, query, param } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const {
  createSpecialTournament,
  openRegistration,
  cancelSpecialTournament,
  updateTournamentConfig,
  sendSpecialTournamentNotification,
  startRound,
  assignSlotHost,
  distributeRewards,
  declareFinalRanking,
  updateSlotRoom,
  submitSlotMatchResult,
  submitSlotFinalResult,
  getSpecialTournamentList,
  getSpecialTournamentDetails,
  getSpecialTournamentAdminReport,
  getSlotLiveResults,
  joinSpecialTournament
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

/** GET /api/special-tournament/:id */
router.get(
  '/:id',
  authenticate,
  getSpecialTournamentDetails
);

/** GET /api/special-tournament/:id/admin-report — Admin only: full results, every lobby/slot */
router.get(
  '/:id/admin-report',
  authenticate,
  isAdmin,
  getSpecialTournamentAdminReport
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
    body('rounds').isArray({ min: 1 }).withMessage('rounds must be a non-empty array'),
    body('rounds.*.roundNumber').isInt({ min: 1 }).withMessage('Each round must have roundNumber >= 1'),
    body('rounds.*.teamsPerSlot').isInt({ min: 2 }).withMessage('Each round must have teamsPerSlot >= 2'),
    body('rounds.*.matchesPerSlot').isInt({ min: 1 }).withMessage('Each round must have matchesPerSlot >= 1'),
    body('rounds.*.qualifyPerSlot').isInt({ min: 1 }).withMessage('Each round must have qualifyPerSlot >= 1'),
    body('prizeDistribution').optional().isArray(),
    body('prizeDistribution.*.position').optional().isInt({ min: 1 }),
    body('prizeDistribution.*.percent').optional().isFloat({ min: 0, max: 100 }),
    body('scheduledEndDate').optional().isISO8601().withMessage('scheduledEndDate must be valid ISO date'),
    body('formatLabel').optional().trim().isLength({ max: 200 }).withMessage('formatLabel max 200 chars'),
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
      .isArray({ min: 3, max: 4 }).withMessage('players must have 3 or 4 items (4 or 5 total with leader; 4 compulsory, max 5)'),
    body('players.*')
      .isString().withMessage('Each player name must be a string')
      .trim()
      .isLength({ max: 50 }).withMessage('Player name cannot exceed 50 characters')
  ],
  validate,
  joinSpecialTournament
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
