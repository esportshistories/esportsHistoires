/**
 * Tournament Service
 * Handles tournament operations: generation, joining, results, rewards
 */

const mongoose = require('mongoose');
const Tournament = require('../models/Tournament.model');
const { GAME_MODES, MIN_TEAMS_FOR_START, POSITION_POINTS_TABLE } = require('../constants');
const Logger = require('../utils/logger');
const orgWalletService = require('./orgWallet.service');

/** Get participant user id whether participant is ObjectId or populated { _id } */
const toParticipantUserId = (p) => {
  if (p == null) return null;
  const id = p._id != null ? p._id : p;
  return (id && typeof id.toString === 'function') ? id.toString() : String(id);
};

/**
 * Get game mode configuration
 * @param {string} mode - Game mode (CS, BR, or LW)
 * @param {string} subMode - Sub mode
 * @returns {Object} Mode configuration
 */
const getModeConfig = (mode, subMode) => {
  const modeConfig = GAME_MODES[mode];
  if (!modeConfig) {
    throw new Error(`Invalid game mode: ${mode}`);
  }

  const subModeConfig = modeConfig[subMode];
  if (!subModeConfig) {
    throw new Error(`Invalid sub-mode: ${subMode} for mode: ${mode}`);
  }

  return subModeConfig;
};

/**
 * Calculate team statistics based on subMode
 * @param {string} subMode - Tournament subMode (solo, duo, squad, 1v1, 2v2)
 * @param {number} maxPlayers - Maximum players
 * @returns {Object} { playersPerTeam, maxTeams }
 */
const calculateTeamStats = (subMode, maxPlayers) => {
  let playersPerTeam = 1;
  let maxTeams = null;

  if (subMode === 'duo' || subMode === '2v2') {
    playersPerTeam = 2;
    maxTeams = Math.floor(maxPlayers / playersPerTeam);
  } else if (subMode === 'squad' || subMode === '4v4') {
    playersPerTeam = 4;
    maxTeams = Math.floor(maxPlayers / playersPerTeam);
  } else if (subMode === 'solo' || subMode === '1v1' || subMode === '7round' || subMode === '13round' || subMode === 'clash') {
    playersPerTeam = 1;
    maxTeams = maxPlayers;
  }

  return { playersPerTeam, maxTeams };
};

/**
 * Calculate prize pool breakdown from total prize pool
 * @param {number} totalPrizePool - Total prize pool amount
 * @returns {Object} Prize pool breakdown with fees
 */
/** Fixed host fee per lobby (GC) - host gets this amount when result is declared. Not used for CS. */
const HOST_FEE_FIXED_GC = 40;

/** Clash Squad: host gets 5 GC for 25/50/75 entry, 10 GC for 100/150/200/300. Rest of fee share goes to platform. */
const CS_HOST_FEE_SMALL_GC = 5;
const CS_HOST_FEE_LARGE_GC = 10;
const CS_SMALL_ENTRY_FEES = [25, 50, 75];

/**
 * Calculate prize pool breakdown from total prize pool.
 * Clash Squad (CS): 85% winner prize pool, 15% fees. Host: 5 GC (25/50/75 entry) or 10 GC (100+); caster 5%; remainder → platform.
 * BR/LW: 5% platform, 5% caster, fixed 40 GC host; remainder = winner prize pool (split 50/30/20 for top 3).
 * @param {number} totalPrizePool - Total collected (joinedTeams * entryFee)
 * @param {string} [mode] - 'CS', 'BR', or 'LW'
 * @param {number} [entryFee] - Required when mode is CS (to decide host 5 vs 10 GC)
 */
const calculatePrizePoolBreakdown = (totalPrizePool, mode, entryFee) => {
  if (mode === 'CS') {
    const CS_WINNER_POOL_PERCENT = 0.85;
    const CS_CASTER_PERCENT = 0.05;
    const winnerPrizePool = Math.floor(totalPrizePool * CS_WINNER_POOL_PERCENT);
    const totalFees = totalPrizePool - winnerPrizePool;
    const casterFee = Math.floor(totalPrizePool * CS_CASTER_PERCENT);
    const entryFeeNum = Number(entryFee);
    const hostFee = (entryFeeNum != null && !isNaN(entryFeeNum) && CS_SMALL_ENTRY_FEES.includes(entryFeeNum))
      ? CS_HOST_FEE_SMALL_GC
      : CS_HOST_FEE_LARGE_GC;
    const platformFee = Math.max(0, totalFees - casterFee - hostFee);
    return {
      totalPrizePool,
      platformFee,
      hostFee,
      casterFee,
      totalFees,
      winnerPrizePool
    };
  }

  const PLATFORM_FEE_PERCENTAGE = 0.05; // 5%
  const CASTER_FEE_PERCENTAGE = 0.05; // 5%

  const platformFee = Math.floor(totalPrizePool * PLATFORM_FEE_PERCENTAGE);
  const hostFee = HOST_FEE_FIXED_GC; // Fixed 40 GC per lobby, not percentage
  const casterFee = Math.floor(totalPrizePool * CASTER_FEE_PERCENTAGE);
  const totalFees = platformFee + hostFee + casterFee;
  const winnerPrizePool = totalPrizePool - totalFees;

  return {
    totalPrizePool,
    platformFee,
    hostFee,
    casterFee,
    totalFees,
    winnerPrizePool
  };
};

/**
 * IMPORTANT: Timezone handling
 *
 * All tournament dates/times are for INDIAN lobbies and must follow IST
 * (Asia/Kolkata, UTC+05:30) regardless of the server's local timezone.
 *
 * We store dates in MongoDB as UTC (e.g. 2026‑01‑28T00:00:00.000Z) but we
 * always interpret them as IST calendar dates + IST clock times.
 *
 * The helpers below convert between:
 *   - Stored UTC Date (MongoDB)
 *   - IST wall‑clock (what users/admins think in)
 *   - UTC milliseconds used for all comparisons
 */

// Fixed IST offset: 5 hours 30 minutes ahead of UTC
const IST_OFFSET_MINUTES = 5.5 * 60; // 330

/**
 * Given a stored tournament date (UTC date), return its IST calendar Y-M-D.
 * @param {Date} date
 * @returns {{ year: number, month: number, day: number }}
 */
const getISTDateComponents = (date) => {
  const base = new Date(date);
  const utcMs = base.getTime();
  const istMs = utcMs + IST_OFFSET_MINUTES * 60 * 1000;
  const istDate = new Date(istMs);

  // Use UTC getters here because istDate already has IST-adjusted ms
  return {
    year: istDate.getUTCFullYear(),
    month: istDate.getUTCMonth(), // 0-based
    day: istDate.getUTCDate()
  };
};

/**
 * Build a UTC Date that corresponds to a given IST calendar datetime.
 * Example: 2026‑01‑28 12:00 IST → 2026‑01‑28 06:30 UTC.
 *
 * @param {number} year
 * @param {number} month - 0-based
 * @param {number} day
 * @param {number} hour24
 * @param {number} minute
 * @returns {Date} UTC Date representing that IST moment
 */
const buildUTCFromIST = (year, month, day, hour24, minute) => {
  // First build a "virtual" IST datetime in UTC space…
  const istMs = Date.UTC(year, month, day, hour24, minute || 0, 0, 0);
  // …then subtract IST offset to get the real UTC timestamp
  const utcMs = istMs - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
};

/**
 * Calculate start datetime from date and startTime string, using IST.
 * @param {Date} date - Tournament date (stored as UTC but interpreted as IST date)
 * @param {string} startTime - Start time (e.g., "12:00 PM")
 * @returns {Date} Start datetime in UTC (for comparisons)
 */
const calculateStartDateTime = (date, startTime) => {
  if (!date || !startTime) return null;

  const [time, period] = startTime.split(' ');
  const [hours, minutes] = time.split(':').map(Number);
  
  let hour24 = hours;
  if (period === 'PM' && hours !== 12) {
    hour24 = hours + 12;
  } else if (period === 'AM' && hours === 12) {
    hour24 = 0;
  }

  const { year, month, day } = getISTDateComponents(new Date(date));
  return buildUTCFromIST(year, month, day, hour24, minutes || 0);
};

/**
 * Calculate lock time (same as start time - no early lock)
 * @param {Date} date - Tournament date
 * @param {string} startTime - Start time (e.g., "12:00 PM")
 * @returns {Date} Lock time (same as start time)
 */
const calculateLockTime = (date, startTime) => {
  const startDateTime = calculateStartDateTime(date, startTime);
  // Return start time itself - tournaments lock only when they start
  return startDateTime;
};

/**
 * Check if a time slot has already passed for today, using IST.
 * @param {string} timeSlot - Time slot (e.g., "12:00 PM")
 * @param {Date} targetDate - Target date (stored as UTC but interpreted as IST)
 * @returns {boolean} True if time slot has passed, false otherwise
 */
const isTimeSlotPassed = (timeSlot, targetDate) => {
  const [time, period] = timeSlot.split(' ');
  const [hours, minutes] = time.split(':').map(Number);
  
  let hour24 = hours;
  if (period === 'PM' && hours !== 12) {
    hour24 = hours + 12;
  } else if (period === 'AM' && hours === 12) {
    hour24 = 0;
  }

  const { year, month, day } = getISTDateComponents(new Date(targetDate));
  const slotDateTime = buildUTCFromIST(year, month, day, hour24, minutes || 0);

  const now = new Date(); // current UTC time
  return now >= slotDateTime;
};

/**
 * Generate tournaments for next day
 * @returns {Promise<Array>} Array of created tournaments
 */
