/**
 * @swagger
 * tags:
 *   - name: Geocode
 *     description: Server-side reverse geocoding (OpenStreetMap Nominatim proxy). Use from the app instead of calling Nominatim directly — avoids browser CORS, keeps a valid User-Agent, and throttles abuse. Be kind to OSM infrastructure; production should set NOMINATIM_USER_AGENT with app name + contact.
 */

/**
 * @swagger
 * /api/geocode/reverse:
 *   get:
 *     summary: Reverse geocode (lat/lon → address)
 *     description: |
 *       Proxies to Nominatim `reverse` with ~1 request/second cap to the upstream service (OSM usage policy).
 *       Per-IP limit default 45/minute (`API_RATE_LIMIT_GEOCODE_PER_MIN`). Requires verified user JWT.
 *       Set env `NOMINATIM_USER_AGENT` in production (identify your application; include contact).
 *     tags: [Geocode]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *           example: 28.6139
 *       - in: query
 *         name: lon
 *         required: true
 *         schema:
 *           type: number
 *           example: 77.2090
 *       - in: query
 *         name: acceptLanguage
 *         required: false
 *         schema:
 *           type: string
 *           example: en-IN,en;q=0.9
 *         description: Optional; forwarded as Accept-Language to Nominatim (defaults to request Accept-Language header)
 *     responses:
 *       200:
 *         description: Resolved address
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
 *                     displayName:
 *                       type: string
 *                       nullable: true
 *                     lat:
 *                       type: number
 *                     lon:
 *                       type: number
 *                     placeId:
 *                       type: integer
 *                       nullable: true
 *                     address:
 *                       type: object
 *                       additionalProperties: true
 *                       description: Subset of Nominatim address fields (road, city, state, postcode, country, etc.)
 *       400:
 *         description: Invalid lat/lon
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No result for coordinates
 *       429:
 *         description: Too many requests (per-IP or upstream rate limit)
 *       502:
 *         description: Upstream error or unreachable
 */
