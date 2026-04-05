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
 *           description: Teams per slot (max 12 for Free Fire, 16 for BGMI per in-game match)
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
 *         slotSizes:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 2
 *           description: |
 *             Optional exact lobby sizes for this round; sum must equal team count when the round starts (e.g. semis 12+12+6 = 30).
 *             If set, `teamsPerSlot` should be max(slotSizes); qualifyPerSlot must be less than min(slotSizes).
 *         inviteSlotCaps:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 0
 *           description: Max admin invite teams per slot index (same length as slotSizes). qualified + invites per slot must not exceed game lobby cap (12 FF / 16 BGMI).
 *         inviteSlotsPerSlot:
 *           type: integer
 *           minimum: 0
 *           description: When not using slotSizes, same invite cap for every slot in this round
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
 *     RankRewardRow:
 *       type: object
 *       required: [position, amount]
 *       properties:
 *         position:
 *           type: integer
 *           minimum: 1
 *         amount:
 *           type: number
 *           minimum: 0
 *           description: Reward for this rank; rankRewards rows must sum to prizePool
 *     SponsorEntry:
 *       type: object
 *       properties:
 *         name: { type: string, maxLength: 100 }
 *         logoUrl: { type: string, maxLength: 500 }
 *         link: { type: string, maxLength: 500 }
 *     BracketAuto:
 *       type: object
 *       required: [qualifyPerSlot]
 *       description: |
 *         Auto-build rounds from maxSlots and game lobby size (Free Fire 12, BGMI 16 per match).
 *         Use with mode BR and game set. Do not send `rounds` together with bracketAuto.
 *       properties:
 *         qualifyPerSlot:
 *           type: integer
 *           minimum: 1
 *           example: 4
 *           description: Top N teams qualify from each lobby each round (must be less than lobby size)
 *         matchesPerSlot:
 *           type: integer
 *           minimum: 1
 *           default: 3
 *           description: BR matches played per lobby per round
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
 *           default: Global
 *         registrationStartDate:
 *           type: string
 *           format: date-time
 *         tournamentFormat:
 *           type: string
 *           maxLength: 120
 *         logoUrl:
 *           type: string
 *           maxLength: 500
 *         youtubeStreamUrl:
 *           type: string
 *           maxLength: 500
 *         sponsors:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SponsorEntry'
 *         rankRewardBreakdown:
 *           type: array
 *           description: Per-rank reward amounts (computed from prizeDistribution or from rankRewards at create)
 *           items:
 *             $ref: '#/components/schemas/RankRewardRow'
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
 *           description: Teams with ≥3 teammate names in roster (4+ including leader); only these enter round 1
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
 *       - Admin defines rounds (teamsPerSlot, matchesPerSlot, qualifyPerSlot per round), dates, branding, sponsors, and prize split
 *       - Either **prizeDistribution** (percent per rank) or **rankRewards** (fixed amounts summing to prizePool)
 *       - Either manual **rounds[]** or **bracketAuto** — auto plans round count, lobbies, and qualify counts from maxSlots + game (12 FF / 16 BGMI)
 *       - Default **region** is Global if omitted
 *       - LW (Lone Wolf) mode is NOT supported
 *       - Tournament is created with **registration_open**; set registration window via dates on this request. No separate call needed to start registration.
 *       - **Tournament play** (round 1 groups, schedule): after **registrationDeadline** passes, use `POST …/round/{roundNum}/start` (or rely on auto-advance when configured). Legacy **/open-registration** only for old **draft** rows.
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
 *             required: [title, mode, subMode, prizePool, maxSlots]
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
 *                 default: Global
 *                 example: Global
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
 *                 description: Max total teams allowed to register (slot layout follows round 1 teamsPerSlot)
 *               tournamentFormat:
 *                 type: string
 *                 maxLength: 120
 *                 example: "Multi-round BR slots, single final"
 *               bracketAuto:
 *                 $ref: '#/components/schemas/BracketAuto'
 *               rounds:
 *                 type: array
 *                 description: Manual round config; omit when using bracketAuto
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
 *                 description: Percent per final rank; total percent must not exceed 100. Omit if using rankRewards instead.
 *                 items:
 *                   $ref: '#/components/schemas/PrizeDistribution'
 *                 example:
 *                   - position: 1
 *                     percent: 50
 *                   - position: 2
 *                     percent: 30
 *                   - position: 3
 *                     percent: 20
 *               rankRewards:
 *                 type: array
 *                 description: Fixed reward per rank; amounts must sum exactly to prizePool (alternative to prizeDistribution)
 *                 items:
 *                   $ref: '#/components/schemas/RankRewardRow'
 *               registrationPeriodStart:
 *                 type: string
 *                 format: date-time
 *                 description: Registration window start (alias registrationStartDate)
 *               registrationPeriodEnd:
 *                 type: string
 *                 format: date-time
 *                 description: Registration window end (alias registrationDeadline)
 *               registrationStartDate:
 *                 type: string
 *                 format: date-time
 *               registrationDeadline:
 *                 type: string
 *                 format: date-time
 *               tournamentStartDate:
 *                 type: string
 *                 format: date-time
 *                 description: Tournament run start (alias scheduledDate)
 *               tournamentEndDate:
 *                 type: string
 *                 format: date-time
 *                 description: Tournament run end (alias scheduledEndDate)
 *               scheduledDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-15T00:00:00.000Z"
 *               scheduledTime:
 *                 type: string
 *                 example: "18:00"
 *               scheduledEndDate:
 *                 type: string
 *                 format: date-time
 *                 description: Tournament end date (when tournament runs till)
 *               logoUrl:
 *                 type: string
 *                 maxLength: 500
 *                 description: Tournament logo URL (upload elsewhere, pass URL here)
 *               youtubeStreamUrl:
 *                 type: string
 *                 maxLength: 500
 *                 description: Live or VOD YouTube link (optional; separate from sponsorHandles.youtube channel/handle)
 *               sponsors:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/SponsorEntry'
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
 *         description: Tournament created with registration_open; users can join per registrationStartDate/registrationDeadline
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
 *                   example: Special tournament created. Registration is open; join is allowed per registrationStartDate / registrationDeadline.
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
 *     summary: Open registration (legacy / Admin only)
 *     description: |
 *       New tournaments are created **registration_open** already — you normally skip this.
 *       Use only to flip an old **draft** tournament to open, or if status was fixed manually.
 *       If already **registration_open**, returns success (idempotent).
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
 *         description: Not draft and not already registration_open (e.g. running/completed)
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
 *       - If the round has **slotSizes** (e.g. [12,12,6]), teams are split in that order; sum(slotSizes) must equal the number of teams in the round.
 *       - **maxInvites** per slot comes from inviteSlotCaps or inviteSlotsPerSlot; admin adds teams via add-invite-team before match results.
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