const generateNextDayLobbies = async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const timeSlots = ['12:00 PM', '3:00 PM', '6:00 PM', '9:00 PM'];
  const tournamentData = [];

  // Generate tournaments for each game mode and sub-mode
  for (const [mode, subModes] of Object.entries(GAME_MODES)) {
    for (const [subMode, config] of Object.entries(subModes)) {
      for (const startTime of timeSlots) {
        const lockTime = calculateLockTime(tomorrow, startTime);
        
        // Check existing lobbies with same parameters to determine lobby number
        const existingLobbies = await Tournament.countDocuments({
          date: tomorrow,
          startTime,
          mode,
          subMode,
          entryFee: config.entryFee,
          region: 'Global'
        });

        // Calculate team stats and potential prize pool at creation time (same as generateLobbies)
        const { playersPerTeam, maxTeams } = calculateTeamStats(subMode, config.maxPlayers);
        const potentialTotalPrizePool = maxTeams * config.entryFee;
        const potentialPrizePoolBreakdown = calculatePrizePoolBreakdown(potentialTotalPrizePool, mode, config.entryFee);

        // Generate lobby name: "Lobby 1 75 10:15 PM" (includes entry fee and full time for easy identification)
        const lobbyNumber = existingLobbies + 1;
        const lobbyName = `Lobby ${lobbyNumber} ${config.entryFee} ${startTime}`;

        // IMPORTANT: Each lobby is created without a host. Hosts must apply separately for each tournament.
        // No automatic host assignment - each lobby requires individual host application.
        // CS: 1 match only - host publishes single final result (7 or 13 rounds)
        const totalMatches = mode === 'CS' ? 1 : 6;
        tournamentData.push({
          game: 'Free Fire',
          mode,
          subMode,
          entryFee: config.entryFee,
          maxPlayers: config.maxPlayers,
          date: tomorrow,
          startTime,
          lockTime,
          participants: [],
          hostId: null, // Explicitly set to null - hosts must apply separately for each lobby
          room: {
            roomId: null,
            password: null
          },
          prizePool: 0, // Will be updated when participants join
          totalMatches,
          // Store potential prize pool breakdown at creation time
          platformFees: {
            totalPrizePool: 0, // Current (will update when participants join)
            platformFee: 0,
            hostFee: 0,
            casterFee: 0,
            totalFees: 0,
            winnerPrizePool: 0,
            // Store potential prize pool breakdown for get APIs
            potentialTotalPrizePool: potentialTotalPrizePool,
            potentialPlatformFee: potentialPrizePoolBreakdown.platformFee,
            potentialHostFee: potentialPrizePoolBreakdown.hostFee,
            potentialCasterFee: potentialPrizePoolBreakdown.casterFee,
            potentialTotalFees: potentialPrizePoolBreakdown.totalFees,
            potentialWinnerPrizePool: potentialPrizePoolBreakdown.winnerPrizePool
          },
          status: 'upcoming',
          region: 'Global',
          lobbyName: lobbyName,
          results: []
        });
      }
    }
  }

  return tournamentData.length > 0 ? await Tournament.insertMany(tournamentData) : [];
};

/**
 * Generate tournaments with custom parameters
 * @param {Object} options - Generation options
 * @param {string} options.date - Date in ISO format (YYYY-MM-DD) or Date object
 * @param {Array<string>} options.timeSlots - Array of time slots ['12:00 PM', '3:00 PM', '6:00 PM', '9:00 PM']
 * @param {string} options.mode - 'CS', 'BR', or 'LW'
 * @param {Array<string>} [options.subModes] - Array of sub-modes (optional for CS/LW, required for BR)
 *   - For CS: ['clash'] (optional - if not provided, defaults to clash; 2 teams, max 4 players per team, 1 match, 7/13 rounds host decides manually)
 *   - For BR: ['solo', 'duo', 'squad'] (required)
 *   - For LW: ['solo', 'duo', 'squad', '1v1', '2v2'] (optional - if not provided, defaults to ['1v1']. If '1v1' is selected, '2v2' is automatically included)
 * @param {Array<number>} options.entryFees - Array of entry fees [0, 25, 50, 75, 100, 150, 200, 300] (optional, defaults to mode config)
 * @param {string} options.region - 'Asia' or 'Global' (default: 'Global')
 * @param {string} [options.lobbyName] - Optional custom lobby name (overrides default generated name)
 * @returns {Promise<Array>} Array of created tournaments
 */
const generateLobbies = async (options) => {
  const { date, timeSlots, mode, subModes, entryFees, region = 'Global', lobbyName } = options;

  // Validate date
  if (!date) {
    throw new Error('date is required. Must be a valid date in ISO format (YYYY-MM-DD)');
  }

  let targetDate;
  if (typeof date === 'string') {
    targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      throw new Error('Invalid date format. Must be a valid date in ISO format (YYYY-MM-DD)');
    }
  } else if (date instanceof Date) {
    targetDate = new Date(date);
  } else {
    throw new Error('Invalid date. Must be a date string (YYYY-MM-DD) or Date object');
  }

  // Set time to midnight in UTC to ensure consistent date storage in MongoDB
  // MongoDB stores dates in UTC, so we need to normalize to UTC to avoid timezone issues
  // This ensures tournament.date field matches exactly when filtering
  const dateStr = targetDate.toISOString().split('T')[0]; // Get YYYY-MM-DD in UTC
  const [year, month, day] = dateStr.split('-').map(Number);
  targetDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)); // UTC midnight

  // Validate that date is not in the past (compare in UTC)
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number);
  const todayUTC = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay, 0, 0, 0, 0));
  
  if (targetDate < todayUTC) {
    const selectedDateStr = targetDate.toISOString().split('T')[0];
    throw new Error(`Date cannot be in the past. Selected date: ${selectedDateStr}, Today: ${todayStr}`);
  }

  // Validate mode
  if (mode !== 'CS' && mode !== 'BR' && mode !== 'LW') {
    throw new Error('Invalid mode. Must be "CS", "BR", or "LW"');
  }

  // Validate time slots format (HH:MM AM/PM) - space required between time and AM/PM
  const TIME_SLOT_REGEX = /^([1-9]|1[0-2]):([0-5][0-9])\s(AM|PM)$/i;
  if (!Array.isArray(timeSlots) || timeSlots.length === 0) {
    throw new Error('timeSlots must be a non-empty array');
  }
  for (const timeSlot of timeSlots) {
    if (typeof timeSlot !== 'string' || !TIME_SLOT_REGEX.test(timeSlot)) {
      throw new Error(`Invalid time slot format: ${timeSlot}. Must be in format "HH:MM AM/PM" (e.g., "5:00 PM", "12:00 PM", "9:30 AM")`);
    }
  }

  // Validate sub-modes based on mode
  // subModes is required for BR, but optional for CS and LW
  let finalSubModes = subModes;
  const validSubModesByMode = {
    'CS': ['clash'],
    'BR': ['solo', 'duo', 'squad'],
    'LW': ['solo', 'duo', 'squad', '1v1', '2v2']
  };
  const validSubModes = validSubModesByMode[mode] || [];
  
  if (mode === 'BR') {
    // BR requires subModes
    if (!Array.isArray(subModes) || subModes.length === 0) {
      throw new Error('subModes is required and must be a non-empty array for BR mode');
    }
  } else if (mode === 'CS') {
    // CS: only clash. Admin need not send subModes; we always create clash from code. Ignore request.
    finalSubModes = ['clash'];
  } else if (mode === 'LW') {
    // LW: if subModes is not provided or empty, default to '1v1'
    if (!subModes || !Array.isArray(subModes) || subModes.length === 0) {
      finalSubModes = ['1v1'];
    } else {
      // If '1v1' is selected, automatically also include '2v2'
      if (subModes.includes('1v1') && !subModes.includes('2v2')) {
        finalSubModes = [...subModes, '2v2'];
      }
    }
  }
  
  // Validate each subMode value (after mapping for CS)
  for (const subMode of finalSubModes) {
    if (!validSubModes.includes(subMode)) {
      throw new Error(`Invalid subMode: ${subMode} for mode: ${mode}. Must be one of: ${validSubModes.join(', ')}`);
    }
  }

  // Validate region
  if (region !== 'Asia' && region !== 'Global') {
    throw new Error('Invalid region. Must be "Asia" or "Global"');
  }

  // Validate optional custom lobby name
  const customLobbyName = typeof lobbyName === 'string' ? lobbyName.trim() : '';
  if (lobbyName !== undefined) {
    if (!customLobbyName) {
      throw new Error('lobbyName cannot be empty');
    }
    if (customLobbyName.length > 100) {
      throw new Error('lobbyName cannot exceed 100 characters');
    }
  }

  // Validate entry fees if provided
  const VALID_ENTRY_FEES = [0, 25, 50, 75, 100, 150, 200, 300];
  let validEntryFees = [];
  if (entryFees && Array.isArray(entryFees) && entryFees.length > 0) {
    for (const fee of entryFees) {
      if (!VALID_ENTRY_FEES.includes(Number(fee))) {
        throw new Error(`Invalid entry fee: ${fee}. Must be one of: ${VALID_ENTRY_FEES.join(', ')}`);
      }
    }
    validEntryFees = entryFees.map(f => Number(f));
  }

  // Check if selected date is today
  // Both dates are already set to midnight, so direct comparison works
  const isToday = targetDate.getTime() === today.getTime();

  // Filter out passed time slots if date is today
  // For future dates, all time slots are valid
  let validTimeSlots = timeSlots;
  const skippedTimeSlotsSet = new Set();
  
  if (isToday) {
    // For today: filter out time slots that have already passed
    const passedTimeSlots = timeSlots.filter(timeSlot => isTimeSlotPassed(timeSlot, targetDate));
    passedTimeSlots.forEach(slot => skippedTimeSlotsSet.add(slot));
    validTimeSlots = timeSlots.filter(timeSlot => !isTimeSlotPassed(timeSlot, targetDate));
    
    // Only throw error if ALL selected time slots have passed (and user selected at least one)
    if (validTimeSlots.length === 0 && timeSlots.length > 0) {
      throw new Error(`All selected time slots have already passed for today (${targetDate.toLocaleDateString()}). Please select future time slots or choose a future date.`);
    }
  }
  // For future dates: all time slots are valid, no need to check

  const tournamentData = [];
  
  // Track lobby counts per combination to handle multiple lobbies in same request
  // Key format: `${date}-${startTime}-${mode}-${subMode}-${entryFee}-${region}`
  const lobbyCountMap = new Map();

  // Generate tournaments for each sub-mode, time slot, and entry fee combination
  for (const subMode of finalSubModes) {
    const config = getModeConfig(mode, subMode);
    
    // Use entryFees if provided, otherwise use default from config
    const feesToUse = validEntryFees.length > 0 ? validEntryFees : [config.entryFee];
    
    for (const entryFee of feesToUse) {
      // Use validTimeSlots instead of timeSlots to only process valid time slots
      for (const startTime of validTimeSlots) {
        // Create a unique key for this combination
        const dateKey = targetDate.toISOString().split('T')[0];
        const combinationKey = `${dateKey}-${startTime}-${mode}-${subMode}-${entryFee}-${region}`;
        
        // Check existing lobbies with same parameters to determine starting lobby number
        // Only check once per combination, then increment for subsequent lobbies in same request
        if (!lobbyCountMap.has(combinationKey)) {
          const existingLobbies = await Tournament.countDocuments({
            date: targetDate,
            startTime,
            mode,
            subMode,
            entryFee,
            region
          });
          lobbyCountMap.set(combinationKey, existingLobbies);
        }
        
        // Get current count and increment for this lobby
        const currentCount = lobbyCountMap.get(combinationKey);
        const lobbyNumber = currentCount + 1;
        lobbyCountMap.set(combinationKey, lobbyNumber);

        const lockTime = calculateLockTime(targetDate, startTime);
        
        // Calculate team stats and potential prize pool at creation time
        // This will be stored and used by all get APIs - no need to recalculate
        const { playersPerTeam, maxTeams } = calculateTeamStats(subMode, config.maxPlayers);
        const potentialTotalPrizePool = maxTeams * entryFee;
        const potentialPrizePoolBreakdown = calculatePrizePoolBreakdown(potentialTotalPrizePool, mode, entryFee);

        // Generate default lobby name: "Lobby 1 75 10:15 PM" (includes entry fee and full time for easy identification)
        // If admin sends custom lobbyName, use that instead.
        const generatedLobbyName = `Lobby ${lobbyNumber} ${entryFee} ${startTime}`;
        const finalLobbyName = customLobbyName || generatedLobbyName;

        // IMPORTANT: Each lobby is created without a host. Hosts must apply separately for each tournament.
        // No automatic host assignment - each lobby requires individual host application.
        // CS: 1 match only - host publishes single final result (7 or 13 rounds)
        const totalMatches = mode === 'CS' ? 1 : 6;
        tournamentData.push({
          game: 'Free Fire',
          mode,
          subMode,
          entryFee: entryFee,
          maxPlayers: config.maxPlayers,
          date: targetDate,
          startTime,
          lockTime,
          participants: [],
          hostId: null, // Explicitly set to null - hosts must apply separately for each lobby
          room: {
            roomId: null,
            password: null
          },
          prizePool: 0, // Will be updated when participants join
          totalMatches,
          // Store potential prize pool breakdown at creation time
          // Get APIs will use this stored data instead of recalculating
          platformFees: {
            totalPrizePool: 0, // Current (will update when participants join)
            platformFee: 0,
            hostFee: 0,
            casterFee: 0,
            totalFees: 0,
            winnerPrizePool: 0,
            // Store potential prize pool breakdown for get APIs
            potentialTotalPrizePool: potentialTotalPrizePool,
            potentialPlatformFee: potentialPrizePoolBreakdown.platformFee,
            potentialHostFee: potentialPrizePoolBreakdown.hostFee,
            potentialCasterFee: potentialPrizePoolBreakdown.casterFee,
            potentialTotalFees: potentialPrizePoolBreakdown.totalFees,
            potentialWinnerPrizePool: potentialPrizePoolBreakdown.winnerPrizePool
          },
          status: 'upcoming',
          region,
          lobbyName: finalLobbyName,
          results: []
        });
      }
    }
  }

  // Use insertMany for efficient bulk creation
  const tournaments = tournamentData.length > 0 ? await Tournament.insertMany(tournamentData) : [];
  
  // Return tournaments with info about skipped slots
  return {
    tournaments,
    skippedTimeSlots: Array.from(skippedTimeSlotsSet)
  };
};

