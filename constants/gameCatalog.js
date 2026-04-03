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

/**
 * Full catalogue for admin UI (pick any title when creating lobbies).
 * @returns {{ games: Array<{ title: string, platform: 'mobile'|'pc', slug: string }> }}
 */
/**
 * If the user has any followed games, the tournament's game must match one of them.
 * If they have no followed games set, join is allowed (legacy / open profile).
 * @param {Array<{ platform: string, game: string }>} followedGroups from getUserSelectedGameGroups
 * @param {string} tournamentGame stored Tournament.game
 */
const assertUserFollowsGameForLobby = (followedGroups, tournamentGame) => {
  if (!followedGroups || followedGroups.length === 0) return;
  const title = resolveAnyGameTitle(tournamentGame);
  if (!title) {
    throw new Error('This lobby has an unsupported game configuration');
  }
  const ok = followedGroups.some((g) => matchesGameName(g.game, title));
  if (!ok) {
    throw new Error(
      `Add "${title}" to your followed games in profile to join this lobby`
    );
  }
};

const buildAdminGamesCatalogResponse = () => ({
  games: [
    ...GAME_OPTIONS.mobile.map((title) => ({
      title,
      platform: 'mobile',
      slug: slugifyGameName(title)
    })),
    ...GAME_OPTIONS.pc.map((title) => ({
      title,
      platform: 'pc',
      slug: slugifyGameName(title)
    }))
  ]
});

/**
 * Merge static catalogue with raw game strings seen in DB (tournaments, profiles).
 * Dedupes by normalized game key; prefers canonical titles from GAME_OPTIONS when resolvable.
 * @param {Array<{ title: string, platform: 'mobile'|'pc', slug: string }>} staticGames
 * @param {Array<{ title: string, platform?: 'mobile'|'pc'|null }>} additionalEntries
 * @returns {{ games: Array<{ title: string, platform: 'mobile'|'pc', slug: string }> }}
 */
const mergeAdminCatalogGames = (staticGames, additionalEntries) => {
  const normKey = (title) =>
    normalizeGameMatchKeysForDb([title])[0] || slugifyGameName(title);

  const byKey = new Map();
  for (const g of staticGames) {
    byKey.set(normKey(g.title), { title: g.title, platform: g.platform, slug: g.slug });
  }

  for (const { title: raw, platform: hint } of additionalEntries) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;

    const resolved = resolveAnyGameTitle(trimmed);
    const displayTitle = resolved || trimmed;
    const key = normKey(displayTitle);

    const inferred =
      canonicalizeGameNameFromAnyPlatform(displayTitle) ||
      slugToCanonicalGame(slugifyGameName(trimmed));
    const platform =
      hint === 'mobile' || hint === 'pc'
        ? hint
        : inferred
          ? inferred.platform
          : 'mobile';

    if (!byKey.has(key)) {
      byKey.set(key, {
        title: displayTitle,
        platform,
        slug: slugifyGameName(displayTitle)
      });
    } else {
      const cur = byKey.get(key);
      if (cur.platform === 'mobile' && platform === 'pc') {
        byKey.set(key, { ...cur, platform: 'pc' });
      }
    }
  }

  const games = [...byKey.values()].sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  return { games };
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
  parseAdminGameTitles,
  buildAdminGamesCatalogResponse,
  mergeAdminCatalogGames,
  assertUserFollowsGameForLobby
};
