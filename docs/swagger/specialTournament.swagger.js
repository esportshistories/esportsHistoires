/**
 * @swagger
 * tags:
 *   name: Special Tournament
 *   description: Sponsored/special multi-round tournaments (free entry, fixed prize pool, no LW mode)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RoundConfig:
 *       type: object
 *       required: [roundNumber, teamsPerSlot, matchesPerSlot, qualifyPerSlot]
 *       properties:
 *         roundNumber:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *         roundName:
 *           type: string
 *           example: "Round 1"
 *         teamsPerSlot:
 *           type: integer
 *           minimum: 2
 *           example: 12
 *           description: How many teams are grouped into each slot
 *         matchesPerSlot:
 *           type: integer
 *           minimum: 1
 *           example: 3
 *           description: How many BR matches are played inside each slot
 *         qualifyPerSlot:
 *           type: integer
 *           minimum: 1
 *           example: 6
 *           description: Top N teams that qualify from each slot to the next round
 *     PrizeDistribution:
 *       type: object
 *       properties:
 *         position:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *         percent:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           example: 50
 *           description: Percentage of prizePool for this position
 *     SpecialTournament:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         tournamentType:
 *           type: string
 *           example: sponsored
 *         title:
 *           type: string
 *           example: "BooyahX Grand Championship"
 *         game:
 *           type: string
 *           example: FreeFire
 *         mode:
 *           type: string
 *           enum: [BR, CS]
 *         subMode:
 *           type: string
 *           enum: [solo, duo, squad, 1v1, 2v2, 4v4]
 *         region:
 *           type: string
 *           enum: [Asia, Global]
 *         prizePool:
 *           type: number
 *           example: 5000
 *           description: Fixed prize pool in GC (admin-sponsored)
 *         prizeDistribution:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PrizeDistribution'
 *         maxSlots:
 *           type: integer
 *           example: 180
 *           description: Maximum total teams allowed to register
 *         status:
 *           type: string
 *           enum: [draft, registration_open, running, completed, cancelled]
 *         participantCount:
 *           type: integer
 *         rounds:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RoundConfig'
 *         scheduledDate:
 *           type: string
 *           format: date-time
 *         scheduledTime:
 *           type: string
 *           example: "18:00"
 *         scheduledEndDate:
 *           type: string
 *           format: date-time
 *           description: Tournament end date
 *         formatLabel:
 *           type: string
 *           maxLength: 200
 *           description: Admin-defined format label (e.g. "12 teams per lobby, top 2 qualify")
 *         sponsorHandles:
 *           type: object
 *           description: Sponsor social handles (Instagram, Discord, YouTube, Telegram, WhatsApp)
 *           properties:
 *             instagram: { type: string }
 *             discord: { type: string }
 *             youtube: { type: string }
 *             telegram: { type: string }
 *             whatsapp: { type: string }
 *         declaredFinalRanking:
 *           type: array
 *           description: Admin/host-declared final ranking (position → teamName). Used by distribute-rewards when set.
 *           items:
 *             type: object
 *             properties:
 *               position: { type: integer, minimum: 1 }
 *               teamName: { type: string }
 *         rewardsDistributed:
 *           type: boolean
 *         eligibleTeamCount:
 *           type: integer
 *           description: Teams with 4+ players (only these appear in list and round 1)
 *         createdAt:
 *           type: string
 *           format: date-time
 */

