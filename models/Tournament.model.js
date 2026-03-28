/**
 * Tournament Model (MongoDB)
 * Stores tournament/lobby information
 */

const mongoose = require('mongoose');
const validations = require('../validations/tournament.validations');

/**
 * Tournament Team Schema (embedded in Tournament)
 * Stores team information for each joined lobby
 */
const tournamentTeamSchema = new mongoose.Schema({
  leaderUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: validations.tournamentTeam.leaderUserId.required
  },
  teamName: {
    type: String,
    required: validations.tournamentTeam.teamName.required,
    trim: true,
    maxlength: validations.tournamentTeam.teamName.maxlength
  },
  players: [{
    name: {
      type: String,
      trim: true,
      maxlength: validations.tournamentTeam.players.name.maxlength
    }
  }]
}, {
  _id: true,
  timestamps: true
});

/**
 * Tournament Result Schema (embedded in Tournament)
 */
const tournamentResultSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: validations.tournamentResult.userId.required
  },
  position: {
    type: Number,
    required: validations.tournamentResult.position.required,
    min: validations.tournamentResult.position.min
  },
  kills: {
    type: Number,
    required: validations.tournamentResult.kills.required,
    default: validations.tournamentResult.kills.default,
    min: validations.tournamentResult.kills.min
  },
  rewardGC: {
    type: Number,
    required: validations.tournamentResult.rewardGC.required,
    default: validations.tournamentResult.rewardGC.default,
    min: validations.tournamentResult.rewardGC.min
  },
  claimed: {
    type: Boolean,
    default: validations.tournamentResult.claimed.default
  }
}, {
  _id: false // Don't create separate _id for embedded documents
});

/**
 * Match result team entry (one team's result in one match) – BR partial results
 */
const matchResultTeamSchema = new mongoose.Schema({
  teamName: {
    type: String,
    required: validations.matchResultTeam.teamName.required,
    trim: true,
    maxlength: validations.matchResultTeam.teamName.maxlength
  },
  booyah: {
    type: Number,
    default: validations.matchResultTeam.booyah.default,
    min: validations.matchResultTeam.booyah.min
  },
  kills: {
    type: Number,
    required: validations.matchResultTeam.kills.required,
    default: validations.matchResultTeam.kills.default,
    min: validations.matchResultTeam.kills.min
  },
  position: {
    type: Number,
    required: validations.matchResultTeam.position.required,
    min: validations.matchResultTeam.position.min
  },
  totalPoint: {
    type: Number,
    required: validations.matchResultTeam.totalPoint.required,
    default: validations.matchResultTeam.totalPoint.default,
    min: validations.matchResultTeam.totalPoint.min
  },
  /** CS only: rounds won in this match (e.g. 7-6). For display. */
  roundScore: {
    type: Number,
    default: null,
    min: 0
  }
}, { _id: false });

/**
 * One match result (e.g. match 1 of 6) – array of team results
 */
const matchResultSchema = new mongoose.Schema({
  matchIndex: {
    type: Number,
    required: true,
    min: 0
  },
  teams: [matchResultTeamSchema]
}, { _id: false });

/**
 * Tournament Schema
 * Defines the structure for tournament documents in MongoDB
 */
