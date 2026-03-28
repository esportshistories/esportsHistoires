/**
 * Test Setup
 * Initialize test environment and utilities
 */

const mongoose = require('mongoose');
const path = require('path');

// Load test environment variables BEFORE anything else
require('dotenv').config({ path: path.join(__dirname, '../.env.test'), override: true });

/**
 * Setup test database connections
 */
async function setupTestDB() {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI is not defined in .env.test');
    }
    await mongoose.connect(mongoURI);
    console.log('✅ Test MongoDB connected');
  } catch (error) {
    console.error('❌ Test DB setup failed:', error);
    throw error;
  }
}

/**
 * Cleanup test database
 */
async function cleanupTestDB() {
  try {
    // Clear MongoDB collections
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    console.log('✅ Test MongoDB cleaned');
    console.log('✅ Test cleanup complete');
  } catch (error) {
    console.error('❌ Test cleanup failed:', error);
    throw error;
  }
}

/**
 * Close database connections
 */
async function closeTestDB() {
  try {
    await mongoose.connection.close();
    console.log('✅ Test DB connections closed');
  } catch (error) {
    console.error('❌ Error closing test DB:', error);
    throw error;
  }
}

/**
 * Generate test token (for authenticated requests)
 */
async function getTestToken(userId, email) {
  const { generateTokenPair } = require('../utils/jwt.service');
  const { accessToken } = generateTokenPair(userId, email);
  return accessToken;
}

module.exports = {
  setupTestDB,
  cleanupTestDB,
  closeTestDB,
  getTestToken
};
