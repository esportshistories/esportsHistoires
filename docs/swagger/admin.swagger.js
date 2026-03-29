/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: Admin-only login (legacy)
 *     description: |
 *       **Deprecated for new clients:** use `POST /api/auth/login` for everyone; response includes `role` for routing.
 *       This route still rejects non-admins **before** password check (403), which slightly reduces credential-enumeration noise for admin-only UIs.
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: AdminPassword123!
 *     responses:
 *       200:
 *         description: Admin login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         userId:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                         isEmailVerified:
 *                           type: boolean
 *       400:
 *         description: Password not set, validation error, or account uses Google login
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
 *       403:
 *         description: You are not authorized (non-admin user)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/admin/generate-next-day-lobbies:
 *   post:
 *     summary: Generate next day lobbies (Admin only)
 *     description: Generate tournaments for the next day for all game modes and time slots (12 PM, 3 PM, 6 PM, 9 PM)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Next day tournaments generated successfully
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
 *                   example: Next day tournaments generated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournaments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           game:
 *                             type: string
 *                           mode:
 *                             type: string
 *                           subMode:
 *                             type: string
 *                           date:
 *                             type: string
 *                             format: date
 *                           startTime:
 *                             type: string
 *                           entryFee:
 *                             type: number
 *                           maxPlayers:
 *                             type: number
 *                     total:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/organizations:
 *   post:
 *     summary: Create organization (Admin)
 *     description: |
 *       Creates a new organization and assigns an owner.
 *       - Owner user will automatically get role `org_manager` (unless already admin).
 *       - Owner is also added to managerIds list by default.
 *     tags: [Admin, Organization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - ownerUserId
 *             properties:
 *               name:
 *                 type: string
 *                 description: Organization display name
 *                 example: "Skull Esports"
 *               ownerUserId:
 *                 type: string
 *                 description: User ID of org owner (will be promoted to org_manager)
 *               slug:
 *                 type: string
 *                 description: Optional slug (URL-safe). If not provided, generated from name.
 *     responses:
 *       201:
 *         description: Organization created successfully
 *       400:
 *         description: Validation error or organization with same name/slug exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *
 *   get:
 *     summary: List organizations (Admin)
 *     description: Paginated list of organizations with owner and managers.
 *     tags: [Admin, Organization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or slug
 *     responses:
 *       200:
 *         description: Organizations retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/organizations/{orgId}/managers:
 *   post:
 *     summary: Add organization manager (Admin)
 *     description: |
 *       Adds a user as manager to an organization.
 *       - User will be promoted to role `org_manager` (unless already admin/org_manager).
 *     tags: [Admin, Organization]
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
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID to add as manager
 *     responses:
 *       200:
 *         description: Organization manager added successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Organization or user not found
 *
 * /api/admin/organizations/{orgId}/managers/{userId}:
 *   delete:
 *     summary: Remove organization manager (Admin)
 *     description: |
 *       Removes a manager from organization managerIds.
 *       - Cannot remove the organization owner using this API.
 *     tags: [Admin, Organization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Manager user ID to remove
 *     responses:
 *       200:
 *         description: Organization manager removed successfully
 *       400:
 *         description: Validation error (e.g., trying to remove owner)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Organization not found
 */

/**
 * @swagger
 * /api/admin/generate-lobbies:
 *   post:
 *     summary: Generate lobbies with custom parameters (Admin only)
 *     description: Generate tournaments with custom date, time slots, game modes, and region selection
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - timeSlots
 *               - mode
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: '2024-12-25'
 *                 description: Date in ISO format (YYYY-MM-DD) - can be selected from calendar
 *               timeSlots:
 *                 type: array
 *                 items:
 *                   type: string
 *                   pattern: '^([1-9]|1[0-2]):([0-5][0-9])\\s(AM|PM)$'
 *                 example: ['5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM']
 *                 description: Array of time slots in format "HH:MM AM/PM" (e.g., "5:00 PM", "12:00 PM", "9:30 AM") - admin can create any custom time slots
 *               mode:
 *                 type: string
 *                 enum: [CS, BR, LW]
 *                 example: BR
 *                 description: Game mode - Clash Squad (CS), Battle Royale (BR), or Lone Wolf (LW)
 *               subModes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ['solo', 'duo', 'squad']
 *                 description: |
 *                   For CS: ['solo', 'duo', 'squad'] or ['1v1', '2v2', '4v4'] (optional - if not provided, defaults to ['squad'] which maps to '4v4')
 *                   For BR: ['solo', 'duo', 'squad'] (required)
 *                   For LW: ['solo', 'duo', 'squad', '1v1', '2v2'] (optional - if not provided, defaults to ['1v1']. If '1v1' is selected, '2v2' is automatically included)
 *               price:
 *                 type: number
 *                 enum: [25, 50, 75, 100, 150, 200, 300]
 *                 example: 100
 *                 description: Single entry fee in INR (wallet). If provided, creates lobbies with this price. Alternative to entryFees array.
 *               entryFees:
 *                 type: array
 *                 items:
 *                   type: number
 *                   enum: [25, 50, 75, 100, 150, 200, 300]
 *                 example: [100, 200, 300]
 *                 description: Array of entry fees in INR (wallet). If not provided, uses default from mode config. Multiple entry fees will create separate lobbies for each. If 'price' is provided, it takes precedence.
 *               region:
 *                 type: string
 *                 enum: [Asia, Global]
 *                 default: Global
 *                 example: Asia
 *                 description: Region selection (optional, defaults to Global)
 *     responses:
 *       201:
 *         description: Tournaments generated successfully
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
 *                   example: Tournaments generated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournaments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           game:
 *                             type: string
 *                           mode:
 *                             type: string
 *                           subMode:
 *                             type: string
 *                           date:
 *                             type: string
 *                             format: date
 *                           startTime:
 *                             type: string
 *                           entryFee:
 *                             type: number
 *                           maxPlayers:
 *                             type: number
 *                           region:
 *                             type: string
 *                     total:
 *                       type: number
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/tournaments/{tournamentId}/hosts:
 *   get:
 *     summary: Get hosts list for tournament assignment (Admin only)
 *     description: Get list of all hosts with their existing lobby assignments and time conflict warnings for a specific tournament
 *     tags: [Admin]
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
 *         description: Hosts list retrieved successfully
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
 *                   example: Hosts list retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournament:
 *                       type: object
 *                       properties:
 *                         tournamentId:
 *                           type: string
 *                         date:
 *                           type: string
 *                           format: date-time
 *                         startTime:
 *                           type: string
 *                         game:
 *                           type: string
 *                         mode:
 *                           type: string
 *                         subMode:
 *                           type: string
 *                     hosts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           hostId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           assignedLobbies:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 tournamentId:
 *                                   type: string
 *                                 game:
 *                                   type: string
 *                                 mode:
 *                                   type: string
 *                                 subMode:
 *                                   type: string
 *                                 date:
 *                                   type: string
 *                                   format: date-time
 *                                 startTime:
 *                                   type: string
 *                                 entryFee:
 *                                   type: number
 *                                 status:
 *                                   type: string
 *                           totalLobbies:
 *                             type: number
 *                           hasTimeConflict:
 *                             type: boolean
 *                           timeConflictDetails:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               warning:
 *                                 type: string
 *                               conflictingTournaments:
 *                                 type: array
 *                                 items:
 *                                   type: object
 *                     total:
 *                       type: number
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/admin/assign-host:
 *   post:
 *     summary: Assign host to tournament (Admin only)
 *     description: Manually assign a host user to a tournament. Checks for time conflicts and returns warnings. Use forceAssign=true to proceed despite conflicts.
 *     tags: [Admin]
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
 *               - hostId
 *             properties:
 *               tournamentId:
 *                 type: string
 *                 example: '507f1f77bcf86cd799439011'
 *               hostId:
 *                 type: string
 *                 example: '507f1f77bcf86cd799439012'
 *               forceAssign:
 *                 type: boolean
 *                 default: false
 *                 description: Set to true to assign host despite time conflicts
 *     responses:
 *       200:
 *         description: Host assigned successfully or time conflict warning
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
 *                   example: Host assigned successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                       example: '507f1f77bcf86cd799439011'
 *                     hostId:
 *                       type: string
 *                       example: '507f1f77bcf86cd799439012'
 *                     hasTimeConflict:
 *                       type: boolean
 *                       example: false
 *                     warning:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     conflictingTournaments:
 *                       type: array
 *                       items:
 *                         type: object
 *                       description: Present when hasTimeConflict is true and forceAssign is false
 *                     message:
 *                       type: string
 *                       description: Present when hasTimeConflict is true, instructs to use forceAssign
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List users with pagination and search (Admin only)
 *     description: Get paginated list of users with optional search by email or name and filter by role
 *     tags: [Admin]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for email or name. Can also use query parameter.
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search term for email or name. Alias for search parameter.
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [user, host, admin, org_manager]
 *         description: Filter users by role (omit for all roles). Org managers include `managedOrganizations` when they own or manage an org.
 *     responses:
 *       200:
 *         description: Users retrieved successfully
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
 *                   example: Users retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/users/block:
 *   post:
 *     summary: Block multiple users (Admin only)
 *     description: Block selected users by setting isBlocked to true. Blocked users cannot login.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BlockUsersRequest'
 *     responses:
 *       200:
 *         description: Users blocked successfully
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
 *                   example: Users blocked successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     blockedCount:
 *                       type: number
 *                       example: 2
 *                     userIds:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/users/unblock:
 *   post:
 *     summary: Unblock multiple users (Admin only)
 *     description: Unblock selected users by setting isBlocked to false. Unblocked users can login again.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BlockUsersRequest'
 *     responses:
 *       200:
 *         description: Users unblocked successfully
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
 *                   example: Users unblocked successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     unblockedCount:
 *                       type: number
 *                       example: 2
 *                     userIds:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/hosts/create:
 *   post:
 *     summary: Create host account (Admin only)
 *     description: Create a new host account with email, name, and password. Host account is automatically verified.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateHostRequest'
 *     responses:
 *       201:
 *         description: Host account created successfully
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
 *                   example: Host account created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     host:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                         role:
 *                           type: string
 *                           example: host
 *       400:
 *         description: Validation error or host already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/host-applications:
 *   get:
 *     summary: List host applications (Admin only)
 *     description: Get paginated list of host applications with optional status filter
 *     tags: [Admin]
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
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/host-applications/{applicationId}/approve:
 *   post:
 *     summary: Approve host application (Admin only)
 *     description: Approve a host application and automatically assign host to tournament
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Host application ID
 *     responses:
 *       200:
 *         description: Host application approved successfully
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
 *                   example: Host application approved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     applicationId:
 *                       type: string
 *                     tournamentId:
 *                       type: string
 *                     hostId:
 *                       type: string
 *       400:
 *         description: Application is not pending
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Host application not found
 */

/**
 * @swagger
 * /api/admin/host-applications/{applicationId}/reject:
 *   post:
 *     summary: Reject host application (Admin only)
 *     description: Reject a host application with optional admin notes
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Host application ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RejectHostApplicationRequest'
 *     responses:
 *       200:
 *         description: Host application rejected successfully
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
 *                   example: Host application rejected successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     applicationId:
 *                       type: string
 *                     tournamentId:
 *                       type: string
 *                     hostId:
 *                       type: string
 *       400:
 *         description: Application is not pending
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Host application not found
 */

/**
 * @swagger
 * /api/admin/tournaments:
 *   get:
 *     summary: List tournaments (Admin only)
 *     description: Get tournaments filtered by status (upcoming, live, completed, pendingResult). Shows all tournaments created by admin. pendingResult shows tournaments that have ended but results are not yet published.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, live, completed, pendingResult]
 *           default: upcoming
 *         description: Filter tournaments by status (upcoming, live, completed, or pendingResult). pendingResult shows tournaments that have ended but results are not yet published.
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *           example: '2025-12-04'
 *         description: Filter tournaments by specific date (YYYY-MM-DD). Shows tournaments for that day only (e.g., today's or next day's lobbies).
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter tournaments from this date onwards (for upcoming only)
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter tournaments up to this date (used with fromDate for date range)
 *       - in: query
 *         name: subMode
 *         schema:
 *           type: string
 *           enum: [solo, duo, squad, 1v1, 2v2, 4v4]
 *         description: Filter tournaments by subMode (solo, duo, squad for BR/LW, 1v1, 2v2, 4v4 for CS)
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [CS, BR, LW]
 *         description: Filter tournaments by game mode
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/tournaments/{tournamentId}:
 *   put:
 *     summary: Edit tournament (Admin only)
 *     description: Update tournament details. Can only edit tournaments that are upcoming or locked (not started yet).
 *     tags: [Admin]
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
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: '2025-12-05'
 *               startTime:
 *                 type: string
 *                 pattern: '^([1-9]|1[0-2]):([0-5][0-9])\\s?(AM|PM)$'
 *                 example: '6:00 PM'
 *                 description: Time in format "HH:MM AM/PM" (e.g., "5:00 PM", "12:00 PM", "9:30 AM")
 *               entryFee:
 *                 type: number
 *                 enum: [25, 50, 75, 100, 150, 200, 300]
 *                 example: 100
 *               maxPlayers:
 *                 type: number
 *                 minimum: 1
 *                 example: 48
 *               region:
 *                 type: string
 *                 enum: [Asia, Global]
 *                 example: Asia
 *               mode:
 *                 type: string
 *                 enum: [CS, BR, LW]
 *                 example: BR
 *               subMode:
 *                 type: string
 *                 example: squad
 *     responses:
 *       200:
 *         description: Tournament updated successfully
 *       400:
 *         description: Validation error or cannot edit tournament
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/admin/tournaments/{tournamentId}:
 *   delete:
 *     summary: Delete tournament (Admin only)
 *     description: Delete a tournament. Can only delete tournaments that are upcoming or locked (not started yet). If participants have joined, their entry fees will be automatically refunded to their wallets.
 *     tags: [Admin]
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
 *         description: Tournament deleted successfully. Participants refunded if any.
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
 *                   example: Tournament deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                     refundedCount:
 *                       type: number
 *                       description: Number of participants refunded
 *                     totalParticipants:
 *                       type: number
 *                       description: Total participants before deletion
 *                     refundedUsers:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Array of user IDs who received refunds
 *                     message:
 *                       type: string
 *       400:
 *         description: Cannot delete tournament (already started or completed)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/admin/tournaments/{tournamentId}/update-room:
 *   post:
 *     summary: Update room information (Admin only)
 *     description: Update room ID and password for a tournament. Tournament ID is in the URL. Admin can update room for any tournament regardless of status.
 *     tags: [Admin]
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
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/admin/tournaments/{tournamentId}/notify-lobby-filling:
 *   post:
 *     summary: Notify all users – lobby filling up (Admin only)
 *     description: |
 *       Sends a push notification to all connected users to attract them to join the lobby.
 *       Use when lobby is filling up and you want to notify users. No request body.
 *     tags: [Admin]
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
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Tournament not found
 */

/**
 * @swagger
 * /api/admin/notifications/send:
 *   post:
 *     summary: Send custom push notification to all users (Admin only)
 *     description: |
 *       Sends a custom title and message as a push notification (FCM & WebSocket) to all users.
 *       FCM notifications are delivered via the 'all_users' topic for offline reliability.
 *       Use for announcements, reminders, or any admin message to all users.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, message]
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *                 example: 'New Feature'
 *               message:
 *                 type: string
 *                 maxLength: 1000
 *                 example: 'Check out the new lobby filters!'
 *     responses:
 *       200:
 *         description: Custom notification sent to all users
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
 *                   example: Custom notification sent to all users
 *                 data:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     message:
 *                       type: string
 *       400:
 *         description: Validation error (title/message required or too long)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/hosts:
 *   get:
 *     summary: List all hosts (Admin only)
 *     description: Get simple list of all hosts with basic information (name, email, ID, status)
 *     tags: [Admin]
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
 *           default: 100
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for email or name. Can also use query parameter.
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search term for email or name. Alias for search parameter.
 *     responses:
 *       200:
 *         description: Hosts list retrieved successfully
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
 *                   example: Hosts list retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     hosts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           isBlocked:
 *                             type: boolean
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/hosts/statistics:
 *   get:
 *     summary: Get host statistics and daily records (Admin only)
 *     description: Get detailed statistics for all hosts including total lobbies, time slots, and daily records with full tournament details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *           example: '2025-12-04'
 *         description: Filter by specific date (YYYY-MM-DD)
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *           example: '2025-12-01'
 *         description: Filter from this date onwards (YYYY-MM-DD)
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *           example: '2025-12-31'
 *         description: Filter up to this date (YYYY-MM-DD)
 *       - in: query
 *         name: hostId
 *         schema:
 *           type: string
 *         description: Filter by specific host ID (optional, use email instead)
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Filter by host email (preferred over hostId)
 *     responses:
 *       200:
 *         description: Host statistics retrieved successfully
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
 *                   example: Host statistics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalHosts:
 *                       type: number
 *                       example: 5
 *                     totalLobbies:
 *                       type: number
 *                       example: 25
 *                     filters:
 *                       type: object
 *                       properties:
 *                         date:
 *                           type: string
 *                           nullable: true
 *                         fromDate:
 *                           type: string
 *                           nullable: true
 *                         toDate:
 *                           type: string
 *                           nullable: true
 *                         hostId:
 *                           type: string
 *                           nullable: true
 *                         email:
 *                           type: string
 *                           nullable: true
 *                     hosts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           hostId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           totalLobbies:
 *                             type: number
 *                             description: Total number of lobbies assigned to this host
 *                           timeSlotSummary:
 *                             type: object
 *                             description: Count of lobbies per time slot
 *                             additionalProperties:
 *                               type: number
 *                             example:
 *                               '12:00 PM': 5
 *                               '3:00 PM': 3
 *                               '6:00 PM': 2
 *                               '9:00 PM': 1
 *                           dailyRecords:
 *                             type: array
 *                             description: Daily records grouped by date
 *                             items:
 *                               type: object
 *                               properties:
 *                                 date:
 *                                   type: string
 *                                   format: date
 *                                   example: '2025-12-04'
 *                                 totalLobbies:
 *                                   type: number
 *                                   example: 4
 *                                 timeSlots:
 *                                   type: object
 *                                   description: Count of lobbies per time slot for this date
 *                                   additionalProperties:
 *                                     type: number
 *                                 tournaments:
 *                                   type: array
 *                                   description: Full tournament details for this date
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       tournamentId:
 *                                         type: string
 *                                       game:
 *                                         type: string
 *                                       mode:
 *                                         type: string
 *                                       subMode:
 *                                         type: string
 *                                       startTime:
 *                                         type: string
 *                                       entryFee:
 *                                         type: number
 *                                       maxPlayers:
 *                                         type: number
 *                                       currentPlayers:
 *                                         type: number
 *                                       status:
 *                                         type: string
 *                                       region:
 *                                         type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/topup-transactions:
 *   get:
 *     summary: Get all top-up transactions (Admin only)
 *     description: Retrieve all top-up transactions with date, time, and status. Can be filtered by status, user ID, and date range.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [success, fail]
 *         description: Filter by transaction status
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Filter by user email
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter transactions from this date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter transactions up to this date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Top-up transactions retrieved successfully
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
 *                   example: Top-up transactions retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           userId:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *                               ign:
 *                                 type: string
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
 *                     total:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     skip:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/*
 * @swagger
 * /api/admin/payments/pending:
 *   get:
 *     summary: Get pending payment requests (Admin only)
 *     description: Retrieve all pending payment requests that need admin approval. These are payments where users have submitted UTR and are waiting for admin verification.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Filter by user email
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter transactions from this date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter transactions up to this date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Pending payment requests retrieved successfully
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
 *                   example: Pending payment requests retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     pendingPayments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           userId:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *                               ign:
 *                                 type: string
 *                           type:
 *                             type: string
 *                             example: topup
 *                           amountINR:
 *                             type: number
 *                           description:
 *                             type: string
 *                           status:
 *                             type: string
 *                             example: fail
 *                             description: Status is 'fail' for pending payments
 *                           utr:
 *                             type: string
 *                             description: UTR number provided by user
 *                           qrCodeId:
 *                             type: string
 *                           receiptCode:
 *                             type: string
 *                           paymentMethod:
 *                             type: string
 *                           paymentVerified:
 *                             type: boolean
 *                           verifiedBy:
 *                             type: string
 *                           verifiedAt:
 *                             type: string
 *                             format: date-time
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     total:
 *                       type: number
 *                       description: Total number of pending payment requests
 *                     limit:
 *                       type: number
 *                     skip:
 *                       type: number
 *                     message:
 *                       type: string
 *                       example: Found 5 pending payment request(s) awaiting admin approval
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/*
 * @swagger
 * /api/admin/topup-transactions/{transactionId}/update-status:
 *   post:
 *     summary: Update top-up transaction status (Admin only)
 *     description: Admin can update transaction status to 'success' or 'fail'. When marked as 'success', balance is added to user wallet. When marked as 'fail', balance is not added.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: WalletHistory transaction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [success, fail]
 *                 example: success
 *                 description: Transaction status - 'success' adds balance, 'fail' does not add balance
 *     responses:
 *       200:
 *         description: Transaction status updated successfully
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
 *                   example: Transaction status updated to success
 *                 data:
 *                   type: object
 *                   properties:
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         userId:
 *                           type: string
 *                         type:
 *                           type: string
 *                           example: topup
 *                         amountINR:
 *                           type: number
 *                         description:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [success, fail]
 *                         addedBy:
 *                           type: string
 *                           enum: [user, admin]
 *                         timestamp:
 *                           type: string
 *                           format: date-time
 *                     wallet:
 *                       type: object
 *                       properties:
 *                         balanceINR:
 *                           type: number
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     message:
 *                       type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Transaction not found
 */

/**
 * @swagger
 * /api/admin/withdrawals:
 *   get:
 *     summary: List withdrawal requests (Admin only)
 *     description: Lists withdrawal rows. User `POST /api/wallet/withdraw` creates **pending** (wallet debited); admin pays manually then PATCH **success** or **fail** (refund).
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, success, fail]
 *         description: Filter by status (`pending` = awaiting admin payout)
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Filter by user email
 *     responses:
 *       200:
 *         description: Withdrawal requests retrieved
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
 *                   example: Withdrawal requests retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     requests:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           userId:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *                               ign:
 *                                 type: string
 *                           type:
 *                             type: string
 *                             example: withdrawal
 *                           amountINR:
 *                             type: number
 *                           description:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [pending, success, fail]
 *                             description: pending = awaiting admin payment; success = admin paid; fail = rejected (refunded)
 *                           userBalanceINR:
 *                             type: number
 *                             description: User current wallet balance in INR (so admin can verify user had sufficient balance)
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     total:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     skip:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/withdrawals/{transactionId}/status:
 *   patch:
 *     summary: Update withdrawal status (Admin only)
 *     description: |
 *       For **pending** withdrawals only (wallet already debited on user request). **success:** you paid the user manually; marks row paid. **fail:** refund wallet.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: WalletHistory withdrawal transaction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [success, fail]
 *                 example: success
 *     responses:
 *       200:
 *         description: Withdrawal status updated
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
 *                   example: Withdrawal status updated to success
 *                 data:
 *                   type: object
 *                   properties:
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         userId:
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
 *                           enum: [success, fail]
 *                         verifiedBy:
 *                           type: string
 *                           example: admin
 *                         verifiedAt:
 *                           type: string
 *                           format: date-time
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     wallet:
 *                       type: object
 *                       properties:
 *                         balanceINR:
 *                           type: number
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     message:
 *                       type: string
 *       400:
 *         description: Validation error or withdrawal already processed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Transaction not found
 */

/*
 * @swagger
 * /api/admin/transactions/search-by-utr:
 *   get:
 *     summary: Search transaction by UTR (Admin only)
 *     description: Search for a transaction using UTR number. Useful when verifying payments from bank statement.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: utr
 *         required: true
 *         schema:
 *           type: string
 *         description: UTR (Unique Transaction Reference) number
 *     responses:
 *       200:
 *         description: Transaction found or not found
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/*
 * @swagger
 * /api/admin/transactions/verify-by-utr:
 *   post:
 *     summary: Verify payment by UTR and amount (Admin only)
 *     description: Admin provides UTR and amount from bank statement. System automatically matches transaction and verifies payment. This is the fastest way to verify payments.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - utr
 *               - amountINR
 *             properties:
 *               utr:
 *                 type: string
 *                 example: "123456789012"
 *                 description: UTR number from bank statement
 *               amountINR:
 *                 type: number
 *                 example: 100.00
 *                 description: Amount in INR from bank statement
 *               bankReference:
 *                 type: string
 *                 example: "TXN123456"
 *                 description: Optional bank reference number
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Transaction not found
 */

/*
 * @swagger
 * /api/admin/transactions/{transactionId}/add-bank-reference:
 *   post:
 *     summary: Add bank reference to transaction (Admin only)
 *     description: Add bank reference number from bank statement to a transaction
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankReference
 *             properties:
 *               bankReference:
 *                 type: string
 *                 example: "TXN123456"
 *                 description: Bank reference number from statement
 *     responses:
 *       200:
 *         description: Bank reference added successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Transaction not found
 */

/*
 * @swagger
 * /api/admin/transactions/bulk-verify-from-statement:
 *   post:
 *     summary: Bulk verify payments from bank statement file (Admin only)
 *     description: Upload bank statement CSV/Excel file. System automatically matches UTR and amount with pending transactions and can automatically verify them. This is the fastest way to verify multiple payments at once.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         required: true
 *         description: Bank statement file (CSV or Excel format)
 *       - in: formData
 *         name: autoVerify
 *         type: boolean
 *         default: false
 *         description: If true, automatically verify all matched transactions. If false, only show matches for manual review.
 *     responses:
 *       200:
 *         description: Bank statement processed successfully
 *       400:
 *         description: Validation error or invalid file format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/*
 * @swagger
 * /api/admin/transactions/verify-from-api:
 *   post:
 *     summary: Verify payment from external API/service (Admin only)
 *     description: This endpoint can be called by external services, cron jobs, or bank API integrations to automatically verify payments. No file upload needed - just provide UTR and amount.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - utr
 *               - amountINR
 *             properties:
 *               utr:
 *                 type: string
 *                 example: "ABC123456789"
 *               amountINR:
 *                 type: number
 *                 example: 100.00
 *               bankReference:
 *                 type: string
 *                 example: "TXN123456"
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/inquiries:
 *   get:
 *     summary: Get all inquiries (Admin only)
 *     description: Retrieve all inquiries with pagination, filtering by status, and search functionality
 *     tags: [Admin]
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
 *         description: Number of items per page (max 100)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [new, read, replied, resolved]
 *         description: Filter by inquiry status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, subject, or message
 *     responses:
 *       200:
 *         description: Inquiries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Inquiries retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     inquiries:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           subject:
 *                             type: string
 *                           message:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [new, read, replied, resolved]
 *                           adminNotes:
 *                             type: string
 *                             nullable: true
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
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalItems:
 *                           type: integer
 *                         itemsPerPage:
 *                           type: integer
 *                         hasNextPage:
 *                           type: boolean
 *                         hasPrevPage:
 *                           type: boolean
 *                     filters:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/inquiries/{inquiryId}:
 *   get:
 *     summary: Get inquiry by ID (Admin only)
 *     description: Retrieve a single inquiry by its ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inquiryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Inquiry ID
 *     responses:
 *       200:
 *         description: Inquiry retrieved successfully
 *       400:
 *         description: Invalid inquiry ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Inquiry not found
 */

/**
 * @swagger
 * /api/admin/inquiries/{inquiryId}/status:
 *   patch:
 *     summary: Update inquiry status (Admin only)
 *     description: Update the status of an inquiry and optionally add admin notes
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inquiryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Inquiry ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [new, read, replied, resolved]
 *                 example: read
 *               adminNotes:
 *                 type: string
 *                 maxLength: 1000
 *                 example: "Responded via email on 2024-12-05"
 *     responses:
 *       200:
 *         description: Inquiry status updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Inquiry not found
 */

/**
 * @swagger
 * /api/admin/inquiries/{inquiryId}/reply:
 *   post:
 *     summary: Reply to inquiry (Admin only)
 *     description: Send a reply email to the user regarding their inquiry. The reply message will be sent via email and saved in the inquiry record.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inquiryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Inquiry ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - replyMessage
 *             properties:
 *               replyMessage:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *                 example: "Thank you for contacting us. We have reviewed your inquiry and here is our response..."
 *     responses:
 *       200:
 *         description: Reply sent successfully to user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Reply sent successfully to user
 *                 data:
 *                   type: object
 *                   properties:
 *                     inquiry:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         status:
 *                           type: string
 *                           example: replied
 *                         replyMessage:
 *                           type: string
 *                         repliedAt:
 *                           type: string
 *                           format: date-time
 *                         repliedBy:
 *                           type: string
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Inquiry not found
 */

/**
 * @swagger
 * /api/admin/inquiries/{inquiryId}:
 *   delete:
 *     summary: Delete inquiry (Admin only)
 *     description: Delete an inquiry by its ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inquiryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Inquiry ID
 *     responses:
 *       200:
 *         description: Inquiry deleted successfully
 *       400:
 *         description: Invalid inquiry ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Inquiry not found
 */

/**
 * @swagger
 * /api/admin/support/tickets:
 *   get:
 *     summary: Get all support tickets (Admin only)
 *     description: Retrieve all support tickets with pagination and filtering. Requires authentication and admin role.
 *     tags: [Admin, Support]
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
 *           enum: [open, closed]
 *         description: Filter by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by subject or issue
 *     responses:
 *       200:
 *         description: Support tickets retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/support/tickets/:ticketId:
 *   patch:
 *     summary: Update ticket status, resolution, or notes (Admin)
 *     description: Update support ticket status, resolution, or admin notes. Requires authentication and admin role.
 *     tags: [Admin, Support]
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
 *                 enum: [open, in_progress, resolved, closed]
 *               resolution:
 *                 type: string
 *                 maxLength: 5000
 *               adminNotes:
 *                 type: string
 *                 maxLength: 2000
 *     responses:
 *       200:
 *         description: Ticket updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Ticket not found
 */

/**
 * @swagger
 * /api/admin/support/tickets/:ticketId/reply:
 *   post:
 *     summary: Reply to support ticket (Admin)
 *     description: Add a reply message to a support ticket. Admin can reply to any ticket. Requires authentication and admin role.
 *     tags: [Admin, Support]
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
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Ticket not found
 */

/**
 * @swagger
 * /api/admin/dashboard/stats:
 *   get:
 *     summary: Get overall dashboard statistics (Admin only)
 *     description: |
 *       Key financial and operational metrics (amounts in INR / wallet units):
 *       - totalUsers, totalDepositsINR (= userSelfTopupsINR), userSelfTopupsINR, adminManualTopupsINR, totalTopupsINR (user+admin wallet top-ups)
 *       - lobbyStats: totalCreated, finishedSuccessful (completed+result_published), cancelled, running
 *       - activeLobbyCount (currently running lobbies)
 *       - prizePoolDistributed (rewards paid to winners)
 *       - totalHostFeePaid (host fee credited to hosts)
 *       - platformFeeCollected, casterFeeCollected (from completed lobbies; includes Clash Squad fee logic)
 *       - platformProfit = platform + caster fee (for server/expenses)
 *       - feesBreakdown (all-time): sums platformFees on tournaments with status completed or result_published only
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Dashboard statistics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: integer
 *                       example: 125
 *                     totalDepositsINR:
 *                       type: number
 *                       description: Same as userSelfTopupsINR (legacy key)
 *                     userSelfTopupsINR:
 *                       type: number
 *                       description: Successful top-ups where addedBy=user
 *                     adminManualTopupsINR:
 *                       type: number
 *                       description: Successful top-ups where addedBy=admin
 *                     totalTopupsINR:
 *                       type: number
 *                       description: userSelfTopupsINR + adminManualTopupsINR
 *                     lobbyStats:
 *                       type: object
 *                       properties:
 *                         totalCreated: { type: integer }
 *                         finishedSuccessful: { type: integer }
 *                         cancelled: { type: integer }
 *                         running: { type: integer }
 *                     activeLobbyCount:
 *                       type: integer
 *                       description: Lobbies currently running
 *                     prizePoolDistributed:
 *                       type: number
 *                       description: Amount paid to winners (wallet / INR)
 *                     totalHostFeePaid:
 *                       type: number
 *                       description: Host fee credited to hosts (INR)
 *                     platformFeeCollected:
 *                       type: number
 *                     casterFeeCollected:
 *                       type: number
 *                     platformProfit:
 *                       type: number
 *                       description: platform + caster fee (for server/expenses)
 *                     feesBreakdown:
 *                       type: object
 *                       description: All-time totals (BR/LW/CS) — sum of platformFees on every completed/result_published lobby; INR
 *                       properties:
 *                         platformFeeINR: { type: number }
 *                         casterFeeINR: { type: number }
 *                         hostFeeINR: { type: number }
 *                         totalFeesINR: { type: number }
 *                         winnerPoolPaidINR: { type: number }
 *                     totalDeposits:
 *                       type: number
 *                     totalRewards:
 *                       type: number
 *                     netProfit:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /api/admin/dashboard/stream:
 *   get:
 *     summary: SSE stream of dashboard statistics (Admin only)
 *     description: |
 *       Server-Sent Events. Sends `event: stats` with JSON `{ type: 'dashboard', data: { ...same fields as GET /dashboard/stats } }`.
 *       Repeats on an interval (default 45s, env ADMIN_DASHBOARD_SSE_INTERVAL_MS). Also pushed shortly after wallet top-up/reward changes.
 *       Auth: `Authorization: Bearer` or `?access_token=` (for browser EventSource).
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: access_token
 *         schema:
 *           type: string
 *         description: Optional JWT if header cannot be set (e.g. EventSource in browser)
 *     responses:
 *       200:
 *         description: text/event-stream (not JSON)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get overall dashboard statistics (Alias for /dashboard/stats)
 *     description: Alternative endpoint for getting key financial and user metrics.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/paths/~1api~1admin~1dashboard~1stats/get/responses/200/content/application~1json/schema'
 */

/**
 * @swagger
 * /api/admin/analytics:
 *   get:
 *     summary: Get financial analytics with time-series data
 *     description: Returns aggregated deposit, reward, and profit data grouped by day, week, or month.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: daily
 *         description: Time period for grouping data
 *     responses:
 *       200:
 *         description: Analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Analytics (daily) retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                       example: daily
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             example: "2024-03-20"
 *                           deposits:
 *                             type: number
 *                             example: 1500
 *                           rewards:
 *                             type: number
 *                             example: 400
 *                           profit:
 *                             type: number
 *                             example: 1100
 */

/*
 * @swagger
 * /api/admin/payments/verification-stats:
 *   get:
 *     summary: Get payment verification statistics (Admin only)
 *     description: Get statistics about payment verification including success/fail rates, flagged transactions, and bank statement processing
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification statistics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/*
 * @swagger
 * /api/admin/payments/flagged:
 *   get:
 *     summary: Get flagged transactions for review (Admin only)
 *     description: Get transactions that have been flagged for manual review due to suspicious activity
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of transactions to return
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of transactions to skip
 *     responses:
 *       200:
 *         description: Flagged transactions retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/*
 * @swagger
 * /api/admin/payments/process-email:
 *   post:
 *     summary: Manually trigger email processing (Admin only)
 *     description: Manually trigger processing of bank statement emails. Useful for testing or immediate processing.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxEmails:
 *                 type: integer
 *                 default: 50
 *                 description: Maximum number of emails to process
 *     responses:
 *       200:
 *         description: Email processing completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */

/*
 * @swagger
 * /api/admin/payments/bank-statements:
 *   get:
 *     summary: Get processed bank statements (Admin only)
 *     description: Get bank statement transactions that have been parsed from emails
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of transactions to return
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of transactions to skip
 *       - in: query
 *         name: processed
 *         schema:
 *           type: boolean
 *         description: Filter by processed status
 *     responses:
 *       200:
 *         description: Bank statements retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
/**
 * @swagger
 * /api/admin/notifications/send:
 *   post:
 *     summary: Send custom notification to all users (Admin only)
 *     description: Send a custom push notification (via FCM topic 'all_users' and WebSocket) to all registered users.
 *     tags: [Admin, Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *             properties:
 *               title:
 *                 type: string
 *                 description: Title of the notification
 *                 example: "Exciting News!"
 *               message:
 *                 type: string
 *                 description: Body message of the notification
 *                 example: "Check out the new game mode starting today."
 *     responses:
 *       200:
 *         description: Custom notification sent to all users
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error - Title and message are required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
