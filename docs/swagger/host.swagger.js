/**
 * @swagger
 * /api/host/tournaments/available:
 *   get:
 *     summary: List tournaments available for host to apply (Host only)
 *     description: Get paginated list of tournaments that host can apply to. Shows application status (hasApplied, applicationStatus) for each tournament so frontend can display "Applied" button instead of "Apply to Host".
 *     tags: [Host]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, locked]
 *         description: Filter by tournament status
 *     responses:
 *       200:
 *         description: Available tournaments retrieved successfully
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
 *                               hasApplied:
 *                                 type: boolean
 *                                 description: Whether the host has applied for this tournament
 *                                 example: true
 *                               applicationStatus:
 *                                 type: string
 *                                 nullable: true
 *                                 enum: [pending, approved, rejected, null]
 *                                 description: Application status if applied, null otherwise
 *                                 example: "pending"
 *                               hostApplication:
 *                                 type: object
 *                                 nullable: true
 *                                 description: Full application object if exists, null otherwise
 *                                 properties:
 *                                   applicationId:
 *                                     type: string
 *                                   status:
 *                                     type: string
 *                                     enum: [pending, approved, rejected]
 *                                   appliedAt:
 *                                     type: string
 *                                     format: date-time
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Host access required
 */

/**
 * @swagger
 * /api/host/tournaments/{tournamentId}/apply:
 *   post:
 *     summary: Apply to host a tournament (Host only)
 *     description: Submit an application to host a specific tournament. Each host can only apply once per tournament.
 *     tags: [Host]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tournament ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApplyForTournamentRequest'
 *     responses:
 *       201:
 *         description: Host application submitted successfully
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
 *                   example: Host application submitted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     application:
 *                       $ref: '#/components/schemas/HostApplication'
 *       400:
 *         description: Validation error or already applied
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Host access required
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/host/applications:
 *   get:
 *     summary: List host's own applications (Host only)
 *     description: Get paginated list of applications submitted by the logged-in host
 *     tags: [Host]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by application status
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *           example: '2025-12-16'
 *         description: Filter applications by tournament date (YYYY-MM-DD). Shows applications for tournaments on that specific date.
 *     responses:
 *       200:
 *         description: Host applications retrieved successfully
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
 *                   example: Host applications retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     applications:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/HostApplication'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Host access required
 */

/**
 * @swagger
 * /api/host/my-lobbies:
 *   get:
 *     summary: Get host's assigned lobbies
 *     description: |
 *       Single endpoint for host lobbies. Two modes:
 *       - **No status**: Returns upcoming + live lobbies grouped by status.
 *       - **status=completed|cancelled|result_pending**: Returns history with pagination and date filters.
 *     tags: [Host]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [completed, cancelled, result_pending]
 *         description: Filter by status (history mode). Omit for active lobbies (upcoming + live).
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *           example: '2026-02-05'
 *         description: Filter by specific date (YYYY-MM-DD) - history mode only
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from this date onwards (YYYY-MM-DD) - history mode only
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter up to this date (YYYY-MM-DD) - history mode only
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number - history mode only
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page (max 100) - history mode only
 *     responses:
 *       200:
 *         description: Lobbies retrieved successfully. Response structure varies - active (lobbies.upcoming, lobbies.live) or history (lobbies array + pagination).
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     lobbies:
 *                       oneOf:
 *                         - type: object
 *                           properties:
 *                             upcoming:
 *                               type: array
 *                               items:
 *                                 $ref: '#/components/schemas/Tournament'
 *                             live:
 *                               type: array
 *                               items:
 *                                 $ref: '#/components/schemas/Tournament'
 *                         - type: array
 *                           items:
 *                             $ref: '#/components/schemas/Tournament'
 *                     total:
 *                       type: number
 *                       description: Total (active mode only)
 *                     counts:
 *                       type: object
 *                       description: Counts (active mode only)
 *                     pagination:
 *                       type: object
 *                       description: Pagination (history mode only)
 *                     filters:
 *                       type: object
 *                       description: Applied filters (history mode only)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Host access required
 */

/**
 * @swagger
 * /api/host/tournaments/{tournamentId}/end:
 *   post:
 *     summary: Mark tournament as ended (Host only)
 *     description: Mark a running tournament as ended. Moves tournament from 'running' to 'result_pending' status. Host should then publish results.
 *     tags: [Host]
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
 *         description: Tournament marked as ended successfully
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
 *                   example: Tournament marked as ended. Please publish results.
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: result_pending
 *       400:
 *         description: Bad request (tournament not running or already ended)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only assigned host can end tournament
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/host/tournaments/{tournamentId}/update-room:
 *   post:
 *     summary: Update room information (Host only)
 *     description: |
 *       Update room ID and password for a tournament. Tournament ID is in the URL - payload only needs roomId and password.
 *       Host can update room/password anytime before tournament starts.
 *     tags: [Host]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tournament ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               roomId:
 *                 type: string
 *                 nullable: true
 *                 example: '123456789'
 *               password:
 *                 type: string
 *                 nullable: true
 *                 example: 'pass123'
 *           example:
 *             roomId: "123456789"
 *             password: "pass123"
 *     responses:
 *       200:
 *         description: Room information updated successfully
 *       400:
 *         description: Validation error or tournament has already started
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only the assigned host can update room information
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/host/tournaments/{tournamentId}/notify-lobby-filling:
 *   post:
 *     summary: Notify all users – lobby filling up (Host only)
 *     description: |
 *       Sends a push notification to all connected users to attract them to join this lobby.
 *       Only the assigned host can trigger this. No request body.
 *     tags: [Host]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tournament ID (must be a lobby assigned to this host)
 *     responses:
 *       200:
 *         description: Lobby filling notification sent to all users
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
 *                   example: Lobby filling notification sent to all users
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                     lobbyName:
 *                       type: string
 *                       nullable: true
 *                     participantCount:
 *                       type: integer
 *                     maxPlayers:
 *                       type: integer
 *       400:
 *         description: Bad request / failed to send notification
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only the assigned host can send this notification
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/host/support/tickets:
 *   get:
 *     summary: Get host's support tickets
 *     description: Retrieve all support tickets for tournaments hosted by the authenticated host. Requires authentication and host role.
 *     tags: [Host, Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, closed]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Support tickets retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Host access required
 */

/**
 * @swagger
 * /api/host/support/tickets/:ticketId:
 *   patch:
 *     summary: Update ticket status or add notes (Host)
 *     description: Update support ticket status or add host notes. Requires authentication and host role.
 *     tags: [Host, Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *         description: Support ticket ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, closed]
 *               hostNotes:
 *                 type: string
 *                 maxLength: 2000
 *     responses:
 *       200:
 *         description: Ticket updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Ticket not found
 */

/**
 * @swagger
 * /api/host/support/tickets/:ticketId/reply:
 *   post:
 *     summary: Reply to support ticket (Host)
 *     description: Add a reply message to a support ticket. Host can only reply to tickets for their tournaments. Requires authentication and host role.
 *     tags: [Host, Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *         description: Support ticket ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 5000
 *     responses:
 *       200:
 *         description: Reply sent successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Ticket not found
 */
