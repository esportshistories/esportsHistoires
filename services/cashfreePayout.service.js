/**
 * Cashfree Payouts — Standard Transfer V2 (UPI).
 * Auth: x-client-id + x-client-secret on POST /transfers (not Bearer from /v1/authorize).
 * Sandbox: https://sandbox.cashfree.com/payout | Production: https://api.cashfree.com/payout
 * Docs: https://www.cashfree.com/docs/api-reference/payouts/v2/transfers-v2/standard-transfer-v2
 */

const axios = require('axios');

const PAYOUT_API_VERSION = (process.env.CASHFREE_PAYOUT_API_VERSION || '2024-01-01').trim();

const parseEnvTruthy = (v) => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

const getPayoutBase = () => {
  const override = (process.env.CASHFREE_PAYOUT_BASE || '').trim();
  if (override) return override.replace(/\/$/, '');
  return String(process.env.CASHFREE_ENV || 'sandbox').toLowerCase() === 'production'
    ? 'https://api.cashfree.com/payout'
    : 'https://sandbox.cashfree.com/payout';
};

const getConfig = () => {
  const enabled = parseEnvTruthy(process.env.CASHFREE_PAYOUT_ENABLED);
  const clientId = (process.env.CASHFREE_PAYOUT_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CASHFREE_PAYOUT_CLIENT_SECRET || '').trim();
  return { enabled, clientId, clientSecret, baseUrl: getPayoutBase(), apiVersion: PAYOUT_API_VERSION };
};

const isPayoutConfigured = () => {
  const c = getConfig();
  return c.enabled && c.clientId && c.clientSecret;
};

/** Beneficiary name: alphabets + spaces only (Cashfree validation). */
function sanitizeBeneficiaryName(name) {
  let s = String(name || 'Wallet User')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  if (!s) s = 'Wallet User';
  return s;
}

/**
 * Initiate UPI transfer. Returns normalized payload (unwraps data if present).
 */
async function transferToUpi({ transferId, amountINR, vpa, beneficiaryName }) {
  if (!isPayoutConfigured()) {
    throw new Error('Cashfree Payout is not configured');
  }
  const amt = Number(amountINR);
  if (!Number.isFinite(amt) || amt < 1) {
    throw new Error('Invalid payout amount');
  }
  const v = String(vpa || '').trim();
  if (!/^[\w.-]+@[\w.-]+$/.test(v)) {
    throw new Error('Invalid UPI VPA for payout');
  }

  const tid = String(transferId)
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 40);
  const c = getConfig();

  const payload = {
    transfer_id: tid,
    transfer_amount: amt,
    transfer_currency: 'INR',
    transfer_mode: 'upi',
    beneficiary_details: {
      beneficiary_name: sanitizeBeneficiaryName(beneficiaryName),
      beneficiary_instrument_details: {
        vpa: v
      }
    }
  };

  const res = await axios.post(`${c.baseUrl}/transfers`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': c.clientId,
      'x-client-secret': c.clientSecret,
      'x-api-version': c.apiVersion
    },
    timeout: 60000,
    validateStatus: () => true
  });

  const body = res.data;
  const out = body?.data && typeof body.data === 'object' ? body.data : body;

  if (res.status >= 200 && res.status < 300) {
    return out;
  }

  const msg =
    body?.message ||
    body?.error?.message ||
    (typeof body === 'string' ? body : null) ||
    `Cashfree Payout HTTP ${res.status}`;
  const err = new Error(msg);
  err.statusCode = res.status;
  err.cashfree = body;
  throw err;
}

function isTerminalPayoutSuccess(response) {
  if (!response || typeof response !== 'object') return false;
  const st = String(response.status || '').toUpperCase();
  const code = String(response.status_code || '').toUpperCase();
  return st === 'SUCCESS' && code === 'COMPLETED';
}

function isTerminalPayoutFailure(response) {
  if (!response || typeof response !== 'object') return false;
  const st = String(response.status || '').toUpperCase();
  return st === 'FAILED' || st === 'REJECTED';
}

module.exports = {
  getConfig,
  isPayoutConfigured,
  transferToUpi,
  isTerminalPayoutSuccess,
  isTerminalPayoutFailure
};
