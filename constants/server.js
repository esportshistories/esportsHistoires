/**
 * Server, database and environment configuration
 */

const SERVER = {
  DEFAULT_PORT: 3000,
  DEFAULT_HOST: 'localhost',
  DEFAULT_CORS_ORIGIN: 'http://localhost:3000',
  BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
  PRODUCTION_BASE_URL: 'https://api.gaminghuballday.buzz',
  PRODUCTION_CORS_ORIGINS: [
    'https://gaminghuballday.buzz',
    'https://www.gaminghuballday.buzz',
    'https://api.gaminghuballday.buzz',
    'https://admin.gaminghuballday.buzz',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:3001'
  ]
};

const DATABASE = {
  MONGODB: {
    DEFAULT_HOST: 'localhost',
    DEFAULT_PORT: 27017,
    DEFAULT_DATABASE: 'booyahx',
    DEFAULT_URI: 'mongodb://localhost:27017/booyahx'
  }
};

const ENV = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

module.exports = { SERVER, DATABASE, ENV };
