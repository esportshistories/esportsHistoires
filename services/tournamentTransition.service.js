/**
 * Tournament Status Transition Service
 * Centralized logic for all tournament status transitions
 * 
 * IMPORTANT: Single source of truth for tournament state machine
 * All status changes should go through this service
 */

const Tournament = require('../models/Tournament.model');
const walletService = require('./wallet.service');
const Logger = require('../utils/logger');
const { MIN_TEAMS_FOR_START } = require('../constants');

/**
 * Calculate start datetime from date and startTime string (IST)
 * Duplicated from tournament.service.js for independence
 */
const IST_OFFSET_MINUTES = 5.5 * 60;

const getISTDateComponents = (date) => {
  const base = new Date(date);
  const utcMs = base.getTime();
  const istMs = utcMs + IST_OFFSET_MINUTES * 60 * 1000;
  const istDate = new Date(istMs);
  return {
    year: istDate.getUTCFullYear(),
    month: istDate.getUTCMonth(),
    day: istDate.getUTCDate()
  };
};

const buildUTCFromIST = (year, month, day, hour24, minute) => {
  const istMs = Date.UTC(year, month, day, hour24, minute || 0, 0, 0);
  const utcMs = istMs - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
};

const calculateStartDateTime = (date, startTime) => {
  if (!date || !startTime) return null;
  const [time, periodRaw] = startTime.split(' ');
  const [hours, minutes] = time.split(':').map(Number);
  const period = String(periodRaw || '').trim().toUpperCase();
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
 * Calculate joined teams based on subMode
 */
const calculateJoinedTeams = (tournament) => {
  const rawCount = tournament.participants ? tournament.participants.length : 0;
  // Each participant = 1 team (regardless of subMode)
  return rawCount;
};

/**
 * Check minimum teams requirement
 */
const hasMinimumTeams = (tournament) => {
  const joinedTeams = calculateJoinedTeams(tournament);
  const minTeamsRequired = MIN_TEAMS_FOR_START[tournament.subMode] || 0;
  return minTeamsRequired === 0 || joinedTeams >= minTeamsRequired;
};

/** Get participant user id whether participant is ObjectId or populated { _id } */
const toParticipantUserId = (p) => {
  if (p == null) return null;
  const id = p._id != null ? p._id : p;
  return (id && typeof id.toString === 'function') ? id.toString() : String(id);
};

/**
 * Refund all participants
 */
const refundAllParticipants = async (tournament) => {
  if (!tournament.participants || tournament.participants.length === 0) {
    return { refunded: 0, failed: 0 };
  }

  const entryFeeNum = Number(tournament.entryFee) || 0;
  if (entryFeeNum <= 0) {
    return { refunded: 0, failed: 0, total: tournament.participants.length };
  }

  const refundPromises = tournament.participants.map(async (participant) => {
    const userId = toParticipantUserId(participant);
    if (!userId) return { success: false, userId: null, error: new Error('Invalid participant id') };
    try {
      await walletService.refundEntryFee(
        userId,
        entryFeeNum,
        `Refund: Tournament cancelled - ${tournament.game} ${tournament.mode} ${tournament.subMode} - ${tournament.date.toISOString().split('T')[0]} ${tournament.startTime}`,
        tournament._id.toString()
      );
      return { success: true, userId };
    } catch (error) {
      Logger.error('Failed to refund participant', { userId, tournamentId: tournament._id, error: error.message });
      return { success: false, userId, error };
    }
  });

  const results = await Promise.allSettled(refundPromises);
  const refunded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - refunded;

  return { refunded, failed, total: tournament.participants.length };
};

/**
 * Broadcast tournament status change via WebSocket
 */
const broadcastStatusChange = async (tournament, message, cancellationReason = null) => {
  try {
    const { broadcastTournamentUpdate } = require('./websocket.service');
    const updateData = {
      status: tournament.status,
      tournamentId: tournament._id.toString(),
      date: tournament.date,
      startTime: tournament.startTime,
      mode: tournament.mode,
      subMode: tournament.subMode,
      message
    };

    if (cancellationReason) {
      updateData.cancellationReason = cancellationReason;
    }

    await broadcastTournamentUpdate(
      tournament._id.toString(),
      updateData,
      {
        userId: null,
        hostId: tournament.hostId ? tournament.hostId.toString() : null,
        broadcastToAll: true
      }
    );
  } catch (error) {
    Logger.error('Failed to broadcast status change', { tournamentId: tournament._id, error: error.message });
  }
};

/**
 * MAIN FUNCTION: Check and transition tournament to appropriate status
 * 
 * Handles all possible transitions:
 * - upcoming → locked (10 min before start)
 * - locked → running (when room published + min teams met)
 * - locked/upcoming → cancelled (start time passed OR insufficient teams at lock time)
 * - running → result_pending (manual by host)
 * - result_pending → completed (when results submitted)
 * 
 * @param {string} tournamentId - Tournament ID to check
 * @returns {Promise<Object>} { transitioned: boolean, newStatus: string|null, reason: string }
 */
const checkTournamentTransition = async (tournamentId) => {
  const tournament = await Tournament.findById(tournamentId);
  
  if (!tournament) {
    return { transitioned: false, newStatus: null, reason: 'Tournament not found' };
  }

  const now = new Date();
  const startDateTime = calculateStartDateTime(tournament.date, tournament.startTime);
  const lockTime = new Date(startDateTime.getTime() - 10 * 60 * 1000); // 10 min before start

  // Skip if tournament already in terminal state
  if (['completed', 'result_published', 'cancelled'].includes(tournament.status)) {
    return { transitioned: false, newStatus: tournament.status, reason: 'Already in terminal state' };
  }

  // Skip if tournament has results (safety check)
  if (tournament.results && tournament.results.length > 0 && tournament.status !== 'completed') {
    tournament.status = 'completed';
    await tournament.save();
    return { transitioned: true, newStatus: 'completed', reason: 'Has results, marked as completed' };
  }

  // TRANSITION 1: upcoming → cancelled (start time passed, never went live)
  if (tournament.status === 'upcoming' && now >= startDateTime) {
    const refundResult = await refundAllParticipants(tournament);
    tournament.status = 'cancelled';
    await tournament.save();
    await broadcastStatusChange(tournament, 'Tournament expired (never started). Entry fee refunded.', 'expired');
    Logger.info('Tournament expired', { tournamentId, refunded: refundResult.refunded });
    return { transitioned: true, newStatus: 'cancelled', reason: 'Start time passed, never went live' };
  }

  // TRANSITION 2: upcoming → locked (approaching start time, insufficient teams)
  if (tournament.status === 'upcoming' && now >= lockTime && now < startDateTime) {
    if (!hasMinimumTeams(tournament)) {
      const refundResult = await refundAllParticipants(tournament);
      tournament.status = 'cancelled';
      await tournament.save();
      await broadcastStatusChange(tournament, 'Tournament cancelled due to insufficient teams. Entry fee refunded.', 'insufficient_teams');
      Logger.info('Tournament cancelled (insufficient teams at lock time)', { tournamentId, refunded: refundResult.refunded });
      return { transitioned: true, newStatus: 'cancelled', reason: 'Insufficient teams at lock time' };
    }
  }

  // TRANSITION 3: locked → running (room published + minimum teams met)
  if (tournament.status === 'locked' && now >= lockTime) {
    const hasRoom = tournament.room && tournament.room.roomId && tournament.room.password;
    
    if (hasRoom && hasMinimumTeams(tournament)) {
      tournament.status = 'running';
      await tournament.save();
      await broadcastStatusChange(tournament, 'Tournament is now live! Join the room with provided credentials.');
      Logger.info('Tournament went live', { tournamentId });
      return { transitioned: true, newStatus: 'running', reason: 'Room published and minimum teams met' };
    }
    
    if (!hasMinimumTeams(tournament) && now >= startDateTime) {
      const refundResult = await refundAllParticipants(tournament);
      tournament.status = 'cancelled';
      await tournament.save();
      await broadcastStatusChange(tournament, 'Tournament cancelled due to insufficient teams. Entry fee refunded.', 'insufficient_teams');
      Logger.info('Tournament cancelled (insufficient teams at start time)', { tournamentId, refunded: refundResult.refunded });
      return { transitioned: true, newStatus: 'cancelled', reason: 'Insufficient teams at start time' };
    }
  }

  // TRANSITION 4: running → result_pending (only if start time passed significantly)
  // This is typically triggered manually by host, not automatically

  // No transition needed
  return { transitioned: false, newStatus: tournament.status, reason: 'No transition criteria met' };
};

module.exports = {
  checkTournamentTransition,
  calculateStartDateTime,
  hasMinimumTeams,
  refundAllParticipants,
  broadcastStatusChange
};