// ---------------------------------------------------------------------------
// Admin: Create
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/create:
 *   post:
 *     summary: Create a sponsored tournament (Admin only)
 *     description: |
 *       Creates a new special/sponsored tournament with free entry and a fixed prize pool.
 *       - Entry fee is always 0 — no GC is deducted from users
 *       - Admin defines rounds config, prize pool, and prize distribution
 *       - LW (Lone Wolf) mode is NOT supported
 *       - Tournament starts in 'draft' status; use /open-registration to accept participants
 *
 *       **Example: 180 Teams, 5000 GC Prize Pool**
 *       ```
 *       Round 1: 180 teams → 15 slots × 12 teams/slot, 3 matches, top 6 qualify → 90 advance
 *       Round 2: 90 teams → 10 slots × 9 teams/slot, 3 matches, top 3 qualify → 30 advance
 *       Semi Final: 30 teams → 5 slots × 6 teams/slot, 3 matches, top 2 qualify → 10 advance
 *       Final: 10 teams → 1 slot × 10 teams, 3 matches → winners paid
 *       ```
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, mode, subMode, prizePool, maxSlots, rounds]
 *             properties:
 *               title:
 *                 type: string
 *                 example: "BooyahX Grand Championship Season 1"
 *               game:
 *                 type: string
 *                 example: FreeFire
 *               mode:
 *                 type: string
 *                 enum: [BR, CS]
 *                 example: BR
 *               subMode:
 *                 type: string
 *                 enum: [solo, duo, squad, 1v1, 2v2, 4v4]
 *                 example: squad
 *               region:
 *                 type: string
 *                 enum: [Asia, Global]
 *                 example: Asia
 *               lobbyName:
 *                 type: string
 *                 example: "BX Grand Champ S1"
 *               prizePool:
 *                 type: number
 *                 example: 5000
 *                 description: Fixed prize pool in GC (admin pays)
 *               maxSlots:
 *                 type: integer
 *                 example: 180
 *                 description: Max total teams allowed to register
 *               rounds:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/RoundConfig'
 *                 example:
 *                   - roundNumber: 1
 *                     roundName: "Round 1"
 *                     teamsPerSlot: 12
 *                     matchesPerSlot: 3
 *                     qualifyPerSlot: 6
 *                   - roundNumber: 2
 *                     roundName: "Round 2"
 *                     teamsPerSlot: 9
 *                     matchesPerSlot: 3
 *                     qualifyPerSlot: 3
 *                   - roundNumber: 3
 *                     roundName: "Final"
 *                     teamsPerSlot: 10
 *                     matchesPerSlot: 3
 *                     qualifyPerSlot: 1
 *               prizeDistribution:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/PrizeDistribution'
 *                 example:
 *                   - position: 1
 *                     percent: 50
 *                   - position: 2
 *                     percent: 30
 *                   - position: 3
 *                     percent: 20
 *               scheduledDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-15T00:00:00.000Z"
 *               scheduledTime:
 *                 type: string
 *                 example: "18:00"
 *               registrationDeadline:
 *                 type: string
 *                 format: date-time
 *               scheduledEndDate:
 *                 type: string
 *                 format: date-time
 *                 description: Tournament end date (when tournament runs till)
 *               description:
 *                 type: string
 *                 example: "Grand championship with 5000 GC prize pool"
 *               formatLabel:
 *                 type: string
 *                 maxLength: 200
 *                 example: "12 teams per lobby, top 2 qualify"
 *                 description: Admin-defined format label shown to users
 *               sponsorHandles:
 *                 type: object
 *                 description: Sponsor social handles for users to follow (Instagram, Discord, etc.)
 *                 properties:
 *                   instagram: { type: string, maxLength: 200 }
 *                   discord: { type: string, maxLength: 200 }
 *                   youtube: { type: string, maxLength: 200 }
 *                   telegram: { type: string, maxLength: 200 }
 *                   whatsapp: { type: string, maxLength: 200 }
 *     responses:
 *       201:
 *         description: Tournament created in draft status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Special tournament created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournament:
 *                       $ref: '#/components/schemas/SpecialTournament'
 *       400:
 *         description: Validation error
 *       403:
 *         description: Admin access required
 */

// ---------------------------------------------------------------------------
// Admin: Open registration
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/open-registration:
 *   post:
 *     summary: Open registration for a tournament (Admin only)
 *     description: Changes tournament status from 'draft' to 'registration_open'. Users can then join for free.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Registration opened
 *       400:
 *         description: Tournament not in draft status
 *       403:
 *         description: Admin access required
 */

// ---------------------------------------------------------------------------
// Admin: Cancel
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/cancel:
 *   post:
 *     summary: Cancel a special tournament (Admin only)
 *     description: Cancels the tournament. Since entry is free, no refunds are needed.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Insufficient registrations"
 *     responses:
 *       200:
 *         description: Tournament cancelled
 *       403:
 *         description: Admin access required
 */

// ---------------------------------------------------------------------------
// Admin: Start round
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/round/{roundNum}/start:
 *   post:
 *     summary: Start a round — auto-assign teams to slots (Admin only)
 *     description: |
 *       Starts a round by auto-assigning teams into slots of `teamsPerSlot`.
 *       - Round 1: uses all registered participants
 *       - Round 2+: uses qualifiedTeams from all completed slots of the previous round
 *       - Teams are randomly shuffled before assignment
 *       - If teams don't divide evenly, the last slot gets fewer teams
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roundNum
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         example: 1
 *     responses:
 *       200:
 *         description: Round started, teams assigned to slots
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     roundNumber:
 *                       type: integer
 *                     totalSlots:
 *                       type: integer
 *                       example: 15
 *                     teamsPerSlot:
 *                       type: integer
 *                     matchesPerSlot:
 *                       type: integer
 *                     qualifyPerSlot:
 *                       type: integer
 *                     slots:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           slotIndex:
 *                             type: integer
 *                           teamCount:
 *                             type: integer
 *                           teams:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 teamName:
 *                                   type: string
 *       400:
 *         description: Round already started or previous round not completed
 *       403:
 *         description: Admin access required
 */

