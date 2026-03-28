/**
 * FCM Payload Verification Test
 */
process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nN\n-----END PRIVATE KEY-----';

// Mock Logger and Firebase Admin BEFORE requiring services
jest.mock('../utils/logger');
jest.mock('firebase-admin', () => {
  const send = jest.fn().mockResolvedValue('fake-response');
  return {
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    messaging: () => ({ send })
  };
});

const fcmService = require('../services/fcm.service');
const notificationService = require('../services/notification.service');
const admin = require('firebase-admin');

describe('FCM Payload Construction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sendToDevice should omit notification block when title and body are missing', async () => {
    const payload = {
      data: { key: 'value' }
    };
    await fcmService.sendToDevice('fake-token', payload);
    
    expect(admin.messaging().send).toHaveBeenCalled();
    const sentMessage = admin.messaging().send.mock.calls[0][0];
    expect(sentMessage.notification).toBeUndefined();
    expect(sentMessage.data).toEqual({ key: 'value' });
    expect(sentMessage.token).toBe('fake-token');
  });

  test('sendToDevice should include notification block when title is provided', async () => {
    const payload = {
      title: 'Test Title',
      data: { key: 'value' }
    };
    await fcmService.sendToDevice('fake-token', payload);
    
    expect(admin.messaging().send).toHaveBeenCalled();
    const sentMessage = admin.messaging().send.mock.calls[0][0];
    expect(sentMessage.notification).toBeDefined();
    expect(sentMessage.notification.title).toBe('Test Title');
  });

  test('sendToTopic should omit notification block when title and body are missing', async () => {
    const payload = {
      data: { type: 'test' }
    };
    await fcmService.sendToTopic('test_topic', payload);
    
    expect(admin.messaging().send).toHaveBeenCalled();
    const sentMessage = admin.messaging().send.mock.calls[0][0];
    expect(sentMessage.notification).toBeUndefined();
    expect(sentMessage.data).toEqual({ type: 'test' });
    expect(sentMessage.topic).toBe('test_topic');
  });

  test('sendCustomNotification should still send visible notification (with title/body)', async () => {
    notificationService.sendCustomNotification('Admin Title', 'Admin Body');
    
    expect(admin.messaging().send).toHaveBeenCalled();
    const sentMessage = admin.messaging().send.mock.calls[0][0];
    expect(sentMessage.notification).toBeDefined();
    expect(sentMessage.notification.title).toBe('Admin Title');
    expect(sentMessage.notification.body).toBe('Admin Body');
  });
});
