/**
 * Fix wallet_history qrCodeId unique index (one-time)
 *
 * Problem: E11000 duplicate key on wallet_history index qrCodeId_1 dup key: { qrCodeId: null }
 * Cause: The DB has a non-sparse unique index on qrCodeId. Only one doc can have qrCodeId: null.
 *        Tournament join (and other flows) create wallet_history without qrCodeId → multiple nulls → duplicate key.
 * Fix: Drop the existing qrCodeId_1 index and let Mongoose recreate it with sparse: true
 *      (sparse = index only includes docs that have qrCodeId, so multiple nulls are allowed).
 *
 * Usage:
 *   NODE_ENV=test node scripts/fix-wallet-history-qrcode-index.js
 *   node scripts/fix-wallet-history-qrcode-index.js   # uses .env.development
 *   NODE_ENV=production node scripts/fix-wallet-history-qrcode-index.js  # uses system env
 */

const path = require('path');
const nodeEnv = process.env.NODE_ENV || 'development';
const envArg = process.argv.find(arg => arg.startsWith('--env='));
const envFromArg = envArg ? envArg.split('=')[1] : null;
const environment = envFromArg || nodeEnv;

if (environment === 'production') {
  console.log('Production: using system env (no .env load)');
} else {
  const envFile = `.env.${environment}`;
  require('dotenv').config({ path: path.join(__dirname, `../${envFile}`) });
  console.log(`Loaded ${envFile}`);
}

const mongoose = require('mongoose');
const { DATABASE } = require('../constants');
const WalletHistory = require('../models/WalletHistory.model');

const run = async () => {
  const mongoURI = process.env.MONGODB_URI || DATABASE.MONGODB.DEFAULT_URI;
  if (!process.env.MONGODB_URI && environment === 'production') {
    console.error('MONGODB_URI must be set in production.');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB (${environment})...`);
  await mongoose.connect(mongoURI);
  const db = mongoose.connection.db;
  console.log(`Database: ${db.databaseName}`);
  const coll = db.collection('wallet_history');

  try {
    const indexes = await coll.indexes();
    const qrIndex = indexes.find(i => i.name === 'qrCodeId_1');
    if (qrIndex) {
      console.log('Dropping existing qrCodeId_1 index (may be non-sparse)...');
      await coll.dropIndex('qrCodeId_1');
      console.log('Dropped qrCodeId_1.');
    } else {
      console.log('No qrCodeId_1 index found (nothing to drop).');
    }

    console.log('Syncing WalletHistory indexes...');
    await WalletHistory.syncIndexes();

    // Ensure qrCodeId_1 is sparse (driver creates it explicitly so it's guaranteed)
    const afterSync = (await coll.indexes()).find(i => i.name === 'qrCodeId_1');
    if (afterSync && !afterSync.sparse) {
      console.log('qrCodeId_1 was recreated without sparse. Dropping and creating with sparse: true...');
      await coll.dropIndex('qrCodeId_1');
    }
    const existsSparse = (await coll.indexes()).find(i => i.name === 'qrCodeId_1');
    if (!existsSparse || !existsSparse.sparse) {
      await coll.createIndex({ qrCodeId: 1 }, { unique: true, sparse: true });
      console.log('Created qrCodeId_1 with { unique: true, sparse: true }.');
    }

    const after = (await coll.indexes()).find(i => i.name === 'qrCodeId_1');
    console.log('qrCodeId_1 now:', after ? { unique: after.unique, sparse: after.sparse } : 'missing');
    console.log('Done. Multiple null qrCodeIds are allowed.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
};

run();
