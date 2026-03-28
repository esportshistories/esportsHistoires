/**
 * Profile Controller
 * Handles user profile operations: get profile, update profile
 */

const mongoose = require('mongoose');
const User = require('../models/User.model');
const UserPaymentInfo = require('../models/UserPaymentInfo.model');
const { HTTP_STATUS, MESSAGES, GENDER_OPTIONS, AGE, ENV, MAX_SAVED_ADDRESSES } = require('../constants');
const { asyncHandler } = require('../utils/response.helper');
const { checkUserExists, handleDatabaseError } = require('../utils/controller.helper');
const Logger = require('../utils/logger');
const tournamentService = require('../services/tournament.service');
const cloudinaryService = require('../services/cloudinary.service');

const UPI_PATTERN = /^[\w.-]+@[\w]+$/;
const MAX_SAVED_UPI_IDS = 10;

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

/** Curated Indian esports orgs (teams / companies) for reference UI */
const INDIA_ESPORTS_ORGANIZATIONS = [
  'S8UL Esports',
  'GodLike Esports',
  'Team Soul',
  'Entity Gaming',
  'Orange Rock Esports',
  'Global Esports',
  'Revenant Esports',
  'Orangutan Gaming',
  'Chemin Esports',
  'Team XSpark',
  'Blind Esports',
  'Marcos Gaming',
  'Team Tamilas',
  'Team Insane Esports',
  'Waska Gaming',
  'Tranzist Esports',
  'Skylightz Gaming',
  'Carnival Gaming',
  'Enigma Gaming',
  '8Bit Creatives',
  'Velocity Gaming',
  'True Rippers Esports',
  'Medal Esports',
  'iQOO Soul',
  'Gods Reign',
  '7Sea Esports'
];

/** Notable India-linked esports / gaming figures (public-facing names) */
const INDIA_ESPORTS_PERSONALITIES = [
  { name: 'Naman Mathur', knownAs: 'Mortal', role: 'Streamer / creator' },
  { name: 'Tanmay Singh', knownAs: 'ScoutOP', role: 'Competitive player (BGMI)' },
  { name: 'Jonathan Amaral', knownAs: 'Jonathan', role: 'Competitive player (BGMI)' },
  { name: 'Aaditya Sawant', knownAs: 'Dynamo', role: 'Streamer / creator' },
  { name: 'Payal Dhare', knownAs: 'Payal Gaming', role: 'Streamer / creator' },
  { name: 'Parv Singh', knownAs: 'Regaltos', role: 'Streamer / creator' },
  { name: 'Lokesh Jain', knownAs: 'Goldy', role: 'Streamer / creator' },
  { name: 'Harmandeep Singh', knownAs: 'Mavi', role: 'Competitive player (BGMI)' },
  { name: 'Abhijeet Andhare', knownAs: 'Ghatak', role: 'Coach / analyst (BGMI)' },
  { name: 'Vivek Aabhas Horo', knownAs: 'ClutchGod', role: 'Competitive player (BGMI)' },
  { name: 'Saloni Pawar', knownAs: 'Mili Kya Mili', role: 'Streamer / creator' },
  { name: 'Kaashvi Hiranandani', knownAs: 'Kaashvi', role: 'Streamer / creator' },
  { name: 'Shagufta Iqbal', knownAs: 'Xyaa', role: 'Streamer / creator' },
  { name: 'Animesh Agarwal', knownAs: '8Bit Thug', role: 'Org founder / manager' },
  { name: 'Ocean Sharma', knownAs: null, role: 'Caster / analyst' },
  { name: 'Siddharth Joshi', knownAs: 'Sid', role: 'Streamer / creator' },
  { name: 'Harsh Paudwal', knownAs: 'Goblin', role: 'Competitive player (BGMI)' },
  { name: 'Ankit Panth', knownAs: 'V3nom', role: 'Competitive player (CS2 / Valorant)' },
  { name: 'Ritesh Nawandar', knownAs: 'Neyoo', role: 'Competitive player (Valorant)' },
  { name: 'Chetan Chandgude', knownAs: 'Kronten', role: 'Streamer / org (Free Fire)' },
  { name: 'Manmeet Singh', knownAs: 'Teddy', role: 'Coach / analyst (BGMI)' }
];

function normalizeUpiInput(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return String(v).trim() || null;
  const t = v.trim();
  return t === '' ? null : t;
}

function upiEquals(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

async function ensurePaymentDocMigrated(paymentDoc) {
  if (!paymentDoc) return null;

  const hasNew = Array.isArray(paymentDoc.upiIds) && paymentDoc.upiIds.length > 0;
  const hasLegacy = paymentDoc.upiId && String(paymentDoc.upiId).trim() !== '';

  if (!hasNew && hasLegacy) {
    paymentDoc.upiIds = [
      {
        upiId: String(paymentDoc.upiId).trim(),
        isVerified: Boolean(paymentDoc.isVerified)
      }
    ];
    paymentDoc.selectedUpiId = paymentDoc.upiIds[0]._id;
    await paymentDoc.save();
  }

  return paymentDoc;
}

function paymentPayloadForApi(paymentDoc) {
  if (!paymentDoc) {
    return {
      paymentUPIs: [], // string[] (for UI lists)
      paymentUPIEntries: [], // detailed rows for edit/delete/select
      selectedPaymentUPI: null,
      selectedPaymentUPIId: null,
      paymentUPI: null,
      paymentMethod: null,
      isPaymentVerified: false
    };
  }

  const entries = Array.isArray(paymentDoc.upiIds)
    ? paymentDoc.upiIds.map(e => ({
        id: String(e._id),
        upiId: e.upiId,
        isVerified: Boolean(e.isVerified)
      }))
    : [];

  const selectedEntry =
    paymentDoc.selectedUpiId
      ? entries.find(x => String(x.id) === String(paymentDoc.selectedUpiId))
      : null;

  const selectedUpiId = selectedEntry ? selectedEntry.upiId : null;
  const selectedIsVerified = selectedEntry ? Boolean(selectedEntry.isVerified) : false;

  return {
    paymentUPIs: entries.map(e => e.upiId),
    paymentUPIEntries: entries,
    selectedPaymentUPI: selectedEntry ? { id: selectedEntry.id, upiId: selectedEntry.upiId } : null,
    selectedPaymentUPIId: selectedEntry ? selectedEntry.id : null,
    // Backward compatible fields
    paymentUPI: selectedUpiId,
    paymentMethod: paymentDoc.paymentMethod || null,
    isPaymentVerified: selectedIsVerified
  };
}

const INDIA_ORG_BY_LOWER = new Map(
  INDIA_ESPORTS_ORGANIZATIONS.map((org) => [org.toLowerCase(), org])
);

const MAX_SELECTED_ORGS = 15;
const MAX_SELECTED_PERSONALITIES = 25;

const findPersonalityByToken = (token) => {
  const t = String(token || '').trim().toLowerCase();
  if (!t) return null;
  for (const p of INDIA_ESPORTS_PERSONALITIES) {
    if (p.name.toLowerCase() === t) return p;
    if (p.knownAs && String(p.knownAs).trim().toLowerCase() === t) return p;
  }
  return null;
};

const normalizeSelectedEsportsOrganizations = (input) => {
  const arr = Array.isArray(input) ? input : [input];
  if (arr.length > MAX_SELECTED_ORGS) {
    throw new Error(`You can select at most ${MAX_SELECTED_ORGS} organizations`);
  }
  const out = [];
  for (const raw of arr) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    const canon = INDIA_ORG_BY_LOWER.get(s.toLowerCase());
    if (!canon) {
      throw new Error(`Invalid esports organization: ${s}`);
    }
    if (!out.includes(canon)) out.push(canon);
  }
  return out;
};

const normalizeSelectedEsportsPersonalities = (input) => {
  const arr = Array.isArray(input) ? input : [input];
  if (arr.length > MAX_SELECTED_PERSONALITIES) {
    throw new Error(`You can select at most ${MAX_SELECTED_PERSONALITIES} personalities`);
  }
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    let match = null;
    if (typeof raw === 'string') {
      match = findPersonalityByToken(raw);
    } else if (raw && typeof raw === 'object') {
      match = findPersonalityByToken(raw.name || raw.knownAs);
    }
    if (!match) {
      const label = typeof raw === 'string' ? raw : JSON.stringify(raw);
      throw new Error(`Invalid esports personality: ${label}`);
    }
    const key = match.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: match.name,
      knownAs: match.knownAs ?? null,
      role: match.role
    });
  }
  return out;
};

