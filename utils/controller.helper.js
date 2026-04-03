/**
 * Controller Helper Utilities
 * Common functions and utilities used across controllers
 */

const { HTTP_STATUS, MESSAGES } = require('../constants');
const { GAME_OPTIONS } = require('../constants/gameCatalog');
const { ResponseHelper } = require('./response.helper');

/**
 * Check if user exists and return appropriate response
 * @param {Object} res - Express response object
 * @param {Object} user - User object (can be null)
 * @param {string} customMessage - Custom error message (optional)
 * @returns {boolean} True if user exists, false otherwise
 */
const checkUserExists = (res, user, customMessage = null) => {
  if (!user) {
    ResponseHelper.notFound(res, customMessage || MESSAGES.ERROR.USER_NOT_FOUND);
    return false;
  }
  return true;
};

/**
 * Check if email is verified
 * @param {Object} res - Express response object
 * @param {Object} user - User object
 * @returns {boolean} True if verified, false otherwise
 */
const checkEmailVerified = (res, user) => {
  if (!user.isEmailVerified) {
    ResponseHelper.forbidden(res, MESSAGES.ERROR.EMAIL_NOT_VERIFIED);
    return false;
  }
  return true;
};

/**
 * Build a full followed-games list from static catalogue (used for admin defaults).
 * @returns {Array<{ platform: string, game: string, uid: null, selected: boolean }>}
 */
const buildAllGamesFollowed = () => {
  const out = [];
  for (const platform of ['mobile', 'pc']) {
    for (const game of GAME_OPTIONS[platform] || []) {
      out.push({
        platform,
        game,
        uid: null,
        selected: true
      });
    }
  }
  return out;
};

/**
 * @param {Array|undefined} followedGames - gamePreference.followedGames from User
 * @returns {Array<{ platform: string|null, game: string|null, uid: string|null, selected: boolean }>}
 */
const formatFollowedGamesForAuth = (followedGames) => {
  if (!Array.isArray(followedGames) || followedGames.length === 0) {
    return [];
  }
  return followedGames.map((item) => ({
    platform: item.platform ?? null,
    game: item.game ?? null,
    uid: item.uid ?? null,
    selected: Boolean(item.selected)
  }));
};

const slugOrgId = (name) =>
  String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const formatOrganizationProfilesForAuth = (orgs) => {
  if (!Array.isArray(orgs) || !orgs.length) return [];
  return orgs.map((orgName) => ({
    orgId: slugOrgId(orgName),
    orgName
  }));
};

const formatPersonalityProfilesForAuth = (list) => {
  if (!Array.isArray(list) || !list.length) return [];
  return list.map((p) => {
    const name = p?.name ?? '';
    const knownAs = p.knownAs ?? null;
    const role = p.role ?? null;
    const idSource = knownAs || name;
    return {
      personalityId: String(idSource || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, ''),
      name,
      knownAs,
      role
    };
  });
};

/**
 * Validate and format user data for response
 * @param {Object} user - User document
 * @returns {Object} Formatted user data
 */
const formatUserData = (user) => {
  const gp = user.gamePreference;
  let followedGames = formatFollowedGamesForAuth(gp?.followedGames);

  // Admin UX: if admin has no explicit followedGames, treat all catalogue games as followed by default.
  if (user.role === 'admin' && followedGames.length === 0) {
    followedGames = buildAllGamesFollowed();
  }

  return {
    userId: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    twoFactorEnabled: Boolean(user.twoFactor?.enabled),
    followedGames,
    organizationProfiles: formatOrganizationProfilesForAuth(gp?.selectedEsportsOrganizations),
    personalityProfiles: formatPersonalityProfilesForAuth(gp?.selectedEsportsPersonalities)
  };
};

/**
 * Standard auth success payload (login, OTP verify, Google login, refresh).
 * `role` is duplicated at root so clients can route UI without reading nested `user`.
 */
const buildAuthResponseData = (user, accessToken, refreshToken) => ({
  accessToken,
  refreshToken,
  user: formatUserData(user),
  role: user.role
});

/**
 * Validate OTP
 * @param {Object} res - Express response object
 * @param {Object} user - User object
 * @param {string} otp - OTP code to validate
 * @param {Function} isOTPExpired - Function to check if OTP is expired
 * @returns {boolean} True if valid, false otherwise
 */
const validateOTP = (res, user, otp, isOTPExpired) => {
  // Check if OTP exists
  if (!user.otp || !user.otp.code) {
    ResponseHelper.badRequest(res, MESSAGES.ERROR.NO_OTP);
    return false;
  }

  // Check if OTP is expired
  if (isOTPExpired(user.otp.expiresAt)) {
    ResponseHelper.badRequest(res, MESSAGES.ERROR.OTP_EXPIRED);
    return false;
  }

  // Verify OTP
  if (user.otp.code !== otp) {
    ResponseHelper.badRequest(res, MESSAGES.ERROR.INVALID_OTP);
    return false;
  }

  return true;
};

/**
 * Handle database errors dynamically
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} defaultMessage - Default error message
 */
const handleDatabaseError = (res, error, defaultMessage) => {
  const Logger = require('./logger');
  Logger.error('Database error', error);
  
  // Handle specific error types
  if (error.code === 11000) {
    // Duplicate key error (MongoDB)
    ResponseHelper.badRequest(res, 'Duplicate entry. This record already exists.');
    return;
  }
  
  if (error.name === 'ValidationError') {
    // Mongoose validation error
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));
    ResponseHelper.badRequest(res, 'Validation failed', errors);
    return;
  }
  
  // Generic error
  ResponseHelper.serverError(res, defaultMessage, error);
};

module.exports = {
  checkUserExists,
  checkEmailVerified,
  formatUserData,
  buildAuthResponseData,
  validateOTP,
  handleDatabaseError
};

