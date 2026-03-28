/**
 * User Model (MongoDB)
 * Stores user profile information, room IDs, and other user data
 * Payment-related data is stored in MongoDB (UserPaymentInfo model)
 */

const mongoose = require('mongoose');
const validations = require('../validations/user.validations');

const savedAddressSubSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 60, default: null },
    addressLine1: { type: String, trim: true, default: null },
    addressLine2: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    pincode: { type: String, trim: true, default: null },
    contactNumber: { type: String, trim: true, default: null },
    countryCode: { type: String, trim: true, default: '+91' },
    isDefault: { type: Boolean, default: false },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  { _id: true, timestamps: true }
);

const deviceHistorySubSchema = new mongoose.Schema(
  {
    sessionId: { type: String, trim: true, index: true },
    deviceInfo: { type: String, trim: true, default: 'Unknown device' },
    ip: { type: String, trim: true, default: null },
    loggedInAt: { type: Date, default: Date.now },
    loggedOutAt: { type: Date, default: null },
    logoutReason: { type: String, trim: true, default: null } // e.g. user_logout | logout_other_device | new_login
  },
  { _id: true, timestamps: false }
);

/**
 * User Schema
 * Defines the structure for user documents in MongoDB
 */
const userSchema = new mongoose.Schema({
  // Basic Information (from registration)
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
  
  // Authentication
  password: {
    type: String,
    required: validations.password.required, // Password is set during verify-otp, not during registration
    minlength: validations.password.minlength
  },
  // Google OAuth
  googleId: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values (only one non-null value must be unique)
    trim: true
    // Index is automatically created by unique: true
  },
  authProvider: {
    type: String,
    enum: validations.authProvider.enum,
    default: validations.authProvider.default
  },
  
  // OTP Verification
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  otp: {
    code: String,
    expiresAt: Date
  },
  // Track password reset OTP verification attempts
  passwordResetAttempts: {
    type: Number,
    default: 0
  },
  // Cooldown until timestamp (after max failed password reset attempts)
  passwordResetCooldownUntil: {
    type: Date,
    default: null
  },
  
  // Refresh Tokens (array to support multiple devices)
  refreshTokens: [{
    sessionId: String, // Stable per device session (does not change on refresh rotation)
    token: String,
    tokenId: String, // Unique identifier for token revocation
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    deviceInfo: String, // Optional: device/browser info
    ip: { type: String, trim: true, default: null }
  }],

  // Device login history (limited, safe to expose without tokens)
  deviceHistory: {
    type: [deviceHistorySubSchema],
    default: []
  },

  // Two-Factor Authentication (TOTP)
  // Secrets are stored server-side; never expose them to clients.
  twoFactor: {
    enabled: { type: Boolean, default: false },
    secret: { type: String, default: null }, // base32
    tempSecret: { type: String, default: null } // base32 (during setup)
  },
  
  // Profile Information (can be updated)
  ign: {
    type: String,
    trim: true,
    maxlength: validations.ign.maxlength
  },
  profileImage: {
    type: String,
    trim: true,
    default: null
  },
  phoneNumber: {
    type: String,
    trim: true,
    match: validations.phoneNumber.match
  },
  gender: {
    type: String,
    enum: validations.gender.enum,
    lowercase: true
  },
  dateOfBirth: {
    type: Date
  },
  age: {
    type: Number,
    min: validations.age.min,
    max: validations.age.max
  },
  gamePreference: {
    platform: {
      type: String,
      enum: ['mobile', 'pc'],
      lowercase: true,
      default: null
    },
    game: {
      type: String,
      trim: true,
      default: null
    },
    followedGames: [{
      platform: {
        type: String,
        enum: ['mobile', 'pc'],
        lowercase: true
      },
      game: {
        type: String,
        trim: true
      },
      uid: {
        type: String,
        trim: true,
        default: null
      },
      selected: {
        type: Boolean,
        default: false
      }
    }],
    selectedEsportsOrganizations: [{
      type: String,
      trim: true
    }],
    selectedEsportsPersonalities: [{
      name: {
        type: String,
        trim: true
      },
      knownAs: {
        type: String,
        trim: true,
        default: null
      },
      role: {
        type: String,
        trim: true,
        default: null
      }
    }],
    updatedAt: {
      type: Date,
      default: null
    }
  },
  address: {
    addressLine1: {
      type: String,
      trim: true,
      default: null
    },
    addressLine2: {
      type: String,
      trim: true,
      default: null
    },
    city: {
      type: String,
      trim: true,
      default: null
    },
    state: {
      type: String,
      trim: true,
      default: null
    },
    pincode: {
      type: String,
      trim: true,
      default: null
    },
    contactNumber: {
      type: String,
      trim: true,
      default: null
    },
    countryCode: {
      type: String,
      trim: true,
      default: '+91'
    }
  },
  savedAddresses: {
    type: [savedAddressSubSchema],
    default: []
  },

  // Room Management
  roomIds: [{
    type: String,
    trim: true
  }],
  
  // Role and Status
  role: {
    type: String,
    enum: validations.role.enum,
    default: validations.role.default,
    index: true
  },
  isBlocked: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Notification Tokens
  fcmToken: {
    type: String,
    trim: true
  }
}, {
  timestamps: true, // Automatically manage createdAt and updatedAt
  collection: 'users' // Explicit collection name
});

// Indexes for better query performance
// Note: email index is automatically created by unique: true, so we don't need to define it again
// Note: googleId index is automatically created by unique: true, so we don't need to define it again
// Note: role and isBlocked indexes are defined in the schema fields above
userSchema.index({ ign: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'refreshTokens.sessionId': 1 });
userSchema.index({ 'deviceHistory.sessionId': 1, 'deviceHistory.loggedInAt': -1 });

// Note: updatedAt is automatically managed by timestamps: true option, no need for pre-save hook

// Method to remove sensitive data before sending to client
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.otp;
  delete userObject.refreshTokens; // Don't expose refresh tokens
  delete userObject.twoFactor; // Never expose 2FA secrets/status here; use dedicated endpoints
  return userObject;
};

// Create and export User model
const User = mongoose.model('User', userSchema);

module.exports = User;