/**
 * Update prize pool based on participants and calculate platform fees
 * @param {string} tournamentId - Tournament ID
 * @returns {Promise<Object>} Updated tournament
 */
const updatePrizePool = async (tournamentId) => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  // Calculate teams based on subMode (entry fee is per TEAM, not per player)
  // Each participant entry = 1 team (team leader joins, other team members are optional)
  // SOLO/1v1: 1 player per team, each participant = 1 team
  // DUO/2v2: up to 2 players per team, each participant = 1 team
  // SQUAD/4v4: up to 4 players per team, each participant = 1 team
  let playersPerTeam = 1;
  if (tournament.subMode === 'duo' || tournament.subMode === '2v2') {
    playersPerTeam = 2;
  } else if (tournament.subMode === 'squad' || tournament.subMode === '4v4') {
    playersPerTeam = 4;
  }
  // solo and 1v1 default to 1 player per team
  
  // Calculate joined teams: each participant = 1 team (team leader)
  // For 2v2: 1 participant = 1 team (can have up to 2 players)
  // For 4v4/squad: 1 participant = 1 team (can have up to 4 players)
  const joinedTeams = tournament.participants.length;
  
  // Total prize pool = joined teams × entryFee (entry fee is per team)
  const totalPrizePool = joinedTeams * tournament.entryFee;

  const breakdown = calculatePrizePoolBreakdown(totalPrizePool, tournament.mode, tournament.entryFee);
  const { platformFee, hostFee, casterFee, totalFees, winnerPrizePool } = breakdown;

  tournament.prizePool = totalPrizePool;
  
  // Preserve potential prize pool values when updating current prize pool
  // Use spread operator to merge new current values with existing potential values
  tournament.platformFees = {
    ...tournament.platformFees, // Preserve existing fields (especially potential* fields)
    totalPrizePool,
    platformFee,
    hostFee,
    casterFee,
    totalFees,
    winnerPrizePool
  };
  
  await tournament.save();

  return tournament;
};

/**
 * Calculate rewards based on winner prize pool (after fees) and position.
 * Clash Squad (CS): only position 1 gets 100% of winner prize pool; 2nd gets nothing.
 * BR/LW: 50% / 30% / 20% for top 3.
 * @param {number} winnerPrizePool - Winner prize pool (after fees deducted)
 * @param {number} position - Player position (1, 2, 3, etc.)
 * @param {string} [mode] - 'CS', 'BR', or 'LW'
 * @returns {number} Reward amount in GC
 */
const calculateReward = (winnerPrizePool, position, mode) => {
  if (mode === 'CS') {
    // Clash Squad: only winner gets prize; loser (2nd) gets nothing
    return position === 1 ? Math.floor(winnerPrizePool) : 0;
  }

  const rewardDistribution = [
    { position: 1, percentage: 0.50 }, // 50% for 1st place
    { position: 2, percentage: 0.30 }, // 30% for 2nd place
    { position: 3, percentage: 0.20 }  // 20% for 3rd place
  ];

  const distribution = rewardDistribution.find(d => d.position === position);
  if (!distribution) {
    return 0; // No reward for positions beyond top 3
  }

  return Math.floor(winnerPrizePool * distribution.percentage);
};

/**
 * Generate rewards for tournament results
 * @param {string} tournamentId - Tournament ID
 * @param {Array} results - Array of {userId, position, kills?}
 * @returns {Promise<Object>} Updated tournament with rewards
 */
const generateRewards = async (tournamentId, results) => {
  // Load tournament to decide which prize pool logic to apply
  let tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  // Org-sponsored free-entry tournaments (entryFee = 0, fixed prizePool > 0)
  // use organization wallet funds instead of entry-fee based prize pool.
  const isOrgSponsoredFree = Boolean(
    tournament.organizationId &&
    Number(tournament.entryFee) === 0 &&
    Number(tournament.prizePool) > 0
  );

  if (!isOrgSponsoredFree) {
    // Default behaviour for regular tournaments – prize pool from entry fees.
    await updatePrizePool(tournamentId);
    tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }
  } else {
    // For org-sponsored free tournaments:
    // - Keep tournament.prizePool as-is (admin/org-set fixed amount)
    // - Treat full prizePool as winnerPrizePool, no platform/host/caster fees here.
    const fixedPool = Number(tournament.prizePool) || 0;
    tournament.platformFees = {
      ...(tournament.platformFees || {}),
      totalPrizePool: fixedPool,
      platformFee: 0,
      hostFee: 0,
      casterFee: 0,
      totalFees: 0,
      winnerPrizePool: fixedPool
    };
    await tournament.save();
  }

  // EDGE CASE FIX: Validate tournament status - results can only be submitted for running or result_pending tournaments
  if (!['running', 'result_pending'].includes(tournament.status)) {
    throw new Error(`Cannot submit results. Tournament status is: ${tournament.status}. Results can only be submitted for running or result_pending tournaments.`);
  }

  // EDGE CASE FIX: Validate that tournament has participants
  if (!tournament.participants || tournament.participants.length === 0) {
    throw new Error('Cannot submit results. Tournament has no participants.');
  }

  // Sort results by position
  const sortedResults = results.sort((a, b) => a.position - b.position);

  // Generate rewards for each result using winner prize pool (after fees)
  const winnerPrizePool = tournament.platformFees.winnerPrizePool;
  
  const resultsWithRewards = sortedResults.map(result => ({
    userId: result.userId,
    position: result.position,
    // Kills are optional in payload; default to 0 if not provided
    kills: typeof result.kills === 'number' ? result.kills : 0,
    rewardGC: calculateReward(winnerPrizePool, result.position, tournament.mode),
    claimed: false
  }));

  // EDGE CASE FIX: Handle rounding errors - distribute remainder to 1st place
  const totalRewards = resultsWithRewards.reduce((sum, r) => sum + r.rewardGC, 0);
  const unaccountedGC = winnerPrizePool - totalRewards;
  if (unaccountedGC > 0 && resultsWithRewards.length > 0) {
    const firstPlace = resultsWithRewards.find(r => r.position === 1);
    if (firstPlace) {
      firstPlace.rewardGC += unaccountedGC;
    }
  }

  // Auto-credit rewards to winners' wallets (no claim step needed)
  // Lazy require to avoid circular dependency (wallet -> websocket -> tournament)
  const walletService = require('./wallet.service');
  const participantCount = (tournament.participants || []).length;
  for (const r of resultsWithRewards) {
    if (r.rewardGC > 0) {
      try {
        await walletService.addReward(
          r.userId,
          r.rewardGC,
          `Reward for ${tournament.game} ${tournament.mode} ${tournament.subMode} - Position ${r.position}`,
          tournamentId,
          { position: r.position, participantCount }
        );
        r.claimed = true;
      } catch (walletErr) {
        Logger.error('Failed to credit reward to winner wallet', { userId: r.userId, rewardGC: r.rewardGC, tournamentId, errName: walletErr.name });
        throw walletErr;
      }
    }
  }

  // Credit host fee:
  // - Regular tournaments: existing fixed/percentage host fee logic (from entry fees).
  // - Org-sponsored free tournaments: host can be paid separately from org wallet in future;
  //   for now we keep hostFee = 0 there to avoid double counting.
  const hostId = tournament.hostId ? tournament.hostId.toString() : null;
  const hostFee = (tournament.platformFees && tournament.platformFees.hostFee) ? tournament.platformFees.hostFee : 0;
  if (!isOrgSponsoredFree && hostId && hostFee > 0) {
    try {
      await walletService.addBalance(
        hostId,
        hostFee,
        `Host fee for lobby - ${tournament.game} ${tournament.mode} ${tournament.subMode} (${tournament.lobbyName || tournament._id})`,
        'success',
        'system'
      );
      Logger.info('Host fee credited', { tournamentId, hostId, hostFee });
    } catch (hostFeeErr) {
      Logger.error('Failed to credit host fee', { tournamentId, hostId, hostFee, errName: hostFeeErr.name });
      throw hostFeeErr;
    }
  }

  // For org-sponsored free tournaments, deduct total winner prize pool from org locked funds.
  if (isOrgSponsoredFree && winnerPrizePool > 0 && tournament.organizationId) {
    try {
      await orgWalletService.spendLockedOrgFunds(tournament.organizationId, winnerPrizePool);
      Logger.info('Org locked funds spent for rewards', {
        tournamentId,
        organizationId: tournament.organizationId.toString(),
        amount: winnerPrizePool
      });
    } catch (orgErr) {
      Logger.error('Failed to deduct org locked funds for rewards', {
        tournamentId,
        organizationId: tournament.organizationId.toString(),
        amount: winnerPrizePool,
        errName: orgErr.name
      });
      throw orgErr;
    }
  }

  tournament.results = resultsWithRewards;
  // When results are published, move from 'running' or 'result_pending' to 'completed'
  tournament.status = 'completed';
  await tournament.save();

  // Broadcast status change via WebSocket
  const { broadcastTournamentUpdate } = require('./websocket.service');
  try {
    broadcastTournamentUpdate(tournament._id.toString(), {
      status: 'completed',
      tournamentId: tournament._id.toString(),
      date: tournament.date,
      startTime: tournament.startTime,
      mode: tournament.mode,
      subMode: tournament.subMode,
      joinedTeams: tournament.participants?.length || 0,
      message: 'Tournament results published. Rewards credited to winners\' wallets.'
    }, {
      userId: null,
      hostId: tournament.hostId ? tournament.hostId.toString() : null,
      broadcastToAll: true
    });
  } catch (wsError) {
    Logger.error('Error broadcasting tournament completion', { errName: wsError.name });
  }

  return tournament;
};

