/**
 * @swagger
 * tags:
 *   - name: Organization
 *     description: Org manager specific APIs (separate role from host/admin)
 */

/**
 * @swagger
 * /api/orgs/{orgId}/deposit:
 *   post:
 *     summary: Deposit GC from user wallet into organization wallet (Org Manager)
 *     description: |
 *       Moves balance from the logged-in user's platform wallet to the organization's internal walletBalance.
 *       This is used by organizations to fund their own tournaments. Existing user/host/admin flows are unaffected.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount of GC to deposit into organization wallet
 *                 example: 500
 *     responses:
 *       200:
 *         description: Amount deposited to organization wallet
 *       400:
 *         description: Validation error or invalid amount
 *       401:
 *         description: Unauthorized - missing/invalid token
 *       403:
 *         description: Forbidden - only org managers/admin can access
 *       404:
 *         description: Organization not found
 */

/**
 * @swagger
 * /api/orgs/{orgId}/tournaments:
 *   get:
 *     summary: List tournaments owned by organization (Org Manager)
 *     description: Returns all tournaments created for the given organization. Each tournament is isolated per organization.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           description: Optional tournament status filter (upcoming, running, completed, etc.)
 *     responses:
 *       200:
 *         description: Organization tournaments retrieved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - org manager/admin only
 *       404:
 *         description: Organization not found
 */

/**
 * @swagger
 * /api/orgs/{orgId}/tournaments:
 *   post:
 *     summary: Create organization tournament (Org Manager)
 *     description: |
 *       Creates a new tournament lobby owned by the given organization.
 *       - If entryFee = 0 and prizePool > 0, prize pool is locked from organization wallet (non-refundable).
 *       - Regular platform tournaments remain unchanged; this is additive.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mode
 *               - subMode
 *               - entryFee
 *               - maxPlayers
 *               - date
 *               - startTime
 *             properties:
 *               game:
 *                 type: string
 *                 example: Free Fire
 *               mode:
 *                 type: string
 *                 description: Game mode (CS, BR, LW, etc.)
 *                 example: BR
 *               subMode:
 *                 type: string
 *                 description: Sub mode (solo, duo, squad, 1v1, 2v2)
 *                 example: squad
 *               entryFee:
 *                 type: number
 *                 description: Entry fee per team. Use 0 for free-entry special tournaments.
 *                 example: 0
 *               maxPlayers:
 *                 type: number
 *                 description: Maximum players allowed in the lobby
 *                 example: 48
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Lobby date (YYYY-MM-DD)
 *                 example: "2026-03-20"
 *               startTime:
 *                 type: string
 *                 description: Lobby start time in HH:MM AM/PM format
 *                 example: "9:00 PM"
 *               region:
 *                 type: string
 *                 description: Optional region (defaults to Global)
 *               lobbyName:
 *                 type: string
 *                 description: Optional lobby name override
 *               prizePool:
 *                 type: number
 *                 description: Fixed prize pool in GC for free-entry org special tournaments (locked from org wallet)
 *                 example: 1000
 *     responses:
 *       201:
 *         description: Organization tournament created successfully
 *       400:
 *         description: Validation error or insufficient org wallet balance
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - org manager/admin only
 *       404:
 *         description: Organization not found
 */

