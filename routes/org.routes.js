/**
 * Org Routes
 * Org manager specific APIs – fully additive, no changes to existing routes.
 */

const express = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { loadOrganization, isOrgManagerForOrg } = require('../middleware/org.middleware');
const {
  depositToOrg,
  createOrgTournament,
  listOrgTournaments,
  createOrgSpecialTournament
} = require('../controllers/org.controller');

const router = express.Router();

// All routes under /api/orgs/:orgId require auth + org context
router.use('/orgs/:orgId', authenticate, loadOrganization, isOrgManagerForOrg);

router.post(
  '/orgs/:orgId/deposit',
  [
    body('amount')
      .notEmpty()
      .withMessage('Amount is required')
      .isNumeric()
      .withMessage('Amount must be a number')
  ],
  validate,
  depositToOrg
);

router.post(
  '/orgs/:orgId/tournaments',
  [
    body('mode').notEmpty().withMessage('mode is required'),
    body('subMode').notEmpty().withMessage('subMode is required'),
    body('entryFee').isNumeric().withMessage('entryFee must be a number'),
    body('maxPlayers').isNumeric().withMessage('maxPlayers must be a number'),
    body('date').notEmpty().withMessage('date is required'),
    body('startTime').notEmpty().withMessage('startTime is required')
  ],
  validate,
  createOrgTournament
);

router.get(
  '/orgs/:orgId/tournaments',
  listOrgTournaments
);

router.post(
  '/orgs/:orgId/special-tournaments',
  [
    body('title').notEmpty().withMessage('title is required').trim().isLength({ max: 100 }),
    body('mode').isIn(['BR', 'CS']).withMessage('mode must be BR or CS'),
    body('subMode').isIn(['solo', 'duo', 'squad', '1v1', '2v2', '4v4']).withMessage('Invalid subMode'),
    body('prizePool').isFloat({ min: 1 }).withMessage('prizePool must be at least 1'),
    body('maxSlots').isInt({ min: 2 }).withMessage('maxSlots must be at least 2'),
    body('rounds').optional().isArray(),
    body('rounds.*.roundNumber').optional().isInt({ min: 1 }),
    body('rounds.*.teamsPerSlot').optional().isInt({ min: 2 }),
    body('rounds.*.matchesPerSlot').optional().isInt({ min: 1 }),
    body('rounds.*.qualifyPerSlot').optional().isInt({ min: 1 }),
    body('bracketAuto').optional().isObject(),
    body('bracketAuto.qualifyPerSlot').optional().isInt({ min: 1, max: 30 }),
    body('bracketAuto.matchesPerSlot').optional().isInt({ min: 1, max: 99 }),
    body('game').optional().trim().isLength({ max: 80 }),
    body().custom((_, { req }) => {
      const hasRounds = Array.isArray(req.body.rounds) && req.body.rounds.length > 0;
      const ba = req.body.bracketAuto;
      const hasAuto = ba != null && typeof ba === 'object' && ba.qualifyPerSlot != null && ba.qualifyPerSlot !== '';
      if (hasRounds && hasAuto) throw new Error('Send either rounds or bracketAuto, not both');
      if (!hasRounds && !hasAuto) throw new Error('Send rounds[] or bracketAuto');
      if (hasAuto && req.body.mode !== 'BR') throw new Error('bracketAuto requires mode BR');
      if (hasAuto && (!req.body.game || !String(req.body.game).trim())) {
        throw new Error('game is required with bracketAuto');
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
    body('scheduledEndDate').optional().isISO8601().withMessage('scheduledEndDate must be valid ISO date'),
    body('formatLabel').optional().trim().isLength({ max: 200 }).withMessage('formatLabel max 200 chars'),
    body('sponsorHandles').optional().isObject().withMessage('sponsorHandles must be an object')
  ],
  validate,
  createOrgSpecialTournament
);

module.exports = router;

