/**
 * Support Ticket Model (MongoDB)
 * Stores dispute tickets created by users for lobbies/tournaments
 */

const mongoose = require('mongoose');
const validations = require('../validations/supportTicket.validations');

/**
 * Support Ticket Schema
 * Defines the structure for support ticket documents in MongoDB
 */
const supportTicketSchema = new mongoose.Schema({
  // User who created the ticket
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: validations.userId.required,
    index: true
  },
  // Tournament/Lobby this ticket is related to (optional - for general support tickets)
  tournamentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tournament',
    required: false,
    default: null
    // Index defined below using schema.index() to avoid duplicate index warning
  },
  // Host of the tournament/lobby (optional - only if tournamentId is provided)
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
    index: true
  },
  // Ticket details
  subject: {
    type: String,
    required: validations.subject.required,
    trim: true,
    minlength: validations.subject.minlength,
    maxlength: validations.subject.maxlength
  },
  issue: {
    type: String,
    required: validations.issue.required,
    trim: true,
    minlength: validations.issue.minlength,
    maxlength: validations.issue.maxlength
  },
  // Images (max 2) - stored as base64 strings or URLs
  images: {
    type: [{
      type: String,
      trim: true,
      maxlength: validations.images.maxlength // Base64 can be large
    }],
    validate: validations.images.validate
  },
  // Ticket status (only open or closed)
  status: {
    type: String,
    enum: validations.status.enum,
    default: validations.status.default,
    index: true
  },
  // Resolution details
  resolution: {
    type: String,
    trim: true,
    maxlength: validations.resolution.maxlength
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  // Admin notes (visible to admin and host)
  adminNotes: {
    type: String,
    trim: true,
    maxlength: validations.adminNotes.maxlength
  },
  // Host notes (visible to host and admin)
  hostNotes: {
    type: String,
    trim: true,
    maxlength: validations.hostNotes.maxlength
  },
  // Messages/Replies array - all replies on the same ticket
  messages: [{
    message: {
      type: String,
      required: validations.messages.message.required,
      trim: true,
      minlength: validations.messages.message.minlength,
      maxlength: validations.messages.message.maxlength
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: validations.messages.role.enum,
      required: validations.messages.role.required
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Track last reply time for reminders
  lastReplyAt: {
    type: Date,
    default: null
  },
  lastRepliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  collection: 'support_tickets'
});

// Indexes for better query performance
supportTicketSchema.index({ userId: 1, createdAt: -1 });
supportTicketSchema.index({ tournamentId: 1 });
supportTicketSchema.index({ hostId: 1, status: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });

// Validate max 2 images
supportTicketSchema.pre('save', async function() {
  if (this.images && this.images.length > 2) {
    throw new Error('Maximum 2 images allowed');
  }
});

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

module.exports = SupportTicket;

