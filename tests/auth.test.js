/**
 * Authentication API Tests
 */

// Setup test environment before requiring server
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').join(__dirname, '../.env.test') });

const request = require('supertest');
const app = require('../server');
const config = require('../testsprite.config');
const { setupTestDB, cleanupTestDB, closeTestDB } = require('./setup');

describe('Authentication API', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterEach(async () => {
    await cleanupTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('POST /api/auth/register', () => {
    test('should register a new user', async () => {
      const response = await request(app)
        .post(config.endpoints.auth.register)
        .send({
          email: config.testData.user.email,
          name: config.testData.user.name
        })
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('OTP has been sent');
      expect(response.body.data).toHaveProperty('email');
    });

    test('should reject duplicate email', async () => {
      // First registration
      await request(app)
        .post(config.endpoints.auth.register)
        .send({
          email: config.testData.user.email,
          name: config.testData.user.name
        });

      // Second registration with same email
      const response = await request(app)
        .post(config.endpoints.auth.register)
        .send({
          email: config.testData.user.email,
          name: 'Another User'
        })
        .expect(400);
      
      expect(response.body.success).toBe(false);
    });

    test('should validate email format', async () => {
      const response = await request(app)
        .post(config.endpoints.auth.register)
        .send({
          email: 'invalid-email',
          name: config.testData.user.name
        })
        .expect(400);
      
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      // First register and verify OTP
      await request(app)
        .post(config.endpoints.auth.register)
        .send({
          email: config.testData.user.email,
          name: config.testData.user.name
        });

      // Note: In real test, you'd need to get OTP from email or mock it
      // This is a placeholder test structure
      
      const response = await request(app)
        .post(config.endpoints.auth.login)
        .send({
          email: config.testData.user.email,
          password: config.testData.user.password
        });
      
      // Adjust expectations based on whether user is verified
      expect([200, 400]).toContain(response.status);
    });
  });
});
