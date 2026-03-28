/**
 * Lobby Chat Message Model (MongoDB)
 * Stores chat messages for live tournament lobbies.
 * Messages stored only while tournament is live; cleared when completed/cancelled.
 */

const mongoose = require('mongoose');

const lobbyChatMessageSchema = new mongoose.Schema({
  tournamentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tournament',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  senderName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  role: {
    type: String,
    enum: ['host', 'participant'],
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true,
  collection: 'lobby_chat_messages'
});

lobbyChatMessageSchema.index({ tournamentId: 1, createdAt: -1 });

const LobbyChatMessage = mongoose.model('LobbyChatMessage', lobbyChatMessageSchema);

module.exports = LobbyChatMessage;
