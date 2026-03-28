/**
 * Wallet Model (MongoDB)
 * Stores user wallet balance information
 */

const mongoose = require('mongoose');
const validations = require('../validations/wallet.validations');

/**
 * Wallet Schema
 * Defines the structure for wallet documents in MongoDB
 */
const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: validations.userId.required,
    unique: true
    // Index is automatically created by unique: true
  },
  balanceINR: {
    type: Number,
    required: validations.balanceINR.required,
    default: validations.balanceINR.default,
    min: validations.balanceINR.min
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'wallets'
});

// Index for faster queries
// Note: userId index is automatically created by unique: true, so we don't need to define it again
walletSchema.index({ updatedAt: -1 });

// Note: updatedAt is automatically managed by timestamps: true option, no need for pre-save hook

// Create and export Wallet model
const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
