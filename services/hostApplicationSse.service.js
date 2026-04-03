/**
 * SSE: admin sees new host applications; hosts see approve/reject (and auto-reject) updates.
 */

const Logger = require('../utils/logger');

const adminClients = new Set();
const hostClientsByUserId = new Map();

function writeSse(res, eventName, dataObj) {
  const payload = typeof dataObj === 'string' ? dataObj : JSON.stringify(dataObj);
  res.write(`event: ${eventName}\ndata: ${payload}\n\n`);
}

function removeHostClient(hostUserId, res) {
  const set = hostClientsByUserId.get(hostUserId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) hostClientsByUserId.delete(hostUserId);
}

/**
 * Admin panel: new applications and optional lifecycle pings.
 * GET /api/admin/host-applications/stream
 */
function attachAdminHostApplicationsSse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write(': host applications (admin)\n\n');
  adminClients.add(res);
  Logger.info('Host application SSE: admin connected', { count: adminClients.size });

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clearInterval(ping);
    }
  }, 25000);
  if (typeof ping.unref === 'function') ping.unref();

  const onClose = () => {
    clearInterval(ping);
    adminClients.delete(res);
    Logger.info('Host application SSE: admin disconnected', { count: adminClients.size });
    try {
      res.end();
    } catch (e) {
      /* ignore */
    }
  };
  req.on('close', onClose);
}

/**
 * Host app: own application status changes.
 * GET /api/host/applications/stream
 */
function attachHostApplicationEventsSse(req, res) {
  const hostUserId = String(req.userId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write(': host application events\n\n');
  if (!hostClientsByUserId.has(hostUserId)) {
    hostClientsByUserId.set(hostUserId, new Set());
  }
  hostClientsByUserId.get(hostUserId).add(res);
  Logger.info('Host application SSE: host connected', {
    hostUserId,
    clientsForHost: hostClientsByUserId.get(hostUserId).size
  });

  writeSse(res, 'ready', { type: 'connected', hostId: hostUserId });

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clearInterval(ping);
    }
  }, 25000);
  if (typeof ping.unref === 'function') ping.unref();

  const onClose = () => {
    clearInterval(ping);
    removeHostClient(hostUserId, res);
    Logger.info('Host application SSE: host disconnected', { hostUserId });
    try {
      res.end();
    } catch (e) {
      /* ignore */
    }
  };
  req.on('close', onClose);
}

function broadcastToAdmins(eventName, payload) {
  if (adminClients.size === 0) return;
  const line = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of adminClients) {
    try {
      res.write(line);
    } catch (e) {
      adminClients.delete(res);
    }
  }
}

function broadcastToHost(hostUserId, eventName, payload) {
  const set = hostClientsByUserId.get(String(hostUserId));
  if (!set || set.size === 0) return;
  const line = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(line);
    } catch (e) {
      removeHostClient(String(hostUserId), res);
    }
  }
}

/** After host submits application (pending). */
function broadcastHostApplicationSubmittedToAdmins(applicationPayload) {
  broadcastToAdmins('host_application', {
    type: 'submitted',
    application: applicationPayload
  });
}

/** Approve / reject / auto-reject — host listens on `host_application` event. */
function broadcastHostApplicationStatusToHost(hostUserId, detail) {
  broadcastToHost(hostUserId, 'host_application', detail);
}

module.exports = {
  attachAdminHostApplicationsSse,
  attachHostApplicationEventsSse,
  broadcastHostApplicationSubmittedToAdmins,
  broadcastHostApplicationStatusToHost
};
