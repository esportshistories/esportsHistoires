/**
 * Maps common frontend aliases onto withdraw handler fields before validation.
 * amount → amountINR, vpa | upi → upiId
 */
const normalizeWithdrawBody = (req, res, next) => {
  const b = req.body && typeof req.body === 'object' ? { ...req.body } : {};
  if (b.amountINR == null && b.amount != null) b.amountINR = b.amount;
  if (b.upiId == null && b.vpa != null) b.upiId = b.vpa;
  if (b.upiId == null && b.upi != null) b.upiId = b.upi;
  req.body = b;
  next();
};

module.exports = { normalizeWithdrawBody };
