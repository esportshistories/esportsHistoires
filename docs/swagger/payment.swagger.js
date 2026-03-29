/**
 * @swagger
 * /api/payment/create-qr:
 *   post:
 *     summary: UPI top-up — QR image and/or payment link
 *     description: |
 *       Creates a pending `WalletHistory` top-up (`status` stored as `fail` until admin verifies; user sees `pending`).
 *       Requires `PAYMENT_UPI_ID` (and optional `PAYMENT_MERCHANT_NAME`) on the server.
 *       - **Default (`includeQr` omitted or true):** Returns base64 QR image + SVG + `upiLink`; `paymentMethod` is `upi_qr`.
 *       - **`includeQr: false`:** Link-only — same as `POST /api/payment/deposit` (`paymentMethod` `upi_link`, no QR bitmap).
 *       After paying, call `POST /api/payment/confirm` with `qrCodeId` from this response and bank **UTR**.
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amountINR:
 *                 type: number
 *                 format: float
 *                 minimum: 1
 *                 description: Required when `fixedAmount` is true (default)
 *               fixedAmount:
 *                 type: boolean
 *                 default: true
 *                 description: If false, amount is open / variable (amountINR may be 0 in stored row)
 *               description:
 *                 type: string
 *                 description: Optional note embedded in UPI `tn` parameter
 *               includeQr:
 *                 type: boolean
 *                 default: true
 *                 description: If false, skips QR image generation (manual UPI / link flow)
 *               payerUPI:
 *                 type: string
 *                 example: payer@oksbi
 *                 description: Optional payer VPA — stored as `payerUpiId` for admin matching (`name@bank`)
 *     responses:
 *       200:
 *         description: Payment request created
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
 *                   $ref: '#/components/schemas/UpiTopupInitiateData'
 *       400:
 *         description: Validation, rate limit, or too many active pending requests
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
 *       500:
 *         description: Payment not configured (`PAYMENT_UPI_ID` missing) or server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/payment/deposit:
 *   post:
 *     summary: UPI deposit (manual — merchant VPA / link, no QR image)
 *     description: |
 *       Same lifecycle as `POST /api/payment/create-qr` with `includeQr: false`.
 *       Response includes `merchantUpi`, `upiLink`, and `qrCodeId` (alias `depositRequestId`) for `confirm` / `qr-status` / `close-qr`.
 *       Wallet line uses `paymentMethod: upi_link` and description deposit via UPI (manual).
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amountINR:
 *                 type: number
 *                 format: float
 *                 minimum: 1
 *                 description: Required when fixedAmount is true (default)
 *               fixedAmount:
 *                 type: boolean
 *                 default: true
 *               description:
 *                 type: string
 *               payerUPI:
 *                 type: string
 *                 example: payer@oksbi
 *                 description: Optional payer VPA for admin (`name@bank`)
 *     responses:
 *       200:
 *         description: Deposit request created (pending until UTR + admin verification)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/UpiTopupInitiateData'
 *       400:
 *         description: Validation / limits
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
 *       500:
 *         description: Payment not configured or server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/payment/confirm:
 *   post:
 *     summary: Submit UTR after manual UPI payment
 *     description: |
 *       Attaches UTR to the pending top-up row identified by `qrCodeId`. Subject to admin / automated verification rules.
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [qrCodeId, utr]
 *             properties:
 *               qrCodeId:
 *                 type: string
 *                 description: From create-qr or deposit response
 *               utr:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 20
 *                 description: Bank UTR / reference from payer app
 *               paymentProof:
 *                 type: string
 *                 description: Optional note or reference text
 *     responses:
 *       200:
 *         description: UTR recorded or duplicate success payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: Shape varies — may include transactionId, qrCodeId, utr, amountINR, balanceINR, status
 *       400:
 *         description: Missing fields, invalid UTR, expired request, or business rule rejection
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No transaction for this qrCodeId / user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/payment/qr-status/{qrCodeId}:
 *   get:
 *     summary: Get status of a manual UPI / deposit request
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: qrCodeId
 *         required: true
 *         schema:
 *           type: string
 *         description: From create-qr or deposit response
 *     responses:
 *       200:
 *         description: Current status and transaction metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                     qrCodeId:
 *                       type: string
 *                     paymentId:
 *                       type: string
 *                     receiptCode:
 *                       type: string
 *                     status:
 *                       type: string
 *                       description: User-facing display status (e.g. pending, success)
 *                     amountINR:
 *                       type: number
 *                     paymentMethod:
 *                       type: string
 *                       enum: [upi_qr, upi_link, manual, razorpay, cashfree, other]
 *                     utr:
 *                       type: string
 *                     isExpired:
 *                       type: boolean
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/payment/close-qr/{qrCodeId}:
 *   post:
 *     summary: Expire / cancel a pending UPI request (user)
 *     description: Sets expiry so the request can no longer be used for payment (cannot close if already successful).
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: qrCodeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Request closed
 *       400:
 *         description: Already successful or invalid state
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/payment/webhook:
 *   post:
 *     summary: Bank / gateway webhook (optional)
 *     description: |
 *       External systems may POST payment notifications (UTR, amount). Not JWT-protected.
 *       If `PAYMENT_WEBHOOK_SECRET` is set, caller may need to send matching `signature`.
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [utr, amount]
 *             properties:
 *               utr:
 *                 type: string
 *               amount:
 *                 type: number
 *               status:
 *                 type: string
 *               reference:
 *                 type: string
 *               signature:
 *                 type: string
 *                 description: HMAC-SHA256 when secret configured
 *     responses:
 *       200:
 *         description: Webhook processed (verified or no match)
 *       400:
 *         description: Missing fields or invalid signature
 */

