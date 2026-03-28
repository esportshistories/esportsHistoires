/**
 * Profile Routes
 * Defines all profile-related API endpoints
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, query, param } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const {
  getProfile,
  updateProfile,
  uploadProfileAvatar,
  getGameOptions,
  updateFCMToken,
  getDashboardFeed,
  patchFollowedGames,
  patchGameProfile,
  deleteGameProfile,
  addSavedAddress,
  patchSavedAddress,
  deleteSavedAddress,
  patchDefaultAddressByIndex
} = require('../controllers/profile.controller');

const router = express.Router();

// Multer: keep file in memory only — POST /avatar streams to Cloudinary (no disk staging).
const avatarStorage = multer.memoryStorage();

const avatarFileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname || '').toLowerCase();
  const extOk = !ext || allowedExt.includes(ext);
  if (allowedMimes.includes(file.mimetype) && extOk) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, or WEBP images are allowed'), false);
  }
};

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: {
    fileSize: 1 * 1024 * 1024 // 1MB limit
  }
});

const avatarUploadAny = (req, res, next) => {
  uploadAvatar.any()(req, res, (err) => {
    if (!err) return next();
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.badRequest('Image must be 1MB or smaller');
    }
    return res.badRequest(err.message || 'Invalid image upload');
  });
};

router.get(
  '/',
  authenticate,
  getProfile
);

router.post(
  '/avatar',
  authenticate,
  avatarUploadAny,
  uploadProfileAvatar
);

router.get(
  '/game-options',
  authenticate,
  getGameOptions
);

router.get(
  '/dashboard',
  authenticate,
  [
    query('status')
      .optional()
      .isIn(['upcoming', 'live', 'completed', 'pendingResult', 'cancelled'])
      .withMessage('Invalid status')
  ],
  validate,
  getDashboardFeed
);

router.post(
  '/fcm-token',
  authenticate,
  [
    body('fcmToken')
      .notEmpty()
      .withMessage('fcmToken is required')
      .trim()
  ],
  validate,
  updateFCMToken
);

router.patch(
  '/followed-games',
  authenticate,
  [
    body('followedGames').optional().isArray(),
    body('gameProfiles').optional().isArray(),
    body().custom((_, { req }) => {
      const a = req.body.followedGames;
      const b = req.body.gameProfiles;
      const okA = Array.isArray(a) && a.length > 0;
      const okB = Array.isArray(b) && b.length > 0;
      if (!okA && !okB) {
        throw new Error('followedGames or gameProfiles must be a non-empty array');
      }
      return true;
    })
  ],
  validate,
  patchFollowedGames
);

router.patch(
  '/game-profile',
  authenticate,
  [
    body('platform')
      .optional()
      .isIn(['mobile', 'pc'])
      .withMessage('platform must be mobile or pc'),
    body('game').optional().isString().withMessage('game must be a string'),
    body('gameId').optional().isString().withMessage('gameId must be a string'),
    body('gameName').optional().isString().withMessage('gameName must be a string'),
    body('uid').optional({ nullable: true }),
    body('gameUid').optional({ nullable: true }),
    body('clearUid').optional()
  ],
  validate,
  patchGameProfile
);

router.delete(
  '/game-profile',
  authenticate,
  [
    body('action')
      .optional()
      .isIn(['removeGame', 'clearUid'])
      .withMessage('action must be removeGame or clearUid'),
    body('platform')
      .optional()
      .isIn(['mobile', 'pc'])
      .withMessage('platform must be mobile or pc'),
    body('game').optional().isString().withMessage('game must be a string'),
    body('gameId').optional().isString().withMessage('gameId must be a string'),
    body('gameName').optional().isString().withMessage('gameName must be a string')
  ],
  validate,
  deleteGameProfile
);

router.put(
  '/',
  authenticate,
  [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('phoneNumber')
      .optional()
      .trim()
      .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
      .withMessage('Please provide a valid phone number'),
    body('gender')
      .optional()
      .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
      .withMessage('Gender must be one of: male, female, other, prefer_not_to_say'),
    body('dateOfBirth')
      .optional({ nullable: true, checkFalsy: true })
      .isISO8601()
      .withMessage('dateOfBirth must be a valid date (ISO 8601)'),
    body('mergeFollowedGames')
      .optional()
      .isBoolean()
      .withMessage('mergeFollowedGames must be boolean'),
    body('followedGames')
      .optional()
      .isArray()
      .withMessage('followedGames must be an array'),
    body('selectedGames')
      .optional()
      .isArray()
      .withMessage('selectedGames must be an array (alias of followedGames)'),
    body('gameProfiles')
      .optional()
      .isArray()
      .withMessage('gameProfiles must be an array'),
    body('followedGames.*.platform')
      .optional()
      .isIn(['mobile', 'pc'])
      .withMessage('followedGames[].platform must be mobile or pc'),
    body('followedGames.*.game')
      .optional()
      .isString()
      .withMessage('followedGames[].game must be a string'),
    body('followedGames.*.uid')
      .optional({ nullable: true })
      .isString()
      .withMessage('followedGames[].uid must be a string'),
    body('followedGames.*.selected')
      .optional()
      .isBoolean()
      .withMessage('followedGames[].selected must be boolean'),
    body('selectedGames.*.platform')
      .optional()
      .isIn(['mobile', 'pc'])
      .withMessage('selectedGames[].platform must be mobile or pc'),
    body('selectedGames.*.game')
      .optional()
      .isString()
      .withMessage('selectedGames[].game must be a string'),
    body('selectedGames.*.uid')
      .optional({ nullable: true })
      .isString()
      .withMessage('selectedGames[].uid must be a string'),
    body('selectedGames.*.selected')
      .optional()
      .isBoolean()
      .withMessage('selectedGames[].selected must be boolean'),
    body('followedOrganizations')
      .optional({ nullable: true })
      .isArray()
      .withMessage('followedOrganizations must be an array'),
    body('followedOrganizations.*')
      .optional()
      .isString()
      .withMessage('followedOrganizations entries must be strings'),
    body('followedPersonalities')
      .optional({ nullable: true })
      .isArray()
      .withMessage('followedPersonalities must be an array'),
    body('selectedEsportsOrganizations')
      .optional({ nullable: true })
      .isArray()
      .withMessage('selectedEsportsOrganizations must be an array'),
    body('selectedEsportsOrganizations.*')
      .optional()
      .isString()
      .withMessage('selectedEsportsOrganizations entries must be strings'),
    body('selectedEsportsPersonalities')
      .optional({ nullable: true })
      .isArray()
      .withMessage('selectedEsportsPersonalities must be an array'),
    body('selectedOrganizations')
      .optional({ nullable: true })
      .isArray()
      .withMessage('selectedOrganizations must be an array'),
    body('selectedPersonalities')
      .optional({ nullable: true })
      .isArray()
      .withMessage('selectedPersonalities must be an array'),
    body('address')
      .optional()
      .isObject()
      .withMessage('address must be an object'),
    body('address.addressLine1')
      .optional({ nullable: true })
      .isString()
      .withMessage('address.addressLine1 must be a string'),
    body('address.addressLine2')
      .optional({ nullable: true })
      .isString()
      .withMessage('address.addressLine2 must be a string'),
    body('address.city')
      .optional({ nullable: true })
      .isString()
      .withMessage('address.city must be a string'),
    body('address.state')
      .optional({ nullable: true })
      .isString()
      .withMessage('address.state must be a string'),
    body('address.pincode')
      .optional({ nullable: true })
      .isString()
      .withMessage('address.pincode must be a string'),
    body('address.contactNumber')
      .optional({ nullable: true })
      .isString()
      .withMessage('address.contactNumber must be a string'),
    body('address.countryCode')
      .optional({ nullable: true })
      .isString()
      .withMessage('address.countryCode must be a string'),
    body('paymentUPI')
      .optional({ nullable: true })
      .customSanitizer(v => (typeof v === 'string' ? v.trim() : v))
      .custom((value) => {
        // Allow clearing UPI: null or empty string.
        if (value === null || value === undefined || value === '') return true;
        if (typeof value !== 'string') {
          throw new Error('Please provide a valid UPI ID (format: name@bank)');
        }
        if (!/^[\w.-]+@[\w]+$/.test(value)) {
          throw new Error('Please provide a valid UPI ID (format: name@bank)');
        }
        return true;
      }),

    // Multiple UPI IDs support (same old endpoint)
    body('paymentUPIAdd')
      .optional()
      .customSanitizer(v => (typeof v === 'string' ? v.trim() : v))
      .matches(/^[\w.-]+@[\w]+$/)
      .withMessage('Please provide a valid UPI ID (format: name@bank)'),
    body('paymentUPIUpdate')
      .optional()
      .isObject()
      .withMessage('paymentUPIUpdate must be an object'),
    body('paymentUPIUpdate.upiEntryId')
      .optional()
      .isMongoId()
      .withMessage('paymentUPIUpdate.upiEntryId must be a valid id'),
    body('paymentUPIUpdate.upiId')
      .optional()
      .customSanitizer(v => (typeof v === 'string' ? v.trim() : v))
      .matches(/^[\w.-]+@[\w]+$/)
      .withMessage('Please provide a valid UPI ID (format: name@bank)'),
    body('paymentUPIDelete')
      .optional()
      .isObject()
      .withMessage('paymentUPIDelete must be an object'),
    body('paymentUPIDelete.upiEntryId')
      .optional()
      .isMongoId()
      .withMessage('paymentUPIDelete.upiEntryId must be a valid id'),
    body('selectedPaymentUPIId')
      .optional({ nullable: true })
      .custom((v) => {
        if (v === null || v === undefined || v === '') return true;
        if (!/^[a-fA-F0-9]{24}$/.test(String(v))) {
          throw new Error('selectedPaymentUPIId must be a valid id');
        }
        return true;
      }),
    body('paymentUPIs')
      .optional({ nullable: true })
      .custom((v) => {
        if (v === null) return true;
        if (!Array.isArray(v)) throw new Error('paymentUPIs must be an array');
        if (v.length > 10) throw new Error('paymentUPIs can have max 10 items');
        for (const item of v) {
          const raw =
            typeof item === 'string'
              ? item
              : (item && typeof item === 'object' && item.upiId !== undefined)
                ? item.upiId
                : item;
          const s = (typeof raw === 'string' ? raw : String(raw || '')).trim();
          if (s === '' || !/^[\w.-]+@[\w]+$/.test(s)) {
            throw new Error('Each paymentUPIs entry must be a valid UPI ID (format: name@bank)');
          }
        }
        return true;
      })
    ,
    body('profileImageUploadId')
      .optional({ nullable: true })
  ],
  validate,
  updateProfile
);

router.post(
  '/addresses',
  authenticate,
  [
    body('addressLine1')
      .trim()
      .notEmpty()
      .withMessage('addressLine1 is required'),
    body('addressLine2')
      .optional({ nullable: true })
      .isString()
      .withMessage('addressLine2 must be a string'),
    body('city')
      .optional({ nullable: true })
      .isString()
      .withMessage('city must be a string'),
    body('state')
      .optional({ nullable: true })
      .isString()
      .withMessage('state must be a string'),
    body('pincode')
      .optional({ nullable: true })
      .isString()
      .withMessage('pincode must be a string'),
    body('contactNumber')
      .optional({ nullable: true })
      .isString()
      .withMessage('contactNumber must be a string'),
    body('countryCode')
      .optional({ nullable: true })
      .isString()
      .withMessage('countryCode must be a string'),
    body('label')
      .optional({ nullable: true })
      .isString()
      .withMessage('label must be a string'),
    body('setDefault')
      .optional()
      .isBoolean()
      .withMessage('setDefault must be boolean'),
    body('lat')
      .optional({ nullable: true })
      .isFloat({ min: -90, max: 90 })
      .withMessage('lat must be a number between -90 and 90'),
    body('lng')
      .optional({ nullable: true })
      .isFloat({ min: -180, max: 180 })
      .withMessage('lng must be a number between -180 and 180')
  ],
  validate,
  addSavedAddress
);

router.patch(
  '/addresses/default-index',
  authenticate,
  [
    body('index')
      .optional()
      .isInt({ min: 0 })
      .withMessage('index must be a non-negative integer'),
    body('defaultIndex')
      .optional()
      .isInt({ min: 0 })
      .withMessage('defaultIndex must be a non-negative integer'),
    body().custom((_, { req }) => {
      const hasI = req.body && Object.prototype.hasOwnProperty.call(req.body, 'index');
      const hasD = req.body && Object.prototype.hasOwnProperty.call(req.body, 'defaultIndex');
      if (!hasI && !hasD) {
        throw new Error('Send index or defaultIndex (0-based position in GET profile addresses array)');
      }
      if (hasI && hasD && Number(req.body.index) !== Number(req.body.defaultIndex)) {
        throw new Error('index and defaultIndex must match if both are sent');
      }
      return true;
    })
  ],
  validate,
  patchDefaultAddressByIndex
);

router.patch(
  '/addresses/:addressId',
  authenticate,
  [
    param('addressId')
      .isMongoId()
      .withMessage('addressId must be a valid id'),
    body('addressLine1')
      .optional({ nullable: true })
      .isString()
      .withMessage('addressLine1 must be a string'),
    body('addressLine2')
      .optional({ nullable: true })
      .isString()
      .withMessage('addressLine2 must be a string'),
    body('city')
      .optional({ nullable: true })
      .isString()
      .withMessage('city must be a string'),
    body('state')
      .optional({ nullable: true })
      .isString()
      .withMessage('state must be a string'),
    body('pincode')
      .optional({ nullable: true })
      .isString()
      .withMessage('pincode must be a string'),
    body('contactNumber')
      .optional({ nullable: true })
      .isString()
      .withMessage('contactNumber must be a string'),
    body('countryCode')
      .optional({ nullable: true })
      .isString()
      .withMessage('countryCode must be a string'),
    body('label')
      .optional({ nullable: true })
      .isString()
      .withMessage('label must be a string'),
    body('setDefault')
      .optional()
      .isBoolean()
      .withMessage('setDefault must be boolean')
  ],
  validate,
  patchSavedAddress
);

router.delete(
  '/addresses/:addressId',
  authenticate,
  [
    param('addressId')
      .isMongoId()
      .withMessage('addressId must be a valid id')
  ],
  validate,
  deleteSavedAddress
);

module.exports = router;
