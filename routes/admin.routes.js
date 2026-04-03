/**
 * Admin Routes
 * Defines all admin-only API endpoints
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { authenticateAdminSse } = require('../middleware/sseAdminAuth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const { veryStrictRateLimiter } = require('../middleware/rateLimit.middleware');

// Configure multer for file uploads (bank statements)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/statements');
    const fs = require('fs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'statement-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.csv', '.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});
const tournamentService = require('../services/tournament.service');

const {
  adminLogin,
  getAdminGamesCatalog,
  generateLobbies,
  getHostsForTournament,
  assignHost,
  listUsers,
  blockUsers,
  unblockUsers,
  createHost,
  listHostApplications,
  approveHostApplication,
  rejectHostApplication,
  listTournaments,
  editTournament,
  deleteTournament,
  listHosts,
  getHostStatistics,
  getTopupTransactions,
  getPendingPayments,
  updateTransactionStatus,
  getWithdrawalRequests,
  updateWithdrawalStatus,
  searchTransactionByUTR,
  verifyPaymentByUTR,
  addBankReference,
  bulkVerifyFromStatement,
  verifyFromExternalAPI,
  getVerificationStats,
  getFlaggedTransactions,
  processEmailManually,
  getBankStatements,
  sendCustomNotification,
  getDashboardStats,
  streamAdminDashboard,
  streamAdminHostApplications,
  getAnalytics,
  getLobbyFinancialHistory,
  createOrganization,
  listOrganizations,
  addOrgManager,
  removeOrgManager,
  updateOrgPrimaryManager,
  blockOrganization,
  unblockOrganization
} = require('../controllers/admin.controller');
const {
  getInquiries,
  getInquiryById,
  updateInquiryStatus,
  replyToInquiry,
  deleteInquiry
} = require('../controllers/inquiry.controller');
const {
  getAdminTickets,
  updateAdminTicket,
  replyToTicketAsAdmin
} = require('../controllers/support.controller');
const { updateRoom, notifyLobbyFilling } = require('../controllers/tournament.controller');

const router = express.Router();

router.post(
  '/login',
  veryStrictRateLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  validate,
  adminLogin
);

router.get(
  '/games/catalog',
  authenticate,
  isAdmin,
  getAdminGamesCatalog
);

router.post(
  '/generate-lobbies',
  authenticate,
  isAdmin,
  [
    body('date')
      .notEmpty()
      .withMessage('date is required')
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('date must be YYYY-MM-DD')
      .custom((value) => {
        tournamentService.assertGenerateLobbiesDateAllowed(value);
        return true;
      }),
    body('timeSlots')
      .isArray({ min: 1 })
      .withMessage('timeSlots must be a non-empty array'),
    body('timeSlots.*')
      .matches(/^([1-9]|1[0-2]):([0-5][0-9])\s(AM|PM)$/i)
      .withMessage('Each timeSlot must be in format "HH:MM AM/PM" (e.g., "5:00 PM", "12:00 PM", "9:30 AM")'),
    body('mode')
      .isIn(['CS', 'BR', 'LW'])
      .withMessage('mode must be "CS", "BR", or "LW"'),
    body('subModes')
      .optional()
      .custom((value, { req }) => {
        const mode = req.body.mode;
        // subModes is optional for CS and LW, but required for BR
        if (mode === 'BR') {
          if (!value || !Array.isArray(value) || value.length === 0) {
            throw new Error('subModes is required and must be a non-empty array for BR mode');
          }
        }
        // For CS and LW, subModes can be empty/undefined (optional)
        if (value !== undefined && value !== null) {
          if (!Array.isArray(value)) {
            throw new Error('subModes must be an array');
          }
        }
        return true;
      }),
    body('subModes.*')
      .custom((value, { req }) => {
        const mode = req.body.mode;
        if (mode === 'CS') {
          return true;
        }
        if (mode === 'BR') {
          return ['solo', 'duo', 'squad'].includes(value);
        }
        if (mode === 'LW') {
          return ['solo', 'duo', 'squad', '1v1', '2v2'].includes(value);
        }
        return false;
      })
      .withMessage('subMode must be valid for the selected mode (CS: not needed | BR: solo, duo, squad | LW: solo, duo, squad, 1v1, 2v2)'),
    body('price')
      .optional()
      .isInt({ min: 1 })
      .isIn([25, 50, 75, 100, 150, 200, 300])
      .withMessage('price must be one of: 25, 50, 75, 100, 150, 200, 300'),
    body('entryFees')
      .optional()
      .isArray()
      .withMessage('entryFees must be an array'),
    body('entryFees.*')
      .optional()
      .isInt({ min: 1 })
      .isIn([25, 50, 75, 100, 150, 200, 300])
      .withMessage('Each entryFee must be one of: 25, 50, 75, 100, 150, 200, 300'),
    body('totalMatches')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('totalMatches must be an integer (CS: 1 only)'),
    body('game')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 120 }),
    body('games').optional().isArray(),
    body('games.*').optional().isString().trim().notEmpty(),
    body('lobbyName').optional().isString().trim().isLength({ max: 120 })
  ],
  validate,
  generateLobbies
);

router.get(
  '/tournaments/:tournamentId/hosts',
  authenticate,
  isAdmin,
  getHostsForTournament
);

router.post(
  '/assign-host',
  authenticate,
  isAdmin,
  [
    body('tournamentId')
      .notEmpty()
      .withMessage('tournamentId is required'),
    body('hostId')
      .notEmpty()
      .withMessage('hostId is required')
  ],
  validate,
  assignHost
);

router.get(
  '/users',
  authenticate,
  isAdmin,
  listUsers
);

router.post(
  '/users/block',
  authenticate,
  isAdmin,
  [
    body('userIds')
      .isArray({ min: 1 })
      .withMessage('userIds array with at least one user ID is required'),
    body('userIds.*')
      .isMongoId()
      .withMessage('Each userId must be a valid MongoDB ID')
  ],
  validate,
  blockUsers
);

router.post(
  '/users/unblock',
  authenticate,
  isAdmin,
  [
    body('userIds')
      .isArray({ min: 1 })
      .withMessage('userIds array with at least one user ID is required'),
    body('userIds.*')
      .isMongoId()
      .withMessage('Each userId must be a valid MongoDB ID')
  ],
  validate,
  unblockUsers
);

router.post(
  '/hosts/create',
  authenticate,
  isAdmin,
  [
    body('email')
      .isEmail()
      .withMessage('Valid email is required'),
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters')
  ],
  validate,
  createHost
);

/** SSE — new host applications; use Bearer or ?access_token= for EventSource */
router.get(
  '/host-applications/stream',
  authenticateAdminSse,
  streamAdminHostApplications
);

