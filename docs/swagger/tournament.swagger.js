/**
 * @swagger
* /api/tournament/list:
*   get:
*     summary: Get tournaments by status with lobby rules
*     description: Retrieve tournaments filtered by status (upcoming, live, completed, pendingResult) along with FreeFire paid lobby rules. Shows joined count and available slots. Use status query parameter to filter by upcoming, live, completed, or pendingResult tournaments.
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, live, completed, pendingResult, cancelled]
 *           default: upcoming
 *         example: upcoming
 *         description: Filter tournaments by status (upcoming, live, completed, or pendingResult). pendingResult shows tournaments that have ended but results are not yet published.
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *           example: '2025-12-04'
 *         description: Filter tournaments by specific date (YYYY-MM-DD). Shows tournaments for that day only.
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *           example: '2025-12-01'
 *         description: Filter tournaments from this date onwards (for upcoming only)
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *           example: '2025-12-31'
 *         description: Filter tournaments up to this date (used with fromDate for date range)
 *       - in: query
 *         name: subMode
 *         schema:
 *           type: string
 *           enum: [solo, duo, squad, 1v1, 2v2, 4v4]
 *           example: squad
 *         description: Filter tournaments by subMode (solo, duo, squad for BR/LW, 1v1, 2v2, 4v4 for CS)
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [CS, BR, LW]
 *           example: BR
 *         description: Optional. Filter by game mode (BR, CS, LW). If omitted, all modes are returned.
 *     responses:
 *       200:
 *         description: Tournaments and rules retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tournaments retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournaments:
 *                       type: array
 *                       items:
 *                         allOf:
 *                           - $ref: '#/components/schemas/Tournament'
 *                           - type: object
 *                             properties:
 *                               joinedTeams:
 *                                 type: number
 *                                 description: Number of teams joined
 *                               availableTeams:
 *                                 type: number
 *                                 description: Available teams remaining
 *                               joinedTeamsList:
 *                                 type: array
 *                                 description: List of team names that have joined (visible to host & users)
 *                                 items:
 *                                   type: object
 *                                   properties:
 *                                     teamName:
 *                                       type: string
 *                                       example: Thunder Squad
 *                                     leaderUserId:
 *                                       type: string
 *                                       example: 6944fd3b148e702f214a7e29
 *                                     playerCount:
 *                                       type: number
 *                                       example: 4
 *                               room:
 *                                 type: object
 *                                 properties:
 *                                   roomId:
 *                                     type: string
 *                                     nullable: true
 *                                   password:
 *                                     type: string
 *                                     nullable: true
 *                     total:
 *                       type: number
 *                     filters:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         date:
 *                           type: string
 *                           nullable: true
 *                         subMode:
 *                           type: string
 *                           nullable: true
 *                         mode:
 *                           type: string
 *                           nullable: true
 *                     rules:
 *                       type: object
 *                       description: FreeFire paid lobby rules organized by game mode (BR, CS, LW) and sub-mode
 *                       properties:
 *                         BR:
 *                           type: object
 *                           properties:
 *                             solo:
 *                               type: object
 *                             duo:
 *                               type: object
 *                             squad:
 *                               type: object
 *                         CS:
 *                           type: object
 *                           properties:
 *                             '1v1':
 *                               type: object
 *                             '2v2':
 *                               type: object
 *                         LW:
 *                           type: object
 *                           properties:
 *                             solo:
 *                               type: object
 *                             duo:
 *                               type: object
 *                             squad:
 *                               type: object
 *                         generalRules:
 *                           type: array
 *                           items:
 *                             type: string
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/tournament/list/stream:
 *   get:
 *     summary: Stream tournament list updates via Server-Sent Events (SSE)
 *     description: |
 *       Real-time lobby **list** patches (join slots + new lobbies). Scope = same `game` filter as list API (comma-separated titles allowed).
 *
 *       **Auth (browser EventSource):** native `EventSource` cannot send `Authorization`. Use query param `access_token=<JWT>` or a fetch-based SSE client with `Authorization: Bearer`.
 *
 *       **Flow:** `GET /api/tournament/list?game=...` for initial rows, then open this stream with the same `game` value.
 *
 *       **Events** (`event: update`):
 *       - `type: 'slots'` — someone joined / slot count changed. Payload includes `tournamentId`, `game`, `participantCount`, `maxPlayers`.
 *       - `type: 'created'` — admin created lobby(ies). Payload includes `tournamentId`, `game`, `mode`, `subMode`, `date`, `startTime`, `entryFee`, `maxPlayers`, `maxTeams`, `playersPerTeam`, `status`, `region`, `lobbyName`, `participantCount`, `prizePool`.
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: game
 *         required: true
 *         schema:
 *           type: string
 *         example: BGMI
 *         description: Same as list API — one or comma-separated catalogue titles; only matching games receive events.
 *       - in: query
 *         name: access_token
 *         required: false
 *         schema:
 *           type: string
 *         description: JWT when Authorization header cannot be set (browser EventSource).
 *     responses:
 *       200:
 *         description: text/event-stream (SSE)
 *       400:
 *         description: Missing or invalid game query
 *       401:
 *         description: Unauthorized / missing token
 *       403:
 *         description: Email not verified
 */

