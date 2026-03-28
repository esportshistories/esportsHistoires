/**
 * MongoDB Database Configuration
 * Handles connection to MongoDB for profile, room ID, and other non-payment data
 */

const mongoose = require('mongoose');
const { DATABASE } = require('../constants');
const Logger = require('../utils/logger');

// Track if SIGINT handler has been registered to prevent multiple registrations
let sigintHandlerRegistered = false;

/**
 * Connect to MongoDB database with optimized connection pooling
 * Configured for high concurrency (40k+ daily active users)
 * @returns {Promise<void>}
 */
const connectMongoDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || DATABASE.MONGODB.DEFAULT_URI;
    
    // Connection pool options optimized for high concurrency
    const connectionOptions = {
      // Connection Pool Settings
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 50, // Maximum connections in pool (default: 100, we use 50 for better resource management)
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE) || 10, // Minimum connections to maintain
      
      // Timeout Settings
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT) || 5000, // Timeout for server selection (5 seconds)
      socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT) || 45000, // Socket timeout (45 seconds)
      connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT) || 10000, // Connection timeout (10 seconds)
      maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME) || 30000, // Close idle connections after 30 seconds
      
      // Retry Settings
      retryWrites: true, // Retry write operations on transient errors
      retryReads: true, // Retry read operations on transient errors
      
      // Read Preference (for replica sets)
      // Use 'primary' for single server, 'secondaryPreferred' for replica sets
      readPreference: process.env.MONGODB_READ_PREFERENCE || 'primary',
      
      // Write Concern (for data durability)
      w: 'majority', // Wait for majority of replica set members
      wtimeoutMS: 5000, // Timeout for write concern (5 seconds) - use wtimeoutMS (wtimeout is deprecated)
      
      // Heartbeat Settings
      heartbeatFrequencyMS: 10000, // Check server status every 10 seconds
    };

    // Mongoose 9+ uses modern connection options by default
    // No need for useNewUrlParser and useUnifiedTopology (removed in v9)
    await mongoose.connect(mongoURI, connectionOptions);
    
    // Set global Mongoose settings
    mongoose.set('strictQuery', true); // Require field names in queries
    mongoose.set('bufferCommands', false); // Disable buffering (fail fast)
    
    Logger.info('MongoDB connected successfully', { minPoolSize: connectionOptions.minPoolSize, maxPoolSize: connectionOptions.maxPoolSize, readPreference: connectionOptions.readPreference });

    // E11000 fix: qrCodeId index must NOT be unique (join/add-balance/admin topup have null). QR uniqueness = app-level (checkQRCodeUniqueness).
    const ensureWalletHistoryQRCodeIndex = async () => {
      try {
        const coll = mongoose.connection.db.collection('wallet_history');
        const indexes = await coll.indexes();
        const qrIndex = indexes.find(i => i.name === 'qrCodeId_1');
        if (qrIndex) await coll.dropIndex('qrCodeId_1');
        await coll.createIndex({ qrCodeId: 1 }, { sparse: true });
        Logger.info('wallet_history: qrCodeId_1 index set (sparse, non-unique) — join/add-balance E11000 fix');
      } catch (idxErr) {
        Logger.error('wallet_history qrCodeId index fix FAILED', { error: idxErr.message });
      }
    };
    setImmediate(ensureWalletHistoryQRCodeIndex);

    // One-time style migration: wallet balance + history amounts in INR (was balanceGC / amountGC)
    const migrateWalletFieldsToInr = async () => {
      try {
        const db = mongoose.connection.db;
        const wallets = db.collection('wallets');
        const wh = db.collection('wallet_history');
        const wRes = await wallets.updateMany(
          {},
          [{ $set: { balanceINR: { $ifNull: ['$balanceINR', '$balanceGC'] } } }, { $unset: 'balanceGC' }]
        );
        if (wRes.modifiedCount > 0) {
          Logger.info('Migrated wallets: balanceGC → balanceINR', { modifiedCount: wRes.modifiedCount });
        }
        const hRes = await wh.updateMany(
          {},
          [{ $set: { amountINR: { $ifNull: ['$amountINR', '$amountGC'] } } }, { $unset: 'amountGC' }]
        );
        if (hRes.modifiedCount > 0) {
          Logger.info('Migrated wallet_history: amountGC → amountINR', { modifiedCount: hRes.modifiedCount });
        }
        try {
          const idx = await wh.indexes();
          if (idx.some((i) => i.name === 'utr_1_amountGC_1')) {
            await wh.dropIndex('utr_1_amountGC_1');
            Logger.info('Dropped legacy index utr_1_amountGC_1');
          }
        } catch (dropErr) {
          Logger.warn('wallet_history index drop utr_1_amountGC_1 skipped', { message: dropErr.message });
        }
        await wh.createIndex({ utr: 1, amountINR: 1 }, { background: true });
      } catch (mErr) {
        Logger.error('INR field migration failed', { message: mErr.message });
      }
    };
    setImmediate(migrateWalletFieldsToInr);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      Logger.error('MongoDB connection error', err);
    });

    mongoose.connection.on('disconnected', () => {
      Logger.warn('MongoDB disconnected - attempting to reconnect');
    });

    mongoose.connection.on('reconnected', () => {
      Logger.info('MongoDB reconnected successfully');
    });

    mongoose.connection.on('connecting', () => {
      Logger.info('Connecting to MongoDB');
    });

    mongoose.connection.on('connected', () => {
      Logger.info('MongoDB connection established');
    });

    // Log connection pool status periodically (optional, for monitoring)
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_MONGODB_POOL_LOGGING === 'true') {
      setInterval(() => {
        if (mongoose.connection.readyState === 1) {
          const state = mongoose.connection.readyState;
          const stateText = state === 1 ? 'Connected' : state === 2 ? 'Connecting' : 'Disconnected';
          Logger.info('MongoDB Status', { state: stateText, minPoolSize: connectionOptions.minPoolSize, maxPoolSize: connectionOptions.maxPoolSize });
        }
      }, 300000); // Log every 5 minutes (reduce log noise)
    }

    // Graceful shutdown - register only once to prevent multiple handlers
    if (!sigintHandlerRegistered) {
      process.on('SIGINT', async () => {
        Logger.info('Closing MongoDB connection');
        await mongoose.connection.close();
        Logger.info('MongoDB connection closed through app termination');
        process.exit(0);
      });
      
      process.on('SIGTERM', async () => {
        Logger.info('Closing MongoDB connection (SIGTERM)');
        await mongoose.connection.close();
        Logger.info('MongoDB connection closed');
        process.exit(0);
      });
      
      sigintHandlerRegistered = true;
    }
  } catch (error) {
    Logger.error('MongoDB connection error', error);
    throw error;
  }
};

module.exports = connectMongoDB;

