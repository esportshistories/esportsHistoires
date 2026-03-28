/**
 * Game modes, lobby rules, maps and position points
 * FREEFIRE_LOBBY_RULES references AVAILABLE_MAPS and POSITION_POINTS_TABLE in this file
 */

const GAME_MODES = {
  CS: {
    clash: { entryFee: 30, maxPlayers: 2 }
  },
  BR: {
    solo: { entryFee: 50, maxPlayers: 48 },
    duo: { entryFee: 100, maxPlayers: 48 },
    squad: { entryFee: 200, maxPlayers: 48 }
  },
  LW: {
    solo: { entryFee: 50, maxPlayers: 48 },
    duo: { entryFee: 100, maxPlayers: 48 },
    squad: { entryFee: 200, maxPlayers: 48 },
    '1v1': { entryFee: 50, maxPlayers: 2 },
    '2v2': { entryFee: 100, maxPlayers: 4 }
  }
};

const MIN_TEAMS_FOR_START = {
  solo: 0,
  duo: 10,
  squad: 3,
  '1v1': 2,
  '2v2': 4,
  '4v4': 8,
  clash: 2
};

const POSITION_POINTS_TABLE = {
  1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1
};

const AVAILABLE_MAPS = [
  'Bermuda', 'Purgatory', 'Alpine', 'Nextterra', 'Kalahari', 'Solara'
];