const cloneGamePreferenceForUpdate = (user) => {
  try {
    const gp = user.gamePreference;
    if (!gp) {
      return {
        platform: null,
        game: null,
        followedGames: [],
        selectedEsportsOrganizations: [],
        selectedEsportsPersonalities: [],
        updatedAt: null
      };
    }
    const plain = JSON.parse(JSON.stringify(gp));
    if (!Array.isArray(plain.followedGames)) plain.followedGames = [];
    if (!Array.isArray(plain.selectedEsportsOrganizations)) plain.selectedEsportsOrganizations = [];
    if (!Array.isArray(plain.selectedEsportsPersonalities)) plain.selectedEsportsPersonalities = [];
    return plain;
  } catch {
    return {
      platform: null,
      game: null,
      followedGames: [],
      selectedEsportsOrganizations: [],
      selectedEsportsPersonalities: [],
      updatedAt: null
    };
  }
};

const slugifyGameName = (game) =>
  String(game)
    .toLowerCase()
    .replace(/:/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

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

/** Full catalogue (GET /api/profile/game-options only — not on GET/PUT profile or /me). */
const buildGameSelectionConfig = () => ({
  defaultPlatform: 'mobile',
  options: GAME_OPTIONS,
  indiaEsportsOrganizations: INDIA_ESPORTS_ORGANIZATIONS,
  indiaEsportsPersonalities: INDIA_ESPORTS_PERSONALITIES
});

/**
 * Get game options for selection UI
 * GET /api/profile/game-options
 */
const getGameOptions = asyncHandler(async (req, res) => {
  return res.success(HTTP_STATUS.OK, 'Game options retrieved successfully', buildGameSelectionConfig());
});

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
 * Single source of truth for resolving platform + canonical game from any supported client shape.
 */
const resolveFollowedGameIdentity = (item) => {
  if (!item || typeof item !== 'object') return null;
  let platform = String(item.platform || '').trim().toLowerCase();
  let game = null;
  if (['mobile', 'pc'].includes(platform)) {
    game = canonicalizeGameName(platform, item.game || item.gameName);
  }
  if (!game && item.gameId) {
    const fromSlug = slugToCanonicalGame(item.gameId);
    if (fromSlug) {
      platform = fromSlug.platform;
      game = fromSlug.game;
    }
  }
  if (!game && (item.gameName || item.game)) {
    const fromName = canonicalizeGameNameFromAnyPlatform(item.gameName || item.game);
    if (fromName) {
      platform = fromName.platform;
      game = fromName.game;
    }
  }
  if (!['mobile', 'pc'].includes(platform) || !game) return null;
  return { platform, game };
};

/** Full list replace: uid from `uid` or legacy `gameUid`; missing keys => null. */
const readUidForFullReplace = (item) => {
  if (item.uid !== undefined && item.uid !== null) {
    const u = String(item.uid).trim();
    return u || null;
  }
  if (item.gameUid !== undefined && item.gameUid !== null) {
    const u = String(item.gameUid).trim();
    return u || null;
  }
  return null;
};

/** Merge patch: only overwrite uid when client sends uid or gameUid key. */
const readUidForMergePatch = (item) => {
  const hasU = Object.prototype.hasOwnProperty.call(item, 'uid');
  const hasG = Object.prototype.hasOwnProperty.call(item, 'gameUid');
  if (!hasU && !hasG) return { provided: false, uid: null };
  if (hasU && item.uid !== undefined && item.uid !== null) {
    const u = String(item.uid).trim();
    return { provided: true, uid: u || null };
  }
  if (hasG && item.gameUid !== undefined && item.gameUid !== null) {
    const u = String(item.gameUid).trim();
    return { provided: true, uid: u || null };
  }
  return { provided: true, uid: null };
};

const followedGameRowKey = (platform, game) =>
  `${String(platform).toLowerCase()}:${String(game).toLowerCase()}`;

/**
 * Client payloads often duplicate uid as gameUid — drop gameUid and keep a single `uid` field.
 * If only gameUid was sent, it becomes uid. Omits uid key when neither was sent (merge-safe).
 */
const canonicalizeFollowedGameInputItems = (arr) => {
  if (!Array.isArray(arr)) return arr;
  return arr.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const hasU = Object.prototype.hasOwnProperty.call(item, 'uid');
    const hasG = Object.prototype.hasOwnProperty.call(item, 'gameUid');
    const uRaw = hasU && item.uid !== undefined && item.uid !== null ? String(item.uid).trim() : '';
    const gRaw = hasG && item.gameUid !== undefined && item.gameUid !== null ? String(item.gameUid).trim() : '';
    const merged = uRaw || gRaw || null;
    const { gameUid: _drop, ...rest } = item;
    const out = { ...rest };
    if (hasU || hasG) {
      out.uid = merged;
    }
    return out;
  });
};

const rebalanceFollowedGamesSelected = (list) => {
  if (!Array.isArray(list) || list.length === 0) return;
  const selectedIndex = list.findIndex((g) => g.selected);
  if (selectedIndex === -1) {
    list[0].selected = true;
  } else {
    list.forEach((g, idx) => {
      g.selected = idx === selectedIndex;
    });
  }
};

/** Replace entire followedGames list. Duplicate keys in payload: last wins. */
const normalizeFollowedGames = (followedGamesInput) => {
  if (!Array.isArray(followedGamesInput)) {
    throw new Error('followedGames must be an array');
  }

  const byKey = new Map();
  for (const item of followedGamesInput) {
    const id = resolveFollowedGameIdentity(item);
    if (!id) {
      throw new Error('Each followed game must include valid game/platform');
    }
    const uidValue = readUidForFullReplace(item);
    if (uidValue && uidValue.length > 100) {
      throw new Error('Game UID cannot exceed 100 characters');
    }
    const key = followedGameRowKey(id.platform, id.game);
    byKey.set(key, {
      platform: id.platform,
      game: id.game,
      uid: uidValue || null,
      selected: Boolean(item.selected)
    });
  }

  const normalized = [...byKey.values()];
  rebalanceFollowedGamesSelected(normalized);
  return normalized;
};

/** Upsert into existing followed games (add UID / toggle selected without sending full list). */
const mergeFollowedGamesPatch = (existingList, patches) => {
  const byKey = new Map();
  for (const e of existingList || []) {
    const id = resolveFollowedGameIdentity(e);
    if (!id) continue;
    const uidRaw = e.uid != null ? String(e.uid).trim() : '';
    byKey.set(followedGameRowKey(id.platform, id.game), {
      platform: id.platform,
      game: id.game,
      uid: uidRaw || null,
      selected: Boolean(e.selected)
    });
  }

  for (const item of patches) {
    const id = resolveFollowedGameIdentity(item);
    if (!id) {
      throw new Error('Each followed game must include valid game/platform');
    }
    const key = followedGameRowKey(id.platform, id.game);
    const prev = byKey.get(key) || {
      platform: id.platform,
      game: id.game,
      uid: null,
      selected: false
    };
    const { provided, uid } = readUidForMergePatch(item);
    let nextUid = prev.uid;
    if (provided) {
      nextUid = uid;
      if (nextUid && nextUid.length > 100) {
        throw new Error('Game UID cannot exceed 100 characters');
      }
    }
    let nextSel = prev.selected;
    if (Object.prototype.hasOwnProperty.call(item, 'selected')) {
      nextSel = Boolean(item.selected);
    }
    byKey.set(key, {
      platform: id.platform,
      game: id.game,
      uid: nextUid,
      selected: nextSel
    });
  }

  const list = [...byKey.values()];
  rebalanceFollowedGamesSelected(list);
  return list;
};

/** DELETE game-profile body uses same keys as a followedGames row. */
const resolveTargetGameFromPayload = (body) => resolveFollowedGameIdentity(body || {});

/** API output: one UID field only (`uid`). Input still accepts legacy `gameUid`. */
const toGameProfiles = (followedGames = []) => followedGames.map(item => ({
  gameId: String(item.game || '').toLowerCase().replace(/\s+/g, '-'),
  gameName: item.game,
  uid: item.uid != null && String(item.uid).trim() ? String(item.uid).trim() : null,
  platform: item.platform,
  selected: Boolean(item.selected)
}));

/** User-specific followed org list (same pattern as gameProfiles) */
const toOrganizationProfiles = (orgNames = []) =>
  (Array.isArray(orgNames) ? orgNames : []).map((orgName) => ({
    orgId: String(orgName || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, ''),
    orgName
  }));