/**
 * Join tournament
 * @param {string} tournamentId - Tournament ID
 * @param {string} userId - User ID
 * @param {Object|null} teamData - Optional team data { leaderUserId, teamName, players }
 * @returns {Promise<Object>} Updated tournament
 */
const joinTournament = async (tournamentId, userId, teamData = null) => {
  const now = new Date();
  
  // Use a single atomic operation for the entire join process
  const updateQuery = {
    $addToSet: { participants: userId },
    $set: { updatedAt: now }
  };

  if (teamData && teamData.teamName) {
    updateQuery.$push = {
      teams: {
        leaderUserId: userId,
        teamName: teamData.teamName,
        players: Array.isArray(teamData.players)
          ? teamData.players.map(name => ({ name }))
          : []
      }
    };
  }

  // Allow join until last second before start (lockTime = start time). Slot must be available.
  const updatedTournament = await Tournament.findOneAndUpdate(
    {
      _id: tournamentId,
      status: { $in: ['upcoming', 'locked'] },
      participants: { $ne: userId },
      $expr: { 
        $and: [
          { $lt: [{ $size: { $ifNull: ['$participants', []] } }, '$maxPlayers'] },
          { $gt: ['$lockTime', now] }
        ]
      }
    },
    updateQuery,
    { new: true, runValidators: true }
  );

  if (!updatedTournament) {
    // If update failed, we need to know why to provide a good error message.
    // This is still one extra roundtrip but only on failure.
    const latestTournament = await Tournament.findById(tournamentId);
    if (!latestTournament) throw new Error('Tournament not found');
    if (!['upcoming', 'locked'].includes(latestTournament.status)) {
      throw new Error(`Cannot join tournament. Status is: ${latestTournament.status}`);
    }
    if (latestTournament.participants.includes(userId)) throw new Error('User is already a participant');
    if (latestTournament.participants.length >= latestTournament.maxPlayers) throw new Error('Tournament is full');
    
    // User can join until 1 sec before start (11:29:59). Block at start time (11:30).
    const startDateTime = calculateStartDateTime(latestTournament.date, latestTournament.startTime);
    if (now >= startDateTime) throw new Error('Tournament has gone live. Join option is closed.');
    
    throw new Error('Tournament is locked or cannot be joined');
  }

  // Update prize pool asynchronously (don't wait for it to return the response)
  updatePrizePool(tournamentId).catch(err => Logger.error('Failed to update prize pool', { errName: err.name }));

  return updatedTournament;
};

/**
 * Get tournaments by status (dynamic filtering)
 * @param {string} status - Tournament status: 'upcoming', 'live', 'completed', 'pendingResult'
 * @param {Date} fromDate - Start date (optional)
 * @param {Date} toDate - End date (optional)
 * @param {string} date - Specific date filter (optional, YYYY-MM-DD format)
 * @param {string} subMode - Filter by subMode: 'solo', 'duo', 'squad', '1v1', '2v2' (optional)
 * @param {string} mode - Filter by mode: 'CS', 'BR', 'LW' (optional)
 * @returns {Promise<Array>} Array of tournaments with joinedCount and availableSlots
 */
const getTournamentsByStatus = async (status = 'upcoming', fromDate = null, toDate = null, date = null, subMode = null, mode = null) => {
  let matchQuery = {};
  
  // Helper function to create date range for exact date match (handles timezone correctly)
  const createDateRange = (dateString) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      throw new Error(`Invalid date format. Expected YYYY-MM-DD, got: ${dateString}`);
    }
    const [year, month, day] = dateString.split('-').map(Number);
    const targetDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)); 
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
    return { start: targetDate, end: nextDay };
  };

  // Map status to tournament statuses
  if (status === 'upcoming') {
    matchQuery.status = { $in: ['upcoming', 'locked'] };
    if (date) {
      const dateRange = createDateRange(date);
      matchQuery.date = { $gte: dateRange.start, $lt: dateRange.end };
    } else if (fromDate) {
      matchQuery.date = { $gte: fromDate };
      if (toDate) matchQuery.date.$lte = toDate;
    } else {
      const now = new Date();
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      matchQuery.date = { $gte: todayUTC };
    }
  } else if (status === 'live') {
    matchQuery.status = { $in: ['running'] };
    if (date) {
      const dateRange = createDateRange(date);
      matchQuery.date = { $gte: dateRange.start, $lt: dateRange.end };
    }
  } else if (status === 'pendingResult') {
    matchQuery.status = 'result_pending';
    if (date) {
      const dateRange = createDateRange(date);
      matchQuery.date = { $gte: dateRange.start, $lt: dateRange.end };
    }
  } else if (status === 'completed') {
    matchQuery.status = { $in: ['completed', 'result_published'] };
    if (date) {
      const dateRange = createDateRange(date);
      matchQuery.date = { $gte: dateRange.start, $lt: dateRange.end };
    }
  } else if (status === 'cancelled') {
    matchQuery.status = 'cancelled';
    if (date) {
      const dateRange = createDateRange(date);
      matchQuery.date = { $gte: dateRange.start, $lt: dateRange.end };
    }
  }

  if (subMode) matchQuery.subMode = subMode;
  if (mode) matchQuery.mode = mode;

  let sortOrder = { date: 1, startTime: 1 };
  if (status === 'completed' || status === 'cancelled') {
    sortOrder = { date: -1, startTime: -1 };
  }

  // Use aggregation for performance: calculate counts and prize pools at DB level
  const pipeline = [
    { $match: matchQuery },
    { $sort: sortOrder },
    {
      $addFields: {
        joinedTeams: { $size: { $ifNull: ['$participants', []] } },
        playersPerTeam: {
          $cond: {
            if: { $in: ['$subMode', ['duo', '2v2']] },
            then: 2,
            else: {
              $cond: {
                if: { $in: ['$subMode', ['squad', '4v4']] },
                then: 4,
                else: 1
              }
            }
          }
        }
      }
    },
    {
      $addFields: {
        maxTeams: { $floor: { $divide: ['$maxPlayers', '$playersPerTeam'] } }
      }
    },
    {
      $addFields: {
        availableTeams: { $subtract: ['$maxTeams', '$joinedTeams'] },
        currentWinnerPrizePool: {
          $let: {
            vars: { totalPrizePool: { $multiply: ['$joinedTeams', '$entryFee'] } },
            in: { $subtract: ['$$totalPrizePool', { $multiply: ['$$totalPrizePool', 0.15] }] }
          }
        }
      }
    },
    {
      $project: {
        _id: 1, game: 1, mode: 1, subMode: 1, entryFee: 1, maxPlayers: 1,
        date: 1, startTime: 1, lockTime: 1, status: 1, region: 1, lobbyName: 1,
        hostId: 1, joinedTeams: 1, playersPerTeam: 1, maxTeams: 1, availableTeams: 1,
        // Team names list - Host & users can see who joined
        joinedTeamsList: {
          $map: {
            input: '$teams',
            as: 'team',
            in: {
              teamName: '$$team.teamName',
              leaderUserId: '$$team.leaderUserId',
              playerCount: { $size: { $ifNull: ['$$team.players', []] } }
            }
          }
        },
        prizePool: {
          $cond: {
            if: { $gt: ['$joinedTeams', 0] },
            then: { $floor: '$currentWinnerPrizePool' },
            else: { $ifNull: ['$platformFees.potentialWinnerPrizePool', 0] }
          }
        },
        potentialPrizePool: {
          totalPrizePool: { $ifNull: ['$platformFees.potentialTotalPrizePool', 0] },
          platformFee: { $ifNull: ['$platformFees.potentialPlatformFee', 0] },
          hostFee: { $ifNull: ['$platformFees.potentialHostFee', 0] },
          casterFee: { $ifNull: ['$platformFees.potentialCasterFee', 0] },
          totalFees: { $ifNull: ['$platformFees.potentialTotalFees', 0] },
          winnerPrizePool: { $ifNull: ['$platformFees.potentialWinnerPrizePool', 0] }
        }
      }
    }
  ];

  const tournaments = await Tournament.aggregate(pipeline);
  
  // Populate only hostId (minimal data) - DO NOT populate participants for performance
  return await Tournament.populate(tournaments, { path: 'hostId', select: 'name ign' });
};

