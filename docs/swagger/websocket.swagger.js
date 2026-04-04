/**
 * @swagger
 * components:
 *   schemas:
 *     WebSocketConnection:
 *       type: object
 *       properties:
 *         url:
 *           type: string
 *           example: 'ws://localhost:3000'
 *           description: WebSocket server URL (same as API base URL)
 *         transports:
 *           type: array
 *           items:
 *             type: string
 *           example: ['websocket', 'polling']
 *           description: Supported transport methods
 *         cors:
 *           type: object
 *           properties:
 *             origin:
 *               type: string
 *               example: '*'
 *             credentials:
 *               type: boolean
 *               example: true
 * 
 *     WebSocketEvent:
 *       type: object
 *       properties:
 *         event:
 *           type: string
 *           example: 'tournament:status-updated'
 *         data:
 *           type: object
 *           properties:
 *             tournamentId:
 *               type: string
 *             status:
 *               type: string
 *               enum: [upcoming, locked, running, result_pending, completed, result_published]
 *               description: 'Tournament status: upcoming (not started), locked (join closed), running (live), result_pending (ended, results not published), completed (results published)'
 *             date:
 *               type: string
 *               format: date
 *             startTime:
 *               type: string
 *             mode:
 *               type: string
 *             subMode:
 *               type: string
 *             room:
 *               type: object
 *               properties:
 *                 roomId:
 *                   type: string
 *                 password:
 *                   type: string
 *             joinedTeams:
 *               type: integer
 *               description: Current number of joined teams/participants
 *             type:
 *               type: string
 *               enum: [room-updated, live-results-updated]
 *               description: Optional event sub-type (e.g. room-updated)
 * 
 *     WalletBalanceUpdate:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *           example: '507f1f77bcf86cd799439011'
 *         wallet:
 *           type: object
 *           properties:
 *             balanceINR:
 *               type: number
 *               example: 150.0
 *             updatedAt:
 *               type: string
 *               format: date-time
 *         transaction:
 *           type: object
 *           nullable: true
 *           properties:
 *             _id:
 *               type: string
 *             type:
 *               type: string
 *               enum: [topup, join, reward, refund, withdrawal]
 *             amountINR:
 *               type: number
 *               nullable: true
 *             description:
 *               type: string
 *             status:
 *               type: string
 *               enum: [success, fail, pending, cancelled]
 *               description: Original status from database
 *             displayStatus:
 *               type: string
 *               enum: [pending, success, fail]
 *               description: User-facing status (pending for topup awaiting admin approval)
 *             createdAt:
 *               type: string
 *               format: date-time
 *             updatedAt:
 *               type: string
 *               format: date-time
 *         timestamp:
 *           type: string
 *           format: date-time
 * 
 *     WalletTransactionUpdate:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *           example: '507f1f77bcf86cd799439011'
 *         transaction:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             type:
 *               type: string
 *               enum: [topup, join, reward, refund, withdrawal]
 *             amountINR:
 *               type: number
 *               nullable: true
 *             description:
 *               type: string
 *             status:
 *               type: string
 *               enum: [success, fail, pending, cancelled]
 *               description: Original status from database
 *             displayStatus:
 *               type: string
 *               enum: [pending, success, fail]
 *               description: User-facing status (pending for topup awaiting admin approval)
 *             paymentVerified:
 *               type: boolean
 *             verifiedBy:
 *               type: string
 *               enum: [user, admin]
 *               nullable: true
 *             verifiedAt:
 *               type: string
 *               format: date-time
 *               nullable: true
 *             utr:
 *               type: string
 *               nullable: true
 *             qrCodeId:
 *               type: string
 *               nullable: true
 *             receiptCode:
 *               type: string
 *               nullable: true
 *             createdAt:
 *               type: string
 *               format: date-time
 *             updatedAt:
 *               type: string
 *               format: date-time
 *         wallet:
 *           type: object
 *           nullable: true
 *           properties:
 *             balanceINR:
 *               type: number
 *             updatedAt:
 *               type: string
 *               format: date-time
 *         action:
 *           type: string
 *           enum: [approved, rejected, updated]
 *           description: Action type - 'approved' when admin approves payment, 'rejected' when admin rejects, 'updated' when transaction is updated
 *         timestamp:
 *           type: string
 *           format: date-time
 *
 *     LobbyChatMessage:
 *       type: object
 *       description: Lobby chat message – sirf live tournament mein, participants + host ke liye
 *       properties:
 *         _id:
 *           type: string
 *           description: Message ID
 *         tournamentId:
 *           type: string
 *         userId:
 *           type: string
 *         senderName:
 *           type: string
 *           description: User ign or name
 *         role:
 *           type: string
 *           enum: [host, participant]
 *         message:
 *           type: string
 *           maxLength: 500
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     LobbyChatClosed:
 *       type: object
 *       description: Emitted when tournament completed/cancelled – chat room band, DB se data clear
 *       properties:
 *         tournamentId:
 *           type: string
 *         status:
 *           type: string
 *           enum: [completed, cancelled, result_pending]
 *
 *     WalletHistoryUpdate:
 *       type: object
 *       description: Payload for wallet:history-updated (new transaction added – topup, withdrawal, reward, refund, join)
 *       properties:
 *         userId:
 *           type: string
 *         transaction:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             type:
 *               type: string
 *               enum: [topup, join, reward, refund, withdrawal]
 *             amountINR:
 *               type: number
 *             description:
 *               type: string
 *             status:
 *               type: string
 *               enum: [success, fail, pending, cancelled]
 *             displayStatus:
 *               type: string
 *               enum: [pending, success, fail]
 *             createdAt:
 *               type: string
 *               format: date-time
 *         wallet:
 *           type: object
 *           nullable: true
 *           properties:
 *             balanceINR:
 *               type: number
 *             updatedAt:
 *               type: string
 *               format: date-time
 *         timestamp:
 *           type: string
 *           format: date-time
 * 
 * /websocket:
 *   get:
 *     summary: WebSocket Connection Guide
 *     description: |
 *       Connect to WebSocket server for real-time tournament and wallet updates.
 *       
 *       **Connection:**
 *       - URL: Same as API base URL (e.g., `ws://localhost:3000` or `wss://api.gaminghuballday.buzz`)
 *       - Protocol: Socket.IO v4
 *       - Transports: websocket, polling
 *       
 *       **Client Events (Emit):**
 *       
 *       **Tournament Events:**
 *       - `subscribe:tournament` - Subscribe to specific tournament updates
 *       - `unsubscribe:tournament` - Unsubscribe from tournament updates
 *       - `subscribe:user-tournaments` - Subscribe to user's joined tournaments
 *       - `subscribe:host-tournaments` - Subscribe to host's assigned tournaments
 *       - `subscribe:admin-tournaments` - Subscribe to all tournaments (admin only)
 *       
 *       **Wallet/Top-up Events:**
 *       - **Auto-subscribe**: Connect with `auth: { token: JWT }` – user is auto-subscribed to wallet updates. Admin top-up will push balance in real-time without page reload.
 *       - `subscribe:wallet` - Manual subscribe (if not using auth). Requires userId.
 *       - `unsubscribe:wallet` - Unsubscribe from wallet updates
 *       
 *       **Lobby Chat Events (sirf jab lobby live ho):**
 *       - `subscribe:lobby-chat` - Subscribe to lobby chat (tournamentId). Participants + host only.
 *       - `unsubscribe:lobby-chat` - Unsubscribe from lobby chat (tournamentId)
 *       - `lobby-chat:send-message` - **Send** message. Payload: `{ tournamentId, message }`. Max 500 chars.
 *       - **Receive (listen):** `lobby-chat:message` – Server emits to all participants and host when anyone sends. Use so users see each other's messages in real time. Payload: `{ _id, tournamentId, userId, senderName, role, message, createdAt }`.
 *       - Listen: `lobby-chat:closed` - Chat room band (tournament completed/cancelled). Payload: `{ tournamentId, status }`. Clear local chat data.
 *       - Listen: `lobby-chat:error` - Error. Payload: `{ message }`
 *       - Chat DB mein store hota hai jab tak live; completed/cancelled pe DB se clear.
 *       - API: GET /api/tournament/:tournamentId/chat – history fetch (sirf live)
 *       
 *       **Server Events (Listen):**
 *       
 *       **Tournament Events:**
 *       - `tournament:status-updated` - Tournament status changed or participant joined. Emitted when user joins tournament (via `/api/tournament/join` or `/api/special-tournament/{id}/join`). Payload includes `joinedTeams` count which updates in real-time. Use to update the participant count without page refresh. Subscribe via `subscribe:tournament` or `subscribe:user-tournaments` to receive updates.
 *       - `tournament:room-updated` - Room ID/password sent to joined participants only when tournament goes live. No refresh needed — socket pushes it automatically at start time. Payload: `{ tournamentId, type: 'room-updated', room: { roomId, password }, joinedTeams, timestamp }`
 *       - `tournament:live-results-updated` - Live match results updated (host submitted match result). Sent **only** to joined participants (`user:{id}`), assigned host (`host:{id}`), and `admin:tournaments` — **not** to `subscribe:tournament` room (non-participants must not receive). Payload: `{ tournamentId, type: 'live-results-updated', matchResults, standings, matchResultsCount, status, totalMatches, timestamp }`. Participants should rely on per-user subscription (e.g. after login) or host room. **SSE equivalent:** `GET /api/tournament/{tournamentId}/live-results/stream` (same access rules) — `event: update` matches this payload; initial `event: snapshot`.
 *       - `notification:push` - **Push notification (mobile/in-app).** Broadcast to all connected clients. Payload: `{ type, title, message, timestamp, ... }`. Types: `new-lobby-created` (tournaments[]), `lobby-filling` (tournamentId, lobbyName, slotsLeft), `room-updated` (room: { roomId, password }, tournamentId — sent when tournament goes live), `admin-notification` (custom title + message from admin).
 *       - `lobby-chat:message` - **Receive:** New lobby chat message (server → all participants + host). Listen on this to show messages from other users/host in real time. Payload: `{ _id, tournamentId, userId, senderName, role, message, createdAt }`
 *       - `lobby-chat:closed` - Lobby chat band (tournament completed/cancelled). Payload: `{ tournamentId, status }`. Clear local chat data.
 *       - `lobby-chat:error` - Lobby chat error. Payload: `{ message }`
 *       
 *       **Wallet/Top-up Events (use these so user balance updates without refresh):**
 *       - `wallet:balance-updated` - **Balance changed.** Emitted when: top-up succeeds (e.g. Cashfree), admin adds balance, withdrawal, withdrawal cancelled (refund), reward, refund, join. Payload: `{ userId, wallet: { balanceINR, updatedAt }, transaction? }`. Update UI balance from `data.wallet.balanceINR`.
 *       - `wallet:transaction-updated` - Transaction status updated. Payload: `{ userId, transaction, wallet?, action: 'approved'|'rejected'|'updated' }`.
 *       - `wallet:history-updated` - New transaction added (topup, withdrawal, withdrawal cancelled, reward, refund, join). Payload: `{ userId, transaction, wallet?, timestamp }`.
 *       
 *       **Example (JavaScript/Socket.IO Client):**
 *       ```javascript
 *       import io from 'socket.io-client';
 *
 *       // Connect with JWT for auto wallet subscription (admin top-up → balance updates in real-time)
 *       const token = localStorage.getItem('accessToken'); // or from your auth state
 *       const socket = io('http://localhost:3000', {
 *         transports: ['websocket', 'polling'],
 *         auth: { token }  // or auth: { accessToken: token }
 *       });
 *
 *       // Token refresh: access token expire (15 min) ke baad – naya token bhejo, disconnect nahi karna
 *       socket.emit('auth:refresh', { token: newAccessToken });
 *       socket.on('auth:success', (data) => {
 *         // userId updated, chat/lobby har time chalega
 *       });
 *       socket.on('auth:error', (err) => {
 *         // token invalid - handle re-login
 *       });
 *
 *       // Subscribe to tournament updates
 *       socket.emit('subscribe:tournament', 'tournamentId123');
 *       socket.emit('subscribe:user-tournaments', userId);
 *
 *       // Wallet: auto-subscribed when auth token provided. Or manually:
 *       // socket.emit('subscribe:wallet', userId);
 *
 *       // Listen for tournament status updates
 *       socket.on('tournament:status-updated', (data) => {
 *         console.log('Tournament status updated:', data);
 *         // data.tournamentId, data.status, data.joinedTeams, data.room (only when running)
 *       });
 *
 *       // Listen for room ID/password (sent automatically when tournament goes live — no refresh needed)
 *       socket.on('tournament:room-updated', (data) => {
 *         console.log('Room updated:', data.room.roomId, data.room.password);
 *         // data.tournamentId, data.room.roomId, data.room.password, data.joinedTeams, data.timestamp
 *       });
 *
 *       // Push notifications (new lobby, lobby filling, room updated, custom admin message)
 *       socket.on('notification:push', (data) => {
 *         if (data.type === 'new-lobby-created') {
 *           // data.title, data.message, data.tournaments[]
 *         }
 *         if (data.type === 'lobby-filling') {
 *           // data.lobbyName, data.slotsLeft, data.tournamentId
 *         }
 *         if (data.type === 'room-updated') {
 *           // data.room.roomId, data.room.password, data.tournamentId
 *         }
 *         if (data.type === 'admin-notification') {
 *           // data.title, data.message
 *         }
 *       });
 *
 *       socket.on('tournament:live-results-updated', (data) => {
 *         console.log('Live results updated:', data);
 *         // data.matchResults - per-match breakdown
 *         // data.standings - aggregated totalPoint, kills, booyah, totalPositionPoints, position
 *       });
 *
 *       // Listen for wallet updates (top-up, admin balance add, withdrawal, reward, refund, join, cancel)
 *       socket.on('wallet:balance-updated', (data) => {
 *         setBalance(data.wallet.balanceINR);
 *         // data.wallet.balanceINR - updated balance (no reload needed)
 *         // data.transaction - optional, the transaction that caused the update
 *       });
 *
 *       socket.on('wallet:transaction-updated', (data) => {
 *         console.log('Transaction updated:', data);
 *         // data.transaction - transaction details
 *         // data.action - 'approved', 'rejected', or 'updated'
 *         // data.wallet - updated wallet balance (if balance changed)
 *       });
 *
 *       socket.on('wallet:history-updated', (data) => {
 *         console.log('New transaction added:', data);
 *         // data.transaction - new transaction details (type, amountINR, status, displayStatus)
 *       });
 *
 *       // Lobby chat (sirf jab lobby live ho) – send + receive
 *       socket.emit('subscribe:lobby-chat', tournamentId);
 *       socket.emit('lobby-chat:send-message', { tournamentId, message: 'Hello!' });
 *       socket.on('lobby-chat:message', (data) => appendMessage(data));
 *       socket.on('lobby-chat:closed', (data) => clearChatMessages(data.tournamentId));
 *       socket.on('lobby-chat:error', (data) => showToast(data.message));
 *       socket.emit('unsubscribe:lobby-chat', tournamentId);
 *       ```
 *     tags: [WebSocket]
 *     responses:
 *       200:
 *         description: WebSocket connection guide
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connection:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       example: 'ws://localhost:3000'
 *                     protocol:
 *                       type: string
 *                       example: 'Socket.IO v4'
 *                     transports:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ['websocket', 'polling']
 *                 clientEvents:
 *                   type: object
 *                   properties:
 *                     tournament:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ['subscribe:tournament', 'unsubscribe:tournament', 'subscribe:user-tournaments', 'subscribe:host-tournaments', 'subscribe:admin-tournaments']
 *                     wallet:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ['subscribe:wallet', 'unsubscribe:wallet']
 *                 serverEvents:
 *                   type: object
 *                   properties:
 *                     tournament:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ['tournament:status-updated', 'tournament:room-updated', 'tournament:live-results-updated']
 *                     wallet:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ['wallet:balance-updated', 'wallet:transaction-updated', 'wallet:history-updated']
 *                     lobbyChat:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ['lobby-chat:message', 'lobby-chat:closed', 'lobby-chat:error']
 *           text/plain:
 *             schema:
 *               type: string
 *               example: |
 *                 WebSocket Connection Guide
 *                 
 *                 Connect to: ws://localhost:3000
 *                 
 *                 Client Events (Emit):
 *                 Tournament:
 *                 - subscribe:tournament (tournamentId)
 *                 - unsubscribe:tournament (tournamentId)
 *                 - subscribe:user-tournaments (userId)
 *                 - subscribe:host-tournaments (hostId)
 *                 - subscribe:admin-tournaments ()
 *                 
 *                 Wallet/Top-up:
 *                 - subscribe:wallet (userId)
 *                 - unsubscribe:wallet (userId)
 *
 *                 Lobby Chat (live only):
 *                 - subscribe:lobby-chat (tournamentId)
 *                 - unsubscribe:lobby-chat (tournamentId)
 *                 - lobby-chat:send-message ({ tournamentId, message })
 *                 
 *                 Server Events (Listen):
 *                 Tournament:
 *                 - tournament:status-updated
 *                 - tournament:room-updated
 *                 
 *                 Wallet/Top-up:
 *                 - wallet:balance-updated
 *                 - wallet:transaction-updated
 *                 - wallet:history-updated
 *
 *                 Lobby Chat:
 *                 - lobby-chat:message
 *                 - lobby-chat:closed
 *                 - lobby-chat:error
 */

