/**
 * Host Application Model (MongoDB)
 * Stores host applications for tournaments
 */

const mongoose = require('mongoose');
const validations = require('../validations/hostApplication.validations');

/**
 * Host Application Schema
 * Defines the structure for host application documents in MongoDB
 */
const hostApplicationSchema = new mongoose.Schema({
  tournamentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tournament',
    required: validations.tournamentId.required,
    index: true
  },
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: validations.hostId.required,
    index: true
  },
  status: {
    type: String,
    enum: validations.status.enum,
    default: validations.status.default
  },
  applicationDetails: {
    experience: {
      type: String,
      trim: true
    },
    reason: {
      type: String,
      trim: true
    },
    additionalInfo: {
      type: String,
      trim: true
    }
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  adminNotes: {
    type: String,
    trim: true,
    default: null
  }
}, {
  timestamps: true,
  collection: 'hostApplications'
});

// Compound indexes for efficient queries
hostApplicationSchema.index({ tournamentId: 1, hostId: 1 });
hostApplicationSchema.index({ hostId: 1, status: 1 });
hostApplicationSchema.index({ tournamentId: 1, status: 1 });
hostApplicationSchema.index({ createdAt: -1 });

// Create and export HostApplication model
const HostApplication = mongoose.model('HostApplication', hostApplicationSchema);

module.exports = HostApplication;

