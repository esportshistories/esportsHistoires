/**
 * Organization Model (MongoDB)
 * Represents an esports organisation that can run its own tournaments.
 * NOTE: This is additive only – existing user/host/admin flows are unchanged.
 */

const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  slug: {
    type: String,
    trim: true,
    unique: true,
    sparse: true
  },
  ownerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  managerIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'organizations'
});

organizationSchema.index({ name: 1 }, { unique: true });

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;

