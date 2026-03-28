/**
 * Wallet Model Validations
 * Contains all validation rules and messages for Wallet model
 */

module.exports = {
  userId: {
    required: [true, 'User ID is required']
  },
  balanceINR: {
    required: [true, 'Balance is required'],
    default: 0,
    min: [0, 'Balance cannot be negative']
  }
};
