/**
 * Cashfree PG: create order + verify payment + webhook (wallet credit).
 */

const crypto = require('crypto');
const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS, PAYMENT } = require('../constants');
const WalletHistory = require('../models/WalletHistory.model');
const User = require('../models/User.model');
const walletService = require('../services/wallet.service');
const cashfreePg = require('../services/cashfreePg.service');
const Logger = require('../utils/logger');
const { roundInr } = require('../utils/inr');

const generateMerchantOrderId = () =>
  `CFX_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`.slice(0, 45);

const amountsMatch = (expected, received) => {
  if (!Number.isFinite(expected) || !Number.isFinite(received)) return false;
  return Math.abs(expected - received) <= (PAYMENT.AMOUNT_TOLERANCE || 0.01) + 1e-9;
};

const baseUrlFromEnv = () => {
  const b = (process.env.BASE_URL || '').trim().replace(/\/$/, '');
  return b || 'http://localhost:5000';
};

/**
 * POST /api/payment/cashfree/order
 * Body: { amountINR: number }
 */
const createCashfreeOrder = asyncHandler(async (req, res) => {
  if (!cashfreePg.isConfigured()) {
    return res.error(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'Cashfree payments are not enabled or configured on the server.',
      { code: 'CASHFREE_PG_NOT_CONFIGURED' }
    );
  }

  const userId = req.userId;
  const creditInr = roundInr(req.body?.amountINR);
  if (!Number.isFinite(creditInr) || creditInr < PAYMENT.MIN_AMOUNT_INR) {
    return res.badRequest(`amountINR must be at least ${PAYMENT.MIN_AMOUNT_INR} INR`);
  }

  const user = await User.findById(userId).select('email phoneNumber name').lean();
  const merchantOrderId = generateMerchantOrderId();

  const pendingDoc = await WalletHistory.create({
    userId,
    type: 'topup',
    amountINR: creditInr,
    description: 'Top-up via Cashfree',
    status: 'fail',
    addedBy: 'user',
    paymentMethod: 'cashfree',
    paymentId: merchantOrderId,
    paymentVerified: false,
    qrCodeId: null,
    receiptCode: merchantOrderId
  });

  const returnUrl =
    (process.env.CASHFREE_PG_RETURN_URL || '').trim() ||
    `${baseUrlFromEnv()}/payment/success?order_id={order_id}`;
  const notifyUrl =
    (process.env.CASHFREE_PG_NOTIFY_URL || '').trim() || `${baseUrlFromEnv()}/api/payment/cashfree/webhook`;

  try {
    const order = await cashfreePg.createOrder({
      orderId: merchantOrderId,
      amountINR: creditInr,
      customerId: `u_${userId}`,
      customerEmail: user?.email,
      customerPhone: user?.phoneNumber,
      returnUrl,
      notifyUrl
    });

    pendingDoc.bankReference = order.cfOrderId || null;
    await pendingDoc.save();

    const { clientId } = cashfreePg.getConfig();
    const env =
      String(process.env.CASHFREE_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';

    return res.success(HTTP_STATUS.OK, 'Cashfree order created. Open checkout with paymentSessionId.', {
      environment: env,
      clientId,
      orderId: merchantOrderId,
      cfOrderId: order.cfOrderId,
      paymentSessionId: order.paymentSessionId,
      amountINR: creditInr,
      orderAmount: order.orderAmount,
      orderCurrency: order.orderCurrency || 'INR',
      walletTransactionId: pendingDoc._id.toString()
    });
  } catch (err) {
    Logger.error('Cashfree order create failed', { errName: err.name, message: err.message });
    await WalletHistory.deleteOne({ _id: pendingDoc._id });
    return res.error(
      HTTP_STATUS.BAD_GATEWAY,
      err.message || 'Cashfree could not start this payment. Try again later.',
      { code: 'CASHFREE_ORDER_FAILED' },
      err
    );
  }
});

const finalizeSuccessIfValid = async ({ merchantOrderId, cfPaymentId, paidAmountInr }) => {
  const tx = await WalletHistory.findOne({
    paymentId: merchantOrderId,
    type: 'topup',
    paymentMethod: 'cashfree'
  });
  if (!tx) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (tx.status === 'success') return { ok: true, alreadyDone: true, transaction: tx };

  const expected = roundInr(tx.amountINR);
  const paid = Number.isFinite(paidAmountInr) ? roundInr(paidAmountInr) : expected;
  if (!amountsMatch(expected, paid)) {
    Logger.warn('Cashfree amount mismatch', { merchantOrderId, expected, paidAmountInr: paid });
    return { ok: false, reason: 'AMOUNT_MISMATCH' };
  }

  if (cfPaymentId) {
    tx.bankReference = String(cfPaymentId);
    await tx.save();
  }

  await walletService.updateTransactionStatus(tx._id.toString(), 'success', 'system');
  const fresh = await WalletHistory.findById(tx._id);
  return { ok: true, alreadyDone: false, transaction: fresh };
};

/**
 * POST /api/payment/cashfree/verify (authenticated)
 * Body: { orderId } — merchant order_id from /cashfree/order
 */
const verifyCashfreePayment = asyncHandler(async (req, res) => {
  if (!cashfreePg.isConfigured()) {
    return res.error(HTTP_STATUS.SERVICE_UNAVAILABLE, 'Cashfree not configured', {
      code: 'CASHFREE_PG_NOT_CONFIGURED'
    });
  }

  const userId = req.userId;
  const merchantOrderId = (req.body?.orderId || '').trim();
  if (!merchantOrderId) {
    return res.badRequest('orderId is required');
  }

  const tx = await WalletHistory.findOne({
    paymentId: merchantOrderId,
    userId,
    type: 'topup',
    paymentMethod: 'cashfree'
  });
  if (!tx) {
    return res.notFound('Order not found for this user');
  }
  if (tx.status === 'success') {
    const wallet = await walletService.getWalletBalance(userId);
    return res.success(HTTP_STATUS.OK, 'Already credited', {
      orderId: merchantOrderId,
      status: 'success',
      balanceINR: wallet.balanceINR
    });
  }

  let orderEntity;
  try {
    orderEntity = await cashfreePg.fetchOrderByMerchantOrderId(merchantOrderId);
  } catch (e) {
    Logger.warn('Cashfree fetch order failed', { merchantOrderId, message: e.message });
    return res.error(HTTP_STATUS.BAD_GATEWAY, e.message || 'Could not fetch order', { code: 'CASHFREE_ORDER_FETCH' });
  }

  const orderStatus = String(orderEntity?.order_status || '').toUpperCase();
  if (orderStatus !== 'PAID') {
    return res.success(HTTP_STATUS.OK, 'Payment not completed yet', {
      orderId: merchantOrderId,
      status: orderEntity?.order_status || orderStatus
    });
  }

  const paidAmountInr = roundInr(Number(orderEntity?.order_amount));
  const cfPaymentId =
    orderEntity?.payments?.[0]?.cf_payment_id ||
    orderEntity?.payment?.cf_payment_id ||
    orderEntity?.cf_payment_id ||
    null;

  const result = await finalizeSuccessIfValid({
    merchantOrderId,
    cfPaymentId,
    paidAmountInr: Number.isFinite(paidAmountInr) ? paidAmountInr : roundInr(tx.amountINR)
  });
  if (!result.ok && result.reason === 'AMOUNT_MISMATCH') {
    return res.badRequest('Amount mismatch — contact support');
  }

  const wallet = await walletService.getWalletBalance(userId);
  return res.success(HTTP_STATUS.OK, 'Wallet updated', {
    orderId: merchantOrderId,
    status: 'success',
    balanceINR: wallet.balanceINR
  });
});

function extractWebhookPaymentPayload(event) {
  const data = event?.data || event;
  const order = data?.order || data?.payment?.order;
  const payment = data?.payment || data;
  const merchantOrderId = order?.order_id || data?.order_id;
  const orderAmount = order?.order_amount != null ? Number(order.order_amount) : Number(data?.order_amount);
  const paymentStatus = String(payment?.payment_status || data?.payment_status || '').toUpperCase();
  const cfPaymentId = payment?.cf_payment_id || data?.cf_payment_id;
  return { merchantOrderId, orderAmount, paymentStatus, cfPaymentId };
}

/**
 * POST /api/payment/cashfree/webhook
 * Headers: x-webhook-signature, x-webhook-timestamp — raw JSON body
 */
const cashfreeWebhook = asyncHandler(async (req, res) => {
  if (!cashfreePg.isConfigured()) {
    return res.status(HTTP_STATUS.OK).json({ ok: true });
  }

  const { clientSecret } = cashfreePg.getConfig();
  const signature = req.get('x-webhook-signature');
  const timestamp = req.get('x-webhook-timestamp');
  const rawBody = req.body;

  if (!cashfreePg.verifyWebhookSignature(rawBody, signature, timestamp, clientSecret)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ ok: false, code: 'CASHFREE_BAD_WEBHOOK_SIGNATURE' });
  }

  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '{}'));
  } catch {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ ok: false, code: 'CASHFREE_BAD_JSON' });
  }

  const { merchantOrderId, orderAmount, paymentStatus, cfPaymentId } = extractWebhookPaymentPayload(event);
  if (!merchantOrderId || paymentStatus !== 'SUCCESS') {
    return res.status(HTTP_STATUS.OK).json({ ok: true });
  }

  const paidAmountInr = roundInr(Number(orderAmount));
  const result = await finalizeSuccessIfValid({
    merchantOrderId,
    cfPaymentId,
    paidAmountInr: Number.isFinite(paidAmountInr) ? paidAmountInr : NaN
  });

  if (!result.ok) {
    return res.status(HTTP_STATUS.OK).json({ ok: true });
  }

  return res.status(HTTP_STATUS.OK).json({ ok: true });
});

module.exports = {
  createCashfreeOrder,
  verifyCashfreePayment,
  cashfreeWebhook
};
