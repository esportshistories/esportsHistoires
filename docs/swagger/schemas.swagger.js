/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: Enter JWT token obtained from login or register endpoint
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 400
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: 'Validation failed'
 *         errors:
 *           type: array
 *           items:
 *             type: string
 *     UpiTopupInitiateData:
 *       type: object
 *       description: Payload from POST /api/payment/create-qr or POST /api/payment/deposit (data field)
 *       properties:
 *         qrCodeId:
 *           type: string
 *           description: Use with confirm, qr-status, close-qr
 *         depositRequestId:
 *           type: string
 *           description: Same as qrCodeId — clearer label for manual/deposit flows
 *         paymentId:
 *           type: string
 *         receiptCode:
 *           type: string
 *         merchantUpi:
 *           type: string
 *           description: Merchant VPA from PAYMENT_UPI_ID (for manual entry in UPI apps)
 *         merchantName:
 *           type: string
 *         qrCodeImage:
 *           type: string
 *           nullable: true
 *           description: Base64 PNG data URL when includeQr true; null for deposit / includeQr false
 *         qrCodeSVG:
 *           type: string
 *           nullable: true
 *         qrCodeString:
 *           type: string
 *           description: UPI intent URI / deep link
 *         upiLink:
 *           type: string
 *         amountINR:
 *           type: number
 *           nullable: true
 *         creditINR:
 *           type: number
 *           nullable: true
 *         fixedAmount:
 *           type: boolean
 *         description:
 *           type: string
 *           description: Note shown in UPI flow
 *         expiresAt:
 *           type: string
 *           format: date-time
 *         transactionId:
 *           type: string
 *           description: MongoDB WalletHistory _id
 *         paymentMethod:
 *           type: string
 *           enum: [upi_qr, upi_link]
 *         payerUPI:
 *           type: string
 *           description: Echo of request when payerUPI was sent
 *         includeQr:
 *           type: boolean
 *           description: Present on create-qr; omitted or false for deposit-only route
 *         status:
 *           type: string
 *           example: pending
 *           description: User-facing status until admin verifies
 *         message:
 *           type: string
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: 'Operation successful'
 *         data:
 *           type: object
 *     RegisterRequest:
 *       type: object
 *       required: ['email', 'name', 'password']
 *       description: 'Email + name + password. OTP will be sent to email; after OTP verification the same password is used for login.'
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: 'user@example.com'
 *           description: 'User email address'
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           example: 'John Doe'
 *           description: 'User full name (letters and spaces only)'
 *         password:
 *           type: string
 *           minLength: 8
 *           example: 'Password123!'
 *           description: 'User password (minimum 8 characters with at least one capital letter, one number, and one special character)'
 *     RegisterResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 201
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: 'Registration successful. OTP has been sent to your email.'
 *         data:
 *           type: object
 *           properties:
 *             userId:
 *               type: string
 *               example: '507f1f77bcf86cd799439011'
 *             email:
 *               type: string
 *               example: 'user@example.com'
 *             name:
 *               type: string
 *               example: 'John Doe'
 *     VerifyOTPRequest:
 *       type: object
 *       required: ['email', 'otp']
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: 'user@example.com'
 *         otp:
 *           type: string
 *           pattern: '^[0-9]{6}$'
 *           example: '123456'
 *           description: '6-digit OTP code'
 *     LoginRequest:
 *       type: object
 *       required: ['email', 'password']
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: 'user@example.com'
 *         password:
 *           type: string
 *           example: 'password123'
 *         twoFactorCode:
 *           type: string
 *           pattern: '^[0-9]{6}$'
 *           description: Optional 6-digit TOTP code (required if 2FA is enabled and using single-step login)
 *           example: '123456'
 *     TwoFactorChallengeResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: '2FA required to complete login'
 *         data:
 *           type: object
 *           properties:
 *             twoFactorRequired:
 *               type: boolean
 *               example: true
 *             twoFactorToken:
 *               type: string
 *               description: Short-lived token to be used with /api/auth/2fa/verify-login
 *             role:
 *               type: string
 *               enum: [user, host, admin, org_manager]
 *             user:
 *               type: object
 *               description: Minimal user payload to let client route UI
 *               properties:
 *                 userId:
 *                   type: string
 *                 email:
 *                   type: string
 *                 name:
 *                   type: string
 *                 role:
 *                   type: string
 *                 isEmailVerified:
 *                   type: boolean
 *                 twoFactorEnabled:
 *                   type: boolean
 *     TwoFactorVerifyLoginRequest:
 *       type: object
 *       required: ['twoFactorToken', 'code']
 *       properties:
 *         twoFactorToken:
 *           type: string
 *         code:
 *           type: string
 *           pattern: '^[0-9]{6}$'
 *           example: '123456'
 *     TwoFactorSetupResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: '2FA setup generated'
 *         data:
 *           type: object
 *           properties:
 *             otpAuthUrl:
 *               type: string
 *             qrCodeDataUrl:
 *               type: string
 *               description: data URL of the QR code image
 *             secret:
 *               type: string
 *               description: base32 secret (show once)
 *     AuthResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: 'Login successful'
 *         data:
 *           type: object
 *           properties:
 *             accessToken:
 *               type: string
 *               example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *             refreshToken:
 *               type: string
 *               example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *             role:
 *               type: string
 *               enum: [user, host, admin, org_manager]
 *               description: Same as data.user.role; use for UI routing (which dashboard to open).
 *               example: user
 *             user:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                   example: '507f1f77bcf86cd799439011'
 *                 email:
 *                   type: string
 *                   example: 'user@example.com'
 *                 name:
 *                   type: string
 *                   example: 'John Doe'
 *                 role:
 *                   type: string
 *                   enum: [user, host, admin, org_manager]
 *                   example: user
 *                 isEmailVerified:
 *                   type: boolean
 *                   example: true
 *                 twoFactorEnabled:
 *                   type: boolean
 *                   description: Whether the user has TOTP 2FA enabled
 *                   example: false
 *                 followedGames:
 *                   type: array
 *                   description: Games the user follows (same shape as profile update). Empty if none.
 *                   items:
 *                     type: object
 *                     properties:
 *                       platform:
 *                         type: string
 *                         enum: [mobile, pc]
 *                       game:
 *                         type: string
 *                         example: 'BGMI'
 *                       uid:
 *                         type: string
 *                         nullable: true
 *                       selected:
 *                         type: boolean
 *                 organizationProfiles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       orgId:
 *                         type: string
 *                       orgName:
 *                         type: string
 *                 personalityProfiles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       personalityId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       knownAs:
 *                         type: string
 *                         nullable: true
 *                       role:
 *                         type: string
 *                         nullable: true
 *     ResendOTPRequest:
 *       type: object
 *       required: ['email']
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: 'user@example.com'
 *     RefreshTokenRequest:
 *       type: object
 *       required: ['refreshToken']
 *       properties:
 *         refreshToken:
 *           type: string
 *           example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *     RefreshTokenResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: 'Token refreshed successfully'
 *         data:
 *           type: object
 *           description: Same shape as login — includes current user and role after rotation
 *           properties:
 *             accessToken:
 *               type: string
 *               example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *             refreshToken:
 *               type: string
 *               example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *             role:
 *               type: string
 *               enum: [user, host, admin, org_manager]
 *             user:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 email:
 *                   type: string
 *                 name:
 *                   type: string
 *                 role:
 *                   type: string
 *                   enum: [user, host, admin, org_manager]
 *                 isEmailVerified:
 *                   type: boolean
 *                 followedGames:
 *                   type: array
 *                   description: Games the user follows. Empty if none.
 *                   items:
 *                     type: object
 *                     properties:
 *                       platform:
 *                         type: string
 *                         enum: [mobile, pc]
 *                       game:
 *                         type: string
 *                       uid:
 *                         type: string
 *                         nullable: true
 *                       selected:
 *                         type: boolean
 *                 organizationProfiles:
 *                   type: array
 *                   items:
 *                     type: object
 *                 personalityProfiles:
 *                   type: array
 *                   items:
 *                     type: object
 *     ForgotPasswordRequest:
 *       type: object
 *       required: ['email']
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: 'user@example.com'
 *     ResetPasswordRequest:
 *       type: object
 *       required: ['email', 'otp', 'newPassword']
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: 'user@example.com'
 *         otp:
 *           type: string
 *           pattern: '^[0-9]{6}$'
 *           example: '123456'
 *           description: '6-digit OTP code'
 *         newPassword:
 *           type: string
 *           minLength: 8
 *           example: 'NewPassword123!'
 *           description: 'New password (minimum 8 characters with at least one capital letter, one number, and one special character)'
 *     ChangePasswordRequest:
 *       type: object
 *       required: ['oldPassword', 'newPassword']
 *       properties:
 *         oldPassword:
 *           type: string
 *           example: 'oldpassword123'
 *         newPassword:
 *           type: string
 *           minLength: 8
 *           example: 'NewPassword123!'
 *           description: 'New password (minimum 8 characters with at least one capital letter, one number, and one special character). Confirm on the client only if needed.'
 *     Profile:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *           example: '507f1f77bcf86cd799439011'
 *         email:
 *           type: string
 *           example: 'user@example.com'
 *         name:
 *           type: string
 *           example: 'John Doe'
 *         phoneNumber:
 *           type: string
 *           nullable: true
 *           example: '+1234567890'
 *         gender:
 *           type: string
 *           enum: ['male', 'female', 'other', 'prefer_not_to_say']
 *           nullable: true
 *           example: 'male'
 *         dateOfBirth:
 *           type: string
 *           format: date
 *           nullable: true
 *           example: '2000-08-15'
 *           description: 'Date of birth (YYYY-MM-DD)'
 *         age:
 *           type: integer
 *           minimum: 13
 *           maximum: 120
 *           nullable: true
 *           example: 25
 *         gamePreference:
 *           type: object
 *           nullable: true
 *           description: 'Games/platform only on GET — org/person picks are only `organizationProfiles` and `personalityProfiles` (not duplicated here).'
 *           properties:
 *             platform:
 *               type: string
 *               enum: ['mobile', 'pc']
 *               nullable: true
 *             game:
 *               type: string
 *               nullable: true
 *             followedGames:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   platform:
 *                     type: string
 *                     enum: ['mobile', 'pc']
 *                   game:
 *                     type: string
 *                     example: 'BGMI'
 *                   uid:
 *                     type: string
 *                     nullable: true
 *                     example: 'BGMI_1234567890'
 *                   selected:
 *                     type: boolean
 *                     example: true
 *             updatedAt:
 *               type: string
 *               format: date-time
 *               nullable: true
 *         gameProfiles:
 *           type: array
 *           description: 'Derived from gamePreference.followedGames — use `uid` only (no duplicate gameUid)'
 *           items:
 *             type: object
 *             properties:
 *               gameId:
 *                 type: string
 *               gameName:
 *                 type: string
 *               uid:
 *                 type: string
 *                 nullable: true
 *               platform:
 *                 type: string
 *                 enum: [mobile, pc]
 *               selected:
 *                 type: boolean
 *         organizationProfiles:
 *           type: array
 *           description: 'User org picks only (orgId + orgName) — no duplicate string array'
 *           items:
 *             type: object
 *             properties:
 *               orgId:
 *                 type: string
 *               orgName:
 *                 type: string
 *         personalityProfiles:
 *           type: array
 *           description: 'UI-friendly personality list (personalityId + name/knownAs/role)'
 *           items:
 *             type: object
 *             properties:
 *               personalityId:
 *                 type: string
 *               name:
 *                 type: string
 *               knownAs:
 *                 type: string
 *                 nullable: true
 *               role:
 *                 type: string
 *                 nullable: true
 *         addresses:
 *           type: array
 *           description: 'All delivery addresses (max 5). Exactly one has `isDefault: true`. Order: oldest `createdAt` first. New row → POST /api/profile/addresses. Legacy PUT body field `address` still updates the default row only (not returned as a separate key).'
 *           items:
 *             type: object
 *             properties:
 *               addressId: { type: string }
 *               label: { type: string, nullable: true }
 *               addressLine1: { type: string, nullable: true }
 *               addressLine2: { type: string, nullable: true }
 *               city: { type: string, nullable: true }
 *               state: { type: string, nullable: true }
 *               pincode: { type: string, nullable: true }
 *               contactNumber: { type: string, nullable: true }
 *               countryCode: { type: string, nullable: true }
 *               isDefault: { type: boolean }
 *               lat: { type: number, nullable: true }
 *               lng: { type: number, nullable: true }
 *               createdAt: { type: string, format: date-time, nullable: true }
 *               updatedAt: { type: string, format: date-time, nullable: true }
 *         defaultAddressIndex:
 *           type: integer
 *           nullable: true
 *           example: 0
 *           description: '0-based index into `addresses` for the default row; null if empty.'
 *         paymentUPI:
 *           type: string
 *           nullable: true
 *           example: 'user@oksbi'
 *           description: 'UPI ID for payments'
 *         paymentMethod:
 *           type: string
 *           nullable: true
 *           example: 'UPI'
 *         isPaymentVerified:
 *           type: boolean
 *           example: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: '2024-01-01T00:00:00.000Z'
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: '2024-01-01T00:00:00.000Z'
 *     UpdateProfileRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           nullable: true
 *           example: 'John Doe'
 *           description: 'Display name (optional, 2–100 characters)'
 *         phoneNumber:
 *           type: string
 *           nullable: true
 *           example: '+1234567890'
 *           description: 'Phone number (optional)'
 *         gender:
 *           type: string
 *           enum: ['male', 'female', 'other', 'prefer_not_to_say']
 *           nullable: true
 *           example: 'male'
 *           description: 'Gender (optional)'
 *         dateOfBirth:
 *           type: string
 *           format: date
 *           nullable: true
 *           example: '2000-08-15'
 *           description: 'Date of birth (optional). Age is auto-calculated by backend.'
 *         mergeFollowedGames:
 *           type: boolean
 *           nullable: true
 *           example: true
 *           description: 'If true with followedGames, merges into existing list (add/update UID per game). If false/omit, followedGames replaces the whole list.'
 *         followedGames:
 *           type: array
 *           nullable: true
 *           description: 'Games you follow, or use gameProfiles (alias). Replace whole list unless mergeFollowedGames=true. Send uid only (not gameUid).'
 *           items:
 *             type: object
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: ['mobile', 'pc']
 *               game:
 *                 type: string
 *                 example: 'Valorant'
 *               gameName:
 *                 type: string
 *               gameId:
 *                 type: string
 *                 description: 'Slug e.g. brawl-stars'
 *               uid:
 *                 type: string
 *                 nullable: true
 *                 example: 'VALORANT#1234'
 *               selected:
 *                 type: boolean
 *                 example: false
 *         gameProfiles:
 *           type: array
 *           nullable: true
 *           description: 'Alias of followedGames for PUT /api/profile (same items). Prefer uid only.'
 *           items:
 *             type: object
 *         selectedGames:
 *           type: array
 *           nullable: true
 *           description: 'Same as followedGames — web/app alias `[{ platform, game, uid?, selected? }]`. Stored in gamePreference.followedGames.'
 *           items:
 *             type: object
 *         followedOrganizations:
 *           type: array
 *           nullable: true
 *           description: 'Preferred — same idea as followedGames: org names from game-options list. Per-user; [] or null clears.'
 *           items:
 *             type: string
 *             example: 'S8UL Esports'
 *         followedPersonalities:
 *           type: array
 *           nullable: true
 *           description: 'Preferred — strings (e.g. Mortal) or { name } objects; validated like games. Per-user; [] or null clears.'
 *           items:
 *             oneOf:
 *               - type: string
 *               - type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   knownAs:
 *                     type: string
 *         selectedEsportsOrganizations:
 *           type: array
 *           nullable: true
 *           description: 'Org names from GET /api/profile/game-options list (canonical spelling). Send [] or null to clear.'
 *           items:
 *             type: string
 *             example: 'S8UL Esports'
 *         selectedEsportsPersonalities:
 *           type: array
 *           nullable: true
 *           description: 'Pick by real name or knownAs (e.g. Mortal). Stored as canonical { name, knownAs, role }. Send [] or null to clear.'
 *           items:
 *             oneOf:
 *               - type: string
 *                 example: 'Mortal'
 *               - type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   knownAs:
 *                     type: string
 *         selectedOrganizations:
 *           type: array
 *           nullable: true
 *           description: 'Alias of selectedEsportsOrganizations'
 *           items:
 *             type: string
 *         selectedPersonalities:
 *           type: array
 *           nullable: true
 *           description: 'Alias of selectedEsportsPersonalities'
 *           items:
 *             type: string
 *         address:
 *           type: object
 *           nullable: true
 *           description: 'Updates the **default** saved address only (or creates the first saved row). For multiple addresses use POST/PATCH /api/profile/addresses.'
 *           properties:
 *             addressLine1:
 *               type: string
 *               nullable: true
 *               example: 'House no. 10, MG Road'
 *             addressLine2:
 *               type: string
 *               nullable: true
 *               example: 'Near City Mall'
 *             city:
 *               type: string
 *               nullable: true
 *               example: 'Ahmedabad'
 *             state:
 *               type: string
 *               nullable: true
 *               example: 'Gujarat'
 *             pincode:
 *               type: string
 *               nullable: true
 *               example: '380001'
 *             contactNumber:
 *               type: string
 *               nullable: true
 *               example: '9711587232'
 *             countryCode:
 *               type: string
 *               nullable: true
 *               example: '+91'
 *         paymentUPI:
 *           type: string
 *           nullable: true
 *           example: 'user@oksbi'
 *           description: 'UPI ID (optional, format: name@bank)'
 *     PatchFollowedGamesRequest:
 *       type: object
 *       description: 'Send either followedGames or gameProfiles (same array shape). Use uid only; gameUid is stripped server-side.'
 *       properties:
 *         followedGames:
 *           type: array
 *           minItems: 1
 *           description: 'Merge patches — omit uid to keep existing UID for that game'
 *           items:
 *             type: object
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: [mobile, pc]
 *               game:
 *                 type: string
 *               gameName:
 *                 type: string
 *               gameId:
 *                 type: string
 *               uid:
 *                 type: string
 *                 nullable: true
 *               selected:
 *                 type: boolean
 *         gameProfiles:
 *           type: array
 *           minItems: 1
 *           description: 'Alias of followedGames (mobile clients)'
 *           items:
 *             type: object
 *     PatchGameProfileRequest:
 *       type: object
 *       description: |
 *         **Delete UID with only uid:** body `{ "uid": "43060786" }` (no gameId/platform) → finds that saved UID and clears it.
 *         **Update/save:** send game id + `uid` string, or `uid: null` / `clearUid: true` with game id to clear.
 *         Keys allowed for uid-only delete: only `uid` and/or `gameUid` (no `clearUid` on that mode).
 *       properties:
 *         platform:
 *           type: string
 *           enum: [mobile, pc]
 *         game:
 *           type: string
 *         gameId:
 *           type: string
 *           example: 'free-fire'
 *         gameName:
 *           type: string
 *         uid:
 *           type: string
 *           nullable: true
 *           description: 'Set to new UID; null or "" to clear. Use only `uid` (not gameUid).'
 *         clearUid:
 *           type: boolean
 *           description: 'Alternative to uid:null — clears saved UID for that game'
 *     RemoveGameProfileRequest:
 *       type: object
 *       description: |
 *         **Remove whole game row** from followed list (trash card). For UID-only changes use **PATCH** same path.
 *         Legacy: action clearUid still works; prefer PATCH /api/profile/game-profile for clear uid.
 *       properties:
 *         action:
 *           type: string
 *           enum: [removeGame, clearUid]
 *           default: removeGame
 *           description: 'removeGame = remove row; clearUid = legacy, use PATCH instead'
 *         platform:
 *           type: string
 *           enum: [mobile, pc]
 *           example: mobile
 *         game:
 *           type: string
 *           example: 'Free Fire'
 *         gameId:
 *           type: string
 *           example: 'free-fire'
 *         gameName:
 *           type: string
 *           example: 'Free Fire'
 *     RemoveGameProfileResponseData:
 *       type: object
 *       properties:
 *         gameProfiles:
 *           type: array
 *           items:
 *             type: object
 *         gamePreference:
 *           type: object
 *           nullable: true
 *           description: 'Slim — platform, game, followedGames, updatedAt only (no org/person arrays).'
 *     FcmTokenRequest:
 *       type: object
 *       required: ['fcmToken']
 *       properties:
 *         fcmToken:
 *           type: string
 *           example: 'f7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8'
 *           description: 'FCM device token obtained from the Firebase SDK'
 *     GameSelectionRequest:
 *       type: object
 *       description: 'Use either (platform + game) for single selection, or selections[] for multiple selections (mobile + pc both).'
 *       properties:
 *         platform:
 *           type: string
 *           enum: ['mobile', 'pc']
 *           example: 'mobile'
 *         game:
 *           type: string
 *           example: 'BGMI'
 *         selections:
 *           type: array
 *           items:
 *             type: object
 *             required: ['platform', 'game']
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: ['mobile', 'pc']
 *               game:
 *                 type: string
 *           example:
 *             - platform: mobile
 *               game: BGMI
 *             - platform: pc
 *               game: Valorant
 *         status:
 *           type: string
 *           enum: ['upcoming', 'live', 'completed', 'pendingResult', 'cancelled']
 *           example: 'upcoming'
 *           description: 'Optional tournament status filter; defaults to upcoming'
 *     GameSelectionResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: 'Game selected successfully'
 *         data:
 *           type: object
 *           properties:
 *             selected:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   platform:
 *                     type: string
 *                     example: 'mobile'
 *                   game:
 *                     type: string
 *                     example: 'BGMI'
 *             options:
 *               type: object
 *               properties:
 *                 mobile:
 *                   type: array
 *                   items:
 *                     type: string
 *                 pc:
 *                   type: array
 *                   items:
 *                     type: string
 *             defaultPlatform:
 *               type: string
 *               example: 'mobile'
 *             tournaments:
 *               type: array
 *               items:
 *                 type: object
 *               description: 'Only selected game related tournaments'
 *             total:
 *               type: number
 *               example: 3
 *     DashboardFeedResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: 'Dashboard feed retrieved successfully'
 *         data:
 *           type: object
 *           properties:
 *             status:
 *               type: string
 *               example: 'upcoming'
 *             selectedGames:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   platform:
 *                     type: string
 *                     example: 'mobile'
 *                   game:
 *                     type: string
 *                     example: 'BGMI'
 *             gameFeeds:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   platform:
 *                     type: string
 *                   game:
 *                     type: string
 *                   tournaments:
 *                     type: array
 *                     items:
 *                       type: object
 *                   total:
 *                     type: number
 *             totalGames:
 *               type: number
 *               example: 2
 *             totalTournaments:
 *               type: number
 *               example: 5
 *     MeResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: 'Me data retrieved successfully'
 *         data:
 *           type: object
 *           properties:
 *             profile:
 *               $ref: '#/components/schemas/Profile'
 *             dashboard:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: 'upcoming'
 *                 selectedGames:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       platform:
 *                         type: string
 *                         example: 'mobile'
 *                       game:
 *                         type: string
 *                         example: 'BGMI'
 *                 gameFeeds:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       platform:
 *                         type: string
 *                       game:
 *                         type: string
 *                       tournaments:
 *                         type: array
 *                         items:
 *                           type: object
 *                       total:
 *                         type: number
 *                 totalGames:
 *                   type: number
 *                 totalTournaments:
 *                   type: number
 *     HealthCheckResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: 'OK'
 *         message:
 *           type: string
 *           example: 'BooyahX Backend is running'
 *         environment:
 *           type: string
 *           example: 'production'
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: '2024-01-01T00:00:00.000Z'
 *     Wallet:
 *       type: object
 *       properties:
 *         balanceGC:
 *           type: number
 *           example: 150.0
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     WalletHistory:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *         type:
 *           type: string
 *           enum: ['topup', 'join', 'reward', 'refund']
 *         amountGC:
 *           type: number
 *           description: Amount (cut for join, added for reward/refund)
 *         lobbyName:
 *           type: string
 *           nullable: true
 *           description: Lobby/tournament name (join, reward, refund)
 *         date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Lobby date or transaction date
 *         time:
 *           type: string
 *           nullable: true
 *           description: Lobby start time or transaction time
 *         description:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         tournamentId:
 *           type: string
 *           nullable: true
 *     Tournament:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         game:
 *           type: string
 *           example: 'Free Fire'
 *         mode:
 *           type: string
 *           enum: ['CS', 'BR', 'LW']
 *           description: 'Game mode: CS (Clash Squad), BR (Battle Royale), LW (Lone Wolf)'
 *         subMode:
 *           type: string
 *           enum: ['1v1', '2v2', 'solo', 'duo', 'squad']
 *         entryFee:
 *           type: number
 *           example: 50
 *         maxPlayers:
 *           type: number
 *           example: 48
 *         date:
 *           type: string
 *           format: date
 *         startTime:
 *           type: string
 *           example: '12:00 PM'
 *         lockTime:
 *           type: string
 *           format: date-time
 *         participants:
 *           type: array
 *           items:
 *             type: object
 *         hostId:
 *           type: string
 *           nullable: true
 *         room:
 *           type: object
 *           properties:
 *             roomId:
 *               type: string
 *               nullable: true
 *             password:
 *               type: string
 *               nullable: true
 *         prizePool:
 *           type: number
 *           example: 2400
 *         status:
 *           type: string
 *           enum: ['upcoming', 'locked', 'running', 'result_pending', 'completed', 'result_published', 'cancelled']
 *           description: 'Tournament status: upcoming (not started), locked (join closed), running (live), result_pending (ended, results not published), completed (results published), cancelled (insufficient teams or cancelled by admin)'
 *         results:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               position:
 *                 type: number
 *               kills:
 *                 type: number
 *               rewardGC:
 *                 type: number
 *               claimed:
 *                 type: boolean
 *     JoinTournamentRequest:
 *       type: object
 *       required: ['tournamentId']
 *       properties:
 *         tournamentId:
 *           type: string
 *           example: '507f1f77bcf86cd799439011'
 *     UpdateRoomRequest:
 *       type: object
 *       required: ['tournamentId']
 *       properties:
 *         tournamentId:
 *           type: string
 *           example: '507f1f77bcf86cd799439011'
 *         roomId:
 *           type: string
 *           nullable: true
 *           example: '123456789'
 *         password:
 *           type: string
 *           nullable: true
 *           example: 'pass123'
 *     ClaimRewardRequest:
 *       type: object
 *       required: ['tournamentId']
 *       properties:
 *         tournamentId:
 *           type: string
 *           example: '507f1f77bcf86cd799439011'
 *     ClaimStatus:
 *       type: object
 *       properties:
 *         eligible:
 *           type: boolean
 *           example: true
 *         rewardGC:
 *           type: number
 *           example: 1200
 *         claimed:
 *           type: boolean
 *           example: false
 *         position:
 *           type: number
 *           example: 1
 *         kills:
 *           type: number
 *           example: 15
 *     AddBalanceRequest:
 *       type: object
 *       required: ['userId', 'amountGC', 'description']
 *       properties:
 *         userId:
 *           type: string
 *           example: '507f1f77bcf86cd799439011'
 *         amountGC:
 *           type: number
 *           minimum: 0.01
 *           example: 100
 *         description:
 *           type: string
 *           example: 'Top-up via UPI'
 *     AssignHostRequest:
 *       type: object
 *       required: ['tournamentId', 'hostId']
 *       properties:
 *         tournamentId:
 *           type: string
 *           example: '507f1f77bcf86cd799439011'
 *         hostId:
 *           type: string
 *           example: '507f1f77bcf86cd799439012'
 *     BlockUsersRequest:
 *       type: object
 *       required: ['userIds']
 *       properties:
 *         userIds:
 *           type: array
 *           items:
 *             type: string
 *           example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
 *     CreateHostRequest:
 *       type: object
 *       required: ['email', 'name', 'password']
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: 'host@example.com'
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           example: 'Host Name'
 *         password:
 *           type: string
 *           minLength: 6
 *           example: 'password123'
 *     HostApplication:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         tournamentId:
 *           type: object
 *         hostId:
 *           type: object
 *         status:
 *           type: string
 *           enum: ['pending', 'approved', 'rejected']
 *         applicationDetails:
 *           type: object
 *           properties:
 *             experience:
 *               type: string
 *             reason:
 *               type: string
 *             additionalInfo:
 *               type: string
 *         adminId:
 *           type: object
 *           nullable: true
 *         adminNotes:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     ApplyForTournamentRequest:
 *       type: object
 *       properties:
 *         applicationDetails:
 *           type: object
 *           properties:
 *             experience:
 *               type: string
 *               example: '5 years of hosting experience'
 *             reason:
 *               type: string
 *               example: 'I want to host this tournament'
 *             additionalInfo:
 *               type: string
 *               example: 'Additional information about my hosting capabilities'
 *     RejectHostApplicationRequest:
 *       type: object
 *       properties:
 *         adminNotes:
 *           type: string
 *           example: 'Application rejected due to insufficient experience'
 *     User:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         email:
 *           type: string
 *         name:
 *           type: string
 *         role:
 *           type: string
 *           enum: ['user', 'host', 'admin']
 *         isBlocked:
 *           type: boolean
 *         isEmailVerified:
 *           type: boolean
 *         ign:
 *           type: string
 *           nullable: true
 *         phoneNumber:
 *           type: string
 *           nullable: true
 *         gender:
 *           type: string
 *           nullable: true
 *         age:
 *           type: integer
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     PaginationResponse:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 10
 *         total:
 *           type: integer
 *           example: 100
 *         totalPages:
 *           type: integer
 *           example: 10
 *
 * tags:
 *   - name: Health
 *     description: Health check endpoints
 *   - name: Authentication
 *     description: User authentication and authorization endpoints
 *   - name: Profile
 *     description: User profile management endpoints
 *   - name: Wallet
 *     description: Wallet and balance management endpoints
 *   - name: Payment
 *     description: |
 *       Top-up / deposit: manual UPI (`/api/payment/create-qr`, `/api/payment/deposit`, confirm & status routes) and Razorpay PG (`/api/payment/razorpay/*`).
 *   - name: Tournament
 *     description: Tournament and lobby management endpoints
 *   - name: Admin
 *     description: Admin-only endpoints for tournament and user management
 *   - name: Host
 *     description: Host-only endpoints for tournament hosting applications
 *   - name: WebSocket
 *     description: WebSocket real-time communication for tournament updates
 */
