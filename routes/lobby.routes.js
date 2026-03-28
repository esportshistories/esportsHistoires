/**
 * Lobby Routes
 * Unified list/join for paid lobbies + sponsored tournaments.
 */

const express = require('express');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { getLobbyList, joinLobby } = require('../controllers/lobby.controller');

const router = express.Router();

router.get(
  '/list',
  authenticate,
  [
    query('type').optional().isIn(['paid', 'sponsored', 'all']).withMessage('type must be paid, sponsored, or all'),
    query('mode').optional().isIn(['BR', 'CS', 'LW']).withMessage('mode must be BR, CS, or LW'),
    query('status').optional().isIn(['upcoming', 'live', 'completed', 'pendingResult', 'cancelled']).withMessage('Invalid status'),
    query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'),
    query('subMode')
      .optional()
      .isIn(['solo', 'duo', 'squad', '1v1', '2v2', '4v4', '7round', '13round', 'clash'])
      .withMessage('Invalid subMode'),
    query('game')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('game must be a non-empty string (comma-separated allowed)'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset must be non-negative')
  ],
  validate,
  getLobbyList
);

router.post(
  '/join',
  authenticate,
  [
    body('lobbyId').notEmpty().withMessage('lobbyId is required'),
    body('lobbyType').notEmpty().isIn(['paid', 'sponsored']).withMessage('lobbyType must be paid or sponsored'),
    body('teamName').notEmpty().isString().trim().isLength({ max: 50 }).withMessage('teamName is required (max 50 chars)'),
    // players validation differs by type; we do strict checks inside controller for sponsored.
    body('players').optional().isArray({ max: 5 }).withMessage('players must be an array (max 5 items)'),
    body('players.*').optional().isString().trim().isLength({ max: 50 }).withMessage('Player name max 50 chars')
  ],
  validate,
  joinLobby
);

module.exports = router;

