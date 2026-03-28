/**
 * Notification Service
 * Push notifications (mobile): via WebSocket only – app listens and shows notification.
 * Email: disabled for tournament/room notifications (no room ID/password emails).
 */

const { broadcastRoomUpdate, broadcastTournamentUpdate, broadcastPushNotification } = require('./websocket.service');
const fcmService = require('./fcm.service');
const User = require('../models/User.model');
const tournamentService = require('./tournament.service');
const Logger = require('../utils/logger');

/**
 * Send room update notification to tournament participants
 * Users get room ID/pass ONLY at start time when tournament goes live (status = 'running').
 * Host can update room anytime before start - room is saved but NOT sent until tournament is live.
 * Socket broadcast ensures users get it automatically without any manual refresh.
 *
 * @param {Object} tournament - Tournament object with populated participants
 * @param {Object} roomData - Room data { roomId, password }
 * @param {string} updateType - Type of update: 'room-updated', 'room-published'
 * @returns {Promise<Object>} Notification result
 */
const sendRoomUpdateNotification = async (tournament, roomData, updateType = 'room-updated') => {
  try {
    if (!tournament || !tournament.participants || tournament.participants.length === 0) {
      return {
        success: true,
        message: 'No participants to notify',
        notified: 0
      };
    }

    if (tournament.status === 'cancelled') {
      Logger.info('Tournament cancelled, skipping room notification', { tournamentId: tournament._id });
      return {
        success: true,
        message: 'Tournament is cancelled. Notification not sent.',
        notified: 0,
        cancelled: true
      };
    }

    // ✅ Prevent duplicate notifications - atomically check and set flag
    // Only skip if updateType is 'room-updated' (not 'room-published' from scheduler)
    if (updateType !== 'room-published') {
      const Tournament = require('../models/Tournament.model');
      const result = await Tournament.findOneAndUpdate(
        { 
          _id: tournament._id,
          'room.roomNotificationSent': { $ne: true } // Only update if flag is not already true
        },
        { 
          $set: { 'room.roomNotificationSent': true } 
        },
        { new: true }
      );
      
      // If result is null, it means flag was already set (another call got there first)
      if (!result) {
        Logger.info('Room notification already sent by another process, skipping duplicate', { tournamentId: tournament._id });
        return {
          success: true,
          message: 'Notification already sent',
          notified: 0,
          alreadySent: true
        };
      }
      
      // Update the tournament object with the fresh data
      tournament = result;
      await tournament.populate('participants hostId');
    }

    const participantIds = tournament.participants.map(p =>
      (p._id ? p._id : p).toString()
    );
    const hostIdStr = tournament.hostId
      ? (tournament.hostId._id ? tournament.hostId._id : tournament.hostId).toString()
      : null;

    const now = new Date();
    const startDateTime = tournamentService.calculateStartDateTime(tournament.date, tournament.startTime);
    const isAfterStartTime = now >= startDateTime;
    const isTournamentLive = tournament.status === 'running';

    // ✅ 10-MINUTE RULE: Users get room details ONLY 10 minutes before start or when live.
    // hostId is excluded from this delay (host always knows the details).
    const tenMinutesBeforeStart = new Date(startDateTime.getTime() - 10 * 60 * 1000);
    const isWithinPublicationWindow = now >= tenMinutesBeforeStart;

    if (!isWithinPublicationWindow && !isTournamentLive) {
      Logger.info('Room updated by host before notification window (10 min before start) - delaying notification', {
        tournamentId: tournament._id,
        startTime: tournament.startTime
      });
      
      // Mark that notification is NOT sent yet (will be handled by scheduler)
      if (tournament.room) {
        tournament.room.roomNotificationSent = false;
        await tournament.save();
      }
      
      return {
        success: true,
        message: 'Room saved. Users will receive it automatically via socket 10 minutes before tournament starts.',
        notified: 0,
        delayed: true
      };
    }

    // Flag is already set atomically at the start (for 'room-updated' type) or will be set for 'room-published' type
    // For 'room-published' type (from scheduler), set flag now
    if (updateType === 'room-published' && tournament.room) {
      tournament.room.roomNotificationSent = true;
      await tournament.save();
    }

    // Tournament is live or within 10-min window - broadcast room to all joined participants via socket instantly
    // Include actual room ID and password in message so user can read from notification
    let notificationMessage;
    if (roomData.roomId && roomData.password) {
      notificationMessage = `Room ID: ${roomData.roomId} | Password: ${roomData.password}. Join the lobby now.`;
    } else if (roomData.roomId) {
      notificationMessage = `Room ID: ${roomData.roomId}. Join the lobby now.`;
    } else if (roomData.password) {
      notificationMessage = `Password: ${roomData.password}. Tournament is live.`;
    } else {
      notificationMessage = 'Room details updated. Join the lobby now.';
    }

    const notificationTitle = 'Room Details Updated';

    // ✅ Broadcast room to participants via socket (tournament:room-updated event)
    broadcastRoomUpdate(
      tournament._id.toString(),
      roomData,
      participantIds,
      hostIdStr
    );

    // ✅ Send tournament:status-updated to each participant for in-app notification banner
    participantIds.forEach(userId => {
      broadcastTournamentUpdate(tournament._id.toString(), {
        type: updateType,
        notificationType: 'room-updated',
        status: tournament.status,
        room: roomData,
        date: tournament.date,
        startTime: tournament.startTime,
        mode: tournament.mode,
        subMode: tournament.subMode,
        tournamentId: tournament._id.toString(),
        lobbyName: tournament.lobbyName || null,
        joinedTeams: tournament.participants?.length || 0,
        title: notificationTitle,
        message: notificationMessage,
        timestamp: new Date().toISOString(),
        isAfterStartTime
      }, {
        userId,
        hostId: null,
        broadcastToAll: false
      });
    });

    // ✅ FCM Push Notification (per-participant, NOT global broadcast)
    if (fcmService.isInitialized()) {
      (async () => {
        try {
          const users = await User.find({ _id: { $in: participantIds } }).select('fcmToken');
          const tokens = users.map(u => u.fcmToken).filter(t => !!t);
          
          if (tokens.length > 0) {
            tokens.forEach(token => {
              fcmService.sendToDevice(token, {
                title: notificationTitle,
                body: notificationMessage,
                data: {
                  type: 'room-updated',
                  notificationType: 'room-updated',
                  tournamentId: tournament._id.toString(),
                  roomId: roomData.roomId || '',
                  password: roomData.password || ''
                }
              });
            });
          }
        } catch (err) {
          Logger.error('Error sending room update FCM', err);
        }
      })();
    }

    // ✅ Notify host as well (confirmation that room details are live)
    if (hostIdStr) {
      broadcastTournamentUpdate(tournament._id.toString(), {
        type: updateType,
        notificationType: 'room-updated',
        status: tournament.status,
        room: roomData,
        date: tournament.date,
        startTime: tournament.startTime,
        mode: tournament.mode,
        subMode: tournament.subMode,
        tournamentId: tournament._id.toString(),
        lobbyName: tournament.lobbyName || null,
        joinedTeams: tournament.participants?.length || 0,
        title: notificationTitle,
        message: notificationMessage,
        timestamp: new Date().toISOString(),
        isAfterStartTime
      }, {
        userId: null,
        hostId: hostIdStr,
        broadcastToAll: false
      });
    }

    Logger.info('Room update notification sent via socket', {
      participantCount: participantIds.length,
      tournamentId: tournament._id,
      isAfterStartTime,
      isTournamentLive
    });

    return {
      success: true,
      message: `Room update sent to ${participantIds.length} participant(s) via WebSocket`,
      notified: participantIds.length,
      websocket: true,
      isAfterStartTime
    };
  } catch (error) {
    Logger.error('Error sending room update notifications', error);
    return {
      success: false,
      message: error.message || 'Failed to send notifications',
      error: error
    };
  }
};