/**
 * Get all upcoming tournaments
 * @param {Date} fromDate - Start date (optional)
 * @returns {Promise<Array>} Array of tournaments
 */
const getUpcomingTournaments = async (fromDate = null) => {
  return await getTournamentsByStatus('upcoming', fromDate, null, null, null, null);
};

/**
 * Parse date string (YYYY-MM-DD) to UTC Date for range queries
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {Date} UTC midnight
 */
const parseDateForRange = (dateString) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`Invalid date format. Expected YYYY-MM-DD, got: ${dateString}`);
  }
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

/**
 * Get user's tournament history - only tournaments where host has submitted final result (status completed).
 * Shows full data: user's rank, all teams' standings, match-by-match results.
 * Filters: fromDate/toDate (YYYY-MM-DD), mode (BR, CS, LW), win (top 3 = got reward).
 * @param {string} userId - User ID
 * @param {Object} options - { limit, offset, fromDate, toDate, mode, win }
 * @returns {Promise<{ history: Array, total: number }>} History with full standings and match results per tournament
 */
const getTournamentHistory = async (userId, options = {}) => {
  const { limit = 50, offset = 0, fromDate = null, toDate = null, mode = null, win = false } = options;
  const userIdObj = new mongoose.Types.ObjectId(userId);

  const matchQuery = {
    participants: userIdObj,
    status: { $in: ['completed', 'result_published'] }
  };
  if (mode) matchQuery.mode = mode;
  if (fromDate || toDate) {
    matchQuery.date = {};
    if (fromDate) {
      matchQuery.date.$gte = parseDateForRange(fromDate);
    }
    if (toDate) {
      const toDateEnd = parseDateForRange(toDate);
      toDateEnd.setUTCDate(toDateEnd.getUTCDate() + 1);
      matchQuery.date.$lt = toDateEnd;
    }
  }

  const addFieldsStage = {
    $addFields: {
      joinedTeams: { $size: { $ifNull: ['$participants', []] } },
      myResult: {
        $let: {
          vars: {
            found: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: { $ifNull: ['$results', []] },
                    as: 'r',
                    cond: { $eq: ['$$r.userId', userIdObj] }
                  }
                },
                0
              ]
            }
          },
          in: {
            $cond: {
              if: { $ne: ['$$found', null] },
              then: {
                position: '$$found.position',
                kills: '$$found.kills',
                rewardGC: '$$found.rewardGC',
                claimed: '$$found.claimed'
              },
              else: null
            }
          }
        }
      },
      myTeam: {
        $let: {
          vars: {
            found: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: { $ifNull: ['$teams', []] },
                    as: 't',
                    cond: { $eq: ['$$t.leaderUserId', userIdObj] }
                  }
                },
                0
              ]
            }
          },
          in: '$$found.teamName'
        }
      }
    }
  };

  const winMatchStage = win ? { $match: { 'myResult.position': { $in: [1, 2, 3] } } } : null;

  const pipeline = [
    { $match: matchQuery },
    addFieldsStage,
    ...(winMatchStage ? [winMatchStage] : []),
    { $sort: { date: -1, startTime: -1 } },
    { $skip: offset },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        game: 1,
        mode: 1,
        subMode: 1,
        entryFee: 1,
        maxPlayers: 1,
        date: 1,
        startTime: 1,
        status: 1,
        region: 1,
        lobbyName: 1,
        prizePool: 1,
        joinedTeams: 1,
        myResult: 1,
        myTeam: 1,
        hostId: 1,
        matchResults: 1,
        totalMatches: 1
      }
    }
  ];

  const countPipeline = [
    { $match: matchQuery },
    ...(win ? [addFieldsStage, { $match: { 'myResult.position': { $in: [1, 2, 3] } } }] : []),
    { $count: 'total' }
  ];

  const [history, countResult] = await Promise.all([
    Tournament.aggregate(pipeline),
    Tournament.aggregate(countPipeline)
  ]);

  const total = countResult[0]?.total ?? 0;

  const populated = await Tournament.populate(history, { path: 'hostId', select: 'name ign' });

  // Enrich with full standings and match results (only available after host submits final result)
  const enrichedHistory = populated.map((t) => {
    const matchResults = t.matchResults || [];
    const totalMatches = t.totalMatches || 6;
    const standings = aggregateMatchStandings(matchResults);
    const matchResultsFormatted = formatMatchResultsWithBreakdown(matchResults);
    return {
      ...t,
      totalMatches,
      standings,
      matchResults: matchResultsFormatted
    };
  });

  return { history: enrichedHistory, total };
};

/**
 * Get tournaments joined by user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of tournaments
 */
const getJoinedTournaments = async (userId) => {
  const pipeline = [
    { $match: { participants: new mongoose.Types.ObjectId(userId) } },
    { $sort: { date: -1, startTime: -1 } },
    {
      $addFields: {
        joinedTeams: { $size: { $ifNull: ['$participants', []] } },
        playersPerTeam: {
          $cond: {
            if: { $in: ['$subMode', ['duo', '2v2']] },
            then: 2,
            else: {
              $cond: {
                if: { $in: ['$subMode', ['squad', '4v4']] },
                then: 4,
                else: 1
              }
            }
          }
        }
      }
    },
    {
      $addFields: {
        maxTeams: { $floor: { $divide: ['$maxPlayers', '$playersPerTeam'] } }
      }
    },
    {
      $addFields: {
        availableTeams: { $subtract: ['$maxTeams', '$joinedTeams'] },
        currentWinnerPrizePool: {
          $let: {
            vars: { totalPrizePool: { $multiply: ['$joinedTeams', '$entryFee'] } },
            in: { $subtract: ['$$totalPrizePool', { $multiply: ['$$totalPrizePool', 0.15] }] }
          }
        }
      }
    },
    {
      $project: {
        _id: 1, game: 1, mode: 1, subMode: 1, entryFee: 1, maxPlayers: 1,
        date: 1, startTime: 1, lockTime: 1, status: 1, region: 1, lobbyName: 1,
        room: 1, hostId: 1, joinedTeams: 1, playersPerTeam: 1, maxTeams: 1, availableTeams: 1,
        // Team names list - Host & users can see who joined
        joinedTeamsList: {
          $map: {
            input: '$teams',
            as: 'team',
            in: {
              teamName: '$$team.teamName',
              leaderUserId: '$$team.leaderUserId',
              playerCount: { $size: { $ifNull: ['$$team.players', []] } }
            }
          }
        },
        prizePool: {
          $cond: {
            if: { $gt: ['$joinedTeams', 0] },
            then: { $floor: '$currentWinnerPrizePool' },
            else: { $ifNull: ['$platformFees.potentialWinnerPrizePool', 0] }
          }
        },
        potentialPrizePool: {
          totalPrizePool: { $ifNull: ['$platformFees.potentialTotalPrizePool', 0] },
          platformFee: { $ifNull: ['$platformFees.potentialPlatformFee', 0] },
          hostFee: { $ifNull: ['$platformFees.potentialHostFee', 0] },
          casterFee: { $ifNull: ['$platformFees.potentialCasterFee', 0] },
          totalFees: { $ifNull: ['$platformFees.potentialTotalFees', 0] },
          winnerPrizePool: { $ifNull: ['$platformFees.potentialWinnerPrizePool', 0] }
        }
      }
    }
  ];

  const tournaments = await Tournament.aggregate(pipeline);
  
  // Populate only hostId - DO NOT populate participants for performance
  return await Tournament.populate(tournaments, { path: 'hostId', select: 'name ign' });
};

/**
 * Get tournament details
 * @param {string} tournamentId - Tournament ID
 * @returns {Promise<Object>} Tournament document
 */
const getTournamentDetails = async (tournamentId) => {
  const tournament = await Tournament.findById(tournamentId)
    .populate('participants', 'name ign')
    .populate('hostId', 'name ign')
    .populate('results.userId', 'name ign')
    .lean();

  if (!tournament) {
    throw new Error('Tournament not found');
  }

  return tournament;
};

/**
 * Check if user can claim reward
 * @param {string} tournamentId - Tournament ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Claim status
 */
const getClaimStatus = async (tournamentId, userId) => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  // Check if results are published (either 'completed' or 'result_published' for backward compatibility)
  if (tournament.status !== 'completed' && tournament.status !== 'result_published') {
    return {
      eligible: false,
      rewardGC: 0,
      claimed: false,
      message: 'Results not published yet'
    };
  }

  const result = tournament.results.find(r => r.userId.toString() === userId.toString());
  
  if (!result) {
    return {
      eligible: false,
      rewardGC: 0,
      claimed: false,
      message: 'User not in results'
    };
  }

  return {
    eligible: true,
    rewardGC: result.rewardGC,
    claimed: result.claimed,
    position: result.position,
    kills: result.kills
  };
};

/**
 * Check and auto-update tournament status from upcoming to live
 * Also handles cancellation when minimum teams not met and time has passed
 * This is now called via WebSocket when room is published or on-demand
 * @param {string|null} tournamentId - Optional tournament ID to check specific tournament
 * @returns {Promise<number>} Number of tournaments updated
 */
