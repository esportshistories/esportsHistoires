/**
 * Pending Registration Model (MongoDB)
 * Temporarily stores registration data until OTP is verified
 * Data is deleted after successful verification or expiration
 */

const mongoose = require('mongoose');
const validations = require('../validations/pendingRegistration.validations');

/**
 * Pending Registration Schema
 * Stores email, name, and OTP temporarily
 */
const pendingRegistrationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: validations.email.required,
    unique: true,
    lowercase: true,
    trim: true,
    match: validations.email.match
  },
  name: {
    type: String,
    required: validations.name.required,
    trim: true,
    minlength: validations.name.minlength,
    maxlength: validations.name.maxlength
  },
  // Store hashed password collected at register step.
  // Plain-text password is never stored.
  passwordHash: {
    type: String,
    required: validations.passwordHash.required
  },
  otp: {
    code: {
      type: String,
      required: validations.otp.code.required
    },
    expiresAt: {
      type: Date,
      required: validations.otp.expiresAt.required
    }
  },
  // Track verification attempts
  verificationAttempts: {
    type: Number,
    default: validations.verificationAttempts.default
  },
  // Cooldown until timestamp (after max failed attempts)
  cooldownUntil: {
    type: Date,
    default: null
  },
  // Track resend count
  resendCount: {
    type: Number,
    default: validations.resendCount.default
  },
  // Last resend timestamp (for cooldown)
  lastResendAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // Auto-delete after 10 minutes (600 seconds)
  }
}, {
  timestamps: true,
  collection: 'pending_registrations'
});

// Index for OTP expiration (email index is automatically created by unique: true)
// Note: expireAfterSeconds: 0 means MongoDB will check expiration but won't auto-delete
// The createdAt field with expires: 600 handles auto-deletion
pendingRegistrationSchema.index({ 'otp.expiresAt': 1 });

// Create and export PendingRegistration model
const PendingRegistration = mongoose.model('PendingRegistration', pendingRegistrationSchema);

module.exports = PendingRegistration;