// ---------------------------------------------------------------------------
// Admin: Assign host to slot
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/round/{roundNum}/slot/{slotIdx}/assign-host:
 *   post:
 *     summary: Assign a host to a slot (Admin only)
 *     description: Assigns a host user to a specific slot. The host can then update room info and submit match results.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roundNum
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: slotIdx
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hostUserId]
 *             properties:
 *               hostUserId:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Host assigned
 *       403:
 *         description: Admin access required
 */

// ---------------------------------------------------------------------------
// Admin: Declare final ranking
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/declare-final-ranking:
 *   post:
 *     summary: Declare final ranking (Admin only)
 *     description: |
 *       Set the final winner list by rank (e.g. as declared by host). Call **before** distribute-rewards.
 *       If set, distribute-rewards uses this order instead of auto-aggregated standings.
 *       Only allowed when tournament status is 'completed' and rewards not yet distributed.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ranking]
 *             properties:
 *               ranking:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [position, teamName]
 *                   properties:
 *                     position:
 *                       type: integer
 *                       minimum: 1
 *                       example: 1
 *                     teamName:
 *                       type: string
 *                       maxLength: 50
 *                       example: "Team Alpha"
 *                 example:
 *                   - position: 1
 *                     teamName: "Team Alpha"
 *                   - position: 2
 *                     teamName: "Team Beta"
 *                   - position: 3
 *                     teamName: "Team Gamma"
 *     responses:
 *       200:
 *         description: Final ranking declared
 *       400:
 *         description: Tournament not completed or rewards already distributed
 *       403:
 *         description: Admin access required
 */

// ---------------------------------------------------------------------------
// Admin: Distribute rewards
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/distribute-rewards:
 *   post:
 *     summary: Distribute prize pool to winners (Admin only)
 *     description: |
 *       After all rounds are completed, admin distributes the fixed prize pool to winners.
 *       - If `declaredFinalRanking` was set (via declare-final-ranking), uses that order; otherwise uses final round standings
 *       - Prize distributed based on `prizeDistribution` config (position → percent of prizePool)
 *       - GC is credited to winners' wallets via `addBalance` (admin-sponsored)
 *       - Can only be called once per tournament
 *
 *       Example: prizePool=5000, prizeDistribution=[{position:1,percent:50},{position:2,percent:30},{position:3,percent:20}]
 *       → 1st gets 2500 GC, 2nd gets 1500 GC, 3rd gets 1000 GC
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Rewards distributed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     prizePool:
 *                       type: number
 *                       example: 5000
 *                     winners:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           teamName:
 *                             type: string
 *                           position:
 *                             type: integer
 *                           rewardINR:
 *                             type: number
 *       400:
 *         description: Tournament not completed or rewards already distributed
 *       403:
 *         description: Admin access required
 */

// ---------------------------------------------------------------------------
// Host: Update slot room
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/round/{roundNum}/slot/{slotIdx}/room:
 *   post:
 *     summary: Set room ID and password for a slot (Host only)
 *     description: Assigned host sets the in-game room ID and password for their slot.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roundNum
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: slotIdx
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roomId]
 *             properties:
 *               roomId:
 *                 type: string
 *                 example: "7845231"
 *               password:
 *                 type: string
 *                 example: "abc123"
 *     responses:
 *       200:
 *         description: Room info updated
 *       403:
 *         description: Not the assigned host for this slot
 */

