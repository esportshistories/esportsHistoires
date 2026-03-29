/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register new user
 *     description: Register a new user with email, name, and password. An OTP will be sent to the provided email address for verification. After OTP verification, the same password will be used and user will be logged in automatically.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Registration successful. OTP sent to email.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegisterResponse'
 *       400:
 *         description: Validation error or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and complete registration
 *     description: Verify the OTP sent to user's email. Uses the password provided during registration, creates the account with role `user`, and logs the user in by returning tokens.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyOTPRequest'
 *     responses:
 *       200:
 *         description: OTP verified and password set successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Invalid OTP, expired OTP, or validation error
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
 * /api/auth/resend-otp:
 *   post:
 *     summary: Resend OTP
 *     description: Resend OTP to user's email address for verification.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResendOTPRequest'
 *     responses:
 *       200:
 *         description: OTP resent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Email already verified or validation error
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
 * /api/auth/login:
 *   post:
 *     summary: Unified login (all roles)
 *     description: |
 *       Single login for every account type (user, host, admin, org_manager).
 *       On success, `data.role` and `data.user.role` tell the client which UI to show.
 *       Admins can use this instead of POST /api/admin/login; tokens work the same for /api/admin/* (role is checked from DB on each request).
 *       Returns access and refresh tokens.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: |
 *           Either returns tokens (normal login) OR returns a 2FA challenge when the user has TOTP enabled.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/AuthResponse'
 *                 - $ref: '#/components/schemas/TwoFactorChallengeResponse'
 *       400:
 *         description: Password not set or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid credentials or email not verified
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/2fa/status:
 *   get:
 *     summary: Get 2FA status
 *     description: Returns whether TOTP 2FA is enabled for the authenticated user.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: integer, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: '2FA status retrieved' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean, example: false }
 */

/**
 * @swagger
 * /api/auth/2fa/setup:
 *   post:
 *     summary: Start 2FA setup (generate QR + secret)
 *     description: Generates a temporary TOTP secret and QR code. You must call /api/auth/2fa/enable with a valid code to enable 2FA.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA setup generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TwoFactorSetupResponse'
 */

/**
 * @swagger
 * /api/auth/2fa/enable:
 *   post:
 *     summary: Enable 2FA
 *     description: Enables TOTP 2FA after verifying a code generated by the authenticator app.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *     responses:
 *       200:
 *         description: 2FA enabled
 */

/**
 * @swagger
 * /api/auth/2fa/disable:
 *   post:
 *     summary: Disable 2FA
 *     description: Disables TOTP 2FA after verifying a current code.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *     responses:
 *       200:
 *         description: 2FA disabled
 */

/**
 * @swagger
 * /api/auth/2fa/verify-login:
 *   post:
 *     summary: Complete login with 2FA
 *     description: Verify the 2FA code using `twoFactorToken` returned from /api/auth/login when 2FA is enabled.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TwoFactorVerifyLoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 */

/**
 * @swagger
 * /api/auth/google-login:
 *   post:
 *     summary: Google OAuth login (Mobile/Android)
 *     description: Authenticate user with Google ID token. Creates new account if user doesn't exist, or links Google account if email already exists. No OTP or password required.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID token from client-side OAuth
 *               name:
 *                 type: string
 *                 description: Optional user name (will use Google name if not provided)
 *     responses:
 *       200:
 *         description: Google login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Invalid token, validation error, or Google account already linked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid Google token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google OAuth flow (Browser)
 *     description: Redirects user to Google OAuth consent screen. After user authorizes, Google redirects to /api/auth/google/callback
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: redirect
 *         schema:
 *           type: string
 *         description: Frontend URL to redirect to after successful OAuth (optional)
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth consent screen
 *       500:
 *         description: OAuth configuration error
 */

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback (Browser)
 *     description: Handles OAuth callback from Google, exchanges authorization code for tokens, and creates/logs in user. Redirects to frontend with tokens.
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Google
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State parameter for CSRF protection
 *       - in: query
 *         name: error
 *         schema:
 *           type: string
 *         description: Error from Google OAuth (if any)
 *     responses:
 *       302:
 *         description: Redirect to frontend with tokens in query parameters
 *       500:
 *         description: OAuth error
 */

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     description: Get a new access token using a valid refresh token.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefreshTokenResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Forgot password
 *     description: Send OTP to user's email for password reset.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: OTP sent successfully (always returns success for security)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Email not verified or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password
 *     description: Verify OTP and reset user password. All refresh tokens will be invalidated.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Invalid OTP, expired OTP, or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Email not verified
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
 * /api/auth/change-password:
 *   put:
 *     summary: Change password
 *     description: Change user password with old password confirmation. Requires authentication. All refresh tokens will be invalidated.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Old password incorrect, same as old password, or validation error
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

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Logout from current device by invalidating the refresh token. Works for all user types (admin, user, host).
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: Logout successful
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

