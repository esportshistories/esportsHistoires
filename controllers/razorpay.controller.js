/**
 * Razorpay PG: create order + verify payment (wallet credit after verified payment).
 */

const crypto = require('crypto');
const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS, PAYMENT } = require('../constants');
const WalletHistory = require('../models/WalletHistory.model');
const walletService = require('../services/wallet.service');
const razorpayService = require('../services/razorpay.service');
const Logger = require('../utils/logger');
const { roundInr } = require('../utils/inr');

const generateReceipt = () => `RBX_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`.slice(0, 40);

const amountsMatch = (expected, received) => {
  if (!Number.isFinite(expected) || !Number.isFinite(received)) return false;
  return Math.abs(expected - received) <= (PAYMENT.AMOUNT_TOLERANCE || 0.01) + 1e-9;
};

/**
 * POST /api/payment/razorpay/order
 * Body: { amountINR: number }
 */
const createRazorpayOrder = asyncHandler(async (req, res) => {
  if (!razorpayService.isConfigured()) {
    return res.error(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'Razorpay payments are not enabled or configured on the server.',
      { code: 'RAZORPAY_NOT_CONFIGURED' }
    );
  }

  const userId = req.userId;
  const creditInr = roundInr(req.body?.amountINR);
  if (!Number.isFinite(creditInr) || creditInr < PAYMENT.MIN_AMOUNT_INR) {
    return res.badRequest(`amountINR must be at least ${PAYMENT.MIN_AMOUNT_INR} INR`);
  }

  const receipt = generateReceipt();

  const pendingDoc = await WalletHistory.create({
    userId,
    type: 'topup',
    amountINR: creditInr,
    description: 'Top-up via Razorpay',
    status: 'fail',
    addedBy: 'user',
    paymentMethod: 'razorpay',
    paymentId: null, // set after order create
    paymentVerified: false,
    qrCodeId: null,
    receiptCode: receipt
  });

  try {
    const order = await razorpayService.createOrder({
      amountINR: creditInr,
      receipt,
      notes: {
        userId: String(userId),
        walletTransactionId: pendingDoc._id.toString()
      }
    });

    pendingDoc.paymentId = order.id; // razorpay order_id
    await pendingDoc.save();

    const { keyId } = razorpayService.getConfig();
    return res.success(HTTP_STATUS.OK, 'Razorpay order created. Use orderId with Razorpay Checkout.', {
      keyId,
      orderId: order.id,
      amountINR: creditInr,
      amountPaise: order.amount,
      currency: order.currency,
      receipt,
      walletTransactionId: pendingDoc._id.toString()
    });
  } catch (err) {
    Logger.error('Razorpay order create failed', { errName: err.name, message: err.message });
    await WalletHistory.deleteOne({ _id: pendingDoc._id });
    return res.error(
      HTTP_STATUS.BAD_GATEWAY,
      err.message || 'Razorpay could not start this payment. Try again later.',
      { code: 'RAZORPAY_ORDER_FAILED' },
      err
    );
  }
});

const finalizeSuccessIfValid = async ({ orderId, paymentId, paidAmountInr }) => {
  const tx = await WalletHistory.findOne({
    paymentId: orderId,
    type: 'topup',
    paymentMethod: 'razorpay'
  });
  if (!tx) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (tx.status === 'success') return { ok: true, alreadyDone: true, transaction: tx };

  const expected = roundInr(tx.amountINR);
  if (!amountsMatch(expected, paidAmountInr)) {
    Logger.warn('Razorpay amount mismatch', { orderId, expected, paidAmountInr });
    return { ok: false, reason: 'AMOUNT_MISMATCH' };
  }

  if (paymentId) {
    tx.bankReference = paymentId;
    await tx.save();
  }

  await walletService.updateTransactionStatus(tx._id.toString(), 'success', 'system');
  const fresh = await WalletHistory.findById(tx._id);
  return { ok: true, alreadyDone: false, transaction: fresh };
};

/**
 * POST /api/payment/razorpay/verify (authenticated)
 * Body: { orderId, paymentId, signature }
 */
