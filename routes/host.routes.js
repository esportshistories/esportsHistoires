/**
 * Host Routes
 * Defines all host-only API endpoints
 */

const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { authenticateHostSse } = require('../middleware/sseHostAuth.middleware');
const { isHost } = require('../middleware/host.middleware');
const {
  listAvailableTournaments,
  applyForTournament,
  listMyApplications,
  streamHostApplicationEvents,
  endTournament,
  getMyLobbies
} = require('../controllers/host.controller');
const { updateRoom, notifyLobbyFilling } = require('../controllers/tournament.controller');
const {
  getHostTickets,
  updateHostTicket,
  replyToTicketAsHost
} = require('../controllers/support.controller');

const router = express.Router();

router.get(
  '/tournaments/available',
  authenticate,
  isHost,
  listAvailableTournaments
);

router.post(
  '/tournaments/:tournamentId/apply',
  authenticate,
  isHost,
  applyForTournament
);

/** SSE — application approved/rejected; use Bearer or ?access_token= for EventSource */
router.get(
  '/applications/stream',
  authenticateHostSse,
  streamHostApplicationEvents
);

router.get(
  '/applications',
  authenticate,
  isHost,
  listMyApplications
);

router.get(
  '/my-lobbies',
  authenticate,
  isHost,
  getMyLobbies
);

router.post(
  '/tournaments/:tournamentId/end',
  authenticate,
  isHost,
  endTournament
);

router.post(
  '/tournaments/:tournamentId/update-room',
  authenticate,
  isHost,
  [
    body('roomId')
      .optional()
      .trim(),
    body('password')
      .optional()
      .trim()
  ],
  validate,
  updateRoom
);

router.post(
  '/tournaments/:tournamentId/notify-lobby-filling',
  authenticate,
  isHost,
  notifyLobbyFilling
);

router.get(
  '/support/tickets',
  authenticate,
  isHost,
  getHostTickets
);

router.patch(
  '/support/tickets/:ticketId',
  authenticate,
  isHost,
  [
    body('status')
      .optional()
      .isIn(['open', 'closed'])
      .withMessage('Invalid status'),
    body('hostNotes')
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Host notes cannot exceed 2000 characters')
  ],
  validate,
  updateHostTicket
);

router.post(
  '/support/tickets/:ticketId/reply',
  authenticate,
  isHost,
  [
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message must be between 1 and 5000 characters')
  ],
  validate,
  replyToTicketAsHost
);

module.exports = router;