/**
 * @swagger
 * /api/auth/logout-all:
 *   post:
 *     summary: Logout from all devices
 *     description: Logout from all devices by invalidating all refresh tokens. Works for all user types (admin, user, host).
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all devices successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/device-history:
 *   get:
 *     summary: Device history + active sessions
 *     description: Returns current active device sessions and recent login history (no tokens included). Useful for "Device history" UI and single-device logout.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeActive
 *         schema:
 *           type: string
 *           enum: ["0","1"]
 *           example: "1"
 *         description: Include active sessions section (default "1")
 *       - in: query
 *         name: includeHistory
 *         schema:
 *           type: string
 *           enum: ["0","1"]
 *           example: "0"
 *         description: Include login history section (default "0"). Set to "1" when user opens Login History screen.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: History page number (1-based)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: History page size (max 50)
 *       - in: query
 *         name: activePage
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Active devices page number (1-based)
 *       - in: query
 *         name: activeLimit
 *         schema:
 *           type: integer
 *           example: 5
 *         description: Active devices page size (max 50)
 *     responses:
 *       200:
 *         description: Device history retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: integer, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Device history retrieved }
 *                 data:
 *                   type: object
 *                   properties:
 *                     activeDevices:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               sessionId: { type: string, example: "a1b2c3..." }
 *                               deviceInfo: { type: string, example: "Mozilla/5.0 ..." }
 *                               deviceLabel: { type: string, example: "Chrome • Android" }
 *                               ip: { type: string, example: "203.0.113.10" }
 *                               createdAt: { type: string, format: date-time }
 *                               lastUsedAt: { type: string, format: date-time }
 *                               expiresAt: { type: string, format: date-time }
 *                         meta:
 *                           type: object
 *                           properties:
 *                             page: { type: integer, example: 1 }
 *                             limit: { type: integer, example: 5 }
 *                             total: { type: integer, example: 2 }
 *                             totalPages: { type: integer, example: 1 }
 *                     history:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               sessionId: { type: string, example: "a1b2c3..." }
 *                               deviceInfo: { type: string, example: "Mozilla/5.0 ..." }
 *                               deviceLabel: { type: string, example: "Chrome • Android" }
 *                               ip: { type: string, example: "203.0.113.10" }
 *                               loggedInAt: { type: string, format: date-time }
 *                               loggedOutAt: { type: string, format: date-time, nullable: true }
 *                               logoutReason: { type: string, nullable: true, example: "new_login" }
 *                         meta:
 *                           type: object
 *                           properties:
 *                             page: { type: integer, example: 1 }
 *                             limit: { type: integer, example: 10 }
 *                             total: { type: integer, example: 23 }
 *                             totalPages: { type: integer, example: 3 }
 *                 description: |
 *                   Response can omit `history` when `includeHistory=0`, and can omit `activeDevices` when `includeActive=0`.
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/logout-device:
 *   post:
 *     summary: Logout a specific device session
 *     description: Logs out a specific device by `sessionId` (revokes that session's refresh token). Use GET /api/auth/device-history to obtain sessionId.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId]
 *             properties:
 *               sessionId:
 *                 type: string
 *                 example: "a1b2c3..."
 *     responses:
 *       200:
 *         description: Device logged out successfully
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
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
