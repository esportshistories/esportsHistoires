/**
 * OTP Rate Limit Model (MongoDB)
 * Tracks OTP request rates per email and IP to prevent abuse
 */

const mongoose = require('mongoose');
const validations = require('../validations/otpRateLimit.validations');

/**
 * OTP Rate Limit Schema
 * Tracks OTP generation requests with timestamps
 */
const otpRateLimitSchema = new mongoose.Schema({
  // Identifier (email or IP address)
  identifier: {
    type: String,
    required: validations.identifier.required,
    index: true
  },
  // Type: 'email' or 'ip'
  type: {
    type: String,
    enum: validations.type.enum,
    required: validations.type.required,
    index: true
  },
  // Array of request timestamps
  requests: [{
    timestamp: {
      type: Date,
      default: validations.requests.timestamp.default
    }
  }],
  // Last OTP generation timestamp (for cooldown)
  lastOTPGenerated: {
    type: Date,
    default: validations.lastOTPGenerated.default
  },
  // Failed verification attempts for current OTP
  failedAttempts: {
    type: Number,
    default: validations.failedAttempts.default
  },
  // Last failed attempt timestamp
  lastFailedAttempt: {
    type: Date,
    default: validations.lastFailedAttempt.default
  },
  // Created timestamp
  createdAt: {
    type: Date,
    default: validations.createdAt.default,
    expires: 3600 // Auto-delete after 1 hour (3600 seconds)
  }
}, {
  timestamps: true,
  collection: 'otp_rate_limits'
});

// Compound index for efficient queries
otpRateLimitSchema.index({ identifier: 1, type: 1 });

// Method to clean old requests (older than 1 hour)
otpRateLimitSchema.methods.cleanOldRequests = function() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  this.requests = this.requests.filter(req => req.timestamp > oneHourAgo);
};

// Method to get request count in last hour
otpRateLimitSchema.methods.getRequestCount = function() {
  this.cleanOldRequests();
  return this.requests.length;
};

// Method to add new request
otpRateLimitSchema.methods.addRequest = function() {
  this.requests.push({ timestamp: new Date() });
  this.lastOTPGenerated = new Date();
  this.cleanOldRequests();
};

// Method to increment failed attempts
otpRateLimitSchema.methods.incrementFailedAttempts = function() {
  this.failedAttempts += 1;
  this.lastFailedAttempt = new Date();
};

// Method to reset failed attempts
otpRateLimitSchema.methods.resetFailedAttempts = function() {
  this.failedAttempts = 0;
  this.lastFailedAttempt = null;
};

// Create and export OTPRateLimit model
const OTPRateLimit = mongoose.model('OTPRateLimit', otpRateLimitSchema);

module.exports = OTPRateLimit;