const tournamentSchema = new mongoose.Schema({
  game: {
    type: String,
    required: validations.game.required,
    default: validations.game.default,
    trim: true
  },
  /**
   * Optional owning organization for org-specific lobbies.
   * When set, this tournament is managed by org_manager users for that org.
   * Existing platform tournaments keep this as null.
   */
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
  /**
   * User who created this lobby (admin, host, or org_manager).
   * This is additive metadata and does not affect existing flows.
   */
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  mode: {
    type: String,
    required: validations.mode.required,
    enum: validations.mode.enum,
    index: true
  },
  subMode: {
    type: String,
    required: validations.subMode.required,
    enum: validations.subMode.enum,
    index: true
  },
  entryFee: {
    type: Number,
    required: validations.entryFee.required,
    min: validations.entryFee.min
  },
  maxPlayers: {
    type: Number,
    required: validations.maxPlayers.required,
    min: validations.maxPlayers.min
  },
  date: {
    type: Date,
    required: validations.date.required
    // Index will be created in compound index below
  },
  startTime: {
    type: String,
    required: validations.startTime.required,
    trim: true
  },
  lockTime: {
    type: Date,
    required: validations.lockTime.required
    // Index will be created explicitly below
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  room: {
    roomId: {
      type: String,
      default: null,
      trim: true
    },
    password: {
      type: String,
      default: null,
      trim: true
    },
    roomNotificationSent: {
      type: Boolean,
      default: false
    },
    /** Host live stream / lobby link - participants can view when lobby is live */
    liveStreamUrl: {
      type: String,
      default: null,
      trim: true
    }
  },
  prizePool: {
    type: Number,
    required: validations.prizePool.required,
    default: validations.prizePool.default,
    min: validations.prizePool.min
  },
  platformFees: {
    // Current prize pool (updated when participants join)
    totalPrizePool: {
      type: Number,
      default: validations.platformFees.totalPrizePool.default,
      min: validations.platformFees.totalPrizePool.min
    },
    platformFee: {
      type: Number,
      default: validations.platformFees.platformFee.default,
      min: validations.platformFees.platformFee.min
    },
    hostFee: {
      type: Number,
      default: validations.platformFees.hostFee.default,
      min: validations.platformFees.hostFee.min
    },
    casterFee: {
      type: Number,
      default: validations.platformFees.casterFee.default,
      min: validations.platformFees.casterFee.min
    },
    totalFees: {
      type: Number,
      default: validations.platformFees.totalFees.default,
      min: validations.platformFees.totalFees.min
    },
    winnerPrizePool: {
      type: Number,
      default: validations.platformFees.winnerPrizePool.default,
      min: validations.platformFees.winnerPrizePool.min
    },
    // Potential prize pool (calculated at creation time, stored for get APIs)
    potentialTotalPrizePool: {
      type: Number,
      default: validations.platformFees.potentialTotalPrizePool.default,
      min: validations.platformFees.potentialTotalPrizePool.min
    },
    potentialPlatformFee: {
      type: Number,
      default: validations.platformFees.potentialPlatformFee.default,
      min: validations.platformFees.potentialPlatformFee.min
    },
    potentialHostFee: {
      type: Number,
      default: validations.platformFees.potentialHostFee.default,
      min: validations.platformFees.potentialHostFee.min
    },
    potentialCasterFee: {
      type: Number,
      default: validations.platformFees.potentialCasterFee.default,
      min: validations.platformFees.potentialCasterFee.min
    },
    potentialTotalFees: {
      type: Number,
      default: validations.platformFees.potentialTotalFees.default,
      min: validations.platformFees.potentialTotalFees.min
    },
    potentialWinnerPrizePool: {
      type: Number,
      default: validations.platformFees.potentialWinnerPrizePool.default,
      min: validations.platformFees.potentialWinnerPrizePool.min
    }
  },
  status: {
    type: String,
    required: validations.status.required,
    enum: validations.status.enum,
    default: validations.status.default
  },
  region: {
    type: String,
    enum: validations.region.enum,
    default: validations.region.default,
    trim: true
  },
  lobbyName: {
    type: String,
    default: validations.lobbyName.default,
    trim: true,
    maxlength: validations.lobbyName.maxlength
  },
  teams: [tournamentTeamSchema],
  results: [tournamentResultSchema],
  /** Partial match results (BR: e.g. 6 matches). Each item = one match with teams array. */
  matchResults: [matchResultSchema],
  /** Total number of matches (e.g. 6 for BR). Used for final submit. */
  totalMatches: {
    type: Number,
    default: 6,
    min: 1
  }
}, {
  timestamps: true,
  collection: 'tournaments'
});

// Indexes for better query performance
tournamentSchema.index({ date: 1, startTime: 1 });
tournamentSchema.index({ status: 1, date: 1 });
tournamentSchema.index({ mode: 1, subMode: 1 });
tournamentSchema.index({ 'participants': 1 });
tournamentSchema.index({ hostId: 1 });
tournamentSchema.index({ lockTime: 1 });
tournamentSchema.index({ 'teams.leaderUserId': 1 });

// Method to check if tournament is locked
tournamentSchema.methods.isLocked = function() {
  return new Date() >= this.lockTime || this.status === 'locked' || this.status === 'running' || this.status === 'result_pending' || this.status === 'completed' || this.status === 'result_published' || this.status === 'cancelled';
};

// Method to check if user is participant
tournamentSchema.methods.isParticipant = function(userId) {
  return this.participants.some(id => id.toString() === userId.toString());
};

// Method to check if slots are available
tournamentSchema.methods.hasAvailableSlots = function() {
  return this.participants.length < this.maxPlayers;
};

/**
 * Pre-save hook to automatically update prize pool when participants change
 * This eliminates the need to calculate prize pool on every API call
 * 
 * IMPORTANT: This runs BEFORE saving, so calculations use the NEW participant count
 */
tournamentSchema.pre('save', async function() {
  // Only recalculate if participants array was modified
  if (this.isModified('participants')) {
    // Calculate teams based on subMode
    let playersPerTeam = 1;
    if (this.subMode === 'duo' || this.subMode === '2v2') {
      playersPerTeam = 2;
    } else if (this.subMode === 'squad' || this.subMode === '4v4') {
      playersPerTeam = 4;
    }
    
    // Each participant = 1 team
    const joinedTeams = this.participants.length;
    const totalPrizePool = joinedTeams * this.entryFee;

    let platformFee, hostFee, casterFee, totalFees, winnerPrizePool;
    if (this.mode === 'CS') {
      // Clash Squad: 85% winner pool, 15% fees. Host: 5 GC (25/50/75 entry) or 10 GC (100+); caster 5%; rest → platform
      const CS_WINNER_PERCENT = 0.85;
      const CS_CASTER_PERCENT = 0.05;
      const CS_SMALL_ENTRY = [25, 50, 75];
      winnerPrizePool = Math.floor(totalPrizePool * CS_WINNER_PERCENT);
      totalFees = totalPrizePool - winnerPrizePool;
      casterFee = Math.floor(totalPrizePool * CS_CASTER_PERCENT);
      const ef = Number(this.entryFee);
      hostFee = (ef != null && !isNaN(ef) && CS_SMALL_ENTRY.includes(ef)) ? 5 : 10;
      platformFee = Math.max(0, totalFees - casterFee - hostFee);
    } else {
      const HOST_FEE_FIXED_GC = 40;
      const PLATFORM_FEE_PERCENTAGE = 0.05;
      const CASTER_FEE_PERCENTAGE = 0.05;
      platformFee = Math.floor(totalPrizePool * PLATFORM_FEE_PERCENTAGE);
      hostFee = HOST_FEE_FIXED_GC;
      casterFee = Math.floor(totalPrizePool * CASTER_FEE_PERCENTAGE);
      totalFees = platformFee + hostFee + casterFee;
      winnerPrizePool = totalPrizePool - totalFees;
    }
    
    // Update current prize pool fields (preserve potential prize pool)
    this.prizePool = totalPrizePool;
    this.platformFees.totalPrizePool = totalPrizePool;
    this.platformFees.platformFee = platformFee;
    this.platformFees.hostFee = hostFee;
    this.platformFees.casterFee = casterFee;
    this.platformFees.totalFees = totalFees;
    this.platformFees.winnerPrizePool = winnerPrizePool;
  }
});

// Create and export Tournament model
const Tournament = mongoose.model('Tournament', tournamentSchema);

module.exports = Tournament;