router.get(
  '/host-applications',
  authenticate,
  isAdmin,
  listHostApplications
);

router.post(
  '/host-applications/:applicationId/approve',
  authenticate,
  isAdmin,
  approveHostApplication
);

router.post(
  '/host-applications/:applicationId/reject',
  authenticate,
  isAdmin,
  rejectHostApplication
);

router.get(
  '/tournaments',
  authenticate,
  isAdmin,
  listTournaments
);

router.put(
  '/tournaments/:tournamentId',
  authenticate,
  isAdmin,
  [
    body('date')
      .optional()
      .isISO8601()
      .withMessage('date must be a valid date in ISO format (YYYY-MM-DD)'),
    body('startTime')
      .optional()
      .matches(/^([1-9]|1[0-2]):([0-5][0-9])\s(AM|PM)$/i)
      .withMessage('startTime must be in format "HH:MM AM/PM" (e.g., "5:00 PM", "12:00 PM", "9:30 AM")'),
    body('entryFee')
      .optional()
      .isInt({ min: 1 })
      .isIn([25, 50, 75, 100, 150, 200, 300])
      .withMessage('entryFee must be one of: 25, 50, 75, 100, 150, 200, 300'),
    body('maxPlayers')
      .optional()
      .isInt({ min: 1 })
      .withMessage('maxPlayers must be at least 1'),
    body('region')
      .optional()
      .isIn(['Asia', 'Global'])
      .withMessage('region must be "Asia" or "Global"'),
    body('mode')
      .optional()
      .isIn(['CS', 'BR', 'LW'])
      .withMessage('mode must be "CS", "BR", or "LW"'),
    body('subMode')
      .optional()
      .isIn(['1v1', '2v2', '4v4', '7round', '13round', 'clash', 'solo', 'duo', 'squad'])
      .withMessage('subMode must be valid')
  ],
  validate,
  editTournament
);

