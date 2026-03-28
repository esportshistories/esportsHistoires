/**
 * User Payment Info Model (MongoDB)
 * Stores user payment information (UPI IDs list, selected/default UPI, verification)
 */

const mongoose = require('mongoose');
const validations = require('../validations/userPaymentInfo.validations');

const UPI_PATTERN = /^[\w.-]+@[\w]+$/;

/**
 * User Payment Info Schema
 * Defines the structure for user payment info documents in MongoDB
 */
const userPaymentInfoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: validations.userId.required,
    unique: true
  },
  /**
   * Legacy single UPI fields (kept for backward compatibility).
   * New code should use `upiIds` + `selectedUpiId`.
   */
  upiId: { type: String, trim: true, default: null },
  isVerified: { type: Boolean, default: validations.isVerified.default },

  /** New: multiple UPI IDs (max 10). */
  upiIds: {
    type: [
      new mongoose.Schema(
        {
          upiId: {
            type: String,
            trim: true,
            required: true,
            validate: {
              validator: (v) => typeof v === 'string' && UPI_PATTERN.test(v),
              message: 'Invalid UPI ID (format: name@bank)'
            }
          },
          isVerified: {
            type: Boolean,
            default: false
          }
        },
        { _id: true, timestamps: { createdAt: true, updatedAt: true } }
      )
    ],
    default: []
  },
  selectedUpiId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  paymentMethod: {
    type: String,
    enum: validations.paymentMethod.enum,
    default: validations.paymentMethod.default
  }
}, {
  timestamps: true,
  collection: 'user_payment_info'
});

// Indexes for better query performance
// Note: userId index is automatically created by unique: true, so we don't need to define it again
userPaymentInfoSchema.index({ isVerified: 1 });
userPaymentInfoSchema.index({ selectedUpiId: 1 });

const UserPaymentInfo = mongoose.model('UserPaymentInfo', userPaymentInfoSchema);

module.exports = UserPaymentInfo;
