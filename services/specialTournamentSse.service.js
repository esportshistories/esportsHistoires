/**
 * Server-Sent Events for a single special tournament — live joinedTeams / status
 * while users register (EventSource-friendly; use ?access_token= when needed).
 */

const Logger = require('../utils/logger');
const SpecialTournament = require('../models/SpecialTournament.model');
const { assertSpecialTournamentVisibleToViewer } = require('./specialTournament.service');

/** @type {Map<string, Set<{ res: import('http').ServerResponse }>>} */
const clientsByTournamentId = new Map();

function writeSse(res, eventName, dataObj) {
  const line = `event: ${eventName}\ndata: ${JSON.stringify(dataObj)}\n\n`;
  try {
    res.write(line);
  } catch (e) {
    /* connection closed */
  }
}

/**
 * Notify all browsers subscribed to this special tournament (same idea as WebSocket tournament room).
 * @param {string} tournamentId
 * @param {Object} data - e.g. { status, joinedTeams, maxSlots }
 */
function broadcastSpecialTournamentSse(tournamentId, data = {}) {
  const id = tournamentId != null ? String(tournamentId) : '';
  if (!id) return;
  const set = clientsByTournamentId.get(id);
  if (!set || set.size === 0) return;

  const body = {
    tournamentId: id,
    isSpecial: true,
    timestamp: new Date().toISOString(),
    ...data
  };

  for (const client of set) {
    writeSse(client.res, 'update', body);
  }
}

/**
 * GET /api/special-tournament/:id/stream — initial snapshot then `update` on joins (and optional future hooks).
 */
async function attachSpecialTournamentSse(req, res, tournamentId) {
  const id = tournamentId != null ? String(tournamentId) : '';
  if (!id) {
    res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('tournamentId required');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write(': connected\n\n');

  let doc;
  try {
    doc = await SpecialTournament.findById(id)
      .select('status participants maxSlots title registrationStartDate')
      .lean();
    if (!doc) {
      writeSse(res, 'error', { message: 'Special tournament not found' });
      return;
    }
    const isAdmin = req.user && req.user.role === 'admin';
    try {
      assertSpecialTournamentVisibleToViewer(doc, { userId: req.userId, isAdmin });
    } catch (visErr) {
      writeSse(res, 'error', { message: visErr.message || 'Not available' });
      return;
    }
  } catch (e) {
    writeSse(res, 'error', { message: e.message || 'Failed to load tournament' });
    return;
  }

  let set = clientsByTournamentId.get(id);
  if (!set) {
    set = new Set();
    clientsByTournamentId.set(id, set);
  }
  const client = { res };
  set.add(client);

  Logger.info('SSE: special-tournament client connected', {
    tournamentId: id,
    clientCount: set.size
  });

  writeSse(res, 'snapshot', {
    tournamentId: id,
    isSpecial: true,
    status: doc.status,
    joinedTeams: (doc.participants || []).length,
    maxSlots: doc.maxSlots,
    title: doc.title,
    timestamp: new Date().toISOString()
  });

  req.on('close', () => {
    set.delete(client);
    if (set.size === 0) {
      clientsByTournamentId.delete(id);
    }
    try {
      res.end();
    } catch (err) {
      /* ignore */
    }
    Logger.info('SSE: special-tournament client disconnected', {
      tournamentId: id,
      clientCount: set.size
    });
  });
}

module.exports = {
  attachSpecialTournamentSse,
  broadcastSpecialTournamentSse
};