/**
 * @swagger
 * /api/special-tournament/{id}/round/{roundNum}/slot/{slotIdx}/add-invite-team:
 *   post:
 *     summary: Add invite/wildcard team to a slot (Admin only)
 *     description: |
 *       Before any match result is posted for that slot. Leader must not already be in the tournament.
 *       Same roster limits as join (0–4 teammate names in `players`). Respects slot maxInvites and game lobby cap.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [leaderUserId, teamName]
 *             properties:
 *               leaderUserId:
 *                 type: string
 *               teamName:
 *                 type: string
 *               players:
 *                 type: array
 *                 maxItems: 4
 *                 items:
 *                   type: string
 *                 description: Optional; 0–4 teammate names
 *     responses:
 *       200:
 *         description: Invite added
 *       400:
 *         description: Cap reached, slot full, or match results already submitted
 */

/**
 * @swagger
 * /api/special-tournament/{id}/capacity-hints:
 *   get:
 *     summary: Admin — dynamic lobby cap & invite headroom per round
 *     description: |
 *       Uses the tournament’s **game** to derive max teams per in-game lobby (e.g. catalogue limits).
 *       For each round: shows **maxInvitesAllowed** per slot plan, whether configured caps are valid,
 *       and **phaseHint** (`semi_final_stage` for second-to-last round, `final_round` for last).
 *       Running rounds also return **liveSlots** with how many invites can still be added now.
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
 *         description: Capacity breakdown for admin UI
 *       403:
 *         description: Admin only
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
 *       **Roster:** Send `players` as 0–4 teammate names (you are the leader). Round 1 only includes teams with **≥3** teammate names (4+ players including you). Use `PATCH /api/special-tournament/{id}/team` to add names before registration ends / round 1 starts.
 *       
 *       **Real-time Updates:**
 *       After successfully joining, a WebSocket event `tournament:status-updated` is broadcast to all subscribers (`joinedTeams`, etc.).
 *       **SSE:** `GET /api/special-tournament/{id}/stream` sends `event: snapshot` on connect and `event: update` on each join — use when you prefer `EventSource` over sockets.
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
 *             required: [teamName]
 *             properties:
 *               teamName:
 *                 type: string
 *                 example: "Team Alpha"
 *               players:
 *                 type: array
 *                 maxItems: 4
 *                 items:
 *                   type: string
 *                 example: ["Player1", "Player2", "Player3"]
 *                 description: 0–4 teammate names; need ≥3 for round 1 slot eligibility
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
 *                     roster:
 *                       type: object
 *                       properties:
 *                         teammateNamesCount:
 *                           type: integer
 *                         isEligibleForRound1:
 *                           type: boolean
 *                         teammatesNeededForRound1:
 *                           type: integer
 *       400:
 *         description: Already registered, tournament full, registration not open, or registration deadline passed
 */

