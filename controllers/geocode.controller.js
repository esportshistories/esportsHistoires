/**
 * Geocode proxy — reverse lookup for address map picker (OSM Nominatim via server).
 */

const path = require('path');
const { HTTP_STATUS, MESSAGES } = require(path.join(__dirname, '../constants'));
const { asyncHandler } = require(path.join(__dirname, '../utils/response.helper'));
const { reverseGeocodeWithNominatim } = require(path.join(__dirname, '../services/nominatimGeocode.service'));

const pickAddressParts = (addr) => {
  if (!addr || typeof addr !== 'object') return {};
  const keys = [
    'house_number',
    'road',
    'neighbourhood',
    'suburb',
    'city',
    'town',
    'village',
    'municipality',
    'county',
    'state',
    'postcode',
    'country',
    'country_code'
  ];
  const out = {};
  for (const k of keys) {
    if (addr[k] != null && addr[k] !== '') out[k] = addr[k];
  }
  return out;
};

/**
 * GET /api/geocode/reverse?lat=&lon=&acceptLanguage=
 */
const getReverseGeocode = asyncHandler(async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.badRequest('Query params lat and lon must be valid numbers.');
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.badRequest('lat must be between -90 and 90, lon between -180 and 180.');
  }

  const acceptLanguage =
    req.query.acceptLanguage != null
      ? String(req.query.acceptLanguage)
      : req.headers['accept-language'];

  const result = await reverseGeocodeWithNominatim(lat, lon, { acceptLanguage });

  if (!result.ok) {
    const status =
      result.status === 404
        ? HTTP_STATUS.NOT_FOUND
        : result.status === 429
          ? HTTP_STATUS.TOO_MANY_REQUESTS
          : 502;
    if (status === HTTP_STATUS.NOT_FOUND && res.notFound) {
      return res.notFound(result.message);
    }
    return res.status(status).json({
      status,
      success: false,
      message: result.message
    });
  }

  const { display_name: displayName, address, lat: rLat, lon: rLon, place_id: placeId } = result.data;

  return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.GEOCODE_REVERSE, {
    displayName: displayName || null,
    lat: rLat != null ? parseFloat(rLat) : lat,
    lon: rLon != null ? parseFloat(rLon) : lon,
    placeId: placeId != null ? placeId : null,
    address: pickAddressParts(address)
  });
});

module.exports = {
  getReverseGeocode
};
