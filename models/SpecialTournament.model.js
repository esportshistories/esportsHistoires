/**
 * Special Tournament Model (MongoDB)
 * Admin-created sponsored multi-round tournaments.
 * - Entry is FREE (no GC deducted from user)
 * - Fixed prize pool set by admin
 * - Multi-round bracket: each round has slots, each slot has multiple BR matches
 * - Teams qualify round-by-round based on cumulative points per slot
 * - LW mode is NOT supported here (only BR and CS)
 */

const mongoose = require('mongoose');
const validations = require('../validations/specialTournament.validations');

/**
 * One team entry in a slot (participant with optional team info)
 */
const slotTeamSchema = new mongoose.Schema({
  leaderUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  teamName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  players: [{
    name: { type: String, trim: true, maxlength: 50 }
  }],
  /** Admin-seeded team for a slot (wildcard); not from previous-round qualification */
  isInvite: { type: Boolean, default: false }
}, { _id: true, timestamps: true });

/**
 * One team's result in one BR match within a slot
 */
const slotMatchTeamSchema = new mongoose.Schema({
  teamName: { type: String, required: true, trim: true, maxlength: 50 },
  booyah: { type: Number, default: 0, min: 0 },
  kills: { type: Number, required: true, default: 0, min: 0 },
  position: { type: Number, required: true, min: 1 },
  totalPoint: { type: Number, required: true, default: 0, min: 0 }
}, { _id: false });

/**
 * One match result inside a slot (matchIndex = 0-based, e.g. 0 for match 1)
 */
const slotMatchResultSchema = new mongoose.Schema({
  matchIndex: { type: Number, required: true, min: 0 },
  teams: [slotMatchTeamSchema]
}, { _id: false });

/**
 * A slot = one group of teams that play together inside a round
 */
const slotSchema = new mongoose.Schema({
  slotIndex: { type: Number, required: true, min: 0 },
  /** Teams in this slot (populated when round is started by admin) */
  teams: [slotTeamSchema],
  /** Partial match results submitted by host (one per matchIndex) */
  matchResults: [slotMatchResultSchema],
  /** Auto-computed after host submits final result: top qualifyPerSlot teams */
  qualifiedTeams: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: validations.slotStatus.enum,
    default: validations.slotStatus.default
  },
  room: {
    roomId: { type: String, default: null, trim: true },
    password: { type: String, default: null, trim: true }
  },
  /** Host assigned to this slot */
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  /** Max admin invite teams allowed in this slot (set when round starts) */
  maxInvites: { type: Number, default: 0, min: 0 }
}, { _id: true });

/**
 * A round inside the special tournament
 */
const roundSchema = new mongoose.Schema({
  roundNumber: {
    type: Number,
    required: validations.roundNumber.required,
    min: validations.roundNumber.min
  },
  roundName: {
    type: String,
    trim: true,
    default: null
    // e.g. "Round 1", "Semi Final", "Final"
  },
  /** How many teams are placed in each slot */
  teamsPerSlot: {
    type: Number,
    required: validations.teamsPerSlot.required,
    min: validations.teamsPerSlot.min
  },
  /** How many BR matches are played inside each slot */
  matchesPerSlot: {
    type: Number,
    required: validations.matchesPerSlot.required,
    min: validations.matchesPerSlot.min
  },
  /** Top N teams that qualify from each slot to the next round */
  qualifyPerSlot: {
    type: Number,
    required: validations.qualifyPerSlot.required,
    min: validations.qualifyPerSlot.min
  },
  /**
   * Optional: exact bucket sizes for this round (sum must equal team count when round starts).
   * Example semis: [12, 12, 6] for 30 qualified teams. If empty, teams split evenly by teamsPerSlot.
   */
  slotSizes: [{ type: Number, min: 2 }],
  /**
   * When slotSizes is set: max invite teams per slot index (same length as slotSizes).
   * When using even split: use inviteSlotsPerSlot instead.
   */
  inviteSlotCaps: [{ type: Number, min: 0 }],
  /** When not using slotSizes: same invite cap for every slot created in this round */
  inviteSlotsPerSlot: { type: Number, default: 0, min: 0 },
  /** Status of this round */
  status: {
    type: String,
    enum: ['pending', 'running', 'completed'],
    default: 'pending'
  },
  /** Slots are populated when admin starts this round */
  slots: [slotSchema]
}, { _id: true });

/**
 * Prize distribution entry (admin-defined per position)
 */
const prizeDistributionSchema = new mongoose.Schema({
  position: { type: Number, required: true, min: 1 },
  /** Percentage of prizePool that goes to this position (0-100) */
  percent: { type: Number, required: true, min: 0, max: 100 }
}, { _id: false });

/**
 * Snapshot of reward per final rank (for UI + payout; preferred over recomputing from %)
 */
const rankRewardBreakdownSchema = new mongoose.Schema({
  position: { type: Number, required: true, min: 1 },
  amount: { type: Number, required: true, min: 0 }
}, { _id: false });

/**
 * Named sponsor row (logo / link)
 */
