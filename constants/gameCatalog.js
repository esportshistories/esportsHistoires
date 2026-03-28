/**
 * Supported games for profiles, tournaments, and admin lobby generation.
 * Single place for catalogue + slug resolution (keeps spelling consistent).
 */

const GAME_OPTIONS = {
  mobile: [
    'BGMI',
    'Free Fire',
    'COC',
    'COD Mobile',
    'MLBB',
    'Clash Royale',
    'Brawl Stars',
    'Wild Rift',
    'Pokemon UNITE',
    'EA FC Mobile'
  ],
  pc: [
    'Valorant',
    'CS2',
    'Dota 2',
    'PUBG PC',
    'Fortnite',
    'Apex Legends',
    'League of Legends',
    'Rainbow Six Siege',
    'Rocket League',
    'Overwatch 2',
    'EA FC',
    'Tekken 8',
    'Street Fighter 6',
    'Marvel Rivals',
    'StarCraft II'
  ]
};

/** Extra slug -> { platform, game } for legacy clients and short IDs */
const GAME_SLUG_ALIASES = {
  bgmi: { platform: 'mobile', game: 'BGMI' },
  'free-fire': { platform: 'mobile', game: 'Free Fire' },
  freefire: { platform: 'mobile', game: 'Free Fire' },
  coc: { platform: 'mobile', game: 'COC' },
  'clash-of-clans': { platform: 'mobile', game: 'COC' },
  'cod-mobile': { platform: 'mobile', game: 'COD Mobile' },
  codm: { platform: 'mobile', game: 'COD Mobile' },
  mlbb: { platform: 'mobile', game: 'MLBB' },
  'mobile-legends': { platform: 'mobile', game: 'MLBB' },
  valorant: { platform: 'pc', game: 'Valorant' },
  cs2: { platform: 'pc', game: 'CS2' },
  csgo: { platform: 'pc', game: 'CS2' },
  'dota-2': { platform: 'pc', game: 'Dota 2' },
  dota2: { platform: 'pc', game: 'Dota 2' },
  'pubg-pc': { platform: 'pc', game: 'PUBG PC' },
  pubgpc: { platform: 'pc', game: 'PUBG PC' },
  lol: { platform: 'pc', game: 'League of Legends' },
  r6: { platform: 'pc', game: 'Rainbow Six Siege' },
  ow2: { platform: 'pc', game: 'Overwatch 2' },
  sf6: { platform: 'pc', game: 'Street Fighter 6' }
};

const slugifyGameName = (game) =>
  String(game)
    .toLowerCase()
    .replace(/:/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const buildSlugToGameMap = () => {
  const map = { ...GAME_SLUG_ALIASES };
  for (const platform of ['mobile', 'pc']) {
    for (const game of GAME_OPTIONS[platform]) {
      map[slugifyGameName(game)] = { platform, game };
    }
  }
  return map;
};

let cachedSlugToGameMap = null;
const getSlugToGameMap = () => {
  if (!cachedSlugToGameMap) {
    cachedSlugToGameMap = buildSlugToGameMap();
  }
  return cachedSlugToGameMap;
};

const canonicalizeGameName = (platform, gameInput) => {
  if (!platform || !gameInput || !GAME_OPTIONS[platform]) return null;
  const input = String(gameInput).trim().toLowerCase();
  return GAME_OPTIONS[platform].find(g => g.toLowerCase() === input) || null;
};

const canonicalizeGameNameFromAnyPlatform = (gameInput) => {
  const input = String(gameInput || '').trim().toLowerCase();
  if (!input) return null;
  for (const platform of ['mobile', 'pc']) {
    const hit = GAME_OPTIONS[platform].find(g => g.toLowerCase() === input);
    if (hit) return { platform, game: hit };
  }
  return null;
};

const slugToCanonicalGame = (gameIdInput) => {
  const slug = String(gameIdInput || '').trim().toLowerCase();
  if (!slug) return null;
  return getSlugToGameMap()[slug] || null;
};

/**
 * Resolve any raw admin/client string to a single canonical display title from GAME_OPTIONS.
 */
const resolveAnyGameTitle = (raw) => {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const fromSlug = getSlugToGameMap()[slugifyGameName(s)];
  if (fromSlug) return fromSlug.game;
  const fromAny = canonicalizeGameNameFromAnyPlatform(s);
  return fromAny ? fromAny.game : null;
};

/** Keys for Mongo $expr / comparing stored tournament.game to profile titles (spacing + case agnostic). */
const normalizeGameMatchKeysForDb = (titles) =>
  [...new Set(
    (titles || [])
      .map(t => String(t || '').trim().toLowerCase().replace(/\s+/g, ''))
      .filter(Boolean)
  )];

const matchesGameName = (storedGame, canonicalGame) => {
  const [a] = normalizeGameMatchKeysForDb([storedGame]);
  const [b] = normalizeGameMatchKeysForDb([canonicalGame]);
  return Boolean(a && b && a === b);
};

/**
 * Admin: one or more games for lobby generation. Default stays Free Fire for backward compatibility.
 * @param {string|string[]|undefined|null} games
 * @returns {string[]}
 */
const parseAdminGameTitles = (games) => {
  if (games === undefined || games === null) return ['Free Fire'];
  const arr = Array.isArray(games) ? games : [games];
  if (arr.length === 0) return ['Free Fire'];
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const title = resolveAnyGameTitle(raw);
    if (!title) {
      throw new Error(`Unknown or unsupported game: ${raw}`);
    }
    const k = title.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(title);
    }
  }
  return out;
};

module.exports = {
  GAME_OPTIONS,
  GAME_SLUG_ALIASES,
  slugifyGameName,
  getSlugToGameMap,
  canonicalizeGameName,
  canonicalizeGameNameFromAnyPlatform,
  slugToCanonicalGame,
  resolveAnyGameTitle,
  normalizeGameMatchKeysForDb,
  matchesGameName,
  parseAdminGameTitles
};
