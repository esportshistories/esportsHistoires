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
    body('sponsorHandles').optional().isObject().withMessage('sponsorHandles must be an object')
  ],
  validate,
  createOrgSpecialTournament
);

module.exports = router;

