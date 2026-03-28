/**
 * Integration Tests
 * Test complete user flows
 */

// Setup test environment before requiring server
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').join(__dirname, '../.env.test') });

const request = require('supertest');
const app = require('../server');
const config = require('../testsprite.config');
const { setupTestDB, cleanupTestDB, closeTestDB } = require('./setup');
const User = require('../models/User.model');
const Wallet = require('../models/Wallet.model');
const Tournament = require('../models/Tournament.model');
const PendingRegistration = require('../models/PendingRegistration.model');

describe('Integration Tests - Complete User Flow', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await cleanupTestDB();
    await closeTestDB();
  });

  test('Complete flow: Register → Verify OTP → Login → Check Wallet → Join Tournament', async () => {
    const testEmail = `test${Date.now()}@example.com`;
    const testName = 'Integration Test User';
    const testPassword = 'test123456';

    // Step 1: Register
    const registerResponse = await request(app)
      .post(config.endpoints.auth.register)
      .send({
        email: testEmail,
        name: testName
      })
      .expect(201);
    
    expect(registerResponse.body.success).toBe(true);

    // Step 2: Get OTP from pending registration (in real scenario, get from email)
    const pendingReg = await PendingRegistration.findOne({ email: testEmail });
    expect(pendingReg).toBeTruthy();
    const otpCode = pendingReg.otp.code;

    // Step 3: Verify OTP and set password
    const verifyResponse = await request(app)
      .post(config.endpoints.auth.verifyOTP)
      .send({
        email: testEmail,
        otp: otpCode,
        password: testPassword
      })
      .expect(200);
    
    expect(verifyResponse.body.success).toBe(true);
    expect(verifyResponse.body.data).toHaveProperty('accessToken');
    const accessToken = verifyResponse.body.data.accessToken;

    // Step 4: Check wallet (should be created automatically)
    const walletResponse = await request(app)
      .get(config.endpoints.wallet.balance)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    
    expect(walletResponse.body.success).toBe(true);
    expect(walletResponse.body.data.balanceINR).toBe(0);

    // Step 5: Add balance (Admin action - would need admin token in real scenario)
    // For now, directly update wallet for testing
    const user = await User.findOne({ email: testEmail });
    await Wallet.updateOne(
      { userId: user._id },
      { balanceINR: 500 }
    );

    // Step 6: Get tournaments list with rules (mode required: BR, CS, or LW)
    const tournamentsResponse = await request(app)
      .get('/api/tournament/list?mode=BR')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    
    expect(tournamentsResponse.body.success).toBe(true);
    expect(tournamentsResponse.body.data).toHaveProperty('tournaments');
    expect(tournamentsResponse.body.data.filters.mode).toBe('BR');

    // Step 7: Create a test tournament and join it
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const lockTime = new Date(tomorrow);
    lockTime.setHours(11, 0, 0, 0);
    
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

    // Step 8: Join tournament
    const joinResponse = await request(app)
      .post(config.endpoints.tournament.join)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        tournamentId: tournament._id.toString()
      })
      .expect(200);
    
    expect(joinResponse.body.success).toBe(true);

    // Step 9: Verify balance was deducted
    const updatedWallet = await Wallet.findOne({ userId: user._id });
    expect(updatedWallet.balanceINR).toBe(450); // 500 - 50 entry fee
  });
});
