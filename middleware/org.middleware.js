/**
 * Org Manager Middleware
 * Verifies that the authenticated user is an org manager/owner for the given organization.
 * This does NOT change any existing host/admin behaviour.
 */

const Organization = require('../models/Organization.model');
const { HTTP_STATUS, MESSAGES } = require('../constants');

/**
 * Load organization by :orgId param and attach to req.organization.
 */
const loadOrganization = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!orgId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        status: HTTP_STATUS.BAD_REQUEST,
        success: false,
        message: 'orgId is required in path'
      });
    }

    const organization = await Organization.findById(orgId);
    if (!organization || !organization.isActive) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        status: HTTP_STATUS.NOT_FOUND,
        success: false,
        message: 'Organization not found'
      });
    }

    req.organization = organization;
    next();
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || MESSAGES.ERROR.INTERNAL_ERROR
    });
  }
};

/**
 * Ensure user is org_manager (or admin) AND belongs to this organization.
 * Does not affect existing host/admin middlewares.
 */
const isOrgManagerForOrg = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        status: HTTP_STATUS.UNAUTHORIZED,
        success: false,
        message: MESSAGES.ERROR.NO_TOKEN
      });
    }

    const user = req.user;
    const organization = req.organization;

    // Admins can manage any org by design, but we don't change existing admin flows.
    if (user.role === 'admin') {
      return next();
    }

    if (user.role !== 'org_manager') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        status: HTTP_STATUS.FORBIDDEN,
        success: false,
        message: 'Unauthorized. Org manager or admin access required.'
      });
    }

    const userIdStr = user._id.toString();
    const isOwner = organization.ownerUserId && organization.ownerUserId.toString() === userIdStr;
    const isManager = (organization.managerIds || []).some(id => id.toString() === userIdStr);

    if (!isOwner && !isManager) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        status: HTTP_STATUS.FORBIDDEN,
        success: false,
        message: 'Unauthorized. You are not a manager of this organization.'
      });
    }

    next();
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || MESSAGES.ERROR.INTERNAL_ERROR
    });
  }
};

module.exports = {
  loadOrganization,
  isOrgManagerForOrg
};

