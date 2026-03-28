/**
 * Lobby rules helper - shared logic for filtering rules by tournament mode/subMode
 * Used by host and tournament controllers
 */

const { FREEFIRE_LOBBY_RULES } = require('../constants');

/**
 * Get filtered rules based on tournament mode and subMode
 * Returns only relevant rules for the specific tournament type
 * @param {string} mode - Tournament mode (BR, CS, LW)
 * @param {string} subMode - Tournament subMode (solo, duo, squad, 1v1, 2v2)
 * @returns {Object} Filtered rules object
 */
const getFilteredRules = (mode, subMode) => {
  const rules = FREEFIRE_LOBBY_RULES[mode];
  if (!rules) {
    return { mode, subMode, rules: [], generalRules: FREEFIRE_LOBBY_RULES.generalRules };
  }

  const subModeRules = rules[subMode];
  if (!subModeRules) {
    return { mode, subMode, rules: [], generalRules: FREEFIRE_LOBBY_RULES.generalRules };
  }

  return {
    ...subModeRules,
    generalRules: FREEFIRE_LOBBY_RULES.generalRules
  };
};

module.exports = {
  getFilteredRules
};