const toPersonalityProfiles = (personalities = []) =>
  (Array.isArray(personalities) ? personalities : []).map((p) => {
    const name = p?.name ?? '';
    const knownAs = p?.knownAs ?? null;
    const role = p?.role ?? null;
    const idSource = knownAs || name;
    return {
      personalityId: String(idSource || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, ''),
      name,
      knownAs,
      role
    };
  });

const buildUserFollowPayload = (user) => {
  const gp = user?.gamePreference;
  const orgs = Array.isArray(gp?.selectedEsportsOrganizations) ? gp.selectedEsportsOrganizations : [];
  const pers = Array.isArray(gp?.selectedEsportsPersonalities) ? gp.selectedEsportsPersonalities : [];
  return {
    organizationProfiles: toOrganizationProfiles(orgs),
    personalityProfiles: toPersonalityProfiles(pers)
  };
};

/** gamePreference for GET/PUT profile + /me — org/person picks only on root *Profiles keys (no duplicate arrays). */
const gamePreferenceForApiResponse = (user) => {
  const gp = user?.gamePreference;
  if (!gp) return null;
  let plain;
  try {
    plain = typeof gp.toObject === 'function' ? gp.toObject() : JSON.parse(JSON.stringify(gp));
  } catch {
    return null;
  }
  delete plain.selectedEsportsOrganizations;
  delete plain.selectedEsportsPersonalities;
  return plain;
};

const calculateAgeFromDOB = (dateOfBirth) => {
  if (!dateOfBirth) return null;

  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return age;
};

const parseBioPayload = (bio) => {
  if (bio === undefined || bio === null || bio === '') return null;
  if (typeof bio === 'object') return bio;
  if (typeof bio === 'string') {
    try {
      const parsed = JSON.parse(bio);
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch (error) {
      return null;
    }
  }
  return null;
};

const normalizeAddress = (inputAddress) => {
  if (!inputAddress || typeof inputAddress !== 'object') {
    throw new Error('address must be an object');
  }

  const cleaned = {
    addressLine1: (typeof inputAddress.addressLine1 === 'string' ? inputAddress.addressLine1.trim() : '') || null,
    addressLine2: (typeof inputAddress.addressLine2 === 'string' ? inputAddress.addressLine2.trim() : '') || null,
    city: (typeof inputAddress.city === 'string' ? inputAddress.city.trim() : '') || null,
    state: (typeof inputAddress.state === 'string' ? inputAddress.state.trim() : '') || null,
    pincode: (typeof inputAddress.pincode === 'string' ? inputAddress.pincode.trim() : '') || null,
    contactNumber: (typeof inputAddress.contactNumber === 'string' ? inputAddress.contactNumber.trim() : '') || null,
    countryCode: (typeof inputAddress.countryCode === 'string' ? inputAddress.countryCode.trim() : '') || '+91'
  };

  if (cleaned.addressLine1 && cleaned.addressLine1.length > 150) {
    throw new Error('address.addressLine1 cannot exceed 150 characters');
  }
  if (cleaned.addressLine2 && cleaned.addressLine2.length > 150) {
    throw new Error('address.addressLine2 cannot exceed 150 characters');
  }
  if (cleaned.city && cleaned.city.length > 80) {
    throw new Error('address.city cannot exceed 80 characters');
  }
  if (cleaned.state && cleaned.state.length > 80) {
    throw new Error('address.state cannot exceed 80 characters');
  }
  if (cleaned.pincode && !/^[0-9]{4,10}$/.test(cleaned.pincode)) {
    throw new Error('address.pincode must be 4-10 digits');
  }
  if (cleaned.contactNumber && !/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,12}$/.test(cleaned.contactNumber)) {
    throw new Error('address.contactNumber must be a valid phone number');
  }
  if (cleaned.countryCode && !/^\+[0-9]{1,4}$/.test(cleaned.countryCode)) {
    throw new Error('address.countryCode must be like +91');
  }

  return cleaned;
};

const pickAddressCoreFromSaved = (doc) => ({
  addressLine1: doc.addressLine1 ?? null,
  addressLine2: doc.addressLine2 ?? null,
  city: doc.city ?? null,
  state: doc.state ?? null,
  pincode: doc.pincode ?? null,
  contactNumber: doc.contactNumber ?? null,
  countryCode: doc.countryCode ?? '+91'
});

const syncAddressFieldFromDefault = (user) => {
  const def = (user.savedAddresses || []).find((a) => a.isDefault);
  if (!def) {
    user.address = {
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      pincode: null,
      contactNumber: null,
      countryCode: '+91'
    };
    return;
  }
  user.address = pickAddressCoreFromSaved(def);
};

const formatSavedAddressDoc = (doc) => {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    addressId: String(o._id),
    label: o.label ?? null,
    ...pickAddressCoreFromSaved(o),
    isDefault: Boolean(o.isDefault),
    lat: o.lat != null && Number.isFinite(Number(o.lat)) ? Number(o.lat) : null,
    lng: o.lng != null && Number.isFinite(Number(o.lng)) ? Number(o.lng) : null,
    createdAt: o.createdAt ?? null,
    updatedAt: o.updatedAt ?? null
  };
};

/** Stable order for UI + index-based default: oldest created first (tie-break by addressId). */
const formatSavedAddressesList = (user) => {
  const arr = user.savedAddresses || [];
  const mapped = arr.map((s) => formatSavedAddressDoc(s));
  mapped.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.addressId).localeCompare(String(b.addressId));
  });
  return mapped;
};

const defaultAddressIndexFromList = (addresses) => {
  if (!addresses.length) return null;
  const di = addresses.findIndex((a) => a.isDefault);
  return di >= 0 ? di : 0;
};

/** Profile API: single list only — default row has `isDefault: true` and `defaultAddressIndex` points to it. */
const buildProfileAddressPayload = (user) => {
  const addresses = formatSavedAddressesList(user);
  return {
    addresses,
    defaultAddressIndex: defaultAddressIndexFromList(addresses)
  };
};

/** After deleting the default row, mark oldest remaining as default (matches list sort order). */
const setOldestRemainingAsDefault = (user) => {
  const arr = user.savedAddresses || [];
  if (arr.length === 0) return;
  let best = arr[0];
  let bestT = best.createdAt ? new Date(best.createdAt).getTime() : 0;
  for (let i = 1; i < arr.length; i++) {
    const s = arr[i];
    const t = s.createdAt ? new Date(s.createdAt).getTime() : 0;
    if (t < bestT || (t === bestT && String(s._id) < String(best._id))) {
      best = s;
      bestT = t;
    }
  }
  for (const s of arr) {
    s.isDefault = String(s._id) === String(best._id);
  }
};

const strField = (v) => {
  if (v === undefined || v === null) return '';
  return String(v).trim();
};

/** True if legacy embedded `address` has anything worth copying (not only addressLine1 — old clients sometimes filled only city/state). */
const hasLegacyFlatAddressData = (a) => {
  if (!a || typeof a !== 'object') return false;
  return !!(
    strField(a.addressLine1) ||
    strField(a.addressLine2) ||
    strField(a.city) ||
    strField(a.state) ||
    strField(a.pincode) ||
    strField(a.contactNumber)
  );
};

/**
 * One-time: legacy flat `address` → first saved row as default.
 * @returns {Promise<boolean>} true if a new row was written (caller may refetch user for GET responses).
 */
const ensureLegacySavedAddressesMigrated = async (user) => {
  if (!user?._id) return false;
  if (Array.isArray(user.savedAddresses) && user.savedAddresses.length > 0) return false;

  const a = user.address;
  if (!hasLegacyFlatAddressData(a)) return false;

  const line1 = strField(a.addressLine1);
  const line2 = strField(a.addressLine2);
  const city = strField(a.city);
  const state = strField(a.state);
  const pincode = strField(a.pincode);
  const contact = strField(a.contactNumber);
  const cc = strField(a.countryCode) || '+91';

  const primaryLine1 = line1 || line2 || city || state || pincode || 'Saved address';

  user.savedAddresses = [
    {
      label: null,
      addressLine1: primaryLine1,
      addressLine2: line2 || null,
      city: city || null,
      state: state || null,
      pincode: pincode || null,
      contactNumber: contact || null,
      countryCode: cc,
      isDefault: true,
      lat: null,
      lng: null
    }
  ];
  user.markModified('savedAddresses');
  syncAddressFieldFromDefault(user);
  await user.save();
  return true;
};

