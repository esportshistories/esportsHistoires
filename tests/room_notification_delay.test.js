/**
 * Room Notification Delay Test (10-Minute Rule)
 */
process.env.NODE_ENV = 'test';
process.env.DISABLE_CSRF = 'true';
require('dotenv').config({ path: require('path').join(__dirname, '../.env.test') });

const request = require('supertest');
const app = require('../server');
const { setupTestDB, cleanupTestDB, closeTestDB, getTestToken } = require('./setup');
const User = require('../models/User.model');
const Tournament = require('../models/Tournament.model');
const Wallet = require('../models/Wallet.model');
const tournamentService = require('../services/tournament.service');

describe('Room Notification Delay (10-Minute Rule)', () => {
  let authToken;
  let userId;
  let participantToken;
  let participantId;
  let tournamentId;

  // Increase timeout for setup/teardown
  jest.setTimeout(30000);

  beforeAll(async () => {
    await setupTestDB();
    
    // Create test user
    const user = new User({
      email: 'test@example.com',
      name: 'Test User',
      password: 'hashedpassword',
      isEmailVerified: true,
      role: 'admin' // Create as admin so we can update room
    });
    await user.save();
    userId = user._id.toString();
    
    // Create wallet for testing joins
    const wallet = new Wallet({
      userId,
      balanceINR: 1000,
      balanceCash: 0
    });
    await wallet.save();

    authToken = await getTestToken(userId, 'test@example.com');

    // Create a regular participant user
    const participant = new User({
      email: 'player@example.com',
      name: 'Regular Player',
      password: 'hashedpassword',
      isEmailVerified: true,
      role: 'user'
    });
    await participant.save();
    participantId = participant._id.toString();
    participantToken = await getTestToken(participantId, 'player@example.com');
  });

  afterAll(async () => {
    await cleanupTestDB();
    await closeTestDB();
  });

  test('Should DELAY notification if update happens > 10 mins before start', async () => {
    const now = new Date();
    // Use an IST moment for consistency with service logic
    // Set date to tomorrow to be safe from today's time passing
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    tomorrow.setUTCHours(0, 0, 0, 0); // Start of tomorrow UTC
    
    const tournament = new Tournament({
      game: 'Free Fire',
      mode: 'BR',
      subMode: 'solo',
      entryFee: 50,
      maxPlayers: 48,
      date: tomorrow,
      startTime: '10:00 PM',
      lockTime: tomorrow,
      participants: [userId],
      status: 'upcoming'
    });
    
    // Calculate the real startDateTime for this tomorrow at 10:00 PM IST
    const startDateTime = tournamentService.calculateStartDateTime(tomorrow, '10:00 PM');
    const spy = jest.spyOn(tournamentService, 'calculateStartDateTime').mockReturnValue(startDateTime);
    
    await tournament.save();
    tournamentId = tournament._id.toString();

    const response = await request(app)
      .post(`/api/admin/tournaments/${tournamentId}/update-room`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ roomId: 'DELAYED_ROOM', password: 'PASS' });
    
    if (response.status !== 200) {
      console.log('Delayed Test Failed:', response.body);
    }
    expect(response.status).toBe(200);

    expect(response.body.data.delayed).toBe(true);

    const updatedTournament = await Tournament.findById(tournamentId);
    expect(updatedTournament.room.roomNotificationSent).toBe(false);
    expect(updatedTournament.room.roomId).toBe('DELAYED_ROOM');
    
    spy.mockRestore();
  });

  test('Should NOT delay notification if update happens < 10 mins before start', async () => {
    const now = new Date();
    // 5 minutes from now
    const fiveMinsFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    const tournament = new Tournament({
      game: 'Free Fire',
      mode: 'BR',
      subMode: 'solo',
      entryFee: 50,
      maxPlayers: 48,
      date: fiveMinsFromNow,
      startTime: '11:00 PM', // Just needs to be valid, we mock the return
      lockTime: fiveMinsFromNow,
      participants: [userId],
      status: 'upcoming'
    });
    const spy = jest.spyOn(tournamentService, 'calculateStartDateTime').mockReturnValue(fiveMinsFromNow);
    
    await tournament.save();
    const tId = tournament._id.toString();

    const response = await request(app)
      .post(`/api/admin/tournaments/${tId}/update-room`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ roomId: 'IMMEDIATE_ROOM', password: 'PASS' });
    
    if (response.status !== 200) {
      console.log('Immediate Test Failed:', response.body);
    }
    expect(response.status).toBe(200);

    expect(response.body.data.delayed).toBe(false);

    const updatedTournament = await Tournament.findById(tId);
    expect(updatedTournament.room.roomNotificationSent).toBe(true);
    
    spy.mockRestore();
  });

  test('Scheduler should publish delayed room details within 10-min window', async () => {
    // 1. Create tournament with saved room but notificationSent = false
    const startTimeMoment = new Date(Date.now() + 8 * 60 * 1000); // 8 mins in future (inside window)
    
    const tournament = new Tournament({
      game: 'Free Fire',
      mode: 'BR',
      subMode: 'solo',
      entryFee: 50,
      maxPlayers: 48,
      date: startTimeMoment,
      startTime: '2:00 PM',
      lockTime: startTimeMoment,
      participants: [userId],
      room: {
        roomId: 'SCHEDULER_ROOM',
        password: 'PASS',
        roomNotificationSent: false
      },
      status: 'upcoming'
    });
    const spy = jest.spyOn(tournamentService, 'calculateStartDateTime').mockReturnValue(startTimeMoment);
    await tournament.save();

    // 2. Call publishRoomDetails
    const notifiedCount = await tournamentService.publishRoomDetails();
    expect(notifiedCount).toBe(1);

    // 3. Verify notificationSent is now true
    const updatedTournament = await Tournament.findById(tournament._id);
    expect(updatedTournament.room.roomNotificationSent).toBe(true);
    
    spy.mockRestore();
  });

  test('Late Join: User joining 1 min before start should see room info immediately', async () => {
    const now = new Date();
    const oneMinFromNow = new Date(now.getTime() + 1 * 60 * 1000);
    
    // Create tournament that is starting soon and already has room details
    const tournament = new Tournament({
      game: 'Free Fire',
      mode: 'BR',
      subMode: 'solo',
      entryFee: 50,
      maxPlayers: 48,
      date: oneMinFromNow,
      startTime: '11:00 PM',
      lockTime: oneMinFromNow,
      participants: [],
      room: {
        roomId: 'LATE_JOIN_ROOM',
        password: 'PASS',
        roomNotificationSent: true
      },
      status: 'upcoming'
    });
    const spy = jest.spyOn(tournamentService, 'calculateStartDateTime').mockReturnValue(oneMinFromNow);
    await tournament.save();
    // 1. Join the tournament (bypass API to avoid transaction error in non-replica set test env)
    await Tournament.updateOne({ _id: tournament._id }, { $push: { participants: participantId } });

    // 2. Fetch details - should see roomId because we are within 10-min window
    const detailsResponse = await request(app)
      .get(`/api/tournament/${tournament._id}`)
      .set('Authorization', `Bearer ${participantToken}`)
      .expect(200);
    
    expect(detailsResponse.body.data.tournament.room.roomId).toBe('LATE_JOIN_ROOM');
    
    spy.mockRestore();
  });

  test('Early Join: User joining 30 mins before start should NOT see room info until 10-min mark', async () => {
    const now = new Date();
    const thirtyMinsFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    const fiveMinsFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    const tournament = new Tournament({
      game: 'Free Fire',
      mode: 'BR',
      subMode: 'solo',
      entryFee: 50,
      maxPlayers: 48,
      date: thirtyMinsFromNow,
      startTime: '11:00 PM',
      lockTime: thirtyMinsFromNow,
      participants: [],
      room: {
        roomId: 'EARLY_JOIN_ROOM',
        password: 'PASS',
        roomNotificationSent: false
      },
      status: 'upcoming'
    });
    
    // Mock calculateStartDateTime to return 30 mins in future
    const spy = jest.spyOn(tournamentService, 'calculateStartDateTime').mockReturnValue(thirtyMinsFromNow);
    await tournament.save();
    
    // 1. Join the tournament (bypass API to avoid transaction error in non-replica set test env)
    await Tournament.updateOne({ _id: tournament._id }, { $push: { participants: participantId } });

    // 2. Fetch details at T-30 - should NOT see roomId
    const earlyDetails = await request(app)
      .get(`/api/tournament/${tournament._id}`)
      .set('Authorization', `Bearer ${participantToken}`)
      .expect(200);
    
    expect(earlyDetails.body.data.tournament.room.roomId).toBeNull();
    
    // 3. Move "effective" time forward to T-5 by changing what startDateTime is returned relative to now
    spy.mockReturnValue(fiveMinsFromNow);

    // 4. Fetch details again - should NOW see roomId
    const lateDetails = await request(app)
      .get(`/api/tournament/${tournament._id}`)
      .set('Authorization', `Bearer ${participantToken}`)
      .expect(200);
    
    expect(lateDetails.body.data.tournament.room.roomId).toBe('EARLY_JOIN_ROOM');
    
    spy.mockRestore();
  });
});