/**
 * Send tournament cancelled notification to participants
 * Message: "Your [time] lobby that you joined has been cancelled"
 * @param {Object} tournament - Tournament object with participants array
 * @param {string} cancellationReason - 'insufficient_teams' | 'expired'
 * @returns {Promise<Object>} Notification result
 */
const sendTournamentCancelledNotification = async (tournament, cancellationReason = 'cancelled') => {
  try {
    if (!tournament || !tournament.participants || tournament.participants.length === 0) {
      return { success: true, message: 'No participants to notify', notified: 0 };
    }

    // ✅ Prevent duplicate cancellation notifications - atomically check and set flag
    const Tournament = require('../models/Tournament.model');
    const result = await Tournament.findOneAndUpdate(
      { 
        _id: tournament._id,
        cancellationNotificationSent: { $ne: true } // Only update if flag is not already true
      },
      { 
        $set: { cancellationNotificationSent: true } 
      },
      { new: true }
    );
    
    // If result is null, it means flag was already set (another call got there first)
    if (!result) {
      Logger.info('Cancellation notification already sent by another process, skipping duplicate', { tournamentId: tournament._id });
      return {
        success: true,
        message: 'Cancellation notification already sent',
        notified: 0,
        alreadySent: true
      };
    }
    
    // Update the tournament object with the fresh data
    tournament = result;
    await tournament.populate('participants');

    const participantIds = tournament.participants.map(p =>
      p._id ? p._id.toString() : p.toString()
    );
    const lobbyTime = tournament.startTime || 'scheduled'; // e.g. "9:00 PM"
    const message = `Your ${lobbyTime} lobby that you joined has been cancelled. Entry fee has been refunded.`;

    participantIds.forEach(userId => {
      broadcastTournamentUpdate(tournament._id.toString(), {
        type: 'tournament-cancelled',
        notificationType: 'tournament-cancelled',
        status: 'cancelled',
        tournamentId: tournament._id.toString(),
        date: tournament.date,
        startTime: tournament.startTime,
        mode: tournament.mode,
        subMode: tournament.subMode,
        title: 'Lobby Cancelled',
        message,
        cancellationReason,
        timestamp: new Date().toISOString()
      }, {
        userId,
        hostId: null,
        broadcastToAll: false
      });
    });

    // ✅ FCM Push Notification
    if (fcmService.isInitialized()) {
      (async () => {
        try {
          const users = await User.find({ _id: { $in: participantIds } }).select('fcmToken');
          const tokens = users.map(u => u.fcmToken).filter(t => !!t);
          
          if (tokens.length > 0) {
            tokens.forEach(token => {
              fcmService.sendToDevice(token, {
                title: 'Lobby Cancelled',
                body: message,
                data: {
                  type: 'tournament-cancelled',
                  notificationType: 'tournament-cancelled',
                  tournamentId: tournament._id.toString()
                }
              });
            });
          }
        } catch (err) {
          Logger.error('Error sending cancellation FCM', err);
        }
      })();
    }

    Logger.info('Tournament cancelled notification sent', { participantCount: participantIds.length, tournamentId: tournament._id });
    return {
      success: true,
      message: `Cancellation notification sent to ${participantIds.length} participant(s)`,
      notified: participantIds.length
    };
  } catch (error) {
    Logger.error('Error sending tournament cancelled notifications', error);
    return { success: false, message: error.message || 'Failed to send notifications' };
  }
};

