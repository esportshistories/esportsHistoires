/**
 * Room Data Privacy and Socket Updates Test
 */
process.env.NODE_ENV = 'test';
process.env.DISABLE_CSRF = 'true';
require('dotenv').config({ path: require('path').join(__dirname, '../.env.test') });

const request = require('supertest');
const app = require('../server');
const { setupTestDB, cleanupTestDB, closeTestDB, getTestToken } = require('./setup');
const User = require('../models/User.model');
const Tournament = require('../models/Tournament.model');
const Wallet = require('../models/Wallet.model');

describe('Room Data Privacy', () => {
  let authToken;
  let userId;
  let tournamentId;

  // Increase timeout for setup/teardown
  jest.setTimeout(30000);

  beforeAll(async () => {
    await setupTestDB();
    
    // Create test user
    const user = new User({
      email: 'test@example.com',
      name: 'Test User',
      password: 'hashedpassword',
      isEmailVerified: true
    });
    await user.save();
    userId = user._id.toString();
    
    // Create test tournament with room ID/pass
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tournament = new Tournament({
      game: 'Free Fire',
      mode: 'BR',
      subMode: 'solo',
      entryFee: 50,
      maxPlayers: 48,
      date: tomorrow,
      startTime: '12:00 PM',
      lockTime: tomorrow,
      participants: [],
      room: {
        roomId: 'ROOM123',
        password: 'PASS123'
      },
      status: 'upcoming'
    });
    await tournament.save();
    tournamentId = tournament._id.toString();
    
    authToken = await getTestToken(userId, 'test@example.com');
  });

  afterAll(async () => {
    await cleanupTestDB();
    await closeTestDB();
  });

  test('GET /api/tournament/list should NOT contain room info', async () => {
    const response = await request(app)
      .get('/api/tournament/list?status=upcoming')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    
    const tournament = response.body.data.tournaments.find(t => t._id === tournamentId);
    expect(tournament).toBeDefined();
    expect(tournament.room).toBeUndefined();
  });

  test('GET /api/tournament/:id should NOT contain room info for non-participants', async () => {
    const response = await request(app)
      .get(`/api/tournament/${tournamentId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    
    expect(response.body.data.tournament.room).toBeUndefined();
  });

  test('GET /api/tournament/joined should contain room info for participants', async () => {
    // Join the tournament
    await Tournament.updateOne({ _id: tournamentId }, { $push: { participants: userId } });
    
    const response = await request(app)
      .get('/api/tournament/joined')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    
    const tournament = response.body.data.tournaments.find(t => t._id === tournamentId);
    expect(tournament).toBeDefined();
    expect(tournament.room).toBeDefined();
    expect(tournament.room.roomId).toBe('ROOM123');
    expect(tournament.room.password).toBe('PASS123');
  });
});
