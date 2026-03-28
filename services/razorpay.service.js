/**
 * Razorpay Payment Gateway — create order + verify signatures.
 *
 * IMPORTANT:
 * - Order amounts are in paise (INR * 100).
 * - Payment verification for client-side checkout uses signature:
 *   HMAC_SHA256(order_id|payment_id, key_secret)
 * - Webhook verification uses raw request body:
 *   HMAC_SHA256(rawBody, webhook_secret)
 */

const crypto = require('crypto');
const Razorpay = require('razorpay');

const getConfig = () => {
  const enabled = process.env.RAZORPAY_ENABLED === 'true';
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  return { enabled, keyId, keySecret, webhookSecret };
};

const isConfigured = () => {
  const c = getConfig();
  return c.enabled && c.keyId && c.keySecret;
};

const getClient = () => {
  const { keyId, keySecret } = getConfig();
  if (!keyId || !keySecret) {
    throw new Error('Razorpay key id/secret missing');
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const toPaise = (amountINR) => {
  const v = Number(amountINR);
  if (!Number.isFinite(v) || v <= 0) return NaN;
  // Use rounding to avoid floating errors (e.g. 1.01*100=100.999...)
  return Math.round(v * 100);
};

/**
 * Create Razorpay order.
 * @param {{ amountINR: number, receipt: string, notes?: object }} params
 */
const createOrder = async ({ amountINR, receipt, notes = {} }) => {
  if (!isConfigured()) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_ENABLED=true and RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.');
  }
  const amount = toPaise(amountINR);
  if (!Number.isFinite(amount) || amount < 100) {
    throw new Error('amountINR must be at least 1');
  }
  const client = getClient();
  return await client.orders.create({
    amount,
    currency: 'INR',
    receipt: String(receipt).slice(0, 40),
    notes
  });
};

/**
 * Verify checkout signature sent by client after payment.
 * @param {{ orderId: string, paymentId: string, signature: string }} params
 */
const verifyCheckoutSignature = ({ orderId, paymentId, signature }) => {
  const { keySecret } = getConfig();
  if (!keySecret) return false;
  if (!orderId || !paymentId || !signature) return false;

  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
  // Constant-time compare
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(String(signature), 'utf8'));
  } catch {
    return false;
  }
};

/**
 * Verify Razorpay webhook signature.
 * @param {Buffer|string} rawBody
 * @param {string} signatureHeader - x-razorpay-signature
 */
const verifyWebhookSignature = (rawBody, signatureHeader) => {
  const { webhookSecret } = getConfig();
  if (!webhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
  }
  if (!signatureHeader) return false;
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(String(signatureHeader), 'utf8'));
  } catch {
    return false;
  }
};

/**
 * Fetch payment details from Razorpay API (optional extra verification).
 * @param {string} paymentId
 */
const fetchPayment = async (paymentId) => {
  const client = getClient();
  return await client.payments.fetch(paymentId);
};

module.exports = {
  getConfig,
  isConfigured,
  toPaise,
  createOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  fetchPayment
};

