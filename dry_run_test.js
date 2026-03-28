/**
 * Dry Run: Tournament Status Update
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.test'), override: true });

const Tournament = require('./models/Tournament.model');
const tournamentService = require('./services/tournament.service');
const Logger = require('./utils/logger');

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    // Create a mock tournament
    const t = new Tournament({
      game: 'Free Fire',
      mode: 'BR',
      subMode: 'solo',
      entryFee: 0,
      maxPlayers: 48,
      date: new Date(),
      startTime: '10:00 AM',
      status: 'upcoming',
      room: { roomId: 'DRY_RUN', password: 'PASS' }
    });
    await t.save();
    console.log('Created tournament:', t._id);

    // Mock date to bypass skip
    const originalCalc = tournamentService.calculateStartDateTime;
    tournamentService.calculateStartDateTime = () => new Date(Date.now() - 1000);

    // Try to update it
    const updatedCount = await tournamentService.autoUpdateTournamentStatus(t._id.toString());
    console.log('Updated count:', updatedCount);

    // Restore
    tournamentService.calculateStartDateTime = originalCalc;

    await Tournament.deleteOne({ _id: t._id });
    console.log('Cleaned up');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
