/**
 * Verification Test: Duplicate FCM Notifications
 */
process.env.NODE_ENV = 'test';
process.env.DISABLE_CSRF = 'true';
require('dotenv').config({ path: require('path').join(__dirname, '../.env.test'), override: true });

const { setupTestDB, cleanupTestDB, closeTestDB } = require('./setup');
const Tournament = require('../models/Tournament.model');
const tournamentService = require('../services/tournament.service');
const notificationService = require('../services/notification.service');
const fcmService = require('../services/fcm.service');
const Logger = require('../utils/logger');

describe('FCM Notification Duplication Verification', () => {
  let tournament;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await cleanupTestDB();
    await closeTestDB();
  });

  test('Should call fcmService.sendToDevice exactly ONCE during autoUpdateTournamentStatus', async () => {
    // 1. Mock FCM sendToDevice
    const fcmSpy = jest.spyOn(fcmService, 'sendToDevice').mockResolvedValue({ success: true });
    jest.spyOn(fcmService, 'isInitialized').mockReturnValue(true);
    
    // 2. Mock User.find to return some tokens
    const User = require('../models/User.model');
    jest.spyOn(User, 'find').mockReturnValue({
      select: jest.fn().mockResolvedValue([{ fcmToken: 'token1' }, { fcmToken: 'token2' }])
    });

    // 3. Create a tournament that is ready to go live
    const now = new Date();
    const tournamentDate = new Date(now.getTime() - 2 * 60 * 1000); // 2 mins ago
    
    tournament = new Tournament({
      game: 'Free Fire',
      mode: 'BR',
      subMode: 'solo',
      entryFee: 0, // Avoid wallet issues
      maxPlayers: 48,
      date: tournamentDate,
      startTime: '10:00 AM', // Doesn't matter much due to mock
      status: 'upcoming',
      room: {
        roomId: 'MOCK_ROOM',
        password: 'MOCK_PASS'
      },
      participants: [] // Just needs to be non-null for some logic
    });
    await tournament.save();

    // 4. Mock calculateStartDateTime to return current time
    const startDateTime = new Date(now.getTime() - 1000);
    jest.spyOn(tournamentService, 'calculateStartDateTime').mockReturnValue(startDateTime);

    // 5. Trigger autoUpdateTournamentStatus
    Logger.info('Triggering autoUpdateTournamentStatus for verification');
    const updatedCount = await tournamentService.autoUpdateTournamentStatus(tournament._id.toString());
    
    expect(updatedCount).toBe(1);
    
    // 6. Verify FCM was called once per token (so 2 tokens = 2 calls, but 1 logical notification event)
    // Actually, sendRoomUpdateNotification loops over tokens.
    // We want to ensure sendRoomUpdateNotification itself is called once.
    // But since it's an async IIFE inside sendRoomUpdateNotification, we wait a bit or track the calls.
    
    // Wait for the async IIFE in sendRoomUpdateNotification
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Each user gets one notification. We had 2 users mocked.
    // So 2 calls to sendToDevice is correct for ONE notification event.
    // Triple notifications would mean 6 calls.
    expect(fcmSpy).toHaveBeenCalledTimes(2);

    fcmSpy.mockRestore();
    jest.restoreAllMocks();
  });
});