/**
 * @swagger
 * /websocket/events:
 *   get:
 *     summary: WebSocket Events Reference
 *     description: |
 *       **Server events payloads (listen on socket):**
 *
 *       | Event | When | Payload (data) |
 *       |-------|------|----------------|
 *       | `wallet:balance-updated` | Top-up success, admin add balance, withdrawal, withdrawal cancelled, reward, refund, join | `userId`, `wallet: { balanceINR, updatedAt }`, `transaction?` |
 *       | `wallet:transaction-updated` | Transaction status change | `userId`, `transaction`, `wallet?`, `action`: approved/rejected/updated |
 *       | `wallet:history-updated` | New transaction (topup, withdrawal, withdrawal cancelled, reward, refund, join) | `userId`, `transaction`, `wallet?` |
 *       | `tournament:status-updated` | Tournament status change or user joins tournament | `tournamentId`, `status`, `date`, `startTime`, `mode`, `subMode`, `joinedTeams`, `type?`, `room?` |
 *       | `tournament:room-updated` | Tournament goes live — room pushed to joined participants only (no refresh needed) | `tournamentId`, `type: 'room-updated'`, `room: { roomId, password }`, `timestamp` |
 *       | `notification:push` | Push (new lobby / lobby filling / room updated / custom admin) | `type`, `title`, `message`, `timestamp`; `new-lobby-created` → `tournaments[]`; `lobby-filling` → `tournamentId`, `lobbyName`, `slotsLeft`; `room-updated` → `tournamentId`, `room: { roomId, password }`; `admin-notification` → custom title + message |
 *       | `lobby-chat:message` | **Receive** – new message (server → all participants + host) | `_id`, `tournamentId`, `userId`, `senderName`, `role`, `message`, `createdAt` |
 *       | `lobby-chat:closed` | Chat room closed (completed/cancelled) | `tournamentId`, `status` |
 *       | `lobby-chat:error` | Lobby chat error | `message` |
 *
 *       **Schemas:** See components – WalletBalanceUpdate, WalletTransactionUpdate, WalletHistoryUpdate, LobbyChatMessage, LobbyChatClosed, WebSocketEvent.
 *     tags: [WebSocket]
 *     responses:
 *       200:
 *         description: Events reference (documentation)
 */