/**
 * @swagger
 * /api/tournament/joined:
 *   get:
 *     summary: Get tournaments joined by user
 *     description: Retrieve all tournaments that the authenticated user has joined
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tournaments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tournaments retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournaments:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Tournament'
 *                     total:
 *                       type: number
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/tournament/userHistory:
 *   get:
 *     summary: Get user's tournament history (full data after host submits final result)
 *     description: |
 *       Retrieve tournaments the user participated in - only those where host has submitted final result (status completed).
 *       Returns full data: user's rank (myResult), own team (myTeam), all teams' standings, match-by-match results.
 *       Filters: date range (fromDate, toDate), mode (BR, CS, LW), win (only top-3 finishes where user got reward).
 *       Sorted by date (most recent first).
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [BR, CS, LW]
 *           example: BR
 *         description: Filter by game mode (Battle Royale, Clash Squad, Lone Wolf).
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *           example: '2026-01-01'
 *         description: Filter tournaments from this date (YYYY-MM-DD). Inclusive.
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *           example: '2026-01-31'
 *         description: Filter tournaments up to this date (YYYY-MM-DD). Inclusive.
 *       - in: query
 *         name: win
 *         schema:
 *           type: string
 *           enum: [true, false, '1', '0']
 *           example: 'true'
 *         description: If true, only return tournaments where user finished in top 3 (got reward by position).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *           example: 50
 *         description: Maximum number of tournaments to return (default 50, max 100)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *           example: 0
 *         description: Number of tournaments to skip for pagination
 *     responses:
 *       200:
 *         description: Tournament history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tournament history retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     history:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             description: Tournament ID
 *                           game:
 *                             type: string
 *                             example: Free Fire
 *                           mode:
 *                             type: string
 *                             example: BR
 *                           subMode:
 *                             type: string
 *                             example: squad
 *                           date:
 *                             type: string
 *                             format: date-time
 *                           startTime:
 *                             type: string
 *                             example: 9:00 PM
 *                           status:
 *                             type: string
 *                             example: completed
 *                           lobbyName:
 *                             type: string
 *                           entryFee:
 *                             type: number
 *                           prizePool:
 *                             type: number
 *                           joinedTeams:
 *                             type: number
 *                           myResult:
 *                             type: object
 *                             nullable: true
 *                             description: User's result (null if tournament not completed or user not in top 3)
 *                             properties:
 *                               position:
 *                                 type: number
 *                                 description: Final position (1, 2, 3...)
 *                               kills:
 *                                 type: number
 *                               rewardGC:
 *                                 type: number
 *                                 description: Reward amount in GC
 *                               claimed:
 *                                 type: boolean
 *                                 description: Whether reward was claimed
 *                           myTeam:
 *                             type: string
 *                             nullable: true
 *                             description: User's team name
 *                     total:
 *                       type: number
 *                       description: Total count of tournaments user participated in (within date range if applied)
 *                     limit:
 *                       type: number
 *                     offset:
 *                       type: number
 *                     fromDate:
 *                       type: string
 *                       nullable: true
 *                       description: Filter applied (YYYY-MM-DD)
 *                     toDate:
 *                       type: string
 *                       nullable: true
 *                       description: Filter applied (YYYY-MM-DD)
 *       400:
 *         description: Bad request - invalid date format or fromDate > toDate
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/tournament/my-lobbies:
 *   get:
 *     summary: Get user's lobbies (joined tournaments grouped by status)
 *     description: Retrieve tournaments joined by user, grouped by status (upcoming, live, resultPending, completed) for lobby section. Shows all tournaments user has joined, organized by their current status.
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lobbies retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tournaments retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     lobbies:
 *                       type: object
 *                       properties:
 *                         upcoming:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Tournament'
 *                           description: Tournaments that are upcoming or locked (join allowed)
 *                         live:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Tournament'
 *                           description: Tournaments currently running (join not allowed)
 *                         resultPending:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Tournament'
 *                           description: Tournaments that have ended but results are not yet published
 *                         completed:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Tournament'
 *                           description: Tournaments with results published
 *                     total:
 *                       type: number
 *                       description: Total number of tournaments
 *                     counts:
 *                       type: object
 *                       properties:
 *                         upcoming:
 *                           type: number
 *                           description: Count of upcoming tournaments
 *                         live:
 *                           type: number
 *                           description: Count of live tournaments
 *                         resultPending:
 *                           type: number
 *                           description: Count of tournaments with pending results
 *                         completed:
 *                           type: number
 *                           description: Count of completed tournaments
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/tournament/{tournamentId}:
 *   get:
 *     summary: Get tournament details
 *     description: Retrieve detailed information about a specific tournament
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tournament ID
 *     responses:
 *       200:
 *         description: Tournament details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tournament details retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournament:
 *                       $ref: '#/components/schemas/Tournament'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/tournament/join:
 *   post:
 *     summary: Join tournament (with atomic transaction safety)
 *     description: |
 *       Join a tournament as team leader: wallet entry fee is deducted and you are added to participants.
 *
 *       **Game match (followed games):**
 *       If the user has set followed games on their profile, the tournament's `game` must match one of those followed titles (same catalogue as profile). If no followed games are set, join is still allowed (legacy behaviour). Otherwise the API returns 400 with a message like: `Add "<Game Title>" to your followed games in profile to join this lobby`.
 *
 *       **IMPORTANT - Transaction Safety:**
 *       MongoDB transactions (when the deployment supports them) ensure wallet deduction and tournament join succeed or fail together; if either step fails, both roll back.
 *
 *       **Requirements:**
 *       - Sufficient GC balance for `entryFee`
 *       - Tournament status `upcoming` or `locked`
 *       - Slots available; user not already a participant
 *       - Join allowed until the scheduled start time (join closes when the lobby goes live, not X minutes early)
 *       - Optional `players` list: CS uses up to 4 names per team; BR/LW up to 5; org BR squad may require 4–5 total players
 *
 *       **After join:**
 *       Response includes `rules` (mode/subMode/game-specific lobby rules). Slot updates for tournament list UIs may be pushed via SSE (`tournament-list` stream) with minimal payload; WebSocket tournament subscriptions may also reflect status where applicable.
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/JoinTournamentRequest'
 *     responses:
 *       200:
 *         description: Successfully joined tournament
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Successfully joined tournament
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                     entryFee:
 *                       type: number
 *                     rules:
 *                       type: object
 *                       description: Filtered lobby rules for this tournament (mode, subMode, game-specific labels, rule text, generalRules)
 *       400:
 *         description: Bad request (game not in followed games, insufficient balance, locked, already joined, full, started, past date, invalid team size for org squad, validation error)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/tournament/join-team:
 *   post:
 *     summary: Update team roster (bando) after joining
 *     description: |
 *       For users who already joined as team leader via `POST /api/tournament/join`. Updates the leader's team name match and `players` list (teammate IGNs). Same body shape as join: `tournamentId`, `teamName`, optional `players`.
 *       Allowed while tournament is `upcoming`, `locked`, or `running`. Does not deduct wallet. CS/BR/LW and org BR squad player-count rules match join.
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/JoinTournamentRequest'
 *     responses:
 *       200:
 *         description: Team roster updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Team updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                     teamName:
 *                       type: string
 *                     playerCount:
 *                       type: number
 *       400:
 *         description: Bad request (not a leader in this tournament, invalid status, org squad size, validation)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/tournament/{tournamentId}/chat:
 *   get:
 *     summary: Get lobby chat history
 *     description: |
 *       Returns chat messages for a live tournament lobby. Only participants and assigned host can access.
 *       Chat is stored in DB only while lobby is live. When tournament is completed/cancelled, chat data is cleared from DB.
 *       Use with WebSocket `subscribe:lobby-chat` and `lobby-chat:message` for real-time messages.
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tournament ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Max messages to return
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Skip N messages (for pagination)
 *     responses:
 *       200:
 *         description: Lobby chat history retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Lobby chat history retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           userId:
 *                             type: string
 *                           senderName:
 *                             type: string
 *                           role:
 *                             type: string
 *                             enum: [host, participant]
 *                           message:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     limit:
 *                       type: number
 *                     skip:
 *                       type: number
 *       400:
 *         description: Chat only available when lobby is live
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only participants and host can view lobby chat
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/tournament/{tournamentId}/live-results/stream:
 *   get:
 *     summary: SSE stream for live match results and standings (one tournament)
 *     description: |
 *       Server-Sent Events for the **same payload shape** as `GET …/live-results`, plus push on every host update.
 *
 *       On connect: `event: snapshot` with full current state (tournament meta, `matchResults`, `standings`).
 *       When host submits a match or final result: `event: update` with body aligned to WebSocket `tournament:live-results-updated` — `type: 'live-results-updated'`, `tournamentId`, `matchResults`, `standings`, `matchResultsCount`, `status`, `totalMatches`, `timestamp`.
 *
 *       **Auth:** `Authorization: Bearer` or `?access_token=<JWT>` for browser `EventSource`.
 *
 *       **Access:** Only users who **joined** this tournament (participant), the **assigned host**, or **admin**. Others get 403.
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: access_token
 *         required: false
 *         schema:
 *           type: string
 *         description: JWT for EventSource when Bearer header is not available.
 *     responses:
 *       200:
 *         description: text/event-stream
 *       400:
 *         description: Bad tournament id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a participant / not host / not admin, or email not verified
 */

