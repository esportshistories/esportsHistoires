/**
 * Wallet API Tests
 */

// Setup test environment before requiring server
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').join(__dirname, '../.env.test') });

const request = require('supertest');
const app = require('../server');
const config = require('../testsprite.config');
const { setupTestDB, cleanupTestDB, closeTestDB, getTestToken } = require('./setup');
const User = require('../models/User.model');
const Wallet = require('../models/Wallet.model');

describe('Wallet API', () => {
  let authToken;
  let userId;

  beforeAll(async () => {
    await setupTestDB();
    
    // Create test user and wallet
    const user = new User({
      email: config.testData.user.email,
      name: config.testData.user.name,
      password: 'hashedpassword',
      isEmailVerified: true
    });
    await user.save();
    userId = user._id.toString();
    
    const wallet = new Wallet({
      userId: user._id,
      balanceINR: 100
    });
    await wallet.save();
    
    authToken = await getTestToken(userId, config.testData.user.email);
  });

  afterAll(async () => {
    await cleanupTestDB();
    await closeTestDB();
  });

  describe('GET /api/wallet/balance', () => {
    test('should get wallet balance', async () => {
      const response = await request(app)
        .get(config.endpoints.wallet.balance)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('balanceINR');
      expect(response.body.data.balanceINR).toBe(100);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get(config.endpoints.wallet.balance)
        .expect(401);
      
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/wallet/history', () => {
    test('should get wallet history', async () => {
      const response = await request(app)
        .get(config.endpoints.wallet.history)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('history');
      expect(Array.isArray(response.body.data.history)).toBe(true);
    });
  });
});
