/**
 * @swagger
 * /api/inquiry:
 *   post:
 *     summary: Submit inquiry
 *     description: Submit a contact form inquiry. No authentication required.
 *     tags: [Inquiry]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - subject
 *               - message
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *               subject:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "General Inquiry"
 *               message:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *                 example: "I have a question about your services..."
 *     responses:
 *       201:
 *         description: Inquiry submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Inquiry submitted successfully. We will get back to you soon.
 *                 data:
 *                   type: object
 *                   properties:
 *                     inquiryId:
 *                       type: string
 *                     submittedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