const upsertDefaultFromLegacyPut = (user, cleaned) => {
  const arr = Array.isArray(user.savedAddresses) ? [...user.savedAddresses] : [];
  const defIdx = arr.findIndex((s) => s.isDefault);
  if (defIdx >= 0) {
    const s = arr[defIdx];
    s.addressLine1 = cleaned.addressLine1;
    s.addressLine2 = cleaned.addressLine2;
    s.city = cleaned.city;
    s.state = cleaned.state;
    s.pincode = cleaned.pincode;
    s.contactNumber = cleaned.contactNumber;
    s.countryCode = cleaned.countryCode;
  } else if (arr.length > 0) {
    arr.forEach((s, i) => {
      s.isDefault = i === 0;
    });
    const s = arr[0];
    s.addressLine1 = cleaned.addressLine1;
    s.addressLine2 = cleaned.addressLine2;
    s.city = cleaned.city;
    s.state = cleaned.state;
    s.pincode = cleaned.pincode;
    s.contactNumber = cleaned.contactNumber;
    s.countryCode = cleaned.countryCode;
  } else {
    arr.push({
      label: null,
      ...cleaned,
      isDefault: true,
      lat: null,
      lng: null
    });
  }
  user.savedAddresses = arr;
  user.markModified('savedAddresses');
  syncAddressFieldFromDefault(user);
};

const normalizeLabel = (input) => {
  if (input === undefined || input === null) return null;
  const t = String(input).trim();
  return t ? t.slice(0, 60) : null;
};

/** Both lat/lng together or omit both (for map pin). */
const pickOptionalLatLngPair = (body) => {
  const hasL =
    Object.prototype.hasOwnProperty.call(body, 'lat') && body.lat !== null && body.lat !== '';
  const hasG =
    Object.prototype.hasOwnProperty.call(body, 'lng') && body.lng !== null && body.lng !== '';
  if (!hasL && !hasG) return { lat: null, lng: null };
  if (hasL !== hasG) {
    throw new Error('lat and lng must both be provided together or omitted');
  }
  const la = Number(body.lat);
  const ln = Number(body.lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) {
    throw new Error('lat and lng must be valid numbers');
  }
  if (la < -90 || la > 90) throw new Error('lat must be between -90 and 90');
  if (ln < -180 || ln > 180) throw new Error('lng must be between -180 and 180');
  return { lat: la, lng: ln };
};

const applyOptionalLatLngOnPatch = (sub, body) => {
  const hasL = Object.prototype.hasOwnProperty.call(body, 'lat');
  const hasG = Object.prototype.hasOwnProperty.call(body, 'lng');
  if (!hasL && !hasG) return;
  if (!hasL || !hasG) {
    throw new Error('lat and lng must both be provided together when updating coordinates');
  }
  if (body.lat === null && body.lng === null) {
    sub.lat = null;
    sub.lng = null;
    return;
  }
  const pair = pickOptionalLatLngPair({ lat: body.lat, lng: body.lng });
  sub.lat = pair.lat;
  sub.lng = pair.lng;
};

const getUserSelectedGameGroups = (user) => {
  const pref = user?.gamePreference || {};

  const fromFollowed = Array.isArray(pref.followedGames) && pref.followedGames.length
    ? pref.followedGames.map(item => ({
        platform: item.platform,
        game: item.game
      }))
    : [];

  const fallback = (pref.platform && pref.game)
    ? [{ platform: pref.platform, game: pref.game }]
    : [];

  const merged = fromFollowed.length ? fromFollowed : fallback;

  const unique = [];
  for (const item of merged) {
    const platform = String(item?.platform || '').trim().toLowerCase();
    const game = canonicalizeGameName(platform, item?.game);
    if (!platform || !game) continue;
    const key = `${platform}:${game.toLowerCase()}`;
    if (!unique.some(x => `${x.platform}:${x.game.toLowerCase()}` === key)) {
      unique.push({ platform, game });
    }
  }

  return unique;
};