// ---------------------------------------------------------------------------
// Host: Submit match result
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/round/{roundNum}/slot/{slotIdx}/match-result:
 *   post:
 *     summary: Submit one match result for a slot (Host only)
 *     description: |
 *       Host submits results for one BR match within the slot. Can be called multiple times
 *       (once per match). matchIndex is 0-based (0 = match 1, 1 = match 2, etc.).
 *       Points are auto-calculated: positionPoints (from POSITION_POINTS_TABLE) + kills.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roundNum
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: slotIdx
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [matchIndex, teams]
 *             properties:
 *               matchIndex:
 *                 type: integer
 *                 minimum: 0
 *                 example: 0
 *                 description: 0-based match index (0=match1, 1=match2, 2=match3)
 *               teams:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [teamName, position, kills]
 *                   properties:
 *                     teamName:
 *                       type: string
 *                       example: "Team Alpha"
 *                     position:
 *                       type: integer
 *                       minimum: 1
 *                       example: 1
 *                     kills:
 *                       type: integer
 *                       minimum: 0
 *                       example: 5
 *     responses:
 *       200:
 *         description: Match result submitted. Returns updated standings.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     matchResults:
 *                       type: array
 *                     standings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           teamName:
 *                             type: string
 *                           totalPoint:
 *                             type: number
 *                           kills:
 *                             type: integer
 *                           booyah:
 *                             type: integer
 *                           position:
 *                             type: integer
 *       403:
 *         description: Not the assigned host for this slot
 */

// ---------------------------------------------------------------------------
// Host: Submit final result
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/round/{roundNum}/slot/{slotIdx}/final-result:
 *   post:
 *     summary: Submit final result for a slot (Host only)
 *     description: |
 *       After all matches are submitted, host finalizes the slot. The system:
 *       1. Aggregates all match results and computes final standings
 *       2. Auto-qualifies top `qualifyPerSlot` teams
 *       3. Marks slot as completed
 *       4. If all slots in the round are done, marks round as completed
 *       5. If this was the final round, marks tournament as completed
 *
 *       All match results must be submitted before calling this endpoint.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roundNum
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: slotIdx
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *     responses:
 *       200:
 *         description: Slot finalized and teams qualified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     roundNumber:
 *                       type: integer
 *                     slotIndex:
 *                       type: integer
 *                     qualifiedCount:
 *                       type: integer
 *                       example: 6
 *                     standings:
 *                       type: array
 *                     qualifiedTeamUserIds:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Not all match results submitted
 *       403:
 *         description: Not the assigned host for this slot
 */

// ---------------------------------------------------------------------------
// User: Join
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/join:
 *   post:
 *     summary: Join a special tournament (free entry)
 *     description: |
 *       Register for a sponsored tournament. Entry is completely free — no GC is deducted.
 *       Tournament must be in 'registration_open' status.
 *       
 *       **Real-time Updates:**
 *       After successfully joining, a WebSocket event `tournament:status-updated` is broadcasted to all subscribers.
 *       The event includes `joinedTeams` count which updates in real-time. Subscribe via `subscribe:tournament` or `subscribe:user-tournaments` to receive updates.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [teamName, players]
 *             properties:
 *               teamName:
 *                 type: string
 *                 example: "Team Alpha"
 *               players:
 *                 type: array
 *                 minItems: 3
 *                 maxItems: 4
 *                 items:
 *                   type: string
 *                 example: ["Player1", "Player2", "Player3"]
 *                 description: 3 or 4 player names (4 or 5 total with leader). 4 compulsory, max 5. Only complete teams appear in list and round 1.
 *     responses:
 *       200:
 *         description: Successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                     title:
 *                       type: string
 *                     status:
 *                       type: string
 *                     participantCount:
 *                       type: integer
 *                     maxSlots:
 *                       type: integer
 *       400:
 *         description: Already registered, tournament full, registration not open, or registration deadline passed
 */