const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  if (!razorpayService.isConfigured()) {
    return res.error(HTTP_STATUS.SERVICE_UNAVAILABLE, 'Razorpay not configured', { code: 'RAZORPAY_NOT_CONFIGURED' });
  }

  const userId = req.userId;
  const orderId = (req.body?.orderId || '').trim();
  const paymentId = (req.body?.paymentId || '').trim();
  const signature = (req.body?.signature || '').trim();

  if (!orderId || !paymentId || !signature) {
    return res.badRequest('orderId, paymentId, signature are required');
  }

  const tx = await WalletHistory.findOne({
    paymentId: orderId,
    userId,
    type: 'topup',
    paymentMethod: 'razorpay'
  });
  if (!tx) {
    return res.notFound('Order not found for this user');
  }
  if (tx.status === 'success') {
    const wallet = await walletService.getWalletBalance(userId);
    return res.success(HTTP_STATUS.OK, 'Already credited', { orderId, status: 'success', balanceINR: wallet.balanceINR });
  }

  if (!razorpayService.verifyCheckoutSignature({ orderId, paymentId, signature })) {
    return res.error(HTTP_STATUS.BAD_REQUEST, 'Invalid Razorpay signature', { code: 'RAZORPAY_BAD_SIGNATURE' });
  }

  // Optional: fetch payment from Razorpay API to confirm captured amount/currency/status
  let paidAmountInr = roundInr(tx.amountINR);
  try {
    const p = await razorpayService.fetchPayment(paymentId);
    const amountInrFromApi = Number(p?.amount) / 100;
    if (Number.isFinite(amountInrFromApi)) {
      paidAmountInr = roundInr(amountInrFromApi);
    }
    if (p?.currency && p.currency !== 'INR') {
      return res.error(HTTP_STATUS.BAD_REQUEST, 'Invalid currency', { code: 'RAZORPAY_BAD_CURRENCY' });
    }
    if (p?.status && p.status !== 'captured') {
      return res.success(HTTP_STATUS.OK, 'Payment not captured yet', { orderId, status: p.status });
    }
  } catch (e) {
    Logger.warn('Razorpay fetchPayment failed (continuing with signature-only verification)', {
      orderId,
      paymentId,
      errName: e.name,
      message: e.message
    });
  }

  const result = await finalizeSuccessIfValid({ orderId, paymentId, paidAmountInr });
  if (!result.ok && result.reason === 'AMOUNT_MISMATCH') {
    return res.badRequest('Amount mismatch — contact support');
  }

  const wallet = await walletService.getWalletBalance(userId);
  return res.success(HTTP_STATUS.OK, 'Wallet updated', {
    orderId,
    status: 'success',
    balanceINR: wallet.balanceINR
  });
});

/**
 * POST /api/payment/razorpay/webhook
 * Header: x-razorpay-signature
 * Body: raw JSON (Buffer) — must not be parsed by express.json before verification
 */
const razorpayWebhook = asyncHandler(async (req, res) => {
  if (!razorpayService.isConfigured()) {
    // Webhook may still be delivered; acknowledge to avoid retries storm
    return res.status(HTTP_STATUS.OK).json({ ok: true });
  }

  const signatureHeader = req.get('x-razorpay-signature');
  const rawBody = req.body; // Buffer (wired in server.js)

  let verified = false;
  try {
    verified = razorpayService.verifyWebhookSignature(rawBody, signatureHeader);
  } catch (e) {
    Logger.error('Razorpay webhook secret missing', { errName: e.name, message: e.message });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ ok: false });
  }

  if (!verified) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ ok: false, code: 'RAZORPAY_BAD_WEBHOOK_SIGNATURE' });
  }

  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '{}'));
  } catch {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ ok: false, code: 'RAZORPAY_BAD_JSON' });
  }

  const eventType = event?.event;
  // We only care about captured payments; other events are acknowledged.
  if (eventType !== 'payment.captured') {
    return res.status(HTTP_STATUS.OK).json({ ok: true });
  }

  const paymentEntity = event?.payload?.payment?.entity;
  const orderId = paymentEntity?.order_id;
  const paymentId = paymentEntity?.id;
  const amountInr = Number(paymentEntity?.amount) / 100;

  if (!orderId || !paymentId || !Number.isFinite(amountInr)) {
    return res.status(HTTP_STATUS.OK).json({ ok: true });
  }

  const result = await finalizeSuccessIfValid({
    orderId,
    paymentId,
    paidAmountInr: roundInr(amountInr)
  });

  if (!result.ok) {
    // Acknowledge anyway — webhook retries won't help for mismatch/not found.
    return res.status(HTTP_STATUS.OK).json({ ok: true });
  }

  return res.status(HTTP_STATUS.OK).json({ ok: true });
});

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  razorpayWebhook
};

