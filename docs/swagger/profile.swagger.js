/**
 * @swagger
 * /api/profile/game-options:
 *   get:
 *     summary: Get selectable games
 *     description: Full picker data — defaultPlatform, options (mobile/pc games), indiaEsportsOrganizations, indiaEsportsPersonalities. Not returned on GET/PUT profile or GET /me; call this endpoint when building pickers.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Game options retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/profile/followed-games:
 *   patch:
 *     summary: Merge followed games / UIDs (recommended for Game Profiles)
 *     description: |
 *       Upserts into the user's existing `followedGames` without sending the full list.
 *       Body: `followedGames` **or** `gameProfiles` (same shape). Send **`uid` only** — do not send `gameUid` (server ignores duplicate legacy key if present).
 *       Use from Game Profiles when adding a UID or a new game.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PatchFollowedGamesRequest'
 *     responses:
 *       200:
 *         description: Updated gameProfiles + gamePreference
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/me:
 *   get:
 *     summary: Get returning user data in one call
 *     description: Returns profile + personalized dashboard feed based on selected/followed games. Mobile app can hit only this endpoint on app reopen.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, live, completed, pendingResult, cancelled]
 *         required: false
 *         description: Tournament status filter for dashboard feed (default upcoming)
 *     responses:
 *       200:
 *         description: Me data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MeResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 * /api/profile/dashboard:
 *   get:
 *     summary: Get dashboard feed by selected games
 *     description: Returns grouped dashboard data by user's selected/followed games. If BGMI selected then one object, if BGMI + Free Fire selected then two objects.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, live, completed, pendingResult, cancelled]
 *         required: false
 *         description: Tournament status filter (default upcoming)
 *     responses:
 *       200:
 *         description: Dashboard feed retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardFeedResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Get user profile
 *     description: User-specific profile. Addresses only as `addresses` (max 5) + `defaultAddressIndex`. Set default — PATCH `/api/profile/addresses/default-index` or per-row PATCH. Game/org catalog — GET /api/profile/game-options.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
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
 *                   example: Profile retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Profile'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/profile/avatar:
 *   post:
 *     summary: Upload profile image to Cloudinary (not saved on profile yet)
 *     description: |
 *       Upload a profile image (max 1MB). Supported formats: JPG, PNG, WEBP.
 *       Send as `multipart/form-data` with field name `image`.
 *       The file is stored on Cloudinary only (no local disk). Response includes `uploadId` (Cloudinary public_id) and `profileImageUrl`.
 *       To persist on the user profile, send `profileImageUploadId: uploadId` in **PUT /api/profile**.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Upload staged successfully (pending save)
 *       400:
 *         description: Invalid file or file too large
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/profile:
 *   put:
 *     summary: Update user profile
 *     description: |
 *       followedGames replaces the whole list unless `mergeFollowedGames: true` (then merges like PATCH /followed-games).
 *       Prefer **PATCH /api/profile/followed-games** for saving a single game UID. Orgs/personalities unchanged if omitted.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileRequest'
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                   example: Profile updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Profile'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/profile/addresses:
 *   post:
 *     summary: Add a saved address
 *     description: |
 *       Optional `label` (e.g. Home/Office), optional `lat`/`lng` (both together for map pin).
 *       `setDefault: true` makes this row default; first saved address is default if omitted.
 *       Max 5 addresses per user (override with `MAX_SAVED_ADDRESSES` env).
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [addressLine1]
 *             properties:
 *               addressLine1: { type: string }
 *               addressLine2: { type: string, nullable: true }
 *               city: { type: string, nullable: true }
 *               state: { type: string, nullable: true }
 *               pincode: { type: string, nullable: true }
 *               contactNumber: { type: string, nullable: true }
 *               countryCode: { type: string, nullable: true }
 *               label: { type: string, nullable: true }
 *               setDefault: { type: boolean }
 *               lat: { type: number, nullable: true }
 *               lng: { type: number, nullable: true }
 *     responses:
 *       201:
 *         description: Address saved
 *       400:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/profile/addresses/default-index:
 *   patch:
 *     summary: Set default address by list index (Set as default button)
 *     description: |
 *       Body: `{ "index": 0 }` — `index` is 0-based and must match the order of `addresses` on GET profile (oldest `createdAt` first).
 *       Alias: `defaultIndex` instead of `index`. Use this from the row index in your FlatList.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               index:
 *                 type: integer
 *                 minimum: 0
 *                 example: 1
 *               defaultIndex:
 *                 type: integer
 *                 minimum: 0
 *                 description: Same as index (send exactly one of index or defaultIndex)
 *     responses:
 *       200:
 *         description: Updated profile address fields; check defaultAddressIndex
 *       400:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/profile/addresses/{addressId}:
 *   patch:
 *     summary: Update a saved address or set it as default
 *     description: |
 *       Send only fields to change. setDefault true marks this row default and clears default on others.
 *       Send lat and lng together, or both null to clear map pin.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               addressLine1: { type: string, nullable: true }
 *               addressLine2: { type: string, nullable: true }
 *               city: { type: string, nullable: true }
 *               state: { type: string, nullable: true }
 *               pincode: { type: string, nullable: true }
 *               contactNumber: { type: string, nullable: true }
 *               countryCode: { type: string, nullable: true }
 *               label: { type: string, nullable: true }
 *               setDefault: { type: boolean }
 *               lat: { type: number, nullable: true }
 *               lng: { type: number, nullable: true }
 *     responses:
 *       200:
 *         description: Updated
 *       400:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     summary: Remove a saved address (delete / trash button)
 *     description: |
 *       No request body. Bind your UI remove button to this call with the row's `addressId`.
 *       If you delete the default address, oldest remaining row becomes default. Response `data` has `addresses`, `defaultAddressIndex`, plus `removedAddressId` / `wasDefault`.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK — full list after removal
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
 *                     addresses:
 *                       type: array
 *                     defaultAddressIndex:
 *                       type: integer
 *                       nullable: true
 *                     removedAddressId:
 *                       type: string
 *                       description: Id that was deleted (use to drop from local state)
 *                     wasDefault:
 *                       type: boolean
 *                       description: True if the removed row was the default
 *       401:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/profile/game-profile:
 *   patch:
 *     summary: Update or clear game UID (same endpoint)
 *     description: |
 *       **UID delete — only uid:** `{ "uid": "43060786" }` (nothing else) → clears that UID wherever it is saved.
 *       **UID save / update:** game id + `uid` string (e.g. `gameId` + `uid`).
 *       **UID clear with game known:** `gameId` + `uid: null` or `clearUid: true`.
 *       Use `DELETE` on this path only to **remove the whole game** from the list.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PatchGameProfileRequest'
 *     responses:
 *       200:
 *         description: gameProfiles + gamePreference
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/RemoveGameProfileResponseData'
 *       400:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Clear UID requested but game not in list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     summary: Remove game from list (whole row)
 *     description: |
 *       `action: removeGame` (default) — removes that game from followedGames (trash).
 *       `action: clearUid` is legacy; use **PATCH** to clear or set UID.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RemoveGameProfileRequest'
 *     responses:
 *       200:
 *         description: Updated followed games / gameProfiles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/RemoveGameProfileResponseData'
 *       400:
 *         description: Validation error
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
 *       404:
 *         description: No matching game profile for this user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/profile/fcm-token:
 *   post:
 *     summary: Update FCM token
 *     description: Register or update the user's FCM device token for push notifications.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FcmTokenRequest'
 *     responses:
 *       200:
 *         description: FCM token updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
