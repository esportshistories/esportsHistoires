/**
 * Server-Sent Events for admin dashboard stats (JWT admin only).
 * Clients receive `event: stats` with the same payload shape as GET /api/admin/dashboard/stats `data`.
 */

const Logger = require('../utils/logger');
const { fetchAdminDashboardStatsData } = require('./adminDashboardStats.service');

const clients = new Set();
let broadcastTimer = null;
let debounceTimer = null;
const BROADCAST_INTERVAL_MS = Math.max(
  15000,
  parseInt(process.env.ADMIN_DASHBOARD_SSE_INTERVAL_MS || '45000', 10) || 45000
);

function writeSse(res, eventName, dataObj) {
  const payload = typeof dataObj === 'string' ? dataObj : JSON.stringify(dataObj);
  res.write(`event: ${eventName}\ndata: ${payload}\n\n`);
}

async function pushStatsToResponse(res) {
  try {
    const data = await fetchAdminDashboardStatsData();
    writeSse(res, 'stats', { type: 'dashboard', data });
  } catch (e) {
    Logger.error('Admin dashboard SSE: failed to build stats', { message: e.message });
    writeSse(res, 'error', { message: 'Failed to load stats' });
  }
}

async function broadcastStatsToAll() {
  if (clients.size === 0) return;
  let data;
  try {
    data = await fetchAdminDashboardStatsData();
  } catch (e) {
    Logger.error('Admin dashboard SSE broadcast failed', { message: e.message });
    return;
  }
  const line = `event: stats\ndata: ${JSON.stringify({ type: 'dashboard', data })}\n\n`;
  for (const res of clients) {
    try {
      res.write(line);
    } catch (err) {
      clients.delete(res);
    }
  }
}

function ensureBroadcastInterval() {
  if (broadcastTimer != null) return;
  broadcastTimer = setInterval(() => {
    void broadcastStatsToAll();
  }, BROADCAST_INTERVAL_MS);
  if (typeof broadcastTimer.unref === 'function') broadcastTimer.unref();
}

/**
 * Attach admin SSE to an Express response (headers not set yet).
 * Caller must have verified admin on req.user.
 */
function attachAdminDashboardSse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write(': admin dashboard stream\n\n');
  clients.add(res);
  ensureBroadcastInterval();
  Logger.info('Admin dashboard SSE client connected', { count: clients.size });

  void pushStatsToResponse(res);

  const onClose = () => {
    clients.delete(res);
    Logger.info('Admin dashboard SSE client disconnected', { count: clients.size });
    try {
      res.end();
    } catch (e) {
      /* ignore */
    }
  };
  req.on('close', onClose);
}

/** Immediate refresh (all connected clients). */
function scheduleAdminDashboardSseBroadcast() {
  void broadcastStatsToAll();
}

/** Coalesce rapid wallet/tournament writes into one stats rebuild (~2s). */
function scheduleAdminDashboardSseBroadcastDebounced() {
  if (clients.size === 0) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void broadcastStatsToAll();
  }, 2000);
}

module.exports = {
  attachAdminDashboardSse,
  scheduleAdminDashboardSseBroadcast,
  scheduleAdminDashboardSseBroadcastDebounced,
  writeSse
};