/**
 * Send tournament start notification
 * @param {Object} tournament - Tournament object with populated participants
 * @returns {Promise<Object>} Notification result
 */
const sendTournamentStartNotification = async (tournament) => {
  try {
    if (!tournament || !tournament.participants || tournament.participants.length === 0) {
      return {
        success: true,
        message: 'No participants to notify',
        notified: 0
      };
    }

    const participantIds = tournament.participants.map(p => 
      p._id ? p._id.toString() : p.toString()
    );

    // Broadcast via WebSocket for mobile app
    broadcastTournamentUpdate(tournament._id.toString(), {
      type: 'tournament-started',
      notificationType: 'tournament-started', // For mobile app notification handling
      status: tournament.status,
      date: tournament.date,
      startTime: tournament.startTime,
      mode: tournament.mode,
      subMode: tournament.subMode,
      tournamentId: tournament._id.toString(),
      room: tournament.room,
      lobbyName: tournament.lobbyName || null,
      title: 'Tournament Started',
      joinedTeams: tournament.participants?.length || 0,
      message: 'Tournament has started! Join the room now.',
      timestamp: new Date().toISOString()
    }, {
      userId: null,
      hostId: tournament.hostId ? tournament.hostId.toString() : null,
      broadcastToAll: false
    });

    // ✅ FCM Push Notification
    if (fcmService.isInitialized()) {
      (async () => {
        try {
          const users = await User.find({ _id: { $in: participantIds } }).select('fcmToken');
          const tokens = users.map(u => u.fcmToken).filter(t => !!t);
          
          if (tokens.length > 0) {
            const messageStr = 'Tournament has started! Join the room now.';
            tokens.forEach(token => {
              fcmService.sendToDevice(token, {
                title: 'Tournament Started',
                body: messageStr,
                data: {
                  type: 'tournament-started',
                  notificationType: 'tournament-started',
                  tournamentId: tournament._id.toString()
                }
              });
            });
          }
        } catch (err) {
          Logger.error('Error sending start tournament FCM', err);
        }
      })();
    }

    return {
      success: true,
      message: `Notifications sent to ${participantIds.length} participant(s)`,
      notified: participantIds.length
    };
  } catch (error) {
    Logger.error('Error sending tournament start notifications', error);
    return {
      success: false,
      message: error.message || 'Failed to send notifications'
    };
  }
};

/**
 * Send new lobby created notification to all users (when admin creates lobbies)
 * @param {Array<Object>} tournaments - Array of tournament objects (with lobbyName, date, startTime, mode, subMode, entryFee)
 * @returns {Object} Result
 */
