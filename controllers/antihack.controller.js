const path = require('path');
const { HTTP_STATUS } = require(path.join(__dirname, '../constants'));
const { asyncHandler } = require(path.join(__dirname, '../utils/response.helper'));
const { checkBanned } = require(path.join(__dirname, '../services/antihack.service'));

/**
 * GET /api/antihack/check-banned?uid=43060783
 * Proxies to ff.garena.com ban-check API. lang is always "en".
 * Returns upstream JSON as-is for frontend to show user ban history.
 */
const getCheckBanned = asyncHandler(async (req, res) => {
  const uid = req.query.uid;
  const { data } = await checkBanned(uid, 'en');

  // Return upstream response as-is: { status: "success", msg: "", data: { is_banned, period } }
  res.status(HTTP_STATUS.OK).json(data);
});

module.exports = {
  getCheckBanned,
};
