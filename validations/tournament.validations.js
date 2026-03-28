/**
 * Tournament Model Validations
 * Contains all validation rules and messages for Tournament model
 */

module.exports = {
  tournamentTeam: {
    leaderUserId: {
      required: [true, 'Leader user ID is required']
    },
    teamName: {
      required: [true, 'Team name is required'],
      maxlength: [50, 'Team name cannot exceed 50 characters']
    },
    players: {
      name: {
        maxlength: [50, 'Player name cannot exceed 50 characters']
      }
    }
  },
  tournamentResult: {
    userId: {
      required: [true, 'User ID is required']
    },
    position: {
      required: [true, 'Position is required'],
      min: [1, 'Position must be at least 1']
    },
    kills: {
      required: [true, 'Kills is required'],
      default: 0,
      min: [0, 'Kills cannot be negative']
    },
    rewardGC: {
      required: [true, 'Reward amount is required'],
      default: 0,
      min: [0, 'Reward cannot be negative']
    },
    claimed: {
      default: false
    }
  },
  matchResultTeam: {
    teamName: {
      required: [true, 'Team name is required'],
      maxlength: [50, 'Team name cannot exceed 50 characters']
    },
    booyah: {
      default: 0,
      min: [0, 'Booyah cannot be negative']
    },
    kills: {
      required: [true, 'Kills is required'],
      default: 0,
      min: [0, 'Kills cannot be negative']
    },
    position: {
      required: [true, 'Position is required'],
      min: [1, 'Position must be at least 1']
    },
    totalPoint: {
      required: [true, 'Total point is required'],
      default: 0,
      min: [0, 'Total point cannot be negative']
    },
    roundScore: {
      default: null,
      min: [0, 'Round score cannot be negative']
    }
  },
  game: {
    required: [true, 'Game is required'],
    default: 'Free Fire'
  },
  mode: {
    required: [true, 'Mode is required'],
    enum: ['CS', 'BR', 'LW']
  },
  subMode: {
    required: [true, 'Sub-mode is required'],
    enum: ['1v1', '2v2', '4v4', '7round', '13round', 'clash', 'solo', 'duo', 'squad']
  },
  entryFee: {
    required: [true, 'Entry fee is required'],
    min: [0, 'Entry fee cannot be negative']
  },
  maxPlayers: {
    required: [true, 'Max players is required'],
    min: [1, 'Max players must be at least 1']
  },
  date: {
    required: [true, 'Date is required']
  },
  startTime: {
    required: [true, 'Start time is required']
  },
  lockTime: {
    required: [true, 'Lock time is required']
  },
  prizePool: {
    required: [true, 'Prize pool is required'],
    default: 0,
    min: [0, 'Prize pool cannot be negative']
  },
  platformFees: {
    totalPrizePool: {
      default: 0,
      min: [0, 'Total prize pool cannot be negative']
    },
    platformFee: {
      default: 0,
      min: [0, 'Platform fee cannot be negative']
    },
    hostFee: {
      default: 0,
      min: [0, 'Host fee cannot be negative']
    },
    casterFee: {
      default: 0,
      min: [0, 'Caster fee cannot be negative']
    },
    totalFees: {
      default: 0,
      min: [0, 'Total fees cannot be negative']
    },
    winnerPrizePool: {
      default: 0,
      min: [0, 'Winner prize pool cannot be negative']
    },
    potentialTotalPrizePool: {
      default: 0,
      min: [0, 'Potential total prize pool cannot be negative']
    },
    potentialPlatformFee: {
      default: 0,
      min: [0, 'Potential platform fee cannot be negative']
    },
    potentialHostFee: {
      default: 0,
      min: [0, 'Potential host fee cannot be negative']
    },
    potentialCasterFee: {
      default: 0,
      min: [0, 'Potential caster fee cannot be negative']
    },
    potentialTotalFees: {
      default: 0,
      min: [0, 'Potential total fees cannot be negative']
    },
    potentialWinnerPrizePool: {
      default: 0,
      min: [0, 'Potential winner prize pool cannot be negative']
    }
  },
  status: {
    required: [true, 'Status is required'],
    enum: ['upcoming', 'locked', 'running', 'result_pending', 'completed', 'result_published', 'cancelled'],
    default: 'upcoming'
  },
  region: {
    enum: ['Asia', 'Global'],
    default: 'Global'
  },
  lobbyName: {
    default: null,
    maxlength: [100, 'Lobby name cannot exceed 100 characters']
  }
};
