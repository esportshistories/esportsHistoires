/**
 * Cashfree Payment Gateway — create order, fetch order, webhook verification.
 * Docs: https://www.cashfree.com/docs/api-reference/payments/latest/orders/create
 * Sandbox: https://sandbox.cashfree.com/pg | Production: https://api.cashfree.com/pg
 */

const axios = require('axios');
const crypto = require('crypto');

const PG_API_VERSION = (process.env.CASHFREE_PG_API_VERSION || '2025-01-01').trim();

const parseEnvTruthy = (v) => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

const getPgBase = () =>
  String(process.env.CASHFREE_ENV || 'sandbox').toLowerCase() === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

const getConfig = () => {
  const enabled = parseEnvTruthy(process.env.CASHFREE_PG_ENABLED);
  const clientId = (process.env.CASHFREE_PG_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CASHFREE_PG_CLIENT_SECRET || '').trim();
  return { enabled, clientId, clientSecret, baseUrl: getPgBase(), apiVersion: PG_API_VERSION };
};

const isConfigured = () => {
  const c = getConfig();
  return c.enabled && c.clientId && c.clientSecret;
};

function pgHeaders(extra = {}) {
  const c = getConfig();
  return {
    'Content-Type': 'application/json',
    'x-client-id': c.clientId,
    'x-client-secret': c.clientSecret,
    'x-api-version': c.apiVersion,
    ...extra
  };
}

/**
 * Create Cashfree order; returns payment_session_id for Web / JS Checkout (UPI + cards).
 */
async function createOrder({
  orderId,
  amountINR,
  customerId,
  customerEmail,
  customerPhone,
  returnUrl,
  notifyUrl
}) {
  if (!isConfigured()) {
    throw new Error(
      'Cashfree PG is not configured. Set CASHFREE_PG_ENABLED=true, CASHFREE_PG_CLIENT_ID, CASHFREE_PG_CLIENT_SECRET.'
    );
  }
  const amt = Number(amountINR);
  if (!Number.isFinite(amt) || amt < 1) {
    throw new Error('amountINR must be at least 1');
  }

  const body = {
    order_id: String(orderId).slice(0, 45),
    order_amount: amt,
    order_currency: 'INR',
    customer_details: {
      customer_id: String(customerId).slice(0, 50),
      customer_email: customerEmail || 'wallet@customer.local',
      customer_phone: String(customerPhone || '9999999999').replace(/\D/g, '').slice(-10) || '9999999999'
    },
    order_meta: {
      return_url: returnUrl || 'https://www.cashfree.com/devstudio/thankyou',
      notify_url: notifyUrl || undefined,
      payment_methods: (process.env.CASHFREE_PG_PAYMENT_METHODS || 'cc,dc,upi').trim()
    }
  };

  const idempotencyKey = crypto.randomUUID();
  const res = await axios.post(`${getConfig().baseUrl}/orders`, body, {
    headers: pgHeaders({ 'x-idempotency-key': idempotencyKey }),
    timeout: 45000,
    validateStatus: () => true
  });

  const data = res.data;
  if (res.status >= 200 && res.status < 300) {
    return {
      cfOrderId: data.cf_order_id,
      orderId: data.order_id,
      paymentSessionId: data.payment_session_id,
      orderAmount: data.order_amount,
      orderCurrency: data.order_currency,
      orderStatus: data.order_status,
      raw: data
    };
  }

  const msg =
    data?.message ||
    data?.error?.message ||
    (typeof data === 'string' ? data : null) ||
    `Cashfree PG HTTP ${res.status}`;
  const err = new Error(msg);
  err.statusCode = res.status;
  err.cashfree = data;
  throw err;
}

/**
 * GET order — use merchant order_id.
 */
async function fetchOrderByMerchantOrderId(merchantOrderId) {
  if (!isConfigured()) {
    throw new Error('Cashfree PG not configured');
  }
  const oid = encodeURIComponent(String(merchantOrderId));
  const res = await axios.get(`${getConfig().baseUrl}/orders/${oid}`, {
    headers: pgHeaders(),
    timeout: 30000,
    validateStatus: () => true
  });
  const data = res.data;
  if (res.status >= 200 && res.status < 300) {
    return data;
  }
  const msg = data?.message || `Cashfree PG HTTP ${res.status}`;
  const err = new Error(msg);
  err.statusCode = res.status;
  err.cashfree = data;
  throw err;
}

/**
 * Webhook: signedPayload = timestamp + rawBody (string); signature = base64(HMAC-SHA256).
 */
function verifyWebhookSignature(rawBody, signatureHeader, timestampHeader, secret) {
  if (!secret || !signatureHeader || timestampHeader == null) return false;
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const signedPayload = String(timestampHeader) + raw;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(String(signatureHeader), 'utf8'));
  } catch {
    return false;
  }
}

module.exports = {
  getConfig,
  isConfigured,
  getPgBase,
  createOrder,
  fetchOrderByMerchantOrderId,
  verifyWebhookSignature
};
