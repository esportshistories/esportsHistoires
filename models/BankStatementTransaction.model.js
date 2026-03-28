/**
 * Bank Statement Transaction Model (MongoDB)
 * Stores parsed transactions from bank statement emails
 */

const mongoose = require('mongoose');
const validations = require('../validations/bankStatementTransaction.validations');

/**
 * Bank Statement Transaction Schema
 * Defines the structure for bank statement transaction documents in MongoDB
 */
const bankStatementTransactionSchema = new mongoose.Schema({
  utr: {
    type: String,
    required: validations.utr.required,
    trim: true,
    uppercase: true,
    index: true
  },
  amount: {
    type: Number,
    required: validations.amount.required,
    min: validations.amount.min
  },
  date: {
    type: Date,
    required: validations.date.required,
    index: true
  },
  description: {
    type: String,
    trim: true,
    default: validations.description.default
  },
  bankName: {
    type: String,
    trim: true,
    default: validations.bankName.default
  },
  processed: {
    type: Boolean,
    default: validations.processed.default,
    index: true
  },
  matchedTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WalletHistory',
    default: null
  },
  emailSource: {
    type: String,
    trim: true
    // Index is defined below
  },
  processedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'bank_statement_transactions'
});

// Compound indexes for efficient querying
bankStatementTransactionSchema.index({ utr: 1, amount: 1 }); // For matching transactions
bankStatementTransactionSchema.index({ processed: 1, date: -1 }); // For finding unprocessed transactions
bankStatementTransactionSchema.index({ emailSource: 1 }); // For duplicate email detection

// Prevent duplicate UTR + amount combinations from same email
bankStatementTransactionSchema.index({ utr: 1, amount: 1, emailSource: 1 }, { unique: true });

const BankStatementTransaction = mongoose.model('BankStatementTransaction', bankStatementTransactionSchema);

module.exports = BankStatementTransaction;