/**
 * @swagger
 * /api/tournament/{tournamentId}/live-results:
 *   get:
 *     summary: Get live match results and standings (for users)
 *     description: |
 *       One-shot JSON; same data as the initial `snapshot` on `GET …/live-results/stream`. For live UI without polling, prefer the SSE stream — it pushes when the host updates results.
 *       **Access:** Joined participants, assigned host, or admin only (403 otherwise).
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tournament ID
 *     responses:
 *       200:
 *         description: Live results retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Live results retrieved
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                     game:
 *                       type: string
 *                       example: Free Fire
 *                     mode:
 *                       type: string
 *                       example: BR
 *                     subMode:
 *                       type: string
 *                       example: squad
 *                     date:
 *                       type: string
 *                       format: date-time
 *                     startTime:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: running
 *                     totalMatches:
 *                       type: number
 *                       example: 6
 *                       description: Total number of matches (e.g. 6 for BR)
 *                     matchResults:
 *                       type: array
 *                       description: Per-match breakdown (kills, positionPoints, totalPoint, booyah per team)
 *                       items:
 *                         type: object
 *                         properties:
 *                           matchIndex:
 *                             type: number
 *                             description: 0-based (0 = match 1, 5 = match 6)
 *                           teams:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 teamName:
 *                                   type: string
 *                                 position:
 *                                   type: number
 *                                 kills:
 *                                   type: number
 *                                 positionPoints:
 *                                   type: number
 *                                   description: Points from position (1st=12, 2nd=9, etc.)
 *                                 totalPoint:
 *                                   type: number
 *                                   description: positionPoints + kills for this match
 *                                 booyah:
 *                                   type: number
 *                                   description: 1 if 1st place, 0 otherwise
 *                     standings:
 *                       type: array
 *                       description: Live cumulative standings (totalPoint, kills, booyah, totalPositionPoints, position rank)
 *                       items:
 *                         type: object
 *                         properties:
 *                           teamName:
 *                             type: string
 *                           totalPoint:
 *                             type: number
 *                           kills:
 *                             type: number
 *                           booyah:
 *                             type: number
 *                           totalPositionPoints:
 *                             type: number
 *                             description: Sum of position points across all matches
 *                           position:
 *                             type: number
 *                             description: Current rank (1-based)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a participant, not assigned host, and not admin
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/tournament/submit-match-result:
 *   post:
 *     summary: Submit one match result (Host only) – live results after each match
 *     description: |
 *       For BR with 6 matches, call after each match. Host sends teamName, position, kills per team.
 *       Backend calculates totalPoint = position points (1st=12, 2nd=9, 3rd=8...10th=1) + kills (1 per kill).
 *       Response includes matchResults (per-match breakdown) and standings (aggregated totalPoint, booyah, kills, totalPositionPoints, position rank).
 *       After all 6 matches and disputes resolved, host must call POST /api/tournament/submit-final-result to finalize.
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tournamentId
 *               - matchIndex
 *               - teams
 *             properties:
 *               tournamentId:
 *                 type: string
 *                 description: Tournament ID
 *               matchIndex:
 *                 type: integer
 *                 minimum: 0
 *                 description: 0-based match index (0 = match 1, 5 = match 6)
 *                 example: 0
 *               teams:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - teamName
 *                     - position
 *                     - kills
 *                   properties:
 *                     teamName:
 *                       type: string
 *                       maxLength: 50
 *                       example: Thunder Squad
 *                     position:
 *                       type: integer
 *                       minimum: 1
 *                       description: Rank in this match (1st, 2nd, 3rd...)
 *                       example: 1
 *                     kills:
 *                       type: integer
 *                       minimum: 0
 *                       description: Kills in this match (1 point per kill)
 *                       example: 10
 *     responses:
 *       200:
 *         description: Match result submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Match result submitted
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                     matchIndex:
 *                       type: number
 *                     matchResultsCount:
 *                       type: number
 *                       description: Number of match results submitted so far
 *                     matchResults:
 *                       type: array
 *                       description: Per-match breakdown (kills, positionPoints, totalPoint, booyah per team)
 *                       items:
 *                         type: object
 *                         properties:
 *                           matchIndex:
 *                             type: number
 *                           teams:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 teamName:
 *                                   type: string
 *                                 position:
 *                                   type: number
 *                                 kills:
 *                                   type: number
 *                                 positionPoints:
 *                                   type: number
 *                                   description: Points from position (1st=12, 2nd=9, etc.)
 *                                 totalPoint:
 *                                   type: number
 *                                   description: positionPoints + kills for this match
 *                                 booyah:
 *                                   type: number
 *                                   description: 1 if 1st place, 0 otherwise
 *                     standings:
 *                       type: array
 *                       description: Live cumulative standings (totalPoint, kills, booyah, totalPositionPoints, position rank per team)
 *                       items:
 *                         type: object
 *                         properties:
 *                           teamName:
 *                             type: string
 *                           totalPoint:
 *                             type: number
 *                             description: Sum of (position points + kill points) across all matches
 *                           kills:
 *                             type: number
 *                             description: Total kill points across all matches
 *                           booyah:
 *                             type: number
 *                             description: Count of 1st place finishes (wins)
 *                           totalPositionPoints:
 *                             type: number
 *                             description: Sum of position points across all matches
 *                           position:
 *                             type: number
 *                             description: Current rank (1-based)
 *       400:
 *         description: Validation error or tournament status invalid
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only the assigned host can submit match results
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/tournament/submit-final-result:
 *   post:
 *     summary: Submit final result (Host only) – after all matches and disputes resolved
 *     description: |
 *       **Flow:** Host submits each match via POST /api/tournament/submit-match-result (6 times for BR).
 *       After all 6 matches submitted, UI enables this button. Resolve any disputes (support tickets) first.
 *       Host sends only tournamentId – backend uses stored matchResults. No need to resend match data.
 *
 *       **Requirements:** All 6 match results submitted + all disputes resolved.
 *       Computes final standings, generates rewards for top 3, sets status completed, broadcasts to participants.
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tournamentId
 *             properties:
 *               tournamentId:
 *                 type: string
 *                 description: Tournament ID (match results already stored via submit-match-result)
 *                 example: '674a1b2c3d4e5f6789012345'
 *           example:
 *             tournamentId: '674a1b2c3d4e5f6789012345'
 *     responses:
 *       200:
 *         description: Final result submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Result submitted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *       400:
 *         description: Submit all match results first or validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only the assigned host can submit final result
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/tournament/claim-reward:
 *   post:
 *     summary: Claim tournament reward (with built-in eligibility check)
 *     description: |
 *       Claim tournament reward and add it to wallet. This endpoint now includes eligibility checking.
 *       
 *       **IMPORTANT:** This endpoint replaces the old two-step process (claim-status → claim-reward).
 *       Simply call this endpoint directly - it will check eligibility and return appropriate errors if:
 *       - User not in top 3 positions
 *       - Results not published yet
 *       - Reward already claimed
 *       - No reward available
 *       
 *       **Migration Note:** Remove calls to GET /api/tournament/claim-status (deprecated/removed).
 *     tags: [Tournament]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClaimRewardRequest'
 *     responses:
 *       200:
 *         description: Reward claimed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Reward claimed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                     rewardGC:
 *                       type: number
 *                       description: Amount of GC coins awarded
 *                     position:
 *                       type: number
 *                       description: User's final position in the tournament
 *                     kills:
 *                       type: number
 *                       description: Number of kills achieved
 *       400:
 *         description: |
 *           Bad request - various reasons:
 *           - "Results not published yet. Please wait for tournament completion."
 *           - "You are not eligible for rewards. You did not place in the top 3."
 *           - "Reward already claimed"
 *           - "No reward available for your position."
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tournament not found
 */
