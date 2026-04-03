/**
 * Per-game lobby generation config (modes / caps / labels).
 * Default rules follow Free Fire; other titles merge overrides here.
 */

const { GAME_MODES } = require('./game');
const { resolveAnyGameTitle } = require('./gameCatalog');

const cloneModes = (base) => JSON.parse(JSON.stringify(base));

/**
 * BGMI: “Clash Squad” in API is still mode CS / subMode clash (2 teams) — shown as **TDM** in UI.
 * **BR squad** caps at **16 teams** (each join = one team leader slot). Not TDM/CS.
 */
const PER_GAME_MODE_OVERRIDES = {
  BGMI: {
    BR: {
      squad: {
        maxPlayers: 16
      }
    }
  }
};

function getGameModesMerged(gameInput) {
  const title = resolveAnyGameTitle(gameInput) || gameInput;
  const overrides = title ? PER_GAME_MODE_OVERRIDES[title] : null;
  if (!overrides) {
    return GAME_MODES;
  }
  const merged = cloneModes(GAME_MODES);
  for (const mode of Object.keys(overrides)) {
    for (const sub of Object.keys(overrides[mode])) {
      merged[mode] = merged[mode] || {};
      merged[mode][sub] = {
        ...(merged[mode][sub] || {}),
        ...overrides[mode][sub]
      };
    }
  }
  return merged;
}

function getModeConfigForGame(gameTitle, mode, subMode) {
  const modes = getGameModesMerged(gameTitle);
  const modeConfig = modes[mode];
  if (!modeConfig) {
    throw new Error(`Invalid game mode: ${mode}`);
  }
  const subModeConfig = modeConfig[subMode];
  if (!subModeConfig) {
    throw new Error(`Invalid sub-mode: ${subMode} for mode: ${mode}`);
  }
  return subModeConfig;
}

/** User-facing format name where the same API mode differs by game (e.g. CS clash → TDM on BGMI). */
function getLobbyFormatLabel(game, mode, subMode) {
  const g = resolveAnyGameTitle(game) || game;
  if (mode === 'CS' && subMode === 'clash') {
    if (g === 'BGMI') return 'TDM';
    return 'Clash Squad';
  }
  return null;
}

function getCsTotalMatchesBounds(_gameTitle) {
  return { min: 1, max: 1, defaultMatches: 1 };
}

module.exports = {
  PER_GAME_MODE_OVERRIDES,
  getGameModesMerged,
  getModeConfigForGame,
  getLobbyFormatLabel,
  getCsTotalMatchesBounds
};
