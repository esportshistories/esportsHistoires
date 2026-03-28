/**
 * Special Tournament Validations
 * Validation rules for sponsored/special multi-round tournaments
 */

module.exports = {
  title: {
    required: [true, 'Title is required'],
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  game: {
    required: [true, 'Game is required'],
    default: 'FreeFire'
  },
  mode: {
    required: [true, 'Mode is required'],
    enum: ['BR', 'CS']
  },
  subMode: {
    required: [true, 'SubMode is required'],
    enum: ['solo', 'duo', 'squad', '1v1', '2v2', '4v4']
  },
  region: {
    enum: ['Asia', 'Global'],
    default: 'Asia'
  },
  lobbyName: {
    maxlength: [100, 'Lobby name cannot exceed 100 characters'],
    default: null
  },
  prizePool: {
    required: [true, 'Prize pool is required'],
    min: [1, 'Prize pool must be at least 1 GC']
  },
  maxSlots: {
    required: [true, 'Max slots (total teams) is required'],
    min: [2, 'At least 2 teams required']
  },
  status: {
    enum: ['draft', 'registration_open', 'running', 'completed', 'cancelled'],
    default: 'draft'
  },
  roundNumber: {
    required: [true, 'Round number is required'],
    min: [1, 'Round number must be at least 1']
  },
  teamsPerSlot: {
    required: [true, 'Teams per slot is required'],
    min: [2, 'At least 2 teams per slot required']
  },
  matchesPerSlot: {
    required: [true, 'Matches per slot is required'],
    min: [1, 'At least 1 match per slot required']
  },
  qualifyPerSlot: {
    required: [true, 'Qualify per slot is required'],
    min: [1, 'At least 1 team must qualify per slot']
  },
  slotStatus: {
    enum: ['pending', 'running', 'completed'],
    default: 'pending'
  },
  prizeDistribution: {
    position: { min: [1, 'Position must be at least 1'] },
    percent: { min: [0, 'Percent cannot be negative'], max: [100, 'Percent cannot exceed 100'] }
  },
  formatLabel: { maxlength: [200, 'Format label cannot exceed 200 characters'] },
  sponsorHandle: { maxlength: [200, 'Sponsor handle cannot exceed 200 characters'] },
  /** Team size: 4 compulsory, max 5 (leader + 3 or 4 in players array) */
  teamPlayersMin: 3,
  teamPlayersMax: 4
};