const sponsorEntrySchema = new mongoose.Schema({
  name: { type: String, default: '', trim: true, maxlength: 100 },
  logoUrl: { type: String, default: null, trim: true, maxlength: 500 },
  link: { type: String, default: null, trim: true, maxlength: 500 }
}, { _id: false });

/**
 * Winner entry (set when rewards are distributed)
 */
const winnerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  position: { type: Number, required: true, min: 1 },
  rewardINR: { type: Number, required: true, min: 0 },
  teamName: { type: String, default: null }
}, { _id: false });

/**
 * Main Special Tournament Schema
 */
const specialTournamentSchema = new mongoose.Schema({
  tournamentType: {
    type: String,
    default: 'sponsored',
    immutable: true
  },
  /**
   * Optional owning organization. When set, this special tournament
   * is created/funded by an organization instead of global admin pool.
   * Existing admin-created specials leave this null.
   */
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
  title: {
    type: String,
    required: validations.title.required,
    trim: true,
    maxlength: validations.title.maxlength
  },
  game: {
    type: String,
    required: validations.game.required,
    default: validations.game.default,
    trim: true
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
  region: {
    type: String,
    enum: validations.region.enum,
    default: validations.region.default
  },
  lobbyName: {
    type: String,
    default: validations.lobbyName.default,
    trim: true,
    maxlength: validations.lobbyName.maxlength
  },
  /** Fixed prize pool in INR (admin-sponsored, not collected from users) */
  prizePool: {
    type: Number,
    required: validations.prizePool.required,
    min: validations.prizePool.min
  },
  /** How prize is split among winners (admin-defined) */
  prizeDistribution: [prizeDistributionSchema],
  /** Per-rank reward amounts (same currency unit as prizePool); used for display and payout */
  rankRewardBreakdown: [rankRewardBreakdownSchema],
  /** Maximum total teams allowed to register */
  maxSlots: {
    type: Number,
    required: validations.maxSlots.required,
    min: validations.maxSlots.min
  },
  /** Overall tournament status */
  status: {
    type: String,
    enum: validations.status.enum,
    default: validations.status.default,
    index: true
  },
  /** Admin who created this tournament */
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  /** All registered participants (free join, no GC deducted) */
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  /** Team info for each registered participant */
  registeredTeams: [slotTeamSchema],
  /** Multi-round config (defined at creation time by admin) */
  rounds: [roundSchema],
  /** Filled when final round completed and rewards distributed */
  winners: [winnerSchema],
  /** Optional: admin/host-declared final ranking (position → teamName). If set, rewards use this instead of aggregated standings. */
  declaredFinalRanking: [{
    position: { type: Number, required: true, min: 1 },
    teamName: { type: String, required: true, trim: true, maxlength: 50 }
  }],
  /** Whether rewards have been distributed */
  rewardsDistributed: {
    type: Boolean,
    default: false
  },
  /** Tournament schedule info */
  scheduledDate: { type: Date, default: null },
  scheduledTime: { type: String, default: null, trim: true },
  scheduledEndDate: { type: Date, default: null },
  /** Registration window start (admin) */
  registrationStartDate: { type: Date, default: null },
  registrationDeadline: { type: Date, default: null },
  /** Optional description/rules */
  description: { type: String, default: null, trim: true },
  /** Admin-defined format label (e.g. "12 teams per lobby, top 2 qualify") — shown to users */
  formatLabel: { type: String, default: null, trim: true, maxlength: 200 },
  /** Bracket / flow type label (e.g. multi-round BR slots, single final) */
  tournamentFormat: { type: String, default: null, trim: true, maxlength: 120 },
  /** Tournament branding */
  logoUrl: { type: String, default: null, trim: true, maxlength: 500 },
  /** Optional live / VOD YouTube URL (separate from sponsor channel handle) */
  youtubeStreamUrl: { type: String, default: null, trim: true, maxlength: 500 },
  /** Sponsor rows with optional logo and link */
  sponsors: [sponsorEntrySchema],
  /** Sponsor handles for users to follow (Instagram, Discord, YouTube, Telegram, WhatsApp, etc.) */
  sponsorHandles: {
    instagram: { type: String, default: null, trim: true, maxlength: 200 },
    discord: { type: String, default: null, trim: true, maxlength: 200 },
    youtube: { type: String, default: null, trim: true, maxlength: 200 },
    telegram: { type: String, default: null, trim: true, maxlength: 200 },
    whatsapp: { type: String, default: null, trim: true, maxlength: 200 }
  }
}, {
  timestamps: true,
  collection: 'special_tournaments'
});

specialTournamentSchema.index({ status: 1, createdAt: -1 });
specialTournamentSchema.index({ mode: 1, subMode: 1 });
specialTournamentSchema.index({ createdBy: 1 });
specialTournamentSchema.index({ 'participants': 1 });

/** Check if user is already registered */
specialTournamentSchema.methods.isParticipant = function(userId) {
  return this.participants.some(id => id.toString() === userId.toString());
};

/** Check if registration is still open */
specialTournamentSchema.methods.hasAvailableSlots = function() {
  return this.participants.length < this.maxSlots;
};

const SpecialTournament = mongoose.model('SpecialTournament', specialTournamentSchema);

module.exports = SpecialTournament;