const autoUpdateTournamentStatus = async (tournamentId = null) => {
  const now = new Date();
  
  // Build query - if tournamentId provided, check only that tournament
  const query = {
    status: { $in: ['upcoming', 'locked'] },
    'room.roomId': { $ne: null },
    'room.password': { $ne: null }
  };

  if (tournamentId) {
    query._id = tournamentId;
  }

  // Find tournaments that could potentially go live:
  // 1. Status is 'upcoming' or 'locked'
  // 2. Room ID and password are published
  const tournaments = await Tournament.find(query);

  let updatedCount = 0;

  for (const tournament of tournaments) {
    const startDateTime = calculateStartDateTime(tournament.date, tournament.startTime);
    if (!startDateTime) {
      Logger.warn('autoUpdate: Invalid startDateTime', { tournamentId: tournament._id, date: tournament.date, startTime: tournament.startTime });
      continue;
    }

    // Check at START TIME. 60-second buffer to handle scheduler/clock skew - go live when within 1 min of start.
    const oneMinBeforeStart = new Date(startDateTime.getTime() - 60000);
    if (now < oneMinBeforeStart) {
      continue;
    }

    // Calculate joined TEAMS based on subMode (same logic as prize pool/team calc)
    // Each participant entry = 1 team (team leader joins, other team members are optional)
    // For 1v1/solo: 1 participant = 1 team (1 player)
    // For 2v2/duo: 1 participant = 1 team (can have up to 2 players)
    // For 4v4/squad: 1 participant = 1 team (can have up to 4 players)
    const rawParticipantCount = tournament.participants ? tournament.participants.length : 0;
    let playersPerTeam = 1;
    let joinedTeams = rawParticipantCount; // Each participant = 1 team
    
    if (tournament.subMode === 'duo' || tournament.subMode === '2v2') {
      playersPerTeam = 2;
      // For duo/2v2: 1 participant = 1 team (can have up to 2 players)
      joinedTeams = rawParticipantCount;
    } else if (tournament.subMode === 'squad' || tournament.subMode === '4v4') {
      playersPerTeam = 4;
      // For squad/4v4: 1 participant = 1 team (can have up to 4 players)
      joinedTeams = rawParticipantCount;
    } else if (tournament.subMode === 'solo' || tournament.subMode === '1v1' || tournament.subMode === 'clash') {
      playersPerTeam = 1;
      // For solo/1v1/clash: each participant = 1 team (clash = 2 teams, max 4 players per team)
      joinedTeams = rawParticipantCount;
    }

    // Minimum teams required for lobby to start
    const minTeamsRequired = MIN_TEAMS_FOR_START[tournament.subMode] || 0;

    // If minimum teams condition is not satisfied, cancel tournament and refund participants
    if (minTeamsRequired > 0 && joinedTeams < minTeamsRequired) {
      // ✅ ATOMIC STATUS UPDATE: Only proceed if we successfully transition the status
      const updatedTournament = await Tournament.findOneAndUpdate(
        { _id: tournament._id, status: { $in: ['upcoming', 'locked'] } },
        { $set: { status: 'cancelled' } },
        { new: true }
      );

      if (!updatedTournament) {
        Logger.info('Tournament already cancelled or moved live by another process', { tournamentId: tournament._id });
        continue;
      }

      // Refund entry fee BEFORE broadcasting
      const walletService = require('./wallet.service');
      const entryFeeNum = Number(tournament.entryFee) || 0;
      if (entryFeeNum > 0 && tournament.participants && tournament.participants.length > 0) {
        const refundPromises = tournament.participants.map(async (participant) => {
          const userId = toParticipantUserId(participant);
          if (!userId) return;
          try {
            await walletService.refundEntryFee(
              userId,
              entryFeeNum,
              `Refund: Tournament cancelled due to insufficient teams - ${tournament.game} ${tournament.mode} ${tournament.subMode} - ${tournament.date.toISOString().split('T')[0]} ${tournament.startTime}`,
              tournament._id.toString()
            );
            Logger.info('Refunded entry fee for cancelled tournament', { userId, tournamentId: tournament._id });
          } catch (refundError) {
            Logger.error('Failed to refund entry fee for tournament', { userId, tournamentId: tournament._id, errName: refundError.name });
          }
        });
        
        await Promise.allSettled(refundPromises);
      }

      // Send cancellation notification (handles WebSocket broadcast + FCM internally)
      try {
        const { sendTournamentCancelledNotification } = require('./notification.service');
        await sendTournamentCancelledNotification(updatedTournament, 'insufficient_teams');
      } catch (notifError) {
        Logger.error('Error sending cancellation notification', { tournamentId: tournament._id, errName: notifError.name });
      }
      updatedCount++;
      continue; // Move to next tournament
    }

    // All conditions satisfied -> make tournament live
    // ✅ ATOMIC STATUS UPDATE: Only proceed if we successfully transition the status
    const liveTournament = await Tournament.findOneAndUpdate(
      { _id: tournament._id, status: { $in: ['upcoming', 'locked'] } },
      { $set: { status: 'running' } },
      { new: true }
    );

    if (!liveTournament) {
      Logger.info('Tournament already moved live or cancelled by another process', { tournamentId: tournament._id });
      continue;
    }

    Logger.info('Tournament went live', { tournamentId: tournament._id, startTime: tournament.startTime, date: tournament.date });
    
    // ✅ Send notification when tournament goes live (at start time)
    try {
      const { sendRoomUpdateNotification } = require('./notification.service');
      // Populate needed fields for notification
      await liveTournament.populate('hostId', 'name email');
      await liveTournament.populate('participants', 'name email');
      
      await sendRoomUpdateNotification(liveTournament, liveTournament.room, 'room-updated');
      Logger.info('Notification sent automatically when tournament went live', { tournamentId: tournament._id });
    } catch (notifError) {
      Logger.error('Error sending notification when tournament went live', { tournamentId: tournament._id, errName: notifError.name });
    }
    
    updatedCount++;
  }

  return updatedCount;
};

/**
 * Grace period after lobby start time before marking as expired (host may add room shortly after start).
 * Avoids auto-cancel at exact lobby time when host is in Asia / adds room a few minutes late.
 */
const EXPIRED_GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Mark tournaments as cancelled when their start date+time has passed but they never went live.
 * Handles: upcoming/locked tournaments where (date + startTime) < now — e.g. host never published room.
 * Uses a 10-minute grace period after start so host has time to add room (avoids cancel at exact lobby time).
 * Refunds participants and broadcasts. Ensures old-date lobbies don't show in "upcoming".
 * @param {string|null} tournamentId - Optional tournament ID to check
 * @returns {Promise<number>} Number of tournaments expired/cancelled
 */
const markExpiredTournaments = async (tournamentId = null) => {
  const now = new Date();
  const query = { status: { $in: ['upcoming', 'locked'] } };
  if (tournamentId) query._id = tournamentId;
  const tournaments = await Tournament.find(query);
  let expiredCount = 0;

  for (const tournament of tournaments) {
    if (tournament.results && tournament.results.length > 0) continue;
    const startDateTime = calculateStartDateTime(tournament.date, tournament.startTime);
    if (!startDateTime) continue;
    // Only mark expired after grace period (e.g. 10 min after start) so host can add room at lobby time
    const expiryThreshold = new Date(startDateTime.getTime() + EXPIRED_GRACE_PERIOD_MS);
    if (now < expiryThreshold) continue;

    // Refund entry fee BEFORE marking as cancelled so scheduler retries if refund fails
    const walletService = require('./wallet.service');
    const entryFeeNum = Number(tournament.entryFee) || 0;
    if (entryFeeNum > 0 && tournament.participants && tournament.participants.length > 0) {
      const refundPromises = tournament.participants.map(async (participant) => {
        const userId = toParticipantUserId(participant);
        if (!userId) return;
        try {
          await walletService.refundEntryFee(
            userId,
            entryFeeNum,
            `Refund: Tournament expired (date passed, did not start) - ${tournament.game} ${tournament.mode} ${tournament.subMode} - ${tournament.date.toISOString().split('T')[0]} ${tournament.startTime}`,
            tournament._id.toString()
          );
          Logger.info('Refunded entry fee for expired tournament', { userId, tournamentId: tournament._id });
        } catch (refundError) {
          Logger.error('Failed to refund for expired tournament', { userId, tournamentId: tournament._id, errName: refundError.name });
        }
      });
      await Promise.allSettled(refundPromises);
    }

    // Mark as cancelled AFTER refund so scheduler retries on next run if refund failed
    tournament.status = 'cancelled';
    await tournament.save();

    // Send cancellation notification (handles WebSocket broadcast + FCM internally)
    try {
      const { sendTournamentCancelledNotification } = require('./notification.service');
      await sendTournamentCancelledNotification(tournament, 'expired');
    } catch (notifError) {
      Logger.error('Error sending cancellation notification', { tournamentId: tournament._id, errName: notifError.name });
    }
    expiredCount++;
  }
  return expiredCount;
};

/**
 * Check and cancel tournaments that don't have minimum teams
 * Checks at START TIME (9:00) - same timing as go-live check. Host gets room update option at 8:50.
 * Both conditions (room + min teams) checked at 9:00: met → live, not met → cancelled.
 * IMPORTANT: Only checks upcoming/locked - NEVER cancels tournaments that are already 'running' (live).
 * @param {string|null} tournamentId - Optional tournament ID to check specific tournament
 * @returns {Promise<number>} Number of tournaments cancelled
 */
const checkAndCancelInsufficientTeams = async (tournamentId = null) => {
  const now = new Date();
  
  // Build query - ONLY upcoming/locked. NEVER touch 'running' tournaments.
  // Once live, tournament stays live until host updates final result.
  const query = {
    status: { $in: ['upcoming', 'locked'] }
  };

  if (tournamentId) {
    query._id = tournamentId;
  }

  // Find all tournaments that need to be checked (including those with room published)
  const tournaments = await Tournament.find(query);

  let cancelledCount = 0;

  for (const tournament of tournaments) {
    // EDGE CASE: Skip if tournament already has results (shouldn't cancel if results exist)
    if (tournament.results && tournament.results.length > 0) {
      continue;
    }
    
    const startDateTime = calculateStartDateTime(tournament.date, tournament.startTime);

    // Check at START TIME - same 60s buffer as autoUpdate for consistency
    const oneMinBeforeStart = new Date(startDateTime.getTime() - 60000);
    if (now < oneMinBeforeStart) {
      continue;
    }

    // Calculate joined TEAMS - MUST match autoUpdateTournamentStatus logic
    // participants = team leaders (one per team), so participants.length = number of teams
    // Each participant entry = 1 team (team-based registration)
    const rawParticipantCount = tournament.participants ? tournament.participants.length : 0;
    const joinedTeams = rawParticipantCount;

    // Minimum teams required for lobby to start
    const minTeamsRequired = MIN_TEAMS_FOR_START[tournament.subMode] || 0;

    // If minimum teams condition is not satisfied at start time, cancel tournament and refund participants
    if (minTeamsRequired > 0 && joinedTeams < minTeamsRequired) {
      // ✅ ATOMIC STATUS UPDATE: Only proceed if we successfully transition the status
      const updatedTournament = await Tournament.findOneAndUpdate(
        { _id: tournament._id, status: { $in: ['upcoming', 'locked'] } },
        { $set: { status: 'cancelled' } },
        { new: true }
      );

      if (!updatedTournament) {
        Logger.info('Tournament already handled by another process (live or cancelled)', { tournamentId: tournament._id });
        continue;
      }

      // Refund entry fee BEFORE broadcasting
      const walletService = require('./wallet.service');
      const entryFeeNumCancel = Number(tournament.entryFee) || 0;
      if (entryFeeNumCancel > 0 && tournament.participants && tournament.participants.length > 0) {
        const refundPromises = tournament.participants.map(async (participant) => {
          const userId = toParticipantUserId(participant);
          if (!userId) return;
          try {
            await walletService.refundEntryFee(
              userId,
              entryFeeNumCancel,
              `Refund: Tournament cancelled due to insufficient teams - ${tournament.game} ${tournament.mode} ${tournament.subMode} - ${tournament.date.toISOString().split('T')[0]} ${tournament.startTime}`,
              tournament._id.toString()
            );
            Logger.info('Refunded entry fee for cancelled tournament (insufficient teams at start time)', { userId, tournamentId: tournament._id });
          } catch (refundError) {
            Logger.error('Failed to refund entry fee for tournament', { userId, tournamentId: tournament._id, errName: refundError.name });
          }
        });
        
        await Promise.allSettled(refundPromises);
        Logger.info('Tournament cancelled due to insufficient teams (at start time)', { tournamentId: tournament._id, refundedCount: tournament.participants.length });
      }

      // Send cancellation notification (handles WebSocket broadcast + FCM internally)
      try {
        const { sendTournamentCancelledNotification } = require('./notification.service');
        await sendTournamentCancelledNotification(updatedTournament, 'insufficient_teams');
      } catch (notifError) {
        Logger.error('Error sending cancellation notification', { tournamentId: tournament._id, errName: notifError.name });
      }
      cancelledCount++;
    }
  }

  return cancelledCount;
};