/**
 * @swagger
 * /api/payment/withdraw:
 *   post:
 *     summary: Withdraw wallet balance (alias — same as POST /api/wallet/withdraw)
 *     description: |
 *       **Identical** to `POST /api/wallet/withdraw` — debits wallet, creates **pending** withdrawal; admin pays manually.
 *       Body: `amountINR` or **`amount`**, optional `upiId` or **`vpa`** / **`upi`**, optional `description`. Bearer auth required.
 *       Use this path if your app groups money APIs under `/api/payment/*`.
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amountINR]
 *             properties:
 *               amountINR:
 *                 type: number
 *                 minimum: 0.01
 *               amount:
 *                 type: number
 *                 description: Alias for amountINR
 *               upiId:
 *                 type: string
 *                 example: user@oksbi
 *               vpa:
 *                 type: string
 *                 description: Alias for upiId
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Same as /api/wallet/withdraw; `data.mode` may be pending_admin, pending_payout, or automatic (Cashfree Payout)
 *       400:
 *         description: Validation / limits / missing UPI
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/payment/cashfree/order:
 *   post:
 *     summary: Start Cashfree top-up (create order)
 *     description: |
 *       Creates a pending `WalletHistory` top-up and a Cashfree **order**; returns `paymentSessionId` for Cashfree Web Checkout (UPI + cards).
 *       Env: `CASHFREE_PG_ENABLED=true`, `CASHFREE_PG_CLIENT_ID`, `CASHFREE_PG_CLIENT_SECRET`, optional `CASHFREE_ENV=sandbox|production`.
 *       Register webhook URL `POST /api/payment/cashfree/webhook` in Cashfree Dashboard (PG → Webhooks); signing uses the same client secret.
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amountINR]
 *             properties:
 *               amountINR:
 *                 type: number
 *                 format: float
 *                 minimum: 1
 *                 description: Amount in INR (1:1 wallet credit on success)
 *                 example: 10
 *     responses:
 *       200:
 *         description: Use `paymentSessionId` with Cashfree JS SDK checkout
 *       503:
 *         description: Cashfree PG not configured
 *       502:
 *         description: Cashfree order API error
 */

/**
 * @swagger
 * /api/payment/cashfree/verify:
 *   post:
 *     summary: Verify Cashfree payment (authenticated)
 *     description: |
 *       After checkout, poll with merchant `orderId` from `/cashfree/order`. Server fetches order from Cashfree; if `PAID`, credits wallet.
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId]
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Merchant order id from `/api/payment/cashfree/order`
 *     responses:
 *       200:
 *         description: Wallet updated or payment still pending
 *       404:
 *         description: Order not found for this user
 */

/**
 * @swagger
 * /api/payment/cashfree/webhook:
 *   post:
 *     summary: Cashfree PG webhook (payment success)
 *     description: |
 *       Server-to-server. Verifies `x-webhook-signature` + `x-webhook-timestamp` with `CASHFREE_PG_CLIENT_SECRET` (HMAC-SHA256 base64 on `timestamp+rawBody`).
 *       Credits wallet when payment is SUCCESS (idempotent).
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Acknowledged
 *       400:
 *         description: Bad signature or JSON
 */
