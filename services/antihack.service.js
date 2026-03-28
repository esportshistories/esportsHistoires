/**
 * Antihack / ban-check proxy service
 * Proxies requests to ff.garena.com/api/antihack/check_banned with required headers
 */

const CHECK_BANNED_BASE = 'https://ff.garena.com/api/antihack/check_banned';

/** Default headers matching browser request (cookie and x-requested-with can be overridden via env) */
const DEFAULT_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
  cookie:
    process.env.FF_GARENA_COOKIE ||
    '_ga_KE3SY7MRSD=GS2.1.s1772429343$o3$g1$t1772429343$j60$l0$h0; _gid=GA1.2.412930579.1772429344; _ga_RF9R6YT614=GS2.1.s1772429344$o3$g0$t1772429344$j60$l0$h0; _ga=GA1.1.1822255121.1771757137',
  priority: 'u=1, i',
  referer: 'https://ff.garena.com/en/support/',
  'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Linux"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'x-requested-with':
    process.env.FF_GARENA_X_REQUESTED_WITH || 'B6FksShzIgjfrYImLpTsadjS86sddhFH',
};

/**
 * Fetch ban-check result from Garena FF API for a given uid
 * @param {string} uid - User ID to check
 * @param {string} [lang='en'] - Language (default en)
 * @returns {Promise<{ data: object, status: number }>} Response data and status from upstream
 */
async function checkBanned(uid, lang = 'en') {
  const url = `${CHECK_BANNED_BASE}?lang=${encodeURIComponent(lang)}&uid=${encodeURIComponent(uid)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: DEFAULT_HEADERS,
  });

  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = { raw: await response.text() };
  }

  return { data, status: response.status };
}

module.exports = {
  checkBanned,
};