/**
 * Get user profile
 * Returns pre-filled data: email, name, and other profile information
 * GET /api/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const userId = req.userId;

  // Find user in MongoDB
  const user = await User.findById(userId).select('-password -otp');
  
  if (!checkUserExists(res, user)) {
    return;
  }

  const migrated = await ensureLegacySavedAddressesMigrated(user);
  let profileUser = user;
  if (migrated) {
    const again = await User.findById(userId).select('-password -otp');
    if (again) profileUser = again;
  }

  // Get payment UPI(s) information from MongoDB
  let paymentDoc = null;
  try {
    const paymentData = await UserPaymentInfo.findOne({ userId });
    paymentDoc = await ensurePaymentDocMigrated(paymentData);
  } catch (error) {
    Logger.error('Error fetching payment info from MongoDB', error);
    // Continue without payment info if query fails
  }
  const paymentPayload = paymentPayloadForApi(paymentDoc);

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.PROFILE_RETRIEVED, {
    userId: profileUser._id,
    email: profileUser.email,
    name: profileUser.name,
    role: profileUser.role,
    profileImage: profileUser.profileImage || null,
    phoneNumber: profileUser.phoneNumber || null,
    gender: profileUser.gender || null,
    dateOfBirth: profileUser.dateOfBirth || null,
    age: profileUser.age || null,
    gamePreference: gamePreferenceForApiResponse(profileUser),
    gameProfiles: toGameProfiles(profileUser?.gamePreference?.followedGames || []),
    ...buildUserFollowPayload(profileUser),
    ...buildProfileAddressPayload(profileUser),
    ...paymentPayload,
    createdAt: profileUser.createdAt,
    updatedAt: profileUser.updatedAt
  });
});

/**
 * Update user profile
 * Updates: name, phone number, gender, date of birth, payment UPI
 * PUT /api/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const {
    name,
    fullName,
    phoneNumber,
    phone,
    gender,
    dateOfBirth,
    paymentUPI, // legacy single-field input (still supported)
    paymentUPIAdd,
    paymentUPIUpdate,
    paymentUPIDelete,
    selectedPaymentUPIId,
    paymentUPIs,
    bio,
    followedGames,
    /** Alias of followedGames — same shape `[{ platform, game }]` (optional uid/selected). */
    selectedGames,
    gameProfiles: gameProfilesBody,
    mergeFollowedGames,
    followedOrganizations,
    followedPersonalities,
    selectedEsportsOrganizations,
    selectedEsportsPersonalities,
    selectedOrganizations,
    selectedPersonalities,
    address,
    addressLine1,
    addressLine2,
    city,
    state,
    pincode,
    contactNumber,
    countryCode,
    profileImageUploadId
  } = req.body;
  const parsedBio = parseBioPayload(bio);

  // Backward compatibility for older app payload keys.
  const resolvedName = name !== undefined ? name : fullName;
  const resolvedPhoneNumber = phoneNumber !== undefined ? phoneNumber : phone;
  const resolvedGender = gender !== undefined ? gender : parsedBio?.gender;
  const resolvedDateOfBirth = dateOfBirth !== undefined ? dateOfBirth : parsedBio?.dateOfBirth;
  const resolvedSelOrgs =
    followedOrganizations !== undefined
      ? followedOrganizations
      : (selectedEsportsOrganizations !== undefined
        ? selectedEsportsOrganizations
        : selectedOrganizations);
  const resolvedSelPers =
    followedPersonalities !== undefined
      ? followedPersonalities
      : (selectedEsportsPersonalities !== undefined
        ? selectedEsportsPersonalities
        : selectedPersonalities);

  const resolvedAddress = address !== undefined
    ? address
    : (addressLine1 !== undefined ||
      addressLine2 !== undefined ||
      city !== undefined ||
      state !== undefined ||
      pincode !== undefined ||
      contactNumber !== undefined ||
      countryCode !== undefined)
      ? {
          addressLine1,
          addressLine2,
          city,
          state,
          pincode,
          contactNumber,
          countryCode
        }
      : undefined;

  // Find user in MongoDB
  let user = await User.findById(userId);
  
  if (!checkUserExists(res, user)) {
    return;
  }

  const migratedPut = await ensureLegacySavedAddressesMigrated(user);
  if (migratedPut) {
    const again = await User.findById(userId);
    if (again) user = again;
  }

  // Update profile fields in MongoDB (only update provided fields)
  const updateFields = {};

  if (resolvedName !== undefined) {
    const trimmed = typeof resolvedName === 'string' ? resolvedName.trim() : '';
    if (trimmed.length < 2) {
      return res.badRequest('Name must be at least 2 characters');
    }
    if (trimmed.length > 100) {
      return res.badRequest('Name cannot exceed 100 characters');
    }
    updateFields.name = trimmed;
  }
  
  if (resolvedPhoneNumber !== undefined) {
    updateFields.phoneNumber = (typeof resolvedPhoneNumber === 'string' ? resolvedPhoneNumber.trim() : resolvedPhoneNumber) || null;
  }
  
  if (resolvedGender !== undefined) {
    // Validate gender enum
    if (resolvedGender && !GENDER_OPTIONS.includes(resolvedGender.toLowerCase())) {
      return res.badRequest(`Invalid gender. Must be one of: ${GENDER_OPTIONS.join(', ')}`);
    }
    updateFields.gender = resolvedGender ? resolvedGender.toLowerCase() : null;
  }
  
  if (resolvedDateOfBirth !== undefined) {
    if (resolvedDateOfBirth === null || resolvedDateOfBirth === '') {
      updateFields.dateOfBirth = null;
      updateFields.age = null;
    } else {
      const dob = new Date(resolvedDateOfBirth);
      if (Number.isNaN(dob.getTime())) {
        return res.badRequest('dateOfBirth must be a valid date');
      }

      const computedAge = calculateAgeFromDOB(dob);
      if (computedAge === null || computedAge < AGE.MIN || computedAge > AGE.MAX) {
        return res.badRequest(`Date of birth must result in age between ${AGE.MIN} and ${AGE.MAX}`);
      }

      updateFields.dateOfBirth = dob;
      updateFields.age = computedAge;
    }
  }

  const resolvedFollowedGamesInput =
    followedGames !== undefined
      ? followedGames
      : selectedGames !== undefined
        ? selectedGames
        : gameProfilesBody;

  const needsGamePreferenceUpdate =
    resolvedFollowedGamesInput !== undefined ||
    resolvedSelOrgs !== undefined ||
    resolvedSelPers !== undefined;

  if (needsGamePreferenceUpdate) {
    try {
      const gp = cloneGamePreferenceForUpdate(user);
      if (resolvedFollowedGamesInput !== undefined) {
        const cleanedGames = canonicalizeFollowedGameInputItems(resolvedFollowedGamesInput);
        gp.followedGames =
          mergeFollowedGames === true
            ? mergeFollowedGamesPatch(gp.followedGames, cleanedGames)
            : normalizeFollowedGames(cleanedGames);
      }
      if (resolvedSelOrgs !== undefined) {
        gp.selectedEsportsOrganizations =
          resolvedSelOrgs === null
            ? []
            : normalizeSelectedEsportsOrganizations(resolvedSelOrgs);
      }
      if (resolvedSelPers !== undefined) {
        gp.selectedEsportsPersonalities =
          resolvedSelPers === null
            ? []
            : normalizeSelectedEsportsPersonalities(resolvedSelPers);
      }
      gp.updatedAt = new Date();
      updateFields.gamePreference = gp;
    } catch (error) {
      return res.badRequest(error.message);
    }
  }

  if (resolvedAddress !== undefined) {
    try {
      const cleaned = normalizeAddress(resolvedAddress);
      upsertDefaultFromLegacyPut(user, cleaned);
    } catch (error) {
      return res.badRequest(error.message);
    }
  }

  // Update user document
  Object.assign(user, updateFields);
  if (needsGamePreferenceUpdate) {
    user.markModified('gamePreference');
  }
  if (resolvedAddress !== undefined) {
    user.markModified('savedAddresses');
  }

  // Commit staged profile image (only when user hits PUT /api/profile)
  if (profileImageUploadId !== undefined) {
    const raw = profileImageUploadId === null ? null : String(profileImageUploadId || '').trim();
    if (raw === null || raw === '') {
      user.profileImage = null;
    } else {
      if (!cloudinaryService.isConfigured()) {
        return res.error(
          HTTP_STATUS.SERVICE_UNAVAILABLE,
          'Profile image save is unavailable: image storage is not configured.'
        );
      }
      if (!cloudinaryService.isProfileAvatarPublicIdForUser(raw, userId)) {
        return res.badRequest('Invalid profileImageUploadId');
      }
      try {
        user.profileImage = cloudinaryService.buildDeliveryUrl(raw, {});
      } catch (err) {
        Logger.error('Cloudinary profile image URL build failed', err);
        return res.badRequest('Could not save profile image.');
      }
    }
  }

  await user.save();

  // Update payment UPI(s) in MongoDB (old endpoint, multiple modes)
  const paymentOpsTouched =
    paymentUPI !== undefined ||
    paymentUPIAdd !== undefined ||
    paymentUPIUpdate !== undefined ||
    paymentUPIDelete !== undefined ||
    selectedPaymentUPIId !== undefined ||
    paymentUPIs !== undefined;

  if (paymentOpsTouched) {
    try {
      let paymentDoc = await UserPaymentInfo.findOne({ userId });
      if (!paymentDoc) paymentDoc = await UserPaymentInfo.create({ userId, upiIds: [], selectedUpiId: null, paymentMethod: 'UPI' });
      paymentDoc = await ensurePaymentDocMigrated(paymentDoc);

      // 1) Full replace list (paymentUPIs: string[] or null)
      if (paymentUPIs !== undefined) {
        if (paymentUPIs === null) {
          paymentDoc.upiIds = [];
          paymentDoc.selectedUpiId = null;
        } else {
          const normalized = paymentUPIs
            .map((item) => {
              if (typeof item === 'string') return normalizeUpiInput(item);
              if (item && typeof item === 'object' && item.upiId !== undefined) return normalizeUpiInput(item.upiId);
              return normalizeUpiInput(item);
            })
            .filter(Boolean);
          const unique = [];
          for (const u of normalized) {
            if (!UPI_PATTERN.test(u)) return res.badRequest('Please provide a valid UPI ID (format: name@bank)');
            if (!unique.some(x => upiEquals(x, u))) unique.push(u);
          }
          if (unique.length > MAX_SAVED_UPI_IDS) return res.badRequest(`You can save up to ${MAX_SAVED_UPI_IDS} UPI IDs only`);

          paymentDoc.upiIds = unique.map(u => ({ upiId: u, isVerified: false }));
          paymentDoc.selectedUpiId = paymentDoc.upiIds.length ? paymentDoc.upiIds[0]._id : null;
        }
      }

      // 2) Add one
      if (paymentUPIAdd !== undefined) {
        const u = normalizeUpiInput(paymentUPIAdd);
        if (!u || !UPI_PATTERN.test(u)) return res.badRequest('Please provide a valid UPI ID (format: name@bank)');
        const existing = paymentDoc.upiIds.find(e => upiEquals(e.upiId, u));
        if (!existing) {
          if (paymentDoc.upiIds.length >= MAX_SAVED_UPI_IDS) return res.badRequest(`You can save up to ${MAX_SAVED_UPI_IDS} UPI IDs only`);
          paymentDoc.upiIds.push({ upiId: u, isVerified: false });
          paymentDoc.selectedUpiId = paymentDoc.upiIds[paymentDoc.upiIds.length - 1]._id;
        } else {
          paymentDoc.selectedUpiId = existing._id;
        }
      }

      // 3) Update one (by entry id)
      if (paymentUPIUpdate !== undefined && paymentUPIUpdate !== null) {
        const entryId = paymentUPIUpdate.upiEntryId ? String(paymentUPIUpdate.upiEntryId) : '';
        const newUpi = normalizeUpiInput(paymentUPIUpdate.upiId);
        if (!entryId) return res.badRequest('paymentUPIUpdate.upiEntryId is required');
        if (!newUpi || !UPI_PATTERN.test(newUpi)) return res.badRequest('Please provide a valid UPI ID (format: name@bank)');

        const entry = paymentDoc.upiIds.id(entryId);
        if (!entry) return res.notFound('UPI entry not found');
        const dup = paymentDoc.upiIds.find(e => String(e._id) !== String(entry._id) && upiEquals(e.upiId, newUpi));
        if (dup) return res.badRequest('This UPI ID is already saved');
        entry.upiId = newUpi;
        entry.isVerified = false;
      }

      // 4) Delete one (by entry id)
      if (paymentUPIDelete !== undefined && paymentUPIDelete !== null) {
        const entryId = paymentUPIDelete.upiEntryId ? String(paymentUPIDelete.upiEntryId) : '';
        if (!entryId) return res.badRequest('paymentUPIDelete.upiEntryId is required');
        const entry = paymentDoc.upiIds.id(entryId);
        if (!entry) return res.notFound('UPI entry not found');
        const wasSelected = paymentDoc.selectedUpiId && String(paymentDoc.selectedUpiId) === String(entry._id);
        entry.deleteOne();
        if (wasSelected) {
          paymentDoc.selectedUpiId = paymentDoc.upiIds.length ? paymentDoc.upiIds[0]._id : null;
        }
      }

      // 5) Select default (by entry id, or clear)
      if (selectedPaymentUPIId !== undefined) {
        const sel = normalizeUpiInput(selectedPaymentUPIId);
        if (sel === null) {
          paymentDoc.selectedUpiId = null;
        } else {
          const entry = paymentDoc.upiIds.id(String(sel));
          if (!entry) return res.notFound('UPI entry not found');
          paymentDoc.selectedUpiId = entry._id;
        }
      }

      // 6) Legacy: paymentUPI behaves like "add/select" or "clear all"
      if (paymentUPI !== undefined) {
        const upiValue = normalizeUpiInput(paymentUPI);
        if (upiValue === null) {
          paymentDoc.upiId = null;
          paymentDoc.isVerified = false;
          paymentDoc.upiIds = [];
          paymentDoc.selectedUpiId = null;
        } else {
          if (!UPI_PATTERN.test(upiValue)) return res.badRequest('Please provide a valid UPI ID (format: name@bank)');
          const existing = paymentDoc.upiIds.find(e => upiEquals(e.upiId, upiValue));
          if (existing) {
            paymentDoc.selectedUpiId = existing._id;
          } else {
            if (paymentDoc.upiIds.length >= MAX_SAVED_UPI_IDS) return res.badRequest(`You can save up to ${MAX_SAVED_UPI_IDS} UPI IDs only`);
            paymentDoc.upiIds.push({ upiId: upiValue, isVerified: false });
            paymentDoc.selectedUpiId = paymentDoc.upiIds[paymentDoc.upiIds.length - 1]._id;
          }
        }
      }

      // Keep legacy mirror in sync with selection
      if (paymentDoc.selectedUpiId) {
        const selEntry = paymentDoc.upiIds.id(paymentDoc.selectedUpiId);
        paymentDoc.upiId = selEntry ? selEntry.upiId : null;
        paymentDoc.isVerified = selEntry ? Boolean(selEntry.isVerified) : false;
      } else {
        paymentDoc.upiId = null;
        paymentDoc.isVerified = false;
      }
      paymentDoc.paymentMethod = 'UPI';
      await paymentDoc.save();
    } catch (error) {
      Logger.error('Error updating payment info in MongoDB', error);
      // Continue even if update fails - MongoDB user update is successful
    }
  }

  // Get updated payment info from MongoDB
  let paymentDoc = null;
  try {
    const paymentData = await UserPaymentInfo.findOne({ userId });
    paymentDoc = await ensurePaymentDocMigrated(paymentData);
  } catch (error) {
    Logger.error('Error fetching payment info from MongoDB', error);
  }
  const paymentPayload = paymentPayloadForApi(paymentDoc);

  // Get updated user (without password and OTP)
  const updatedUser = await User.findById(userId).select('-password -otp');

  res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.PROFILE_UPDATED, {
    userId: updatedUser._id,
    email: updatedUser.email,
    name: updatedUser.name,
    role: updatedUser.role,
    profileImage: updatedUser.profileImage || null,
    phoneNumber: updatedUser.phoneNumber || null,
    gender: updatedUser.gender || null,
    dateOfBirth: updatedUser.dateOfBirth || null,
    age: updatedUser.age || null,
    gamePreference: gamePreferenceForApiResponse(updatedUser),
    gameProfiles: toGameProfiles(updatedUser?.gamePreference?.followedGames || []),
    ...buildUserFollowPayload(updatedUser),
    ...buildProfileAddressPayload(updatedUser),
    ...paymentPayload,
    createdAt: updatedUser.createdAt,
    updatedAt: updatedUser.updatedAt
  });
});