const FREEFIRE_LOBBY_RULES = {
  BR: {
    solo: {
      mode: 'BR', subMode: 'solo', title: 'Battle Royale Solo', description: 'Solo Battle Royale paid lobby rules',
      rules: [
        'Maximum 48 players per lobby', 'No teaming allowed - solo play only',
        'No hacking, cheating, or use of third-party apps', 'Players must join the room 5 minutes before match start',
        'Screenshots of results required for top 3 positions', 'Kill points: 1 point per kill',
        'Position points: 1st place - 12 points, 2nd place - 9 points, 3rd place - 8 points, 4th place - 7 points, 5th place - 6 points, 6th place - 5 points, 7th place - 4 points, 8th place - 3 points, 9th place - 2 points, 10th place - 1 point',
        'Only top 3 players will receive rewards based on prize pool', 'Disconnection during match will result in disqualification',
        'Players must use their registered IGN (In-Game Name)', 'No account sharing allowed',
        'Respectful behavior towards other players is mandatory', 'Only 1 match will be played (no map rotation)',
        'No extra time will be given', 'Warning: Do not leave room in early elimination - waiting time not entertained',
        'Players must sit according to slot list provided'
      ],
      mapRotation: [], numberOfMatches: 1, maxPlayers: 48, playersPerTeam: 1, maxTeams: 48, positionPoints: POSITION_POINTS_TABLE
    },
    duo: {
      mode: 'BR', subMode: 'duo', title: 'Battle Royale Duo', description: 'Duo Battle Royale paid lobby rules',
      rules: [
        'Maximum 48 players (24 teams) per lobby', 'Each team consists of 2 players', 'Minimum 18 teams required for lobby to start',
        'No solo players allowed - must have a teammate', 'No hacking, cheating, or use of third-party apps',
        'Players must join the room 5 minutes before match start', 'Join in-game chat and write your team name',
        'Screenshots of results required for top 3 teams', 'Kill points: 1 point per kill per team',
        'Position points: 1st place - 12 points, 2nd place - 9 points, 3rd place - 8 points, 4th place - 7 points, 5th place - 6 points, 6th place - 5 points, 7th place - 4 points, 8th place - 3 points, 9th place - 2 points, 10th place - 1 point',
        'Only top 3 teams will receive rewards based on prize pool', 'Disconnection during match will result in team disqualification',
        'Players must use their registered IGN (In-Game Name)', 'No account sharing allowed',
        'Respectful behavior towards other players is mandatory', 'Team members must coordinate and play together',
        '3 matches will be played in map rotation', '2 minutes buffer time between matches', 'No extra time will be given',
        'Warning: Do not leave room in early elimination - waiting time not entertained', 'Players must sit according to slot list provided'
      ],
      mapRotation: AVAILABLE_MAPS.slice(0, 3), numberOfMatches: 3, maxPlayers: 48, playersPerTeam: 2, maxTeams: 24, minTeamsToStart: 18, positionPoints: POSITION_POINTS_TABLE
    },
    squad: {
      mode: 'BR', subMode: 'squad', title: 'Battle Royale Squad', description: 'Squad Battle Royale paid lobby rules',
      rules: [
        'Maximum 48 players per lobby', 'Each team must have minimum 3 players (maximum 4 players)', 'No solo entry allowed - only squad entry permitted',
        'No incomplete teams allowed - minimum 3 players required', 'Minimum 3 teams required for lobby to start',
        'No hacking, cheating, or use of third-party apps', 'Players must join the room 5 minutes before match start',
        'Join in-game chat and write your team name', 'Screenshots of results required for top 3 teams', 'Kill points: 1 point per kill per team',
        'Position points: 1st place - 12 points, 2nd place - 9 points, 3rd place - 8 points, 4th place - 7 points, 5th place - 6 points, 6th place - 5 points, 7th place - 4 points, 8th place - 3 points, 9th place - 2 points, 10th place - 1 point',
        'Only top 3 teams will receive rewards based on prize pool', 'Disconnection during match will result in team disqualification',
        'Players must use their registered IGN (In-Game Name)', 'No account sharing allowed',
        'Respectful behavior towards other players is mandatory', 'Team members must coordinate and play together',
        'All team members must be present at match start', '6 matches will be played in map rotation',
        '2 minutes buffer time between matches', 'No extra time will be given',
        'Warning: Do not leave room in early elimination - waiting time not entertained', 'Players must sit according to slot list provided'
      ],
      mapRotation: AVAILABLE_MAPS, numberOfMatches: 6, maxPlayers: 48, playersPerTeam: 3, minPlayersPerTeam: 3, maxPlayersPerTeam: 4, maxTeams: 12, minTeamsToStart: 3, positionPoints: POSITION_POINTS_TABLE
    }
  },
  CS: {
    clash: {
      mode: 'CS', subMode: 'clash', title: 'Clash Squad', description: 'Clash Squad paid lobby - 2 teams, 1 match',
      rules: [
        'Mode: Clash Squad', '1 match - 7 or 13 rounds (host will decide and run manually)',
        'Only 2 teams can join (minimum 2, maximum 2 teams)', 'Each team: maximum 4 players',
        'No kill points - only match result (round score). Winner: team that wins the match (e.g. 7-6 in 13 rounds). Host declares result',
        'Join same as BR: one person joins as team leader; other player names (up to 4 per team) optional',
        'No hacking, cheating, or use of third-party apps', 'Players must join the room 5 minutes before match start',
        'Screenshots of results required', 'Disconnection during match will result in disqualification',
        'Players must use their registered IGN (In-Game Name)', 'No account sharing allowed',
        'Respectful behavior mandatory', 'No extra time will be given',
        'Warning: Do not leave room in early elimination - waiting time not entertained', 'Players must sit according to slot list provided'
      ],
      mapRotation: ['Bermuda', 'Purgatory', 'Alpine', 'Nextterra', 'Kalahari', 'Solara'], numberOfMatches: 1, maxPlayers: 2, playersPerTeam: 1, maxTeams: 2, minTeamsToStart: 2, maxPlayersPerTeam: 4
    }
  },
  LW: {
    solo: {
      mode: 'LW', subMode: 'solo', title: 'Lone Wolf Solo', description: 'Lone Wolf Solo paid lobby rules',
      rules: [
        'Maximum 48 players per lobby', 'No teaming allowed - solo play only', 'No hacking, cheating, or use of third-party apps',
        'Players must join the room 5 minutes before match start', 'Screenshots of results required for top 3 positions', 'Kill points: 1 point per kill',
        'Position points: 1st place - 12 points, 2nd place - 9 points, 3rd place - 8 points, 4th place - 7 points, 5th place - 6 points, 6th place - 5 points, 7th place - 4 points, 8th place - 3 points, 9th place - 2 points, 10th place - 1 point',
        'Only top 3 players will receive rewards based on prize pool', 'Disconnection during match will result in disqualification',
        'Players must use their registered IGN (In-Game Name)', 'No account sharing allowed',
        'Respectful behavior towards other players is mandatory', 'Lone Wolf mode specific rules apply',
        'Only 1 match will be played (no map rotation)', 'No extra time will be given',
        'Warning: Do not leave room in early elimination - waiting time not entertained', 'Players must sit according to slot list provided'
      ],
      mapRotation: [], numberOfMatches: 1, maxPlayers: 48, playersPerTeam: 1, maxTeams: 48, minTeamsToStart: 0, positionPoints: POSITION_POINTS_TABLE
    },
    duo: {
      mode: 'LW', subMode: 'duo', title: 'Lone Wolf Duo', description: 'Lone Wolf Duo paid lobby rules',
      rules: [
        'Maximum 48 players (24 teams) per lobby', 'Each team consists of 2 players', 'Minimum 18 teams required for lobby to start',
        'No solo players allowed - must have a teammate', 'No hacking, cheating, or use of third-party apps',
        'Players must join the room 5 minutes before match start', 'Join in-game chat and write your team name',
        'Screenshots of results required for top 3 teams', 'Kill points: 1 point per kill per team',
        'Position points: 1st place - 12 points, 2nd place - 9 points, 3rd place - 8 points, 4th place - 7 points, 5th place - 6 points, 6th place - 5 points, 7th place - 4 points, 8th place - 3 points, 9th place - 2 points, 10th place - 1 point',
        'Only top 3 teams will receive rewards based on prize pool', 'Disconnection during match will result in team disqualification',
        'Players must use their registered IGN (In-Game Name)', 'No account sharing allowed',
        'Respectful behavior towards other players is mandatory', 'Team members must coordinate and play together',
        'Lone Wolf mode specific rules apply', '3 matches will be played in map rotation', '2 minutes buffer time between matches',
        'No extra time will be given', 'Warning: Do not leave room in early elimination - waiting time not entertained', 'Players must sit according to slot list provided'
      ],
      mapRotation: AVAILABLE_MAPS.slice(0, 3), numberOfMatches: 3, maxPlayers: 48, playersPerTeam: 2, maxTeams: 24, minTeamsToStart: 18, positionPoints: POSITION_POINTS_TABLE
    },
    squad: {
      mode: 'LW', subMode: 'squad', title: 'Lone Wolf Squad', description: 'Lone Wolf Squad paid lobby rules',
      rules: [
        'Maximum 48 players per lobby', 'Each team must have minimum 3 players (maximum 4 players)', 'No solo entry allowed - only squad entry permitted',
        'No incomplete teams allowed - minimum 3 players required', 'Minimum 3 teams required for lobby to start',
        'No hacking, cheating, or use of third-party apps', 'Players must join the room 5 minutes before match start',
        'Join in-game chat and write your team name', 'Screenshots of results required for top 3 teams', 'Kill points: 1 point per kill per team',
        'Position points: 1st place - 12 points, 2nd place - 9 points, 3rd place - 8 points, 4th place - 7 points, 5th place - 6 points, 6th place - 5 points, 7th place - 4 points, 8th place - 3 points, 9th place - 2 points, 10th place - 1 point',
        'Only top 3 teams will receive rewards based on prize pool', 'Disconnection during match will result in team disqualification',
        'Players must use their registered IGN (In-Game Name)', 'No account sharing allowed',
        'Respectful behavior towards other players is mandatory', 'Team members must coordinate and play together',
        'All team members must be present at match start', 'Lone Wolf mode specific rules apply',
        '6 matches will be played in map rotation', '2 minutes buffer time between matches', 'No extra time will be given',
        'Warning: Do not leave room in early elimination - waiting time not entertained', 'Players must sit according to slot list provided'
      ],
      mapRotation: AVAILABLE_MAPS, numberOfMatches: 6, maxPlayers: 48, playersPerTeam: 3, minPlayersPerTeam: 3, maxPlayersPerTeam: 4, maxTeams: 12, minTeamsToStart: 3, positionPoints: POSITION_POINTS_TABLE
    }
  },
  generalRules: [
    'All participants must have a valid account and sufficient balance to join',
    'Entry fee is non-refundable once tournament starts',
    'Room ID and password will be shared when tournament goes live at match start time',
    'Players must be ready and in the room before lock time',
    'Required game map must be fully downloaded before joining the room - no extra waiting time will be given for map download',
    'If required, a maximum buffer of 2 minutes may be given between rooms/matches; no additional waiting time will be entertained',
    'Any form of cheating, hacking, or exploiting will result in permanent ban',
    'Results will be verified by host/admin before rewards are distributed',
    'Disputes must be raised within 15 minutes of match completion',
    'Admin decision is final in case of any disputes',
    'Rewards will be credited to wallet within 24 hours of result verification',
    'Platform reserves the right to cancel or modify tournament rules if needed'
  ]
};

module.exports = {
  GAME_MODES,
  MIN_TEAMS_FOR_START,
  AVAILABLE_MAPS,
  POSITION_POINTS_TABLE,
  FREEFIRE_LOBBY_RULES
};
