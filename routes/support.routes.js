/**
 * Support Routes
 * Defines all support-related API endpoints for users
 */

const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { generalRateLimiter } = require('../middleware/rateLimit.middleware');
const {
  getFAQs,
  createSupportTicket,
  getUserTickets,
  getTicketById,
  replyToTicket
} = require('../controllers/support.controller');

const router = express.Router();

router.get(
  '/faqs',
  generalRateLimiter,
  getFAQs
);

router.post(
  '/tickets',
  generalRateLimiter,
  authenticate,
  [
    body('subject')
      .trim()
      .notEmpty()
      .withMessage('Subject is required')
      .isLength({ min: 5, max: 200 })
      .withMessage('Subject must be between 5 and 200 characters'),
    body('issue')
      .trim()
      .notEmpty()
      .withMessage('Issue description is required')
      .isLength({ min: 10, max: 5000 })
      .withMessage('Issue description must be between 10 and 5000 characters'),
    body('images')
      .optional()
      .isArray()
      .withMessage('Images must be an array')
      .custom((images) => {
        if (images && Array.isArray(images) && images.length > 2) {
          throw new Error('Maximum 2 images allowed');
        }
        return true;
      })
  ],
  validate,
  createSupportTicket
);

router.get(
  '/tickets',
  generalRateLimiter,
  authenticate,
  getUserTickets
);

router.get(
  '/tickets/:ticketId',
  generalRateLimiter,
  authenticate,
  getTicketById
);

router.post(
  '/tickets/:ticketId/reply',
  generalRateLimiter,
  authenticate,
  [
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message must be between 1 and 5000 characters')
  ],
  validate,
  replyToTicket
);

module.exports = router;