/**
 * Dashboard feed by user's selected games
 * GET /api/profile/dashboard
 */
const getDashboardFeed = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const status = String(req.query.status || 'upcoming').trim();

  if (!['upcoming', 'live', 'completed', 'pendingResult', 'cancelled'].includes(status)) {
    return res.badRequest('Invalid status. Must be: upcoming, live, completed, pendingResult, or cancelled');
  }

  const user = await User.findById(userId);
  if (!checkUserExists(res, user)) {
    return;
  }

  const selectedGames = getUserSelectedGameGroups(user);
  if (!selectedGames.length) {
    return res.success(HTTP_STATUS.OK, 'Dashboard feed retrieved successfully', {
      status,
      selectedGames: [],
      gameFeeds: [],
      totalGames: 0,
      totalTournaments: 0
    });
  }

  const tournaments = await tournamentService.getTournamentsByStatus(status, null, null, null, null, null);
  const feeds = selectedGames.map(sel => {
    const list = tournaments.filter(t => String(t.game || '').toLowerCase() === sel.game.toLowerCase());
    return {
      platform: sel.platform,
      game: sel.game,
      tournaments: list,
      total: list.length
    };
  });

  const totalTournaments = feeds.reduce((sum, item) => sum + item.total, 0);
  return res.success(HTTP_STATUS.OK, 'Dashboard feed retrieved successfully', {
    status,
    selectedGames,
    gameFeeds: feeds,
    totalGames: feeds.length,
    totalTournaments
  });
});

/**
 * Single-shot endpoint for returning users.
 * Returns profile + selected-games dashboard feed in one call.
 * GET /api/me
 */
const getMe = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const status = String(req.query.status || 'upcoming').trim();

  if (!['upcoming', 'live', 'completed', 'pendingResult', 'cancelled'].includes(status)) {
    return res.badRequest('Invalid status. Must be: upcoming, live, completed, pendingResult, or cancelled');
  }

  const user = await User.findById(userId).select('-password -otp');
  if (!checkUserExists(res, user)) {
    return;
  }

  const migrated = await ensureLegacySavedAddressesMigrated(user);
  let profileUser = user;
  if (migrated) {
    const again = await User.findById(userId).select('-password -otp');
    if (again) profileUser = again;
  }

  // Payment info
  let paymentDoc = null;
  try {
    const paymentData = await UserPaymentInfo.findOne({ userId });
    paymentDoc = await ensurePaymentDocMigrated(paymentData);
  } catch (error) {
    Logger.error('Error fetching payment info from MongoDB', error);
  }
  const paymentPayload = paymentPayloadForApi(paymentDoc);

  // Dashboard feed by selected games
  const selectedGames = getUserSelectedGameGroups(profileUser);
  const tournaments = selectedGames.length
    ? await tournamentService.getTournamentsByStatus(status, null, null, null, null, null)
    : [];

  const gameFeeds = selectedGames.map(sel => {
    const list = tournaments.filter(t => String(t.game || '').toLowerCase() === sel.game.toLowerCase());
    return {
      platform: sel.platform,
      game: sel.game,
      tournaments: list,
      total: list.length
    };
  });

  const totalTournaments = gameFeeds.reduce((sum, item) => sum + item.total, 0);

  return res.success(HTTP_STATUS.OK, 'Me data retrieved successfully', {
    profile: {
      userId: profileUser._id,
      email: profileUser.email,
      name: profileUser.name,
      role: profileUser.role,
      profileImage: profileUser.profileImage || null,
      phoneNumber: profileUser.phoneNumber || null,
      gender: profileUser.gender || null,
      dateOfBirth: profileUser.dateOfBirth || null,
      age: profileUser.age || null,
      gamePreference: gamePreferenceForApiResponse(profileUser),
      gameProfiles: toGameProfiles(profileUser?.gamePreference?.followedGames || []),
      ...buildUserFollowPayload(profileUser),
      ...buildProfileAddressPayload(profileUser),
      ...paymentPayload,
      createdAt: profileUser.createdAt,
      updatedAt: profileUser.updatedAt
    },
    dashboard: {
      status,
      selectedGames,
      gameFeeds,
      totalGames: gameFeeds.length,
      totalTournaments
    }
  });
});

/**
 * Upload / replace user's profile avatar
 * POST /api/profile/avatar (multipart/form-data, field: image)
 */
