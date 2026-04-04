/**
 * SSE subscribers per tournament for live match results / standings (host updates).
 * Mirrors payload shape of WebSocket `tournament:live-results-updated`.
 */

const Logger = require('../utils/logger');
const tournamentService = require('./tournament.service');

/** @type {Map<string, Set<{ res: import('http').ServerResponse }>>} */
const clientsByTournamentId = new Map();

function writeSse(res, eventName, dataObj) {
  const line = `event: ${eventName}\ndata: ${JSON.stringify(dataObj)}\n\n`;
  try {
    res.write(line);
  } catch (e) {
    /* connection gone */
  }
}

/**
 * Push to all SSE clients watching this tournament (after host submits match or final).
 * @param {string} tournamentId
 * @param {Object} liveResultsData - matchResults, standings, matchResultsCount, status, totalMatches
 */
function broadcastTournamentLiveResultsSse(tournamentId, liveResultsData) {
  const id = tournamentId != null ? String(tournamentId) : '';
  if (!id) return;
  const set = clientsByTournamentId.get(id);
  if (!set || set.size === 0) return;

  const body = {
    tournamentId: id,
    type: 'live-results-updated',
    ...liveResultsData,
    timestamp: new Date().toISOString()
  };

  for (const client of set) {
    writeSse(client.res, 'update', body);
  }
}

/**
 * GET …/live-results/stream — keep-alive; first `snapshot` then `update` on host changes.
 */
async function attachTournamentLiveResultsSse(req, res, tournamentId) {
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

  let set = clientsByTournamentId.get(id);
  if (!set) {
    set = new Set();
    clientsByTournamentId.set(id, set);
  }
  const client = { res };
  set.add(client);

  Logger.info('SSE: live-results client connected', {
    tournamentId: id,
    clientCount: set.size
  });

  try {
    const snapshot = await tournamentService.getLiveResults(id);
    writeSse(res, 'snapshot', snapshot);
  } catch (e) {
    writeSse(res, 'error', { message: e.message || 'Failed to load live results' });
  }

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
    Logger.info('SSE: live-results client disconnected', {
      tournamentId: id,
      clientCount: set.size
    });
  });
}

module.exports = {
  broadcastTournamentLiveResultsSse,
  attachTournamentLiveResultsSse
};