router.delete(
  '/tournaments/:tournamentId',
  authenticate,
  isAdmin,
  deleteTournament
);

router.post(
  '/tournaments/:tournamentId/update-room',
  authenticate,
  isAdmin,
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
  isAdmin,
  notifyLobbyFilling
);

router.post(
  '/notifications/send',
  authenticate,
  isAdmin,
  [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Title is required')
      .isLength({ max: 200 })
      .withMessage('Title cannot exceed 200 characters'),
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ max: 1000 })
      .withMessage('Message cannot exceed 1000 characters')
  ],
  validate,
  sendCustomNotification
);

router.get(
  '/hosts',
  authenticate,
  isAdmin,
  listHosts
);

router.get(
  '/hosts/statistics',
  authenticate,
  isAdmin,
  getHostStatistics
);

router.get(
  '/topup-transactions',
  authenticate,
  isAdmin,
  getTopupTransactions
);

router.get(
  '/payments/pending',
  authenticate,
  isAdmin,
  getPendingPayments
);

router.post(
  '/topup-transactions/:transactionId/update-status',
  authenticate,
  isAdmin,
  [
    body('status')
      .notEmpty()
      .withMessage('status is required')
      .isIn(['success', 'fail'])
      .withMessage('status must be either "success" or "fail"')
  ],
  validate,
  updateTransactionStatus
);

router.get(
  '/withdrawals',
  authenticate,
  isAdmin,
  getWithdrawalRequests
);

router.patch(
  '/withdrawals/:transactionId/status',
  authenticate,
  isAdmin,
  [
    body('status')
      .notEmpty()
      .withMessage('status is required')
      .isIn(['success', 'fail'])
      .withMessage('status must be either "success" or "fail"')
  ],
  validate,
  updateWithdrawalStatus
);

router.get(
  '/transactions/search-by-utr',
  authenticate,
  isAdmin,
  searchTransactionByUTR
);

router.post(
  '/transactions/verify-by-utr',
  authenticate,
  isAdmin,
  [
    body('utr')
      .notEmpty()
      .withMessage('utr is required')
      .trim(),
    body('amountINR')
      .notEmpty()
      .withMessage('amountINR is required')
      .isFloat({ min: 0.01 })
      .withMessage('amountINR must be greater than 0'),
    body('bankReference')
      .optional()
      .trim()
  ],
  validate,
  verifyPaymentByUTR
);

router.post(
  '/transactions/:transactionId/add-bank-reference',
  authenticate,
  isAdmin,
  [
    body('bankReference')
      .notEmpty()
      .withMessage('bankReference is required')
      .trim()
  ],
  validate,
  addBankReference
);

router.post(
  '/transactions/bulk-verify-from-statement',
  authenticate,
  isAdmin,
  upload.single('file'),
  [
    body('autoVerify')
      .optional()
      .isBoolean()
      .withMessage('autoVerify must be a boolean')
  ],
  validate,
  bulkVerifyFromStatement
);

router.post(
  '/transactions/verify-from-api',
  authenticate,
  isAdmin,
  [
    body('utr')
      .notEmpty()
      .withMessage('utr is required')
      .trim(),
    body('amountINR')
      .notEmpty()
      .withMessage('amountINR is required')
      .isFloat({ min: 0.01 })
      .withMessage('amountINR must be greater than 0'),
    body('bankReference')
      .optional()
      .trim()
  ],
  validate,
  verifyFromExternalAPI
);

router.get(
  '/inquiries',
  authenticate,
  isAdmin,
  getInquiries
);

router.get(
  '/inquiries/:inquiryId',
  authenticate,
  isAdmin,
  getInquiryById
);

