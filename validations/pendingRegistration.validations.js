/**
 * Pending Registration Model Validations
 * Contains all validation rules and messages for PendingRegistration model
 */

module.exports = {
  email: {
    required: [true, 'Email is required'],
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  name: {
    required: [true, 'Name is required'],
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  otp: {
    code: {
      required: true
    },
    expiresAt: {
      required: true
    }
  },
  passwordHash: {
    required: [true, 'Password hash is required']
  },
  verificationAttempts: {
    default: 0
  },
  resendCount: {
    default: 0
  }
};
