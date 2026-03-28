/**
 * Reverse geocode via Nominatim (OpenStreetMap).
 * Called only from our backend proxy — not from clients — to satisfy CORS, hide upstream, and send a proper User-Agent.
 *
 * @see https://operations.osmfoundation.org/policies/nominatim/
 * Production: set NOMINATIM_USER_AGENT to identify your app with contact (required by policy).
 */

const Logger = require('../utils/logger');

const NOMINATIM_BASE = (process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  'BooyahXBackend/1.0 (reverse-geocode-proxy; set NOMINATIM_USER_AGENT in production)';

const MIN_GAP_MS = 1100;
let nextOutboundAt = 0;
let throttleChain = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Serialize outbound calls and enforce ~1 request/second to public Nominatim (policy-friendly).
 */
function withNominatimThrottle(fn) {
  const run = throttleChain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, nextOutboundAt - now);
    if (wait > 0) await sleep(wait);
    nextOutboundAt = Date.now() + MIN_GAP_MS;
    return fn();
  });
  throttleChain = run.catch(() => {});
  return run;
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {{ acceptLanguage?: string }} [opts]
 * @returns {Promise<{ ok: true, data: object } | { ok: false, status: number, message: string }>}
 */
async function reverseGeocodeWithNominatim(lat, lon, opts = {}) {
  const acceptLanguage = opts.acceptLanguage && String(opts.acceptLanguage).trim().slice(0, 80);

  return withNominatimThrottle(async () => {
    const params = new URLSearchParams({
      format: 'json',
      lat: String(lat),
      lon: String(lon),
      addressdetails: '1',
      zoom: '18'
    });

    const url = `${NOMINATIM_BASE}/reverse?${params.toString()}`;
    const headers = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    };
    if (acceptLanguage) {
      headers['Accept-Language'] = acceptLanguage;
    }

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15000)
      });
    } catch (err) {
      Logger.warn('Nominatim reverse request failed', { message: err.message });
      return { ok: false, status: 502, message: 'Geocoding service unreachable. Try again or edit address manually.' };
    }

    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      Logger.warn('Nominatim reverse non-JSON response', { status: response.status });
      return { ok: false, status: 502, message: 'Invalid response from geocoding service.' };
    }

    if (response.status === 429) {
      return { ok: false, status: 429, message: 'Geocoding rate limited. Wait a moment and try again.' };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status >= 400 && response.status < 600 ? response.status : 502,
        message: json?.error || 'Geocoding request failed.'
      };
    }

    if (!json || json.error) {
      return {
        ok: false,
        status: 404,
        message: typeof json?.error === 'string' ? json.error : 'No address found for this location.'
      };
    }

    return { ok: true, data: json };
  });
}

module.exports = {
  reverseGeocodeWithNominatim,
  NOMINATIM_BASE
};
