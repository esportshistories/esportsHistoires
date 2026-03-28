/**
 * Payment Transaction Model Validations
 * Contains all validation rules and messages for PaymentTransaction model
 */

module.exports = {
  userId: {
    required: [true, 'User ID is required']
  },
  transactionId: {
    required: [true, 'Transaction ID is required']
  },
  amount: {
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  transactionType: {
    required: [true, 'Transaction type is required'],
    enum: ['deposit', 'withdrawal', 'refund']
  },
  status: {
    required: [true, 'Status is required'],
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  }
};
