/**
 * Wallet History Model (MongoDB)
 * Stores transaction history for user wallets
 */

const mongoose = require('mongoose');
const validations = require('../validations/walletHistory.validations');

/**
 * Wallet History Schema
 * Defines the structure for wallet history documents in MongoDB
 */
const walletHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: validations.userId.required
  },
  type: {
    type: String,
    required: validations.type.required,
    enum: validations.type.enum
  },
  amountINR: {
    type: Number,
    required: validations.amountINR.required,
    min: validations.amountINR.min
  },
  description: {
    type: String,
    required: validations.description.required,
    trim: true
  },
  // Optional: Reference to tournament for join/reward transactions
  tournamentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tournament',
    default: null
  },
  // Reward metadata: position (1st, 2nd, 3rd) and participant count for display in history
  position: { type: Number, min: 1, default: null },
  tournamentParticipantCount: { type: Number, min: 0, default: null },
  // Transaction status (success/fail) - mainly for topup transactions
  status: {
    type: String,
    enum: validations.status.enum,
    default: validations.status.default
  },
  // Source of topup: 'user' (self topup) or 'admin' (manual admin addition)
  addedBy: {
    type: String,
    enum: validations.addedBy.enum,
    default: validations.addedBy.default
  },
  // Payment details (custom payment system)
  paymentId: {
    type: String,
    trim: true,
    default: null
  },
  qrCodeId: {
    type: String,
    trim: true,
    default: null
    // Unique index is defined below with sparse: true
  },
  qrCodeGeneratedAt: {
    type: Date,
    default: null
  },
  receiptCode: {
    type: String,
    trim: true,
    default: null
  },
  // Payment method details
  paymentMethod: {
    type: String,
    enum: validations.paymentMethod.enum,
    default: validations.paymentMethod.default
  },
  // QR code expiration
  qrCodeExpiresAt: {
    type: Date,
    default: null
  },
  // Payment verification status
  paymentVerified: {
    type: Boolean,
    default: false
  },
  verifiedBy: {
    type: String,
    enum: validations.verifiedBy.enum,
    default: validations.verifiedBy.default
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  // UPI ID - user's UPI ID at the time of withdrawal (for admin to send payment)
  upiId: {
    type: String,
    trim: true,
    default: null
  },
  // Payer UPI (optional) — user says this is the UPI they paid from; helps admin match manual UPI deposits
  payerUpiId: {
    type: String,
    trim: true,
    default: null
  },
  // UTR (Unique Transaction Reference) - provided by user after payment
  utr: {
    type: String,
    trim: true,
    default: null,
    uppercase: true // Store in uppercase for consistency
  },
  // Bank transaction reference (if admin adds from bank statement)
  bankReference: {
    type: String,
    trim: true,
    default: null
  },
  // Verification attempts count
  verificationAttempts: {
    type: Number,
    default: validations.verificationAttempts.default,
    min: validations.verificationAttempts.min
  },
  // Flag for suspicious transactions requiring manual review
  flaggedForReview: {
    type: Boolean,
    default: validations.flaggedForReview.default,
    index: true
  },
  // Reference to matched bank statement transaction
  bankStatementMatchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankStatementTransaction',
    default: null
  },
  // UTR cron check count: incremented each time the 5‑min cron attempts to verify this UTR.
  // After UTR_CRON_CHECK_LIMIT (5) checks, the txn is excluded from cron; admin verifies manually.
  utrCronCheckCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  collection: 'wallet_history'
});

// Indexes for better query performance
walletHistorySchema.index({ userId: 1, createdAt: -1 });
walletHistorySchema.index({ type: 1, createdAt: -1 });
walletHistorySchema.index({ tournamentId: 1 });
walletHistorySchema.index({ paymentId: 1 });
// qrCodeId index: created at startup in config/mongodb.js (sparse, non-unique). QR uniqueness = app-level (payment.service checkQRCodeUniqueness).
walletHistorySchema.index({ receiptCode: 1 });
walletHistorySchema.index({ qrCodeExpiresAt: 1 });
walletHistorySchema.index({ utr: 1 }); // Index for UTR search
walletHistorySchema.index({ utr: 1, amountINR: 1 }); // Compound index for UTR + amount matching
walletHistorySchema.index({ userId: 1, qrCodeExpiresAt: 1 }); // Compound index for active QR lookup

// Create and export WalletHistory model
const WalletHistory = mongoose.model('WalletHistory', walletHistorySchema);

module.exports = WalletHistory;
