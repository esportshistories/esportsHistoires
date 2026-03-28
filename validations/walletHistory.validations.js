/**
 * Wallet History Model Validations
 * Contains all validation rules and messages for WalletHistory model
 */

module.exports = {
  userId: {
    required: [true, 'User ID is required']
  },
  type: {
    required: [true, 'Transaction type is required'],
    enum: ['topup', 'join', 'reward', 'refund', 'withdrawal']
  },
  amountINR: {
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  description: {
    required: [true, 'Description is required']
  },
  status: {
    enum: ['success', 'fail', 'pending', 'cancelled'],
    default: 'success'
  },
  addedBy: {
    enum: ['user', 'admin', 'system'],
    default: 'user'
  },
  paymentMethod: {
    enum: ['upi_qr', 'upi_link', 'manual', 'razorpay', 'other'],
    default: null
  },
  verifiedBy: {
    enum: ['user', 'admin', 'system', null],
    default: null
  },
  verificationAttempts: {
    default: 0,
    min: 0
  },
  flaggedForReview: {
    default: false
  }
};