/**
 * @swagger
 * /api/special-tournament/{id}/team:
 *   patch:
 *     summary: Update team roster (leader only, during registration)
 *     description: |
 *       Replace the list of teammate names (0–4). Same rules as join: round 1 uses only teams with ≥3 teammate names.
 *       Only while `registration_open` and within the registration window.
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
 *             properties:
 *               players:
 *                 type: array
 *                 maxItems: 4
 *                 items:
 *                   type: string
 *                 example: ["P1", "P2", "P3"]
 *     responses:
 *       200:
 *         description: Roster updated
 *       400:
 *         description: Not a leader, wrong status, or deadline passed
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
 *     description: |
 *       Paginated list with optional filters.
 *       **Non-admin:** `draft` never appears. `registration_open` rows appear only after `registrationStartDate` (if set) — same moment users can join. Admins see all statuses and scheduled registrations.
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
 * /api/special-tournament/{id}/stream:
 *   get:
 *     summary: SSE — live join count and status for this special tournament
 *     description: |
 *       Server-Sent Events. On connect: `event: snapshot` with `joinedTeams`, `status`, `maxSlots`, `title`.
 *       After each successful `POST …/join`, subscribers receive `event: update` with the same fields
 *       (aligns with WebSocket `tournament:status-updated` for `isSpecial` clients).
 *       Auth: `Authorization: Bearer` or query `access_token` (browser `EventSource` cannot send Bearer).
 *     tags: [Special Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: access_token
 *         required: false
 *         schema:
 *           type: string
 *         description: JWT when Authorization header cannot be set (e.g. browser EventSource)
 *     produces:
 *       - text/event-stream
 *     responses:
 *       200:
 *         description: text/event-stream — events `snapshot`, `update`, `error`
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       401:
 *         description: Missing or invalid token
 */

/**
 * @swagger
 * /api/special-tournament/{id}:
 *   get:
 *     summary: Get tournament details
 *     description: |
 *       Get full tournament details. After **join**, call this again (or rely on join response) to refresh UI.
 *       - Admin sees all rounds, slots, match results, and team lists
 *       - Regular users: `isParticipant`, **`myTeam`** (leader’s squad + round-1 eligibility), `bracketOutline`, `eligibleTeamCount`, `participantCount`, `userSlotInfo` when a round is running (room/password)
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
 *                             myTeam:
 *                               type: object
 *                               nullable: true
 *                               description: Set when the current user is the registered leader — teamName, teammate names, and whether the squad is eligible for round 1
 *                               properties:
 *                                 teamName:
 *                                   type: string
 *                                 players:
 *                                   type: array
 *                                   items:
 *                                     type: string
 *                                 teammateNamesCount:
 *                                   type: integer
 *                                 isEligibleForRound1:
 *                                   type: boolean
 *                                 teammatesNeededForRound1:
 *                                   type: integer
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