// ---------------------------------------------------------------------------
// Admin: Update tournament config (PATCH)
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/config:
 *   patch:
 *     summary: Update tournament config (Admin only)
 *     description: |
 *       Update tournament settings. Round config (matchesPerSlot, teamsPerSlot, qualifyPerSlot, roundName)
 *       can be changed only for rounds that are still **pending** (not yet started). Admin decides kitne round
 *       kitne match — kabhi bhi change kar sakte hai for pending rounds.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxSlots:
 *                 type: integer
 *                 minimum: 2
 *                 description: Can only increase (not below current participants)
 *               prizePool:
 *                 type: number
 *                 minimum: 1
 *               prizeDistribution:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/PrizeDistribution'
 *               title:
 *                 type: string
 *                 maxLength: 100
 *               lobbyName:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               scheduledDate:
 *                 type: string
 *                 format: date-time
 *               scheduledTime:
 *                 type: string
 *               scheduledEndDate:
 *                 type: string
 *                 format: date-time
 *               registrationDeadline:
 *                 type: string
 *                 format: date-time
 *               formatLabel:
 *                 type: string
 *                 maxLength: 200
 *               sponsorHandles:
 *                 type: object
 *                 properties:
 *                   instagram: { type: string, maxLength: 200 }
 *                   discord: { type: string, maxLength: 200 }
 *                   youtube: { type: string, maxLength: 200 }
 *                   telegram: { type: string, maxLength: 200 }
 *                   whatsapp: { type: string, maxLength: 200 }
 *               rounds:
 *                 type: array
 *                 description: Update round config (only pending rounds). Admin can change matchesPerSlot etc. anytime for pending rounds.
 *                 items:
 *                   type: object
 *                   required: [roundNumber]
 *                   properties:
 *                     roundNumber:
 *                       type: integer
 *                       minimum: 1
 *                     roundName:
 *                       type: string
 *                       maxLength: 100
 *                     teamsPerSlot:
 *                       type: integer
 *                       minimum: 2
 *                     matchesPerSlot:
 *                       type: integer
 *                       minimum: 1
 *                       description: How many matches in this round (admin decides)
 *                     qualifyPerSlot:
 *                       type: integer
 *                       minimum: 1
 *     responses:
 *       200:
 *         description: Config updated. If rounds were updated, event includes rounds in payload.
 *       400:
 *         description: Validation error or round already started
 *       403:
 *         description: Admin access required
 */

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/list:
 *   get:
 *     summary: List special tournaments
 *     description: Get paginated list of special/sponsored tournaments with optional filters.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, registration_open, running, completed, cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [BR, CS]
 *         description: Filter by mode
 *       - in: query
 *         name: subMode
 *         schema:
 *           type: string
 *           enum: [solo, duo, squad, 1v1, 2v2, 4v4]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: List retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournaments:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SpecialTournament'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalItems:
 *                           type: integer
 *                         hasNextPage:
 *                           type: boolean
 *                         hasPrevPage:
 *                           type: boolean
 */

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}:
 *   get:
 *     summary: Get tournament details
 *     description: |
 *       Get full tournament details.
 *       - Admin sees all rounds, slots, match results, and team lists
 *       - Regular users see a safe view with their slot/room info if in a running round
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tournament details retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournament:
 *                       allOf:
 *                         - $ref: '#/components/schemas/SpecialTournament'
 *                         - type: object
 *                           properties:
 *                             isParticipant:
 *                               type: boolean
 *                             userSlotInfo:
 *                               type: object
 *                               nullable: true
 *                               description: The user's current slot/room info (null if not in a running round)
 *                               properties:
 *                                 roundNumber:
 *                                   type: integer
 *                                 roundName:
 *                                   type: string
 *                                 slotIndex:
 *                                   type: integer
 *                                 room:
 *                                   type: object
 *                                   properties:
 *                                     roomId:
 *                                       type: string
 *                                     password:
 *                                       type: string
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/special-tournament/{id}/admin-report:
 *   get:
 *     summary: Get full admin report (Admin only)
 *     description: |
 *       Returns full results for dashboard: every round, every slot (lobby), match results,
 *       standings per slot, and qualified teams. Use this so admin can see "har lobby ka result".
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Admin report with tournament summary, roundsReport (per-slot standings), registeredTeams
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournament:
 *                       type: object
 *                       description: Summary fields (title, status, prizePool, participantCount, etc.)
 *                     roundsReport:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           roundNumber:
 *                             type: integer
 *                           roundName:
 *                             type: string
 *                           slots:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 slotIndex:
 *                                   type: integer
 *                                 standings:
 *                                   type: array
 *                                 matchResults:
 *                                   type: array
 *                                 qualifiedTeamNames:
 *                                   type: array
 *                                   items:
 *                                     type: string
 *                     registeredTeams:
 *                       type: array
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Tournament not found
 */

// ---------------------------------------------------------------------------
// Live results for a slot
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/special-tournament/{id}/round/{roundNum}/slot/{slotIdx}/live-results:
 *   get:
 *     summary: Get live standings for a slot
 *     description: Get current match results and standings for a specific slot in a round.
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roundNum
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: slotIdx
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *     responses:
 *       200:
 *         description: Live results retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     roundNumber:
 *                       type: integer
 *                     slotIndex:
 *                       type: integer
 *                     matchesPerSlot:
 *                       type: integer
 *                     qualifyPerSlot:
 *                       type: integer
 *                     slotStatus:
 *                       type: string
 *                       enum: [pending, running, completed]
 *                     matchResultsCount:
 *                       type: integer
 *                     matchResults:
 *                       type: array
 *                     standings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           teamName:
 *                             type: string
 *                           totalPoint:
 *                             type: number
 *                           kills:
 *                             type: integer
 *                           booyah:
 *                             type: integer
 *                           position:
 *                             type: integer
 */
