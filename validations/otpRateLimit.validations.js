/**
 * OTP Rate Limit Model Validations
 * Contains all validation rules and messages for OTPRateLimit model
 */

module.exports = {
  identifier: {
    required: true
  },
  type: {
    enum: ['email', 'ip'],
    required: true
  },
  requests: {
    timestamp: {
      default: Date.now
    }
  },
  lastOTPGenerated: {
    default: null
  },
  failedAttempts: {
    default: 0
  },
  lastFailedAttempt: {
    default: null
  },
  createdAt: {
    default: Date.now
  }
};
