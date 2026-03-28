/**
 * User Payment Info Model Validations
 * Contains all validation rules and messages for UserPaymentInfo model
 */

module.exports = {
  userId: {
    required: [true, 'User ID is required']
  },
  paymentMethod: {
    enum: ['UPI', 'bank_transfer', 'other'],
    default: 'UPI'
  },
  isVerified: {
    default: false
  }
};