router.patch(
  '/inquiries/:inquiryId/status',
  authenticate,
  isAdmin,
  [
    body('status')
      .notEmpty()
      .withMessage('status is required')
      .isIn(['new', 'read', 'replied', 'resolved'])
      .withMessage('status must be one of: new, read, replied, resolved'),
    body('adminNotes')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Admin notes cannot exceed 1000 characters')
  ],
  validate,
  updateInquiryStatus
);

router.post(
  '/inquiries/:inquiryId/reply',
  authenticate,
  isAdmin,
  [
    body('replyMessage')
      .trim()
      .notEmpty()
      .withMessage('Reply message is required')
      .isLength({ min: 10, max: 5000 })
      .withMessage('Reply message must be between 10 and 5000 characters')
  ],
  validate,
  replyToInquiry
);

router.delete(
  '/inquiries/:inquiryId',
  authenticate,
  isAdmin,
  deleteInquiry
);

router.get(
  '/support/tickets',
  authenticate,
  isAdmin,
  getAdminTickets
);

router.patch(
  '/support/tickets/:ticketId',
  authenticate,
  isAdmin,
  [
    body('status')
      .optional()
      .isIn(['open', 'closed'])
      .withMessage('Invalid status'),
    body('resolution')
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage('Resolution cannot exceed 5000 characters'),
    body('adminNotes')
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Admin notes cannot exceed 2000 characters')
  ],
  validate,
  updateAdminTicket
);

router.post(
  '/support/tickets/:ticketId/reply',
  authenticate,
  isAdmin,
  [
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message must be between 1 and 5000 characters')
  ],
  validate,
  replyToTicketAsAdmin
);

router.get(
  '/payments/verification-stats',
  authenticate,
  isAdmin,
  getVerificationStats
);

router.get(
  '/dashboard/stats',
  authenticate,
  isAdmin,
  getDashboardStats
);

/** SSE — same stats payload as GET /dashboard/stats; use Bearer or ?access_token= for EventSource */
router.get(
  '/dashboard/stream',
  authenticateAdminSse,
  streamAdminDashboard
);

router.get(
  '/history/lobbies',
  authenticate,
  isAdmin,
  getLobbyFinancialHistory
);

router.get(
  '/stats',
  authenticate,
  isAdmin,
  getDashboardStats
);

router.get(
  '/analytics',
  authenticate,
  isAdmin,
  getAnalytics
);

router.get(
  '/payments/flagged',
  authenticate,
  isAdmin,
  getFlaggedTransactions
);

router.post(
  '/payments/process-email',
  authenticate,
  isAdmin,
  [
    body('maxEmails')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('maxEmails must be between 1 and 100')
  ],
  validate,
  processEmailManually
);

router.get(
  '/payments/bank-statements',
  authenticate,
  isAdmin,
  getBankStatements
);

// ---------------------------------------------------------------------------
// Organization management (Admin only)
// ---------------------------------------------------------------------------

router.post(
  '/organizations',
  authenticate,
  isAdmin,
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('name is required'),
    body('manager')
      .notEmpty()
      .withMessage('manager object is required'),
    body('manager.email')
      .isEmail()
      .withMessage('Valid manager.email is required'),
    body('manager.name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('manager.name must be between 2 and 100 characters'),
    body('manager.password')
      .isLength({ min: 6 })
      .withMessage('manager.password must be at least 6 characters')
  ],
  validate,
  createOrganization
);

router.get(
  '/organizations',
  authenticate,
  isAdmin,
  listOrganizations
);

router.patch(
  '/organizations/:orgId/manager',
  authenticate,
  isAdmin,
  [
    body('newManagerUserId')
      .notEmpty()
      .withMessage('newManagerUserId is required')
  ],
  validate,
  updateOrgPrimaryManager
);

router.patch(
  '/organizations/:orgId/block',
  authenticate,
  isAdmin,
  blockOrganization
);

router.patch(
  '/organizations/:orgId/unblock',
  authenticate,
  isAdmin,
  unblockOrganization
);

module.exports = router;
