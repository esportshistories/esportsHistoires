/**
 * @swagger
 * /api/antihack/check-banned:
 *   get:
 *     summary: Check user ban status (proxy)
 *     description: |
 *       Proxies to Garena FF antihack API. Backend sends the request to ff.garena.com with required headers
 *       and returns the result as-is. Use this to check if a user (by uid) has a ban history.
 *       **Flow:** Frontend sends only `uid` → Backend always uses `lang=en` in the proxy request → Returns upstream response.
 *     tags: [Antihack]
 *     parameters:
 *       - in: query
 *         name: uid
 *         required: true
 *         description: Garena/FF user ID to check ban status for (only payload from client; lang is always "en" in backend)
 *         schema:
 *           type: string
 *           example: "43060783"
 *     responses:
 *       200:
 *         description: Ban check result from upstream (proxied as-is)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 msg:
 *                   type: string
 *                   example: ""
 *                 data:
 *                   type: object
 *                   properties:
 *                     is_banned:
 *                       type: integer
 *                       description: 0 = not banned, non-zero = banned
 *                       example: 0
 *                     period:
 *                       type: integer
 *                       description: Ban period/duration; 0 when not banned
 *                       example: 0
 *             example:
 *               status: "success"
 *               msg: ""
 *               data:
 *                 is_banned: 0
 *                 period: 0
 *       400:
 *         description: Validation failed (e.g. missing uid)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Proxy or upstream error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
