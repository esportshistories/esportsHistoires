/**
 * Tournament API Tests
 */

// Setup test environment before requiring server
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').join(__dirname, '../.env.test') });

const request = require('supertest');
const app = require('../server');
const config = require('../testsprite.config');
const { setupTestDB, cleanupTestDB, closeTestDB, getTestToken } = require('./setup');
const User = require('../models/User.model');
const Tournament = require('../models/Tournament.model');
const Wallet = require('../models/Wallet.model');

describe('Tournament API', () => {
  let authToken;
  let userId;
  let tournamentId;

  beforeAll(async () => {
    await setupTestDB();
    
    // Create test user
    const user = new User({
      email: config.testData.user.email,
      name: config.testData.user.name,
      password: 'hashedpassword',
      isEmailVerified: true
    });
    await user.save();
    userId = user._id.toString();
    
    // Create wallet with balance
    const wallet = new Wallet({
      userId: user._id,
      balanceINR: 500
    });
    await wallet.save();
    
    // Create test tournament
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const lockTime = new Date(tomorrow);
    lockTime.setHours(11, 0, 0, 0); // 1 hour before 12 PM
    
    const tournament = new Tournament({
      game: 'Free Fire',
      mode: 'BR',
      subMode: 'solo',
      entryFee: 50,
      maxPlayers: 48,
      date: tomorrow,
      startTime: '12:00 PM',
      lockTime: lockTime,
      participants: [],
      prizePool: 0,
      status: 'upcoming'
    });
    await tournament.save();
    tournamentId = tournament._id.toString();
    
    authToken = await getTestToken(userId, config.testData.user.email);
  });

  afterAll(async () => {
    await cleanupTestDB();
    await closeTestDB();
  });

  describe('GET /api/tournament/list', () => {
    test('should get tournaments with rules when mode=BR', async () => {
      const response = await request(app)
        .get('/api/tournament/list?mode=BR')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tournaments');
      expect(Array.isArray(response.body.data.tournaments)).toBe(true);
      expect(response.body.data.filters.mode).toBe('BR');
    });

    test('should return all modes when mode is omitted', async () => {
      const response = await request(app)
        .get('/api/tournament/list')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tournaments');
      expect(response.body.data.filters.mode).toBeNull();
    });
  });

  describe('POST /api/tournament/join', () => {
    test('should join tournament with sufficient balance', async () => {
      const response = await request(app)
        .post(config.endpoints.tournament.join)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tournamentId: tournamentId
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('joined tournament');
    });

    test('should reject join with insufficient balance', async () => {
      // Update wallet to have low balance
      await Wallet.updateOne(
        { userId: userId },
        { balanceINR: 10 }
      );
      
      const response = await request(app)
        .post(config.endpoints.tournament.join)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tournamentId: tournamentId
        })
        .expect(400);
      
      expect(response.body.success).toBe(false);
    });
  });
});