const uploadProfileAvatar = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const file =
    req.file ||
    (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : null);

  if (!file) {
    return res.badRequest('image file is required (max 1MB, JPG/PNG/WEBP)');
  }

  if (!cloudinaryService.isConfigured()) {
    return res.error(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'Profile image upload is unavailable: image storage is not configured.'
    );
  }

  const publicId = `avatar-${userId}-${Date.now()}`;
  try {
    const uploadResult = await cloudinaryService.uploadImageFromBuffer(file.buffer, { publicId });
    return res.success(HTTP_STATUS.OK, 'Profile image uploaded (pending save)', {
      uploadId: uploadResult.public_id,
      profileImageUrl: uploadResult.secure_url
    });
  } catch (err) {
    Logger.error('Cloudinary profile image upload failed', err);
    return res.badRequest('Could not upload image. Try again.');
  }
});

/**
 * Update FCM token for push notifications
 * POST /api/profile/fcm-token
 */
const updateFCMToken = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { fcmToken } = req.body;

  if (!fcmToken) {
    return res.badRequest('fcmToken is required');
  }

  const user = await User.findById(userId);
  if (!checkUserExists(res, user)) {
    return;
  }

  user.fcmToken = fcmToken;
  await user.save();

  // Subscribe user to 'all_users' topic for general announcements
  try {
    const fcmService = require('../services/fcm.service');
    if (fcmService.isInitialized()) {
      await fcmService.subscribeToTopic(fcmToken, 'all_users');
    }
  } catch (error) {
    Logger.error('Error subscribing to FCM topic', error);
    // Don't fail the request if subscription fails
  }

  res.success(HTTP_STATUS.OK, 'FCM token updated successfully');
});

/**
 * Merge followed games / UIDs without replacing the whole list (Game Profiles screen).
 * PATCH /api/profile/followed-games
 */
const patchFollowedGames = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const rawPatches =
    Array.isArray(req.body.followedGames) && req.body.followedGames.length > 0
      ? req.body.followedGames
      : req.body.gameProfiles;
  if (!Array.isArray(rawPatches) || rawPatches.length === 0) {
    return res.badRequest('followedGames or gameProfiles must be a non-empty array');
  }

  const user = await User.findById(userId);
  if (!checkUserExists(res, user)) {
    return;
  }

  const patches = canonicalizeFollowedGameInputItems(rawPatches);

  let gp;
  try {
    gp = cloneGamePreferenceForUpdate(user);
    gp.followedGames = mergeFollowedGamesPatch(gp.followedGames, patches);
    gp.updatedAt = new Date();
    user.gamePreference = gp;
    user.markModified('gamePreference');
    await user.save();
  } catch (error) {
    return res.badRequest(error.message);
  }

  const updatedUser = await User.findById(userId).select('-password -otp');
  res.success(HTTP_STATUS.OK, 'Followed games updated', {
    gameProfiles: toGameProfiles(updatedUser?.gamePreference?.followedGames || []),
    gamePreference: gamePreferenceForApiResponse(updatedUser)
  });
});

/**
 * PATCH /api/profile/game-profile
 *
 * A) **Uid-only body** (only `uid` and/or `gameUid` keys, no gameId/platform/game…):
 *    non-empty uid string → find that saved UID and **clear it** (delete UID only).
 * B) **Game + uid** (normal): set/update UID, or clear with uid null / clearUid true.
 */
const isUidOnlyGameProfileBody = (body) => {
  if (!body || typeof body !== 'object') return false;
  const keys = Object.keys(body);
  if (keys.length === 0) return false;
  if (Object.prototype.hasOwnProperty.call(body, 'clearUid')) return false;
  return keys.every((k) => k === 'uid' || k === 'gameUid');
};

const patchGameProfile = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const body = req.body || {};

  const user = await User.findById(userId);
  if (!checkUserExists(res, user)) {
    return;
  }

  const gp = cloneGamePreferenceForUpdate(user);
  const list = Array.isArray(gp.followedGames) ? gp.followedGames.map((e) => ({ ...e })) : [];

  if (isUidOnlyGameProfileBody(body)) {
    const raw =
      body.uid !== undefined && body.uid !== null
        ? String(body.uid).trim()
        : body.gameUid !== undefined && body.gameUid !== null
          ? String(body.gameUid).trim()
          : '';
    if (!raw) {
      return res.badRequest(
        'Uid-only payload: send a non-empty uid string to remove that saved UID from its game profile'
      );
    }
    if (raw.length > 100) {
      return res.badRequest('Game UID cannot exceed 100 characters');
    }
    const idx = list.findIndex((e) => e.uid != null && String(e.uid).trim() === raw);
    if (idx === -1) {
      return res.notFound('No game profile found with this UID');
    }
    list[idx] = { ...list[idx], uid: null };
    rebalanceFollowedGamesSelected(list);
    gp.followedGames = list;
    gp.updatedAt = new Date();
    user.gamePreference = gp;
    user.markModified('gamePreference');
    await user.save();
    const updatedUser = await User.findById(userId).select('-password -otp');
    return res.success(HTTP_STATUS.OK, 'Game UID removed', {
      gameProfiles: toGameProfiles(updatedUser?.gamePreference?.followedGames || []),
      gamePreference: gamePreferenceForApiResponse(updatedUser)
    });
  }

  const target = resolveTargetGameFromPayload(body);
  if (!target) {
    return res.badRequest(
      'Provide gameId, gameName, or platform+game — or uid-only body to clear by saved uid value'
    );
  }

  const hasUidKey =
    Object.prototype.hasOwnProperty.call(body, 'uid') ||
    Object.prototype.hasOwnProperty.call(body, 'gameUid');
  const rawUid = hasUidKey ? (body.uid !== undefined ? body.uid : body.gameUid) : undefined;
  const clearFlag = body.clearUid === true || body.clearUid === 'true';

  let nextUid;
  let mode;
  if (hasUidKey) {
    if (rawUid === null || rawUid === '') {
      mode = 'clear';
      nextUid = null;
    } else {
      const t = String(rawUid).trim();
      if (!t) {
        mode = 'clear';
        nextUid = null;
      } else {
        mode = 'set';
        nextUid = t;
        if (nextUid.length > 100) {
          return res.badRequest('Game UID cannot exceed 100 characters');
        }
      }
    }
  } else if (clearFlag) {
    mode = 'clear';
    nextUid = null;
  } else {
    return res.badRequest(
      'Send uid (string to save/update, null or empty to remove) or clearUid: true'
    );
  }

  const idx = list.findIndex(
    (e) =>
      String(e.platform).toLowerCase() === target.platform &&
      String(e.game).toLowerCase() === String(target.game).toLowerCase()
  );

  if (idx === -1) {
    if (mode === 'clear') {
      return res.notFound('No saved game profile found for this game');
    }
    list.push({
      platform: target.platform,
      game: target.game,
      uid: nextUid,
      selected: list.length === 0
    });
  } else {
    list[idx] = { ...list[idx], uid: nextUid };
  }

  rebalanceFollowedGamesSelected(list);
  gp.followedGames = list;
  gp.updatedAt = new Date();
  user.gamePreference = gp;
  user.markModified('gamePreference');
  await user.save();

  const updatedUser = await User.findById(userId).select('-password -otp');
  const message = mode === 'clear' ? 'Game UID removed' : 'Game UID updated';

  res.success(HTTP_STATUS.OK, message, {
    gameProfiles: toGameProfiles(updatedUser?.gamePreference?.followedGames || []),
    gamePreference: gamePreferenceForApiResponse(updatedUser)
  });
});

/**
 * Remove entire game row from followed list (not UID-only — use PATCH for that).
 * DELETE /api/profile/game-profile
 * Body: { action?: 'removeGame' | 'clearUid', ... } — clearUid kept for old clients; prefer PATCH to clear UID.
 */
