/**
 * WebSocket Service
 * Handles real-time tournament status updates via WebSocket
 */

const tournamentService = require('./tournament.service');
const { getDisplayStatus } = require('../utils/transaction.helper');
const { verifyAccessToken } = require('../utils/jwt.service');
const Logger = require('../utils/logger');

let io = null;

/**
 * Initialize WebSocket server
 * @param {Object} server - HTTP server instance
 */
const initializeWebSocket = (server) => {
  const { Server } = require('socket.io');

  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  // Auth middleware: verify JWT and attach userId for auto wallet subscription
  io.use(async (socket, next) => {
    const auth = socket.handshake.auth || {};
    const token =
      auth.token ||
      auth.accessToken ||
      (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      Logger.info('WS connect: no token', { socketId: socket.id, hasAuth: !!socket.handshake.auth, authKeys: socket.handshake.auth ? Object.keys(socket.handshake.auth) : [] });
      return next(); // Allow anonymous connection
    }
    try {
      const decoded = verifyAccessToken(token);
      socket.userId = decoded.userId;
    } catch (err) {
      // Invalid/expired token – allow connection but no userId
      Logger.warn('WebSocket auth failed', { reason: err.message, socketId: socket.id });
      socket.userId = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    Logger.info('WebSocket client connected', { socketId: socket.id, userId: socket.userId || 'anonymous' });

    // Auto-subscribe when user connected with auth
    const subscribeUserRooms = (userId) => {
      if (userId) {
        socket.join(`wallet:${userId}`);
        socket.join(`user:${userId}`);
      }
    };
    if (socket.userId) {
      subscribeUserRooms(socket.userId);
      Logger.info('Client auto-subscribed to wallet + user-tournaments', { socketId: socket.id, userId: socket.userId });
    }

    // Re-auth: token refresh ke baad naya token bhejo – disconnect kiye bina userId update
    socket.on('auth:refresh', (payload) => {
      const token = payload?.token || payload?.accessToken;
      if (!token) {
        Logger.warn('auth:refresh failed: no token', { socketId: socket.id });
        socket.emit('auth:error', { message: 'Token required' });
        return;
      }
      try {
        const decoded = verifyAccessToken(token);
        const prevUserId = socket.userId?.toString();
        socket.userId = decoded.userId;
        subscribeUserRooms(socket.userId);
        if (prevUserId !== socket.userId?.toString()) {
          socket.leave(`wallet:${prevUserId}`);
          socket.leave(`user:${prevUserId}`);
        }
        socket.emit('auth:success', { userId: socket.userId.toString() });
        Logger.info('Socket re-authenticated', { socketId: socket.id, userId: socket.userId });
      } catch (err) {
        Logger.warn('auth:refresh failed: invalid token', { socketId: socket.id, reason: err.message });
        socket.emit('auth:error', { message: err.message || 'Invalid token' });
      }
    });

    // Handle subscription to tournament updates
    socket.on('subscribe:tournament', (tournamentId) => {
      if (tournamentId) {
        socket.join(`tournament:${tournamentId}`);
        Logger.info('Client subscribed to tournament', { socketId: socket.id, tournamentId });
      }
    });

    // Handle unsubscription from tournament updates
    socket.on('unsubscribe:tournament', (tournamentId) => {
      if (tournamentId) {
        socket.leave(`tournament:${tournamentId}`);
        Logger.info('Client unsubscribed from tournament', { socketId: socket.id, tournamentId });
      }
    });

    // Special tournament: subscribe to a specific tournament's events
    socket.on('subscribe:special-tournament', (tournamentId) => {
      if (tournamentId) {
        socket.join(`tournament:${tournamentId}`);
        Logger.info('Client subscribed to special tournament', { socketId: socket.id, tournamentId });
      }
    });

    socket.on('unsubscribe:special-tournament', (tournamentId) => {
      if (tournamentId) {
        socket.leave(`tournament:${tournamentId}`);
        Logger.info('Client unsubscribed from special tournament', { socketId: socket.id, tournamentId });
      }
    });

    // Handle role-based subscriptions
    // User subscribes to their joined tournaments
    socket.on('subscribe:user-tournaments', (userId) => {
      if (userId) {
        socket.join(`user:${userId}`);
        Logger.info('Client subscribed to user tournaments', { socketId: socket.id, userId });
      }
    });

    // Host subscribes to their assigned tournaments
    socket.on('subscribe:host-tournaments', (hostId) => {
      if (hostId) {
        socket.join(`host:${hostId}`);
        Logger.info('Client subscribed to host tournaments', { socketId: socket.id, hostId });
      }
    });

    // Admin subscribes to all tournaments
    socket.on('subscribe:admin-tournaments', () => {
      socket.join('admin:tournaments');
      Logger.info('Client subscribed to admin tournaments', { socketId: socket.id });
    });

    // User subscribes to wallet updates
    socket.on('subscribe:wallet', (userId) => {
      if (userId) {
        socket.join(`wallet:${userId}`);
        Logger.info('Client subscribed to wallet updates', { socketId: socket.id, userId });
      }
    });

    // User unsubscribes from wallet updates
    socket.on('unsubscribe:wallet', (userId) => {
      if (userId) {
        socket.leave(`wallet:${userId}`);
        Logger.info('Client unsubscribed from wallet updates', { socketId: socket.id, userId });
      }
    });

    // Support ticket subscriptions
    // Subscribe to specific ticket updates
    socket.on('subscribe:ticket', (ticketId) => {
      if (ticketId) {
        socket.join(`ticket:${ticketId}`);
        Logger.info('Client subscribed to ticket', { socketId: socket.id, ticketId });
      }
    });

    // Unsubscribe from specific ticket updates
    socket.on('unsubscribe:ticket', (ticketId) => {
      if (ticketId) {
        socket.leave(`ticket:${ticketId}`);
        Logger.info('Client unsubscribed from ticket', { socketId: socket.id, ticketId });
      }
    });

    // User subscribes to their own tickets
    socket.on('subscribe:user-tickets', (userId) => {
      if (userId) {
        socket.join(`user-tickets:${userId}`);
        Logger.info('Client subscribed to user tickets', { socketId: socket.id, userId });
      }
    });

    // User unsubscribes from their tickets
    socket.on('unsubscribe:user-tickets', (userId) => {
      if (userId) {
        socket.leave(`user-tickets:${userId}`);
        Logger.info('Client unsubscribed from user tickets', { socketId: socket.id, userId });
      }
    });

    // Host subscribes to their assigned tickets
    socket.on('subscribe:host-tickets', (hostId) => {
      if (hostId) {
        socket.join(`host-tickets:${hostId}`);
        Logger.info('Client subscribed to host tickets', { socketId: socket.id, hostId });
      }
    });

    // Host unsubscribes from their tickets
    socket.on('unsubscribe:host-tickets', (hostId) => {
      if (hostId) {
        socket.leave(`host-tickets:${hostId}`);
        Logger.info('Client unsubscribed from host tickets', { socketId: socket.id, hostId });
      }
    });

    // Admin subscribes to all tickets
    socket.on('subscribe:admin-tickets', () => {
      socket.join('admin:tickets');
      Logger.info('Client subscribed to admin tickets', { socketId: socket.id });
    });

    // Admin unsubscribes from all tickets
    socket.on('unsubscribe:admin-tickets', () => {
      socket.leave('admin:tickets');
      Logger.info('Client unsubscribed from admin tickets', { socketId: socket.id });
    });

    // Lobby chat – sirf live tournament mein, participants + host ke liye
    socket.on('subscribe:lobby-chat', async (tournamentId) => {
      if (!tournamentId || !socket.userId) {
        Logger.warn('Lobby chat subscribe failed: auth missing', { socketId: socket.id, tournamentId: tournamentId || 'missing', hasUserId: !!socket.userId });
        socket.emit('lobby-chat:error', { message: 'Authentication required' });
        return;
      }
      try {
        const Tournament = require('../models/Tournament.model');
        const tournament = await Tournament.findById(tournamentId).select('status participants hostId');
        if (!tournament) {
          Logger.warn('Lobby chat subscribe failed: tournament not found', { socketId: socket.id, tournamentId });
          socket.emit('lobby-chat:error', { message: 'Tournament not found' });
          return;
        }
        if (tournament.status !== 'running') {
          Logger.warn('Lobby chat subscribe failed: not running', { socketId: socket.id, tournamentId, status: tournament.status });
          socket.emit('lobby-chat:error', { message: 'Chat is only available when lobby is live' });
          return;
        }
        const userIdStr = socket.userId.toString();
        const isParticipant = tournament.participants?.some(p => p.toString() === userIdStr);
        const isHost = tournament.hostId && tournament.hostId.toString() === userIdStr;
        if (!isParticipant && !isHost) {
          Logger.warn('Lobby chat subscribe failed: not participant/host', { socketId: socket.id, tournamentId, userId: userIdStr });
          socket.emit('lobby-chat:error', { message: 'Only participants and host can access lobby chat' });
          return;
        }
        socket.join(`lobby-chat:${tournamentId}`);
        Logger.info('Lobby chat subscribed', { socketId: socket.id, tournamentId, userId: userIdStr, role: isHost ? 'host' : 'participant' });
      } catch (err) {
        Logger.error('Lobby chat subscribe error', { tournamentId, socketId: socket.id, err: err.message, stack: err.stack });
        socket.emit('lobby-chat:error', { message: 'Failed to join lobby chat' });
      }
    });

    socket.on('unsubscribe:lobby-chat', (tournamentId) => {
      if (tournamentId) {
        socket.leave(`lobby-chat:${tournamentId}`);
        Logger.info('Client unsubscribed from lobby chat', { socketId: socket.id, tournamentId });
      }
    });

    socket.on('lobby-chat:send-message', async (payload) => {
      if (!socket.userId) {
        Logger.warn('Lobby chat send failed: no userId', { socketId: socket.id, tournamentId: payload?.tournamentId });
        socket.emit('lobby-chat:error', { message: 'Authentication required' });
        return;
      }
      const { tournamentId, message } = payload || {};
      if (!tournamentId || typeof message !== 'string') {
        Logger.warn('Lobby chat send failed: bad payload', { socketId: socket.id, hasTournamentId: !!tournamentId, messageType: typeof message });
        socket.emit('lobby-chat:error', { message: 'tournamentId and message are required' });
        return;
      }
      const trimmedMsg = message.trim().slice(0, 500);
      if (!trimmedMsg) {
        Logger.warn('Lobby chat send failed: empty message', { socketId: socket.id, tournamentId });
        socket.emit('lobby-chat:error', { message: 'Message cannot be empty' });
        return;
      }
      try {
        const Tournament = require('../models/Tournament.model');
        const User = require('../models/User.model');
        const tournament = await Tournament.findById(tournamentId).select('status participants hostId');
        if (!tournament) {
          Logger.warn('Lobby chat send failed: tournament not found', { socketId: socket.id, tournamentId });
          socket.emit('lobby-chat:error', { message: 'Tournament not found' });
          return;
        }
        if (tournament.status !== 'running') {
          Logger.warn('Lobby chat send failed: tournament not running', { socketId: socket.id, tournamentId, status: tournament.status });
          socket.emit('lobby-chat:error', { message: 'Chat is only available when lobby is live' });
          return;
        }
        const userIdStr = socket.userId.toString();
        const isParticipant = tournament.participants?.some(p => p.toString() === userIdStr);
        const isHost = tournament.hostId && tournament.hostId.toString() === userIdStr;
        if (!isParticipant && !isHost) {
          Logger.warn('Lobby chat send failed: not participant/host', { socketId: socket.id, tournamentId, userId: userIdStr });
          socket.emit('lobby-chat:error', { message: 'Only participants and host can send messages' });
          return;
        }
        const user = await User.findById(socket.userId).select('name ign').lean();
        const senderName = (user?.ign || user?.name || 'Unknown').trim().slice(0, 100);
        const role = isHost ? 'host' : 'participant';
        const LobbyChatMessage = require('../models/LobbyChatMessage.model');
        const doc = await LobbyChatMessage.create({
          tournamentId,
          userId: socket.userId,
          senderName,
          role,
          message: trimmedMsg
        });
        const msgPayload = {
          _id: doc._id,
          tournamentId,
          userId: userIdStr,
          senderName,
          role,
          message: trimmedMsg,
          createdAt: doc.createdAt
        };
        // 1) Sender ko hamesha bhejo – apna message turant dikhe
        socket.emit('lobby-chat:message', msgPayload);
        // 2) Baaki sab jo is lobby-chat room mein hain (dusre users + host) – dynamically receive karenge
        socket.to(`lobby-chat:${tournamentId}`).emit('lobby-chat:message', msgPayload);
        // 3) Host ko bhi bhejo (agar host ne subscribe:lobby-chat nahi kiya ho to bhi receive ho)
        if (tournament.hostId) {
          const hostIdStr = tournament.hostId.toString();
          if (hostIdStr !== userIdStr) {
            io.to(`host:${hostIdStr}`).emit('lobby-chat:message', msgPayload);
          }
        }
        // 4) Har dusra participant ko user room se bhi bhejo (subscribe na bhi kiya ho to bhi receive)
        tournament.participants?.forEach((p) => {
          const pid = p && p.toString ? p.toString() : String(p);
          if (pid && pid !== userIdStr) {
            io.to(`user:${pid}`).emit('lobby-chat:message', msgPayload);
          }
        });
        const otherCount = tournament.participants?.filter(p => (p && p.toString ? p.toString() : String(p)) !== userIdStr).length ?? 0;
        Logger.info('Lobby chat message sent', {
          tournamentId,
          userId: userIdStr,
          senderName,
          role,
          emittedTo: { sender: true, lobbyChatRoom: true, host: !!tournament.hostId, otherParticipants: otherCount }
        });
      } catch (err) {
        Logger.error('Lobby chat send error', { tournamentId, socketId: socket.id, err: err.message, stack: err.stack });
        socket.emit('lobby-chat:error', { message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', () => {
      Logger.info('WebSocket client disconnected', { socketId: socket.id });
    });
  });

  Logger.info('WebSocket server initialized');
  return io;
};

/**
 * Check and update tournament status, then broadcast to subscribers
 * Called event-driven when room is updated
 * @param {string} tournamentId - Optional tournament ID to check specific tournament
 * @param {Object} tournament - Optional tournament object (if already loaded)
 * @returns {Promise<number>} Number of tournaments updated
 */
const checkAndBroadcastTournamentStatus = async (tournamentId = null, tournament = null) => {
  try {
    const Tournament = require('../models/Tournament.model');
    
    // Broadcast status to all live tournaments (or a specific one if provided)
    // The status transition logic is now handled by the caller (scheduler or controller)
    
    let tournamentsToBroadcast = [];
    if (tournament) {
      tournamentsToBroadcast = [tournament];
    } else if (tournamentId) {
      const t = await Tournament.findById(tournamentId);
      if (t) tournamentsToBroadcast = [t];
    } else {
      // Get all recently updated tournaments (status running)
      tournamentsToBroadcast = await Tournament.find({
        status: 'running',
        'room.roomId': { $ne: null },
        'room.password': { $ne: null }
      }).select('_id status date startTime mode subMode participants');
    }

    if (tournamentsToBroadcast.length > 0 && io) {
      tournamentsToBroadcast.forEach(t => {
        const tournamentData = {
          tournamentId: t._id.toString(),
          status: t.status,
          date: t.date,
          startTime: t.startTime,
          mode: t.mode,
          subMode: t.subMode,
          joinedTeams: t.participants?.length || 0
        };
        
        // Broadcast to all clients
        io.emit('tournament:status-updated', tournamentData);
        
        // Also broadcast to specific tournament room
        io.to(`tournament:${t._id}`).emit('tournament:status-updated', tournamentData);
      });
      Logger.info('Broadcasted tournament status updates via WebSocket', { count: tournamentsToBroadcast.length });
    }

    return tournamentsToBroadcast.length;
  } catch (error) {
    Logger.error('Error in broadcast tournament status', error);
    throw error;
  }
};

/**
 * Broadcast tournament status update to specific tournament subscribers
 * @param {string} tournamentId - Tournament ID
 * @param {Object} tournamentData - Tournament data to broadcast
 * @param {Object} options - Broadcast options { userId, hostId, broadcastToAll, adminOnly }
 * @param {boolean} options.adminOnly - When true, only send to admin room (e.g. lobby created by admin – no host/user trigger)
 */
const broadcastTournamentUpdate = (tournamentId, tournamentData, options = {}) => {
  if (!io) {
    Logger.warn('WebSocket server not initialized, cannot broadcast');
    return;
  }

  const { userId, hostId, broadcastToAll = true, adminOnly = false } = options;
  const updateData = {
    tournamentId,
    joinedTeams: tournamentData.joinedTeams ?? (tournamentData.participants?.length || 0),
    ...tournamentData
  };

  // When admin creates lobby: only notify admin panel. Do NOT send to all/hosts so host application does not auto-trigger.
  if (adminOnly) {
    io.to('admin:tournaments').emit('tournament:status-updated', updateData);
    return;
  }

  // ✅ SECURITY: When broadcastToAll is false, only send to specific users
  // This is used for notifications where we only want to notify participants
  if (!broadcastToAll) {
    // Only send to specific user if provided (for participant notifications)
    if (userId) {
      io.to(`user:${userId}`).emit('tournament:status-updated', updateData);
    }

    // Broadcast to specific host if provided
    if (hostId) {
      io.to(`host:${hostId}`).emit('tournament:status-updated', updateData);
    }
  } else {
    // Broadcast to tournament-specific room (for general status updates)
    io.to(`tournament:${tournamentId}`).emit('tournament:status-updated', updateData);

    // Broadcast to specific user if provided
    if (userId) {
      io.to(`user:${userId}`).emit('tournament:status-updated', updateData);
    }

    // Broadcast to specific host if provided
    if (hostId) {
      io.to(`host:${hostId}`).emit('tournament:status-updated', updateData);
    }

    // Broadcast to admin room (for general status updates, not notifications)
    io.to('admin:tournaments').emit('tournament:status-updated', updateData);

    // Broadcast to all clients if enabled (default: true)
    io.emit('tournament:status-updated', updateData);
  }

  // Lobby chat band – completed/cancelled pe chat room close, DB se data clear
  const status = tournamentData.status;
  if (status === 'completed' || status === 'cancelled' || status === 'result_pending') {
    if (io) {
      io.to(`lobby-chat:${tournamentId}`).emit('lobby-chat:closed', { tournamentId, status });
      Logger.info('Lobby chat closed', { tournamentId, status });
    }
    // DB se chat messages delete
    const LobbyChatMessage = require('../models/LobbyChatMessage.model');
    const mongoose = require('mongoose');
    LobbyChatMessage.deleteMany({ tournamentId: new mongoose.Types.ObjectId(tournamentId) })
      .then((result) => {
        if (result.deletedCount > 0) {
          Logger.info('Lobby chat messages cleared from DB', { tournamentId, deletedCount: result.deletedCount });
        }
      })
      .catch((err) => Logger.error('Failed to clear lobby chat from DB', { tournamentId, err: err.message }));
  }
};

/**
 * Broadcast live match results update to tournament participants, host, and tournament subscribers.
 * Called when host submits match result – participants see live standings immediately.
 * @param {string} tournamentId - Tournament ID
 * @param {Object} liveResultsData - { matchResults, standings, matchResultsCount, status, totalMatches }
 * @param {Array} participantIds - Array of participant user IDs (team leaders who joined)
 * @param {string} hostId - Host user ID
 */
const broadcastLiveResultsUpdate = (tournamentId, liveResultsData, participantIds = [], hostId = null) => {
  if (!io) {
    Logger.warn('WebSocket server not initialized, cannot broadcast live results');
    return;
  }

  const updateData = {
    tournamentId,
    type: 'live-results-updated',
    ...liveResultsData,
    timestamp: new Date().toISOString()
  };

  // Tournament room – anyone watching this tournament (e.g. live results page)
  io.to(`tournament:${tournamentId}`).emit('tournament:live-results-updated', updateData);

  // Participants – users who joined this tournament (via user:userId)
  participantIds.forEach(userId => {
    const id = userId && userId.toString ? userId.toString() : String(userId);
    if (id) io.to(`user:${id}`).emit('tournament:live-results-updated', updateData);
  });

  // Host
  if (hostId) {
    const hId = hostId && hostId.toString ? hostId.toString() : String(hostId);
    io.to(`host:${hId}`).emit('tournament:live-results-updated', updateData);
  }

  // Admin room
  io.to('admin:tournaments').emit('tournament:live-results-updated', updateData);

  Logger.info('Live results update broadcasted', { tournamentId, participantCount: participantIds.length });
};

/**
 * Broadcast room update to tournament participants ONLY
 * ✅ SECURITY: Only sends to users who actually joined the tournament
 * @param {string} tournamentId - Tournament ID
 * @param {Object} roomData - Room data { roomId, password }
 * @param {Array} participantIds - Array of participant user IDs (ONLY these users will receive notification)
 * @param {string} hostId - Host user ID
 */
const broadcastRoomUpdate = (tournamentId, roomData, participantIds = [], hostId = null) => {
  if (!io) {
    Logger.warn('WebSocket server not initialized, cannot broadcast');
    return;
  }

  const updateData = {
    tournamentId,
    type: 'room-updated',
    room: roomData,
    timestamp: new Date().toISOString()
  };

  // ✅ SECURITY: Only send to participants who actually joined the tournament
  // Don't broadcast to tournament room (anyone can subscribe to it)
  participantIds.forEach(userId => {
    const uid = userId && userId.toString ? userId.toString() : String(userId);
    if (uid) io.to(`user:${uid}`).emit('tournament:room-updated', updateData);
  });

  // Broadcast to host (assigned host only)
  if (hostId) {
    const hid = hostId && hostId.toString ? hostId.toString() : String(hostId);
    if (hid) io.to(`host:${hid}`).emit('tournament:room-updated', updateData);
  }

  Logger.info('Room update broadcasted', { participantCount: participantIds.length, tournamentId });
};

/**
 * Broadcast push notification to all connected clients
 * Used for: new lobby created, lobby filling up (attract users), etc.
 * @param {Object} payload - { type, title, message, data... }
 */
const broadcastPushNotification = (payload) => {
  if (!io) {
    Logger.warn('WebSocket server not initialized, cannot broadcast push notification');
    return;
  }
  const data = {
    ...payload,
    timestamp: payload.timestamp || new Date().toISOString()
  };
  io.emit('notification:push', data);
  Logger.info('Push notification broadcasted', { type: data.type });
};

/**
 * Broadcast wallet balance update to user
 * @param {string} userId - User ID
 * @param {Object} walletData - Wallet data { balanceINR, updatedAt }
 * @param {Object} transactionData - Optional transaction data that caused the update
 * @param {number} manualAmountINR - Optional manual amount to include (e.g. for bulk topup)
 */
const broadcastWalletUpdate = (userId, walletData, transactionData = null, manualAmountINR = null) => {
  if (!io) {
    Logger.warn('WebSocket server not initialized, cannot broadcast wallet update');
    return;
  }

  const updateData = {
    userId,
    wallet: {
      balanceINR: walletData.balanceINR,
      updatedAt: walletData.updatedAt
    },
    // Include amountINR at top level if available (either from transaction or manual amount)
    amountINR: transactionData ? transactionData.amountINR : (manualAmountINR || null),
    timestamp: new Date().toISOString()
  };

  // Add transaction data if provided
  if (transactionData) {

    // Transform status using helper function
    const displayStatus = getDisplayStatus(transactionData);

    updateData.transaction = {
      _id: transactionData._id,
      type: transactionData.type,
      amountINR: transactionData.amountINR,
      description: transactionData.description,
      status: transactionData.status, // Original status
      displayStatus: displayStatus, // User-facing status (pending/success/fail)
      createdAt: transactionData.createdAt,
      updatedAt: transactionData.updatedAt
    };
  }

  // Broadcast to specific user's wallet room
  io.to(`wallet:${userId}`).emit('wallet:balance-updated', updateData);
  
  Logger.info('Wallet balance update broadcasted', { userId });
};

/**
 * Broadcast transaction status update to user
 * Used when admin approves/rejects payment
 * @param {string} userId - User ID
 * @param {Object} transactionData - Transaction data
 * @param {Object} walletData - Updated wallet data
 * @param {string} action - Action type: 'approved', 'rejected', 'updated'
 */
const broadcastTransactionUpdate = (userId, transactionData, walletData = null, action = 'updated') => {
  if (!io) {
    Logger.warn('WebSocket server not initialized, cannot broadcast transaction update');
    return;
  }

  // Transform status using helper function
  const displayStatus = getDisplayStatus(transactionData);

  const updateData = {
    userId,
    transaction: {
      _id: transactionData._id,
      type: transactionData.type,
      amountINR: transactionData.amountINR,
      description: transactionData.description,
      status: transactionData.status, // Original status
      displayStatus: displayStatus, // User-facing status (pending/success/fail)
      paymentVerified: transactionData.paymentVerified,
      verifiedBy: transactionData.verifiedBy,
      verifiedAt: transactionData.verifiedAt,
      utr: transactionData.utr,
      qrCodeId: transactionData.qrCodeId,
      receiptCode: transactionData.receiptCode,
      createdAt: transactionData.createdAt,
      updatedAt: transactionData.updatedAt
    },
    action, // 'approved', 'rejected', 'updated'
    timestamp: new Date().toISOString()
  };

  // Add wallet data if provided
  if (walletData) {
    updateData.wallet = {
      balanceINR: walletData.balanceINR,
      updatedAt: walletData.updatedAt
    };
  }

  // Broadcast to specific user's wallet room
  io.to(`wallet:${userId}`).emit('wallet:transaction-updated', updateData);
  
  // If transaction has qrCodeId, also broadcast QR status update specifically
  if (transactionData.qrCodeId) {
    // Prepare QR status update data (same format as GET /api/payment/qr-status response)
    const qrStatusData = {
      transactionId: transactionData._id ? transactionData._id.toString() : transactionData._id,
      qrCodeId: transactionData.qrCodeId,
      paymentId: transactionData.paymentId || null,
      receiptCode: transactionData.receiptCode || null,
      status: displayStatus, // User-facing status (pending/success/fail)
      originalStatus: transactionData.status, // Original status from database
      amountINR: transactionData.amountINR || null,
      paymentMethod: transactionData.paymentMethod || null,
      paymentVerified: transactionData.paymentVerified || false,
      verifiedBy: transactionData.verifiedBy || null,
      verifiedAt: transactionData.verifiedAt || null,
      utr: transactionData.utr || null,
      bankReference: transactionData.bankReference || null,
      isExpired: transactionData.qrCodeExpiresAt 
        ? new Date() >= new Date(transactionData.qrCodeExpiresAt)
        : false,
      expiresAt: transactionData.qrCodeExpiresAt || null,
      createdAt: transactionData.createdAt || null,
      updatedAt: transactionData.updatedAt || null,
      action, // 'approved', 'rejected', 'updated'
      timestamp: new Date().toISOString()
    };
    
    // Broadcast QR status update to user's wallet room
    io.to(`wallet:${userId}`).emit('payment:qr-status-updated', qrStatusData);
    Logger.info('QR status update broadcasted', { userId, qrCodeId: transactionData.qrCodeId, displayStatus, action });
  }
  
  Logger.info('Transaction broadcasted to user', { action, userId, transactionId: transactionData._id });
};

/**
 * Broadcast wallet history update (new transaction added)
 * @param {string} userId - User ID
 * @param {Object} transactionData - New transaction data
 * @param {Object} walletData - Updated wallet data
 */
const broadcastWalletHistoryUpdate = (userId, transactionData, walletData = null) => {
  if (!io) {
    Logger.warn('WebSocket server not initialized, cannot broadcast wallet history update');
    return;
  }

  // Transform status using helper function
  const displayStatus = getDisplayStatus(transactionData);

  const updateData = {
    userId,
    transaction: {
      _id: transactionData._id,
      type: transactionData.type,
      amountINR: transactionData.amountINR,
      description: transactionData.description,
      status: transactionData.status, // Original status
      displayStatus: displayStatus, // User-facing status (pending/success/fail)
      createdAt: transactionData.createdAt
    },
    timestamp: new Date().toISOString()
  };

  // Add wallet data if provided
  if (walletData) {
    updateData.wallet = {
      balanceINR: walletData.balanceINR,
      updatedAt: walletData.updatedAt
    };
  }

  // Broadcast to specific user's wallet room
  io.to(`wallet:${userId}`).emit('wallet:history-updated', updateData);
  
  Logger.info('Wallet history update broadcasted', { userId });
};

/**
 * Broadcast ticket reply added to subscribers
 * @param {string} ticketId - Ticket ID
 * @param {Object} ticketData - Ticket data with new reply
 * @param {Object} replyData - New reply data
 * @param {Object} options - Broadcast options { userId, hostId, isAdmin }
 */
const broadcastTicketReply = (ticketId, ticketData, replyData, options = {}) => {
  if (!io) {
    Logger.warn('WebSocket server not initialized, cannot broadcast ticket reply');
    return;
  }

  const { userId, hostId, isAdmin = false } = options;

  const updateData = {
    ticketId,
    ticket: {
      _id: ticketData._id,
      status: ticketData.status,
      lastReplyAt: ticketData.lastReplyAt,
      lastRepliedBy: ticketData.lastRepliedBy
    },
    reply: {
      message: replyData.message,
      sentBy: replyData.sentBy,
      role: replyData.role,
      createdAt: replyData.createdAt
    },
    timestamp: new Date().toISOString()
  };

  // Broadcast to ticket-specific room
  io.to(`ticket:${ticketId}`).emit('ticket:reply-added', updateData);

  // Broadcast to user if provided
  if (userId) {
    io.to(`user-tickets:${userId}`).emit('ticket:reply-added', updateData);
  }

  // Broadcast to host if provided
  if (hostId) {
    io.to(`host-tickets:${hostId}`).emit('ticket:reply-added', updateData);
  }

  // Broadcast to admin room
  if (isAdmin) {
    io.to('admin:tickets').emit('ticket:reply-added', updateData);
  }

  Logger.info('Ticket reply broadcasted', { ticketId });
};

/**
 * Broadcast ticket status update to subscribers
 * @param {string} ticketId - Ticket ID
 * @param {Object} ticketData - Updated ticket data
 * @param {Object} options - Broadcast options { userId, hostId, isAdmin, isAutoClosed }
 */
const broadcastTicketStatusUpdate = (ticketId, ticketData, options = {}) => {
  if (!io) {
    Logger.warn('WebSocket server not initialized, cannot broadcast ticket status update');
    return;
  }

  const { userId, hostId, isAdmin = false, isAutoClosed = false } = options;

  const updateData = {
    ticketId,
    ticket: {
      _id: ticketData._id,
      status: ticketData.status,
      resolvedAt: ticketData.resolvedAt,
      resolvedBy: ticketData.resolvedBy,
      lastReplyAt: ticketData.lastReplyAt,
      lastRepliedBy: ticketData.lastRepliedBy
    },
    isAutoClosed,
    timestamp: new Date().toISOString()
  };

  // Broadcast to ticket-specific room
  io.to(`ticket:${ticketId}`).emit('ticket:status-updated', updateData);

  // If ticket is closed, also emit closed event and disconnect clients from ticket room
  if (ticketData.status === 'closed') {
    io.to(`ticket:${ticketId}`).emit('ticket:closed', {
      ticketId,
      timestamp: new Date().toISOString()
    });

    // Disconnect all clients from the ticket room after a short delay
    setTimeout(() => {
      const room = io.sockets.adapter.rooms.get(`ticket:${ticketId}`);
      if (room) {
        room.forEach((socketId) => {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.leave(`ticket:${ticketId}`);
          }
        });
      }
    }, 1000); // Wait 1 second before disconnecting
  }

  // Broadcast to user if provided
  if (userId) {
    io.to(`user-tickets:${userId}`).emit('ticket:status-updated', updateData);
    if (ticketData.status === 'closed') {
      io.to(`user-tickets:${userId}`).emit('ticket:closed', {
        ticketId,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Broadcast to host if provided
  if (hostId) {
    io.to(`host-tickets:${hostId}`).emit('ticket:status-updated', updateData);
    if (ticketData.status === 'closed') {
      io.to(`host-tickets:${hostId}`).emit('ticket:closed', {
        ticketId,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Broadcast to admin room
  if (isAdmin || isAutoClosed) {
    io.to('admin:tickets').emit('ticket:status-updated', updateData);
    if (ticketData.status === 'closed') {
      io.to('admin:tickets').emit('ticket:closed', {
        ticketId,
        timestamp: new Date().toISOString()
      });
    }
  }

  Logger.info('Ticket status update broadcasted', { ticketId, status: ticketData.status });
};

const getIO = () => io;
const setIO = (newIo) => {
  io = newIo;
};

module.exports = {
  initializeWebSocket,
  checkAndBroadcastTournamentStatus,
  broadcastTournamentUpdate,
  broadcastLiveResultsUpdate,
  broadcastRoomUpdate,
  broadcastPushNotification,
  broadcastWalletUpdate,
  broadcastTransactionUpdate,
  broadcastWalletHistoryUpdate,
  broadcastTicketReply,
  broadcastTicketStatusUpdate,
  getIO,
  setIO
};