/**
 * Calculate match points from position and kills using POSITION_POINTS_TABLE.
 * Position points: 1st=12, 2nd=9, 3rd=8, 4th=7, 5th=6, 6th=5, 7th=4, 8th=3, 9th=2, 10th=1, 11+=0
 * Kill points: 1 point per kill
 */
const calculateMatchPoints = (position, kills) => {
  const positionPoints = POSITION_POINTS_TABLE[position] ?? 0;
  const killPoints = typeof kills === 'number' ? Math.max(0, kills) : 0;
  return positionPoints + killPoints;
};

/**
 * Submit one match result (partial) – Host only. For BR with 6 matches, call after each match.
 * Host sends: teamName, position, kills. Backend calculates totalPoint = position points + kills.
 * @param {string} tournamentId - Tournament ID
 * @param {number} matchIndex - Match index (0-based, e.g. 0 for match 1, 5 for match 6)
 * @param {Array} teams - Array of { teamName, position, kills }
 * @param {string} hostUserId - Host user ID
 * @returns {Promise<{ tournament: Object, standings: Array }>} Updated tournament and cumulative standings
 */
const submitMatchResult = async (tournamentId, matchIndex, teams, hostUserId) => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (!tournament.hostId || tournament.hostId.toString() !== hostUserId) {
    throw new Error('Only the assigned host can submit match results');
  }
  if (!['running', 'result_pending'].includes(tournament.status)) {
    throw new Error(`Cannot submit match result. Tournament status: ${tournament.status}.`);
  }

  const isCS = tournament.mode === 'CS';
  const normalized = (teams || []).map(t => {
    const position = typeof t.position === 'number' ? Math.max(1, t.position) : 1;
    const kills = typeof t.kills === 'number' ? Math.max(0, t.kills) : 0;
    const roundScore = typeof t.roundScore === 'number' && t.roundScore >= 0 ? t.roundScore : null;
    const totalPoint = isCS && roundScore !== null
      ? roundScore
      : calculateMatchPoints(position, kills);
    return {
      teamName: typeof t.teamName === 'string' ? t.teamName.trim() : String(t.teamName || '').trim(),
      booyah: position === 1 ? 1 : 0,
      kills,
      position,
      totalPoint,
      ...(roundScore !== null && { roundScore })
    };
  });

  if (!tournament.matchResults) tournament.matchResults = [];
  const existing = tournament.matchResults.find(m => m.matchIndex === matchIndex);
  if (existing) {
    existing.teams = normalized;
  } else {
    tournament.matchResults.push({ matchIndex, teams: normalized });
    tournament.matchResults.sort((a, b) => a.matchIndex - b.matchIndex);
  }
  await tournament.save();

  const standings = aggregateMatchStandings(tournament.matchResults);
  const matchResultsFormatted = formatMatchResultsWithBreakdown(tournament.matchResults);

  // Broadcast live results via WebSocket – participants get real-time update
  const participantIds = (tournament.participants || []).map(p => (p && p._id ? p._id : p).toString());
  const hostId = tournament.hostId ? tournament.hostId.toString() : null;
  const liveResultsPayload = {
    matchResults: matchResultsFormatted,
    standings,
    matchResultsCount: tournament.matchResults.length,
    status: tournament.status,
    totalMatches: tournament.totalMatches || 6
  };
  try {
    const { broadcastLiveResultsUpdate } = require('./websocket.service');
    broadcastLiveResultsUpdate(tournamentId, liveResultsPayload, participantIds, hostId);
  } catch (wsErr) {
    Logger.error('Failed to broadcast live results via WebSocket', { tournamentId, errName: wsErr.name });
  }

  return { tournament, standings, matchResults: matchResultsFormatted };
};

/**
 * Format match results with positionPoints breakdown (positionPoints = totalPoint - kills).
 * Booyah = 1 if 1st place in that match, 0 otherwise.
 */
const formatMatchResultsWithBreakdown = (matchResults) => {
  return (matchResults || []).map(m => ({
    matchIndex: m.matchIndex,
    teams: (m.teams || []).map(t => {
      const kills = typeof t.kills === 'number' ? t.kills : 0;
      const totalPoint = typeof t.totalPoint === 'number' ? t.totalPoint : 0;
      const positionPoints = Math.max(0, totalPoint - kills);
      const out = {
        teamName: t.teamName,
        position: t.position,
        kills,
        positionPoints,
        totalPoint,
        booyah: t.position === 1 ? 1 : 0
      };
      if (t.roundScore != null) out.roundScore = t.roundScore;
      return out;
    })
  }));
};

/**
 * Aggregate match results by teamName: sum totalPoint, kills, booyah, positionPoints.
 * Ranking: 1) totalPoint (higher = better), 2) booyah count (tie-break), 3) kills (tie-break)
 * @param {Array} matchResults - Array of { matchIndex, teams: [ { teamName, booyah, kills, position, totalPoint } ] }
 * @returns {Array} Standings: [ { teamName, totalPoint, kills, booyah, totalPositionPoints, position } ] position 1-based rank
 */
const aggregateMatchStandings = (matchResults) => {
  const byTeam = {};
  (matchResults || []).forEach(match => {
    (match.teams || []).forEach(t => {
      const name = (t.teamName || '').trim();
      if (!name) return;
      if (!byTeam[name]) byTeam[name] = { teamName: name, totalPoint: 0, kills: 0, booyah: 0, totalPositionPoints: 0 };
      const totalPoint = typeof t.totalPoint === 'number' ? t.totalPoint : 0;
      const kills = typeof t.kills === 'number' ? t.kills : 0;
      const positionPoints = Math.max(0, totalPoint - kills);
      byTeam[name].totalPoint += totalPoint;
      byTeam[name].kills += kills;
      byTeam[name].totalPositionPoints += positionPoints;
      byTeam[name].booyah += typeof t.booyah === 'number' ? t.booyah : (t.booyah ? 1 : 0);
    });
  });
  // Ranking: totalPoint desc → booyah desc → kills desc
  const list = Object.values(byTeam).sort((a, b) => {
    if (b.totalPoint !== a.totalPoint) return b.totalPoint - a.totalPoint;
    if (b.booyah !== a.booyah) return b.booyah - a.booyah;
    return b.kills - a.kills;
  });
  list.forEach((row, i) => { row.position = i + 1; });
  return list;
};

/**
 * Submit final result – Host only. Call after all 6 matches submitted and disputes resolved.
 * Computes final standings, generates rewards, sets status completed, broadcasts to participants.
 * @param {string} tournamentId - Tournament ID
 * @param {string} hostUserId - Host user ID
 * @returns {Promise<Object>} Updated tournament (status completed, results set)
 */
const submitFinalResult = async (tournamentId, hostUserId) => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (!tournament.hostId || tournament.hostId.toString() !== hostUserId) {
    throw new Error('Only the assigned host can submit final result');
  }
  if (!['running', 'result_pending'].includes(tournament.status)) {
    throw new Error(`Cannot submit final result. Tournament status: ${tournament.status}.`);
  }

  const totalMatches = tournament.totalMatches || 6;
  const matchResults = tournament.matchResults || [];
  const haveMatchIndices = new Set((matchResults || []).map(m => m.matchIndex));
  const requiredIndices = new Set([...Array(totalMatches).keys()]);
  const missingIndices = [...requiredIndices].filter(i => !haveMatchIndices.has(i));
  if (missingIndices.length > 0) {
    throw new Error(`Submit all ${totalMatches} match results first. Missing match(es): ${missingIndices.map(i => i + 1).join(', ')}. Currently ${matchResults.length} submitted.`);
  }

  const standings = aggregateMatchStandings(matchResults);
  // Case-insensitive team name lookup (host may type "Team A" vs "team a")
  const teamToLeader = {};
  (tournament.teams || []).forEach(t => {
    const name = (t.teamName || '').trim();
    if (name && t.leaderUserId) {
      teamToLeader[name.toLowerCase()] = { userId: t.leaderUserId.toString(), originalName: name };
    }
  });

  const results = standings.map((row) => {
    const key = (row.teamName || '').trim().toLowerCase();
    const entry = teamToLeader[key];
    if (!entry) {
      const registered = (tournament.teams || []).map(t => (t.teamName || '').trim()).filter(Boolean).join(', ');
      throw new Error(`Team "${row.teamName}" not found in tournament teams. Registered: [${registered}]`);
    }
    return { userId: entry.userId, position: row.position, kills: row.kills };
  });

  await generateRewards(tournamentId, results);

  // Broadcast final live results to participants
  const participantIds = (tournament.participants || []).map(p => (p && p._id ? p._id : p).toString());
  const hostId = tournament.hostId ? tournament.hostId.toString() : null;
  const matchResultsFormatted = formatMatchResultsWithBreakdown(matchResults);
  const finalPayload = {
    matchResults: matchResultsFormatted,
    standings,
    matchResultsCount: matchResults.length,
    status: 'completed',
    totalMatches
  };
  try {
    const { broadcastLiveResultsUpdate } = require('./websocket.service');
    broadcastLiveResultsUpdate(tournamentId, finalPayload, participantIds, hostId);
  } catch (wsErr) {
    Logger.error('Failed to broadcast final live results via WebSocket', { tournamentId, errName: wsErr.name });
  }

  return await Tournament.findById(tournamentId);
};

