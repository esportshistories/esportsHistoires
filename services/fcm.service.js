/**
 * FCM Service
 * Handles push notifications via Firebase Cloud Messaging
 */

const admin = require('firebase-admin');
const Logger = require('../utils/logger');

// Initialize Firebase Admin SDK
let isInitialized = false;

try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    // Trim and handle potential escaped newlines or surrounding quotes
    let privateKey = process.env.FIREBASE_PRIVATE_KEY.trim();
    
    // Remove surrounding quotes if present (common in some env setups)
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
    }
    
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    // Basic validation for private key format
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      Logger.error('FCM initialization failed: FIREBASE_PRIVATE_KEY format is invalid.', {
        length: privateKey.length,
        startsWith: privateKey.substring(0, 20) + '...',
        endsWith: '...' + privateKey.substring(privateKey.length - 20)
      });
      isInitialized = false;
    } else {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
      isInitialized = true;
      Logger.info('FCM Service initialized via environment variables');
    }
  } else {
    // Attempt to load from serviceAccountKey.json if env vars are missing
    const fs = require('fs');
    const path = require('path');
    const serviceAccountPath = path.join(__dirname, '../config/serviceAccountKey.json');
    
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      isInitialized = true;
      Logger.info('FCM Service initialized via serviceAccountKey.json');
    } else {
      Logger.warn('FCM Service not initialized: Missing credentials (env vars or serviceAccountKey.json)');
    }
  }
} catch (error) {
  Logger.error('Error initializing FCM Service', {
    message: error.message,
    code: error.code,
    stack: error.stack
  });
}

/**
 * Send notification to a specific device token
 * @param {string} token - FCM device token
 * @param {Object} payload - Notification payload { title, body, data }
 * @returns {Promise<Object>} Result
 */
const sendToDevice = async (token, payload) => {
  if (!isInitialized) {
    Logger.warn('FCM not initialized, skipping notification', { token });
    return { success: false, message: 'FCM not initialized' };
  }

  if (!token) {
    return { success: false, message: 'Token is required' };
  }

  const message = {
    token: token,
    data: payload.data || {},
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'default_channel'
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default'
        }
      }
    }
  };

  // Only include notification block if title or body is provided
  if (payload.title || payload.body) {
    message.notification = {
      title: payload.title || '',
      body: payload.body || '',
    };
  }

  try {
    // Debug log for construction (mask token for security)
    const debugMessage = { ...message, token: token ? `${token.slice(0, 5)}...` : 'null' };
    Logger.info('Constructed FCM device message', debugMessage);

    const response = await admin.messaging().send(message);
    Logger.info('FCM notification sent successfully', { response, token: token ? `${token.slice(0, 5)}...` : 'null' });
    return { success: true, response };
  } catch (error) {
    Logger.error('Error sending FCM notification', error);
    // If token is invalid, we might want to remove it from DB in the caller
    return { success: false, error: error.code, message: error.message };
  }
};

/**
 * Send notification to a topic
 * @param {string} topic - Topic name (e.g., 'all_users')
 * @param {Object} payload - Notification payload { title, body, data }
 * @returns {Promise<Object>} Result
 */
const sendToTopic = async (topic, payload) => {
  if (!isInitialized) {
    Logger.warn('FCM not initialized, skipping topic notification', { topic });
    return { success: false, message: 'FCM not initialized' };
  }

  // FCM data values must all be strings
  const rawData = payload.data || {};
  const data = {};
  for (const [k, v] of Object.entries(rawData)) {
    data[k] = v == null ? '' : String(v);
  }
  if (payload.title != null) data.title = String(payload.title);
  if (payload.body != null) data.body = String(payload.body);

  const message = {
    topic: topic,
    data: data,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'default_channel'
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default'
        }
      }
    }
  };

  if (payload.title || payload.body) {
    message.notification = {
      title: payload.title || 'Notification',
      body: payload.body || '',
    };
  }

  try {
    Logger.info('Constructed FCM topic message', { topic, hasNotification: !!message.notification });

    const response = await admin.messaging().send(message);
    Logger.info('FCM topic notification sent successfully', { response, topic });
    return { success: true, response };
  } catch (error) {
    Logger.error('Error sending FCM topic notification', error);
    return { success: false, error: error.code, message: error.message };
  }
};

/**
 * Subscribe a token to a topic
 * @param {string|Array<string>} tokens - Device token(s)
 * @param {string} topic - Topic name
 */
const subscribeToTopic = async (tokens, topic) => {
  if (!isInitialized) return;
  try {
    const tokensArray = Array.isArray(tokens) ? tokens : [tokens];
    await admin.messaging().subscribeToTopic(tokensArray, topic);
    Logger.info('Subscribed tokens to topic', { topic, count: tokensArray.length });
  } catch (error) {
    Logger.error('Error subscribing to FCM topic', error);
  }
};

/**
 * Unsubscribe token(s) from a topic
 * @param {string|Array<string>} tokens - Device token(s)
 * @param {string} topic - Topic name
 */
const unsubscribeFromTopic = async (tokens, topic) => {
  if (!isInitialized) return;
  try {
    const tokensArray = Array.isArray(tokens) ? tokens : [tokens];
    await admin.messaging().unsubscribeFromTopic(tokensArray, topic);
    Logger.info('Unsubscribed tokens from topic', { topic, count: tokensArray.length });
  } catch (error) {
    Logger.error('Error unsubscribing from FCM topic', error);
  }
};

module.exports = {
  sendToDevice,
  sendToTopic,
  subscribeToTopic,
  unsubscribeFromTopic,
  isInitialized: () => isInitialized
};