const deleteGameProfile = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const action = String(req.body?.action || 'removeGame').trim();
  if (!['removeGame', 'clearUid'].includes(action)) {
    return res.badRequest('action must be removeGame or clearUid');
  }

  const target = resolveTargetGameFromPayload(req.body);
  if (!target) {
    return res.badRequest('Provide gameId, or gameName, or platform with game or gameName');
  }

  const user = await User.findById(userId);
  if (!checkUserExists(res, user)) {
    return;
  }

  const gp = cloneGamePreferenceForUpdate(user);
  const list = Array.isArray(gp.followedGames) ? gp.followedGames.map((e) => ({ ...e })) : [];
  const idx = list.findIndex(
    (e) =>
      String(e.platform).toLowerCase() === target.platform &&
      String(e.game).toLowerCase() === String(target.game).toLowerCase()
  );

  if (idx === -1) {
    return res.notFound('No saved game profile found for this game');
  }

  if (action === 'clearUid') {
    list[idx] = { ...list[idx], uid: null };
  } else {
    list.splice(idx, 1);
    rebalanceFollowedGamesSelected(list);
  }

  gp.followedGames = list;
  gp.updatedAt = new Date();
  user.gamePreference = gp;
  user.markModified('gamePreference');
  await user.save();

  const updatedUser = await User.findById(userId).select('-password -otp');
  const message =
    action === 'clearUid' ? 'Game UID removed' : 'Game profile removed from your list';

  res.success(HTTP_STATUS.OK, message, {
    gameProfiles: toGameProfiles(updatedUser?.gamePreference?.followedGames || []),
    gamePreference: gamePreferenceForApiResponse(updatedUser)
  });
});

/**
 * POST /api/profile/addresses — add a saved address; first row or setDefault:true becomes default.
 */
const addSavedAddress = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const user = await User.findById(userId);
  if (!checkUserExists(res, user)) {
    return;
  }
  await ensureLegacySavedAddressesMigrated(user);

  const { label, setDefault, ...addrRest } = req.body || {};
  let cleaned;
  let latlng;
  try {
    cleaned = normalizeAddress(addrRest);
    latlng = pickOptionalLatLngPair(req.body || {});
  } catch (e) {
    return res.badRequest(e.message);
  }

  if ((user.savedAddresses || []).length >= MAX_SAVED_ADDRESSES) {
    return res.badRequest(`You can save at most ${MAX_SAVED_ADDRESSES} addresses`);
  }

  const existing = user.savedAddresses || [];
  const makeDefault = setDefault === true || existing.length === 0;
  if (makeDefault) {
    for (const s of existing) {
      s.isDefault = false;
    }
  }

  user.savedAddresses.push({
    label: normalizeLabel(label),
    ...cleaned,
    isDefault: makeDefault,
    lat: latlng.lat,
    lng: latlng.lng
  });
  user.markModified('savedAddresses');
  syncAddressFieldFromDefault(user);
  await user.save();

  const fresh = await User.findById(userId).select('-password -otp');
  const last = fresh.savedAddresses[fresh.savedAddresses.length - 1];
  return res.created(MESSAGES.SUCCESS.SAVED_ADDRESS_ADDED, {
    ...buildProfileAddressPayload(fresh),
    added: formatSavedAddressDoc(last)
  });
});

/**
 * PATCH /api/profile/addresses/:addressId — update fields and/or setDefault.
 */
const patchSavedAddress = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { addressId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    return res.badRequest('Invalid addressId');
  }

  const user = await User.findById(userId);
  if (!checkUserExists(res, user)) {
    return;
  }
  await ensureLegacySavedAddressesMigrated(user);

  const sub = user.savedAddresses.id(addressId);
  if (!sub) {
    return res.notFound('Address not found');
  }

  const body = req.body || {};
  const addrKeys = [
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'pincode',
    'contactNumber',
    'countryCode'
  ];
  const hasAddrField = addrKeys.some((k) => Object.prototype.hasOwnProperty.call(body, k));
  const hasLatLngKey =
    Object.prototype.hasOwnProperty.call(body, 'lat') ||
    Object.prototype.hasOwnProperty.call(body, 'lng');
  const hasPatch =
    hasAddrField ||
    body.label !== undefined ||
    hasLatLngKey ||
    body.setDefault === true;
  if (!hasPatch) {
    return res.badRequest('Provide at least one field to update, or setDefault: true');
  }

  try {
    if (hasAddrField) {
      const merge = {
        addressLine1: Object.prototype.hasOwnProperty.call(body, 'addressLine1')
          ? body.addressLine1
          : sub.addressLine1,
        addressLine2: Object.prototype.hasOwnProperty.call(body, 'addressLine2')
          ? body.addressLine2
          : sub.addressLine2,
        city: Object.prototype.hasOwnProperty.call(body, 'city') ? body.city : sub.city,
        state: Object.prototype.hasOwnProperty.call(body, 'state') ? body.state : sub.state,
        pincode: Object.prototype.hasOwnProperty.call(body, 'pincode') ? body.pincode : sub.pincode,
        contactNumber: Object.prototype.hasOwnProperty.call(body, 'contactNumber')
          ? body.contactNumber
          : sub.contactNumber,
        countryCode: Object.prototype.hasOwnProperty.call(body, 'countryCode')
          ? body.countryCode
          : sub.countryCode
      };
      const cleaned = normalizeAddress(merge);
      Object.assign(sub, cleaned);
    }
    if (body.label !== undefined) {
      sub.label = normalizeLabel(body.label);
    }
    applyOptionalLatLngOnPatch(sub, body);
    if (body.setDefault === true) {
      for (const s of user.savedAddresses) {
        s.isDefault = String(s._id) === String(sub._id);
      }
    }
  } catch (e) {
    return res.badRequest(e.message);
  }

  user.markModified('savedAddresses');
  syncAddressFieldFromDefault(user);
  await user.save();

  const fresh = await User.findById(userId).select('-password -otp');
  const updated = fresh.savedAddresses.id(addressId);
  const message =
    body.setDefault === true ? MESSAGES.SUCCESS.DEFAULT_ADDRESS_SET : MESSAGES.SUCCESS.SAVED_ADDRESS_UPDATED;

  return res.success(HTTP_STATUS.OK, message, {
    ...buildProfileAddressPayload(fresh),
    updated: formatSavedAddressDoc(updated)
  });
});

/**
 * DELETE /api/profile/addresses/:addressId
 */
const deleteSavedAddress = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { addressId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    return res.badRequest('Invalid addressId');
  }

  const user = await User.findById(userId);
  if (!checkUserExists(res, user)) {
    return;
  }
  await ensureLegacySavedAddressesMigrated(user);

  const sub = user.savedAddresses.id(addressId);
  if (!sub) {
    return res.notFound('Address not found');
  }

  const removedAddressId = String(sub._id);
  const wasDefault = sub.isDefault;
  sub.deleteOne();
  user.markModified('savedAddresses');
  if (wasDefault && user.savedAddresses.length > 0) {
    setOldestRemainingAsDefault(user);
  }
  syncAddressFieldFromDefault(user);
  await user.save();

  const fresh = await User.findById(userId).select('-password -otp');
  return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.SAVED_ADDRESS_DELETED, {
    ...buildProfileAddressPayload(fresh),
    removedAddressId,
    wasDefault
  });
});

/**
 * PATCH /api/profile/addresses/default-index
 * Body: { index: number } (0-based, same order as `addresses` on GET profile).
 * Alias key: defaultIndex
 */
const patchDefaultAddressByIndex = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const raw = req.body?.index ?? req.body?.defaultIndex;
  if (raw === undefined || raw === null || raw === '') {
    return res.badRequest('Send index (0-based row in addresses list). You may use defaultIndex as an alias.');
  }
  const index = parseInt(String(raw), 10);
  if (!Number.isInteger(index) || index < 0) {
    return res.badRequest('index must be a non-negative integer');
  }

  const user = await User.findById(userId);
  if (!checkUserExists(res, user)) {
    return;
  }
  await ensureLegacySavedAddressesMigrated(user);

  const ordered = formatSavedAddressesList(user);
  if (ordered.length === 0) {
    return res.badRequest('No saved addresses');
  }
  if (index >= ordered.length) {
    return res.badRequest(`index must be between 0 and ${ordered.length - 1}`);
  }

  const targetId = ordered[index].addressId;
  for (const s of user.savedAddresses) {
    s.isDefault = String(s._id) === String(targetId);
  }
  user.markModified('savedAddresses');
  syncAddressFieldFromDefault(user);
  await user.save();

  const fresh = await User.findById(userId).select('-password -otp');
  return res.success(HTTP_STATUS.OK, MESSAGES.SUCCESS.DEFAULT_ADDRESS_SET, buildProfileAddressPayload(fresh));
});

module.exports = {
  getProfile,
  updateProfile,
  getGameOptions,
  updateFCMToken,
  getDashboardFeed,
  // Used by tournament/lobby listing to scope results to user's selected games.
  getUserSelectedGameGroups,
  getMe,
  uploadProfileAvatar,
  patchFollowedGames,
  patchGameProfile,
  deleteGameProfile,
  addSavedAddress,
  patchSavedAddress,
  deleteSavedAddress,
  patchDefaultAddressByIndex
};