const sendNewLobbyCreatedNotification = (tournaments = []) => {
  try {
    if (!tournaments || tournaments.length === 0) {
      return { success: true, message: 'No tournaments to notify', count: 0 };
    }
    const tournament = tournaments[0];
    const lobbyLabel = tournament.lobbyName || `${tournament.mode} ${tournament.subMode} ${tournament.startTime}`;
    const title = 'New Lobby Created';
    const message = tournaments.length === 1
      ? `New lobby "${lobbyLabel}" is now open. Join before it fills up!`
      : `${tournaments.length} new lobbies are now open. Check and join!`;
    broadcastPushNotification({
      type: 'new-lobby-created',
      notificationType: 'new-lobby-created',
      title,
      message,
      tournaments: tournaments.map(t => ({
        tournamentId: t._id?.toString?.() || t._id,
        lobbyName: t.lobbyName || null,
        date: t.date,
        startTime: t.startTime,
        mode: t.mode,
        subMode: t.subMode,
        entryFee: t.entryFee,
        maxPlayers: t.maxPlayers
      }))
    });

    // ✅ FCM Push Notification (Topic)
    if (fcmService.isInitialized()) {
      fcmService.sendToTopic('all_users', {
        title,
        body: message,
        data: {
          type: 'new-lobby-created'
        }
      });
    }
    Logger.info('New lobby created notification sent', { count: tournaments.length });
    return { success: true, message: `Notification sent to all users`, count: tournaments.length };
  } catch (error) {
    Logger.error('Error sending new lobby notification', error);
    return { success: false, message: error?.message || 'Failed to send notification' };
  }
};

/**
 * Send lobby filling up notification to attract users (admin/host command)
 * @param {Object} tournament - Tournament object with participants, maxPlayers, lobbyName, etc.
 * @returns {Object} Result
 */
const sendLobbyFillingNotification = (tournament) => {
  try {
    if (!tournament) {
      return { success: false, message: 'Tournament not found' };
    }
    const participantCount = tournament.participants?.length ?? 0;
    const maxPlayers = tournament.maxPlayers ?? 0;
    const slotsLeft = Math.max(0, maxPlayers - participantCount);
    const lobbyName = tournament.lobbyName || `${tournament.mode} ${tournament.subMode} ${tournament.startTime}`;
    const title = 'Lobby Filling Up!';
    const message = slotsLeft <= 0
      ? `"${lobbyName}" is full. Stay tuned for more lobbies!`
      : `"${lobbyName}" – ${slotsLeft} slot(s) left! Join now.`;
    broadcastPushNotification({
      type: 'lobby-filling',
      notificationType: 'lobby-filling',
      title,
      message,
      tournamentId: tournament._id?.toString?.() || tournament._id,
      lobbyName,
      date: tournament.date,
      startTime: tournament.startTime,
      mode: tournament.mode,
      subMode: tournament.subMode,
      entryFee: tournament.entryFee,
      participantCount,
      maxPlayers,
      slotsLeft
    });

    // ✅ FCM Push Notification (Topic)
    if (fcmService.isInitialized()) {
      fcmService.sendToTopic('all_users', {
        title,
        body: message,
        data: {
          type: 'lobby-filling',
          tournamentId: tournament._id?.toString?.() || tournament._id
        }
      });
    }
    Logger.info('Lobby filling notification sent', { tournamentId: tournament._id, lobbyName });
    return { success: true, message: 'Lobby filling notification sent to all users' };
  } catch (error) {
    Logger.error('Error sending lobby filling notification', error);
    return { success: false, message: error?.message || 'Failed to send notification' };
  }
};

/**
 * Send custom notification to all users (Admin only)
 * @param {string} title - Notification title
 * @param {string} message - Notification message body
 * @returns {Object} Result
 */
const sendCustomNotification = (title, message) => {
  try {
    if (!title || !message) {
      return { success: false, message: 'Title and message are required' };
    }

    const trimmedTitle = String(title).trim();
    const trimmedMessage = String(message).trim();

    broadcastPushNotification({
      type: 'admin-notification',
      notificationType: 'admin-notification',
      title: trimmedTitle,
      message: trimmedMessage
    });

    if (fcmService.isInitialized()) {
      fcmService.sendToTopic('all_users', {
        title: trimmedTitle,
        body: trimmedMessage,
        data: {
          type: 'admin-notification',
          title: trimmedTitle,
          message: trimmedMessage
        }
      }).catch(err => {
        Logger.error('Error sending FCM topic notification', err);
      });
    }

    Logger.info('Custom (admin) notification sent to all users', { title: trimmedTitle.slice(0, 50) });
    return { success: true, message: 'Custom notification sent to all users' };
  } catch (error) {
    Logger.error('Error sending custom notification', error);
    return { success: false, message: error?.message || 'Failed to send notification' };
  }
};

module.exports = {
  sendRoomUpdateNotification,
  sendTournamentStartNotification,
  sendTournamentCancelledNotification,
  sendNewLobbyCreatedNotification,
  sendLobbyFillingNotification,
  sendCustomNotification
};