/**
 * Pre-check if host can submit final result. Returns readiness and reason if not ready.
 * @param {string} tournamentId - Tournament ID
 * @param {string} hostUserId - Host user ID
 * @returns {Promise<Object>} { canSubmit, reason?, missingMatches?, teamMismatches?, status?, matchResultsCount, totalMatches }
 */
const getCanSubmitFinalResult = async (tournamentId, hostUserId) => {
  const tournament = await Tournament.findById(tournamentId)
    .select('matchResults totalMatches status hostId teams')
    .lean();
  if (!tournament) return { canSubmit: false, reason: 'Tournament not found' };
  if (!tournament.hostId || tournament.hostId.toString() !== hostUserId) {
    return { canSubmit: false, reason: 'Only the assigned host can submit final result' };
  }
  if (!['running', 'result_pending'].includes(tournament.status)) {
    return { canSubmit: false, reason: `Tournament status is ${tournament.status}. Must be running or result_pending.`, status: tournament.status };
  }
  const totalMatches = tournament.totalMatches || 6;
  const matchResults = tournament.matchResults || [];
  const haveMatchIndices = new Set((matchResults || []).map(m => m.matchIndex));
  const requiredIndices = [...Array(totalMatches).keys()];
  const missingIndices = requiredIndices.filter(i => !haveMatchIndices.has(i));
  if (missingIndices.length > 0) {
    return {
      canSubmit: false,
      reason: `Submit all ${totalMatches} match results first. Missing match(es): ${missingIndices.map(i => i + 1).join(', ')}`,
      missingMatches: missingIndices.map(i => i + 1),
      matchResultsCount: matchResults.length,
      totalMatches
    };
  }
  const standings = aggregateMatchStandings(matchResults);
  const teamKeys = new Set((tournament.teams || []).map(t => (t.teamName || '').trim().toLowerCase()).filter(Boolean));
  const mismatches = standings.filter(row => !teamKeys.has((row.teamName || '').trim().toLowerCase()));
  if (mismatches.length > 0) {
    return {
      canSubmit: false,
      reason: `Team(s) in results not found in tournament: ${mismatches.map(r => `"${r.teamName}"`).join(', ')}. Check team names match exactly.`,
      teamMismatches: mismatches.map(r => r.teamName),
      matchResultsCount: matchResults.length,
      totalMatches
    };
  }
  return {
    canSubmit: true,
    matchResultsCount: matchResults.length,
    totalMatches,
    status: tournament.status
  };
};

/**
 * Get live match results and current standings for a tournament (for users to see participant results).
 * @param {string} tournamentId - Tournament ID
 * @returns {Promise<Object>} { matchResults, standings, tournamentId, totalMatches }
 */
const getLiveResults = async (tournamentId) => {
  const tournament = await Tournament.findById(tournamentId)
    .select('matchResults totalMatches _id game mode subMode date startTime status')
    .lean();
  if (!tournament) throw new Error('Tournament not found');

  const matchResults = tournament.matchResults || [];
  const totalMatches = tournament.totalMatches || 6;
  const standings = aggregateMatchStandings(matchResults);

  const matchResultsFormatted = formatMatchResultsWithBreakdown(matchResults);

  return {
    tournamentId: tournament._id.toString(),
    game: tournament.game,
    mode: tournament.mode,
    subMode: tournament.subMode,
    date: tournament.date,
    startTime: tournament.startTime,
    status: tournament.status,
    totalMatches,
    matchResults: matchResultsFormatted,
    standings
  };
};

/**
 * Map a SpecialTournament document to the same shape as regular tournament list items.
 * This lets the frontend reuse the same card/list component for both types.
 * Key differences surfaced in the response:
 *   - entryFee: 0  (always free)
 *   - isSpecial: true
 *   - tournamentType: 'sponsored'
 *   - prizePool: fixed admin-set amount
 *   - maxTeams / availableTeams calculated from maxSlots
 *   - status mapped from special statuses to regular ones where possible
 */
const mapSpecialTournamentToListFormat = (st) => {
  const eligibleTeams = (st.registeredTeams || []).filter(t => (t.players || []).length >= 3);
  const joinedTeamCount = eligibleTeams.length;
  const maxTeams = st.maxSlots || 0;
  const availableTeams = Math.max(0, maxTeams - joinedTeamCount);

  // Map special statuses → regular statuses for display
  const statusMap = {
    draft: 'upcoming',
    registration_open: 'upcoming',
    running: 'running',
    completed: 'completed',
    cancelled: 'cancelled'
  };
  const mappedStatus = statusMap[st.status] || st.status;

  return {
    _id: st._id,
    game: st.game || 'FreeFire',
    mode: st.mode,
    subMode: st.subMode,
    entryFee: 0,
    maxPlayers: maxTeams,       // maxSlots acts as maxTeams
    maxTeams,
    availableTeams,
    joinedTeams: joinedTeamCount,
    date: st.scheduledDate || st.createdAt,
    startTime: st.scheduledTime || null,
    lockTime: st.registrationDeadline || null,
    status: mappedStatus,
    originalStatus: st.status,  // special tournament's own status
    region: st.region || 'Asia',
    lobbyName: st.lobbyName || st.title,
    room: null,                  // room info is per-slot, not top-level
    hostId: st.createdBy || null,
    prizePool: st.prizePool,
    potentialPrizePool: {
      totalPrizePool: st.prizePool,
      winnerPrizePool: st.prizePool,
      platformFee: 0,
      hostFee: 0,
      casterFee: 0,
      totalFees: 0
    },
    prizeDistribution: st.prizeDistribution || [],
    joinedTeamsList: eligibleTeams.map(t => ({
      teamName: t.teamName,
      leaderUserId: t.leaderUserId,
      playerCount: 1 + (t.players || []).length
    })),
    rounds: (st.rounds || []).map(r => ({
      roundNumber: r.roundNumber,
      roundName: r.roundName,
      teamsPerSlot: r.teamsPerSlot,
      matchesPerSlot: r.matchesPerSlot,
      qualifyPerSlot: r.qualifyPerSlot,
      status: r.status,
      slotCount: (r.slots || []).length
    })),
    totalRounds: (st.rounds || []).length,
    rewardsDistributed: st.rewardsDistributed || false,
    description: st.description || null,
    scheduledEndDate: st.scheduledEndDate || null,
    formatLabel: st.formatLabel || null,
    sponsorHandles: st.sponsorHandles || {},
    // Flags so frontend can distinguish and route differently if needed
    isSpecial: true,
    tournamentType: 'sponsored',
    createdAt: st.createdAt,
    updatedAt: st.updatedAt
  };
};

/**
 * Fetch special tournaments matching the same status filter used by getTournamentsByStatus.
 * Returns items in the same list format.
 * @param {string} status - 'upcoming'|'live'|'completed'|'pendingResult'|'cancelled'
 * @param {string|null} mode
 * @param {string|null} subMode
 * @returns {Promise<Array>}
 */
const getSpecialTournamentsForList = async (status, mode, subMode) => {
  try {
    const SpecialTournament = require('../models/SpecialTournament.model');

    // Map regular list status → special tournament statuses
    const statusQueryMap = {
      upcoming: { $in: ['draft', 'registration_open'] },
      live:     'running',
      completed: 'completed',
      pendingResult: 'completed',   // no pending-result concept, completed works
      cancelled: 'cancelled'
    };
    const stStatus = statusQueryMap[status];
    if (!stStatus) return [];

    const query = { status: stStatus };
    if (mode) query.mode = mode;
    if (subMode) query.subMode = subMode;

    const specials = await SpecialTournament.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return specials.map(mapSpecialTournamentToListFormat);
  } catch (err) {
    Logger.error('getSpecialTournamentsForList failed', { errName: err.name, errMsg: err.message });
    return [];
  }
};

/**
 * Publish room details for tournaments that are within the notification window (10 mins before start)
 * This is called by the scheduler every minute.
 * @returns {Promise<number>} Number of tournaments notified
 */
const publishRoomDetails = async () => {
  try {
    const now = new Date();
    // Only check upcoming/locked tournaments that have room ID but haven't sent notification
    const tournaments = await Tournament.find({
      status: { $in: ['upcoming', 'locked'] },
      'room.roomId': { $ne: null },
      'room.roomNotificationSent': { $ne: true }
    }).populate('participants hostId');

    if (tournaments.length === 0) return 0;

    let notifiedCount = 0;
    const { sendRoomUpdateNotification } = require('./notification.service');

    for (const tournament of tournaments) {
      const startDateTime = calculateStartDateTime(tournament.date, tournament.startTime);
      const tenMinutesBeforeStart = new Date(startDateTime.getTime() - 10 * 60 * 1000);

      // If we are within 10 minutes of start, publish
      if (now >= tenMinutesBeforeStart) {
        Logger.info('Scheduler publishing delayed room details', { 
          tournamentId: tournament._id, 
          startTime: tournament.startTime 
        });
        
        await sendRoomUpdateNotification(tournament, tournament.room, 'room-published');
        notifiedCount++;
      }
    }

    return notifiedCount;
  } catch (error) {
    Logger.error('Error in publishRoomDetails', error);
    return 0;
  }
};

// Export reusable calculation functions for use in controllers
module.exports = {
  // Reusable calculation functions
  calculateTeamStats,
  calculatePrizePoolBreakdown,
  generateNextDayLobbies,
  generateLobbies,
  updatePrizePool,
  generateRewards,
  submitMatchResult,
  submitFinalResult,
  getCanSubmitFinalResult,
  getLiveResults,
  aggregateMatchStandings,
  joinTournament,
  getUpcomingTournaments,
  getTournamentsByStatus,
  getJoinedTournaments,
  getTournamentHistory,
  getTournamentDetails,
  getClaimStatus,
  getModeConfig,
  calculateLockTime,
  calculateStartDateTime,
  autoUpdateTournamentStatus,
  checkAndCancelInsufficientTeams,
  markExpiredTournaments,
  getSpecialTournamentsForList,
  mapSpecialTournamentToListFormat,
  publishRoomDetails
};
