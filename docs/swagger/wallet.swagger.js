/**
 * @swagger
 * /api/wallet/balance:
 *   get:
 *     summary: Get wallet balance and withdrawal limits
 *     description: |
 *       Retrieve wallet balance and withdrawal limits:
 *       - **Max withdrawable:** Up to full balance, capped by daily withdrawal limits (and host per-request max).
 *       - **Daily:** Max 3 withdrawals per day, max 500 GC per day (IST) — configurable via env.
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance retrieved successfully
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
 *                   example: Wallet balance retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     balanceINR:
 *                       type: number
 *                       example: 500
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     maxWithdrawableINR:
 *                       type: number
 *                       description: Maximum amount user can withdraw right now (balance capped by daily limits; host role also capped per request)
 *                       example: 250
 *                     totalDepositsGC:
 *                       type: number
 *                       description: Total amount user has deposited (successful topups)
 *                       example: 1000
 *                     totalWithdrawnGC:
 *                       type: number
 *                       description: Total amount user has withdrawn (completed withdrawals)
 *                       example: 250
 *                     dailyLimit:
 *                       type: object
 *                       description: Daily withdrawal limits (IST). Max 3 withdrawals, max 500 GC per day.
 *                       properties:
 *                         count:
 *                           type: number
 *                           description: Withdrawals made today
 *                           example: 1
 *                         totalGC:
 *                           type: number
 *                           description: Total GC withdrawn today
 *                           example: 200
 *                         maxCount:
 *                           type: number
 *                           description: Max withdrawals allowed per day
 *                           example: 3
 *                         maxGC:
 *                           type: number
 *                           description: Max GC allowed per day
 *                           example: 500
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/wallet/history:
 *   get:
 *     summary: Get wallet history – tournament-related only
 *     description: |
 *       Returns tournament-related transactions:
 *       - **join**: Entry fee deducted when user joins a tournament
 *       - **reward**: Winning amount added (1st/2nd/3rd position)
 *       - **refund**: Full entry fee returned when tournament is cancelled (insufficient teams, expired, etc.)
 *       Each record includes: lobbyName, date, time, amountINR, tournament.
 *       For reward: also position, participantCount, winning.
 *       Use type=refund to filter only refunds (tournament cancelled).
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [join, reward, refund]
 *         description: Filter by transaction type. Omit for all (join + reward + refund).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of records to return
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip
 *     responses:
 *       200:
 *         description: Wallet history retrieved successfully
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
 *                   example: Wallet history retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     history:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/WalletHistory'
 *                     total:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     skip:
 *                       type: number
 *             examples:
 *               withRefund:
 *                 summary: Example with join, reward, and refund
 *                 value:
 *                   status: 200
 *                   success: true
 *                   message: Wallet history retrieved successfully
 *                   data:
 *                     history:
 *                       - _id: '507f1f77bcf86cd799439011'
 *                         type: refund
 *                         amountINR: 50
 *                         description: 'Refund: Tournament cancelled due to insufficient teams - Free Fire CS 1v1 - 2026-02-14 12:00 PM'
 *                         lobbyName: 'Free Fire CS 1v1'
 *                         date: '2026-02-14'
 *                         time: '12:00 PM'
 *                         tournament:
 *                           _id: '507f1f77bcf86cd799439012'
 *                           game: 'Free Fire'
 *                           mode: 'CS'
 *                           subMode: '1v1'
 *                           name: 'Free Fire CS 1v1'
 *                           lobbyName: 'Free Fire CS 1v1'
 *                         createdAt: '2026-02-14T06:30:00.000Z'
 *                       - _id: '507f1f77bcf86cd799439013'
 *                         type: reward
 *                         amountINR: 120
 *                         rewardINR: 120
 *                         winning: 120
 *                         position: 1
 *                         participantCount: 16
 *                         lobbyName: 'Free Fire BR Squad'
 *                         date: '2026-02-13'
 *                         time: '02:00 PM'
 *                         createdAt: '2026-02-13T08:30:00.000Z'
 *                       - _id: '507f1f77bcf86cd799439014'
 *                         type: join
 *                         amountINR: -50
 *                         description: 'Entry fee - Free Fire CS 1v1'
 *                         lobbyName: 'Free Fire CS 1v1'
 *                         date: '2026-02-14'
 *                         time: '12:00 PM'
 *                         createdAt: '2026-02-14T05:00:00.000Z'
 *                     total: 3
 *                     limit: 50
 *                     skip: 0
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/wallet/topup-history:
 *   get:
 *     summary: Get deposit/withdraw history (top-up and withdrawal only)
 *     description: |
 *       Returns top-up (deposit) and withdrawal transactions. Supports:
 *       - **type**: Filter by topup or withdrawal (omit for both)
 *       - **date**: Single date YYYY-MM-DD
 *       - **fromDate, toDate**: Date range YYYY-MM-DD (use together or separately)
 *     tags: [Wallet]
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
 *         description: Items per page (max 100)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [topup, withdrawal]
 *         description: Filter by transaction type (omit for both)
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *           example: '2026-02-14'
 *         description: Single date filter (YYYY-MM-DD)
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start of date range (YYYY-MM-DD)
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End of date range (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Top-up history retrieved successfully
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
 *                   example: Top-up history retrieved successfully
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
 *                           userId:
 *                             type: string
 *                           type:
 *                             type: string
 *                             example: topup
 *                           amountINR:
 *                             type: number
 *                           description:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [success, fail]
 *                           addedBy:
 *                             type: string
 *                             enum: [user, admin]
 *                             description: Source of top-up - 'user' for self top-up, 'admin' for manual admin addition
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: number
 *                         totalPages:
 *                           type: number
 *                         totalItems:
 *                           type: number
 *                         itemsPerPage:
 *                           type: number
 *                         hasNextPage:
 *                           type: boolean
 *                         hasPrevPage:
 *                           type: boolean
 *                     filters:
 *                       type: object
 *                       properties:
 *                         type:
 *                           type: string
 *                           nullable: true
 *                         date:
 *                           type: string
 *                           nullable: true
 *                         fromDate:
 *                           type: string
 *                           nullable: true
 *                         toDate:
 *                           type: string
 *                           nullable: true
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/wallet/withdraw/{transactionId}/cancel:
 *   post:
 *     summary: Cancel a pending withdrawal request
 *     description: |
 *       Cancels a **`pending`** withdrawal and refunds the wallet (user changed mind before admin paid).
 *       
 *       **Rules:**
 *       - Only `pending` withdrawals can be cancelled
 *       - Once status is `success`, `fail`, or `cancelled`, it **cannot** be cancelled
 *       - Only the owner of the withdrawal can cancel it
 *       - Refund is instant (wallet balance restored via DB transaction)
 *       - After cancellation, `wallet:balance-updated` and `wallet:history-updated` socket events are emitted
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Withdrawal transaction ID (from requestWithdraw response or topup-history)
 *         example: '507f1f77bcf86cd799439011'
 *     responses:
 *       200:
 *         description: Withdrawal cancelled and amount refunded successfully
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
 *                   example: Withdrawal request cancelled successfully. Amount has been refunded to your wallet.
 *                 data:
 *                   type: object
 *                   properties:
 *                     balanceINR:
 *                       type: number
 *                       description: Updated wallet balance after refund
 *                       example: 350
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                           example: '507f1f77bcf86cd799439011'
 *                         type:
 *                           type: string
 *                           example: withdrawal
 *                         amountINR:
 *                           type: number
 *                           example: 100
 *                         description:
 *                           type: string
 *                           example: Withdrawal request
 *                         status:
 *                           type: string
 *                           example: cancelled
 *                         verifiedAt:
 *                           type: string
 *                           format: date-time
 *             examples:
 *               success:
 *                 summary: Withdrawal cancelled successfully
 *                 value:
 *                   status: 200
 *                   success: true
 *                   message: Withdrawal request cancelled successfully. Amount has been refunded to your wallet.
 *                   data:
 *                     balanceINR: 350
 *                     updatedAt: '2026-02-19T10:30:00.000Z'
 *                     transaction:
 *                       _id: '507f1f77bcf86cd799439011'
 *                       type: withdrawal
 *                       amountINR: 100
 *                       description: Withdrawal request
 *                       status: cancelled
 *                       verifiedAt: '2026-02-19T10:30:00.000Z'
 *       400:
 *         description: |
 *           Bad request:
 *           - `Cannot cancel. Withdrawal is already success` — admin already paid
 *           - `Cannot cancel. Withdrawal is already fail` — admin already rejected
 *           - `This transaction is not a withdrawal request` — wrong transaction type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden — this withdrawal does not belong to you
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/wallet/add-balance:
 *   post:
 *     summary: Add balance to user wallet (Admin only)
 *     description: Admin endpoint to add balance to any user's wallet
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddBalanceRequest'
 *     responses:
 *       200:
 *         description: Balance added successfully
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
 *                   example: Balance added successfully
 *                 data:
 *                   $ref: '#/components/schemas/Wallet'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/wallet/add-balance-bulk:
 *   post:
 *     summary: Add balance to multiple users at once (Admin only - Bulk top-up)
 *     description: Admin endpoint to add the same balance amount to multiple users' wallets in a single request
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIds
 *               - amountINR
 *               - description
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
 *                 description: Array of user IDs to top up
 *               amountINR:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 100
 *                 description: Amount to add to each user's wallet
 *               description:
 *                 type: string
 *                 example: 'Bulk top-up for promotional campaign'
 *                 description: Transaction description for all top-ups
 *     responses:
 *       200:
 *         description: Bulk top-up completed successfully
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
 *                   example: Bulk top-up completed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalProcessed:
 *                       type: number
 *                       example: 2
 *                     totalSuccessful:
 *                       type: number
 *                       example: 2
 *                     totalFailed:
 *                       type: number
 *                       example: 0
 *                     successful:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           balanceINR:
 *                             type: number
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     failed:
 *                       type: array
 *                       nullable: true
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           error:
 *                             type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/wallet/withdraw:
 *   post:
 *     summary: Request withdrawal (cash-out)
 *     description: |
 *       **Same endpoint behaviour as** `POST /api/payment/withdraw` (alias for clients that mount money APIs under `/api/payment`).
 *       Body aliases: **`amount`** → `amountINR`; **`vpa`** / **`upi`** → `upiId`.
 *       Debits wallet. If **Cashfree Payout** is configured (`CASHFREE_PAYOUT_*`), initiates UPI payout (`automatic` / `pending_payout`). Otherwise **`pending_admin`** for manual admin payout via `PATCH /api/admin/withdrawals/:id/status`.
 *       **Limits:** Balance, daily count/amount (IST), host min/max per request.
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amountINR
 *             properties:
 *               amountINR:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 100
 *                 description: Amount to withdraw (GC). Alias field **`amount`** also accepted.
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *                 description: Alias for amountINR
 *               description:
 *                 type: string
 *                 example: UPI payout
 *                 description: Optional note for payout reference
 *               upiId:
 *                 type: string
 *                 example: user@oksbi
 *                 description: Optional payout VPA (aliases **`vpa`**, **`upi`**)
 *               vpa:
 *                 type: string
 *                 description: Alias for upiId
 *     responses:
 *       200:
 *         description: See `data.mode` — pending_admin, pending_payout, or automatic (Cashfree)
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
 *                   example: Withdrawal request submitted
 *                 data:
 *                   type: object
 *                   properties:
 *                     mode:
 *                       type: string
 *                       enum: [pending_admin, pending_payout, automatic]
 *                     balanceINR:
 *                       type: number
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         type:
 *                           type: string
 *                           example: withdrawal
 *                         amountINR:
 *                           type: number
 *                         description:
 *                           type: string
 *                         status:
 *                           type: string
 *                         upiId:
 *                           type: string
 *                         bankReference:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: |
 *           Validation error, insufficient balance, missing UPI, or limit exceeded
 *       401:
 *         description: Unauthorized
 */
