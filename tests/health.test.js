/**
 * Health Check API Tests
 */

// Setup test environment before requiring server
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').join(__dirname, '../.env.test') });

const request = require('supertest');
const app = require('../server');
const config = require('../testsprite.config');

describe('Health Check API', () => {
  test('GET /health should return 200', async () => {
    const response = await request(app)
      .get(config.endpoints.health)
      .expect(200);
    
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toBe('BooyahX Backend is running');
  });
});
