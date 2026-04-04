/**
 * Tournament Routes
 * Defines all tournament-related API endpoints
 */

const express = require('express');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { authenticateUserSse } = require('../middleware/sseUserAuth.middleware');
const {
  getTournamentList,
  streamTournamentList,
  getJoinedTournaments,
  getMyLobbies,
  getTournamentHistory,
  getTournamentDetails,
  joinTournament,
  joinTeam,
  submitMatchResult,
  submitFinalResult,
  getCanSubmitFinalResult,
  getLiveResults,
  streamTournamentLiveResults,
  claimReward,
  getLobbyChatHistory
} = require('../controllers/tournament.controller');

const router = express.Router();

router.get(
  '/list',
  authenticate,
  [
    query('mode')
      .optional()
      .isIn(['BR', 'CS', 'LW'])
      .withMessage('mode must be BR, CS, or LW'),
    query('status')
      .optional()
      .isIn(['upcoming', 'live', 'completed', 'pendingResult', 'cancelled'])
      .withMessage('Invalid status'),
    query('date')
      .optional()
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('date must be YYYY-MM-DD'),
    query('subMode')
      .optional()
      .isIn(['solo', 'duo', 'squad', '1v1', '2v2', '4v4', '7round', '13round', 'clash'])
      .withMessage('Invalid subMode'),
    query('game')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('if provided, game must be 1–200 chars (comma-separated allowed)'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset must be non-negative')
  ],
  validate,
  getTournamentList
);

router.get(
  '/list/stream',
  authenticateUserSse,
  [
    query('game')
      .notEmpty()
      .withMessage('game is required for stream')
      .bail()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('game must be a non-empty string (comma-separated allowed)')
  ],
  validate,
  streamTournamentList
);

router.get(
  '/joined',
  authenticate,
  getJoinedTournaments
);

router.get(
  '/my-lobbies',
  authenticate,
  getMyLobbies
);

router.get(
  '/userHistory',
  authenticate,
  [
    query('mode').optional().isIn(['BR', 'CS', 'LW']).withMessage('mode must be BR, CS, or LW'),
    query('fromDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('fromDate must be YYYY-MM-DD'),
    query('toDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('toDate must be YYYY-MM-DD'),
    query('win').optional().isIn(['true', 'false', '1', '0']).withMessage('win must be true or false'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset must be non-negative')
  ],
  validate,
  getTournamentHistory
);

router.get(
  '/:tournamentId/live-results/stream',
  authenticateUserSse,
  streamTournamentLiveResults
);

router.get(
  '/:tournamentId/live-results',
  authenticate,
  getLiveResults
);

router.get(
  '/:tournamentId/chat',
  authenticate,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100'),
    query('skip').optional().isInt({ min: 0 }).withMessage('skip must be non-negative')
  ],
  validate,
  getLobbyChatHistory
);

router.get(
  '/:tournamentId/can-submit-final-result',
  authenticate,
  getCanSubmitFinalResult
);

router.get(
  '/:tournamentId',
  authenticate,
  getTournamentDetails
);

router.post(
  '/join',
  authenticate,
  [
    body('tournamentId')
      .notEmpty()
      .withMessage('tournamentId is required')
      .bail(),
    body('teamName')
      .notEmpty()
      .withMessage('teamName is required')
      .isString()
      .withMessage('teamName must be a string')
      .trim()
      .isLength({ max: 50 })
      .withMessage('teamName cannot exceed 50 characters'),
    body('players')
      .optional()
      .isArray({ max: 5 })
      .withMessage('players must be an array with maximum 5 items'),
    body('players.*')
      .optional()
      .isString()
      .withMessage('Each player name must be a string')
      .trim()
      .isLength({ max: 50 })
      .withMessage('Player name cannot exceed 50 characters')
  ],
  validate,
  joinTournament
);

router.post(
  '/join-team',
  authenticate,
  [
    body('tournamentId').notEmpty().withMessage('tournamentId is required'),
    body('teamName').notEmpty().withMessage('teamName is required').isString().trim().isLength({ max: 50 }),
    body('players').optional().isArray({ max: 5 }).withMessage('players must be an array with maximum 5 items'),
    body('players.*').optional().isString().trim().isLength({ max: 50 })
  ],
  validate,
  joinTeam
);

router.post(
  '/submit-match-result',
  authenticate,
  [
    body('tournamentId').notEmpty().withMessage('tournamentId is required'),
    body('matchIndex')
      .isInt({ min: 0 })
      .withMessage('matchIndex must be a non-negative integer (0 for match 1, 5 for match 6)'),
    body('teams')
      .isArray({ min: 1 })
      .withMessage('teams must be a non-empty array'),
    body('teams.*.teamName')
      .notEmpty()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Each team must have teamName (max 50 chars)'),
    body('teams.*.position')
      .isInt({ min: 1 })
      .withMessage('Each team must have position (min: 1)'),
    body('teams.*.kills')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Each team must have kills (min: 0)'),
    body('teams.*.roundScore')
      .optional()
      .isInt({ min: 0 })
      .withMessage('roundScore (CS round wins, e.g. 7-6) must be non-negative')
  ],
  validate,
  submitMatchResult
);

router.post(
  '/submit-final-result',
  authenticate,
  [
    body('tournamentId').notEmpty().withMessage('tournamentId is required')
  ],
  validate,
  submitFinalResult
);

router.post(
  '/claim-reward',
  authenticate,
  [
    body('tournamentId')
      .notEmpty()
      .withMessage('tournamentId is required')
  ],
  validate,
  claimReward
);

module.exports = router;
