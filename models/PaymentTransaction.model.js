/**
 * Payment Transaction Model (MongoDB)
 * Stores payment transaction records
 * 
 * NOTE: This model is currently UNUSED in the codebase.
 * All payment transactions are stored in WalletHistory model instead.
 * This model appears to be redundant/legacy code.
 * Consider removing this model if not needed for future use.
 */

const mongoose = require('mongoose');
const validations = require('../validations/paymentTransaction.validations');

/**
 * Payment Transaction Schema
 * Defines the structure for payment transaction documents in MongoDB
 */
const paymentTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: validations.userId.required,
    index: true
  },
  transactionId: {
    type: String,
    required: validations.transactionId.required,
    unique: true,
    index: true,
    trim: true
  },
  amount: {
    type: Number,
    required: validations.amount.required,
    min: validations.amount.min
  },
  transactionType: {
    type: String,
    required: validations.transactionType.required,
    enum: validations.transactionType.enum,
    index: true
  },
  status: {
    type: String,
    required: validations.status.required,
    enum: validations.status.enum,
    default: validations.status.default
  },
  upiId: {
    type: String,
    trim: true,
    default: null
  },
  paymentMethod: {
    type: String,
    trim: true,
    default: null
  }
}, {
  timestamps: true,
  collection: 'payment_transactions'
});

// Indexes for better query performance
paymentTransactionSchema.index({ userId: 1, createdAt: -1 });
paymentTransactionSchema.index({ transactionId: 1 });
paymentTransactionSchema.index({ status: 1 });
paymentTransactionSchema.index({ transactionType: 1 });

const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);

module.exports = PaymentTransaction;
