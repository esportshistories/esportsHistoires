/**
 * JWT auth for SSE where EventSource cannot set Authorization (browser).
 * Accepts `Authorization: Bearer <token>` or `?access_token=<token>` (admin only).
 */

const { verifyAccessToken } = require('../utils/jwt.service');
const User = require('../models/User.model');
const { AUTH } = require('../constants');

const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith(AUTH.BEARER_PREFIX)) {
    return authHeader.substring(AUTH.TOKEN_START_INDEX);
  }
  const q = req.query.access_token;
  if (q != null && String(q).trim() !== '') return String(q).trim();
  return null;
};

const authenticateAdminSse = async (req, res, next) => {
  const deny = (status, msg) => {
    if (!res.headersSent) {
      res.status(status);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    return res.end(msg);
  };

  try {
    const token = extractToken(req);
    if (!token) return deny(401, 'Unauthorized: missing token');

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId).select('-password -otp');

    if (!user) return deny(401, 'Unauthorized');
    if (user.role !== 'admin') return deny(403, 'Forbidden: admin only');
    if (!user.isEmailVerified) return deny(403, 'Forbidden: email not verified');

    if (decoded.sessionId) {
      const hasSession = (user.refreshTokens || []).some((s) => s.sessionId === decoded.sessionId);
      if (!hasSession) return deny(401, 'Session expired');
    }

    req.userId = user._id.toString();
    req.user = user;
    return next();
  } catch (e) {
    return deny(401, 'Unauthorized');
  }
};

module.exports = { authenticateAdminSse };
