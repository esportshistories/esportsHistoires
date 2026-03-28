# TestSprite Test Suite

This directory contains test files for the BooyahX Backend API using TestSprite.

## Setup

1. Install test dependencies:
```bash
npm install --save-dev jest supertest
```

2. Set up test environment variables in `.env.test`:
```
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/booyahx_test
```

3. Run tests:
```bash
npm test
```

## Test Files

- `setup.js` - Test database setup and utilities
- `health.test.js` - Health check endpoint tests
- `auth.test.js` - Authentication API tests
- `wallet.test.js` - Wallet API tests
- `tournament.test.js` - Tournament API tests

## Running Specific Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/wallet.test.js

# Run with coverage
npm test -- --coverage
```

## Test Data

Test data is configured in `testsprite.config.js`. You can modify test user credentials and endpoints there.

## Notes

- Tests use a separate test database to avoid affecting production data
- Each test suite cleans up after itself
- Authentication tokens are generated for authenticated endpoints
- Make sure MongoDB test database is running before tests
