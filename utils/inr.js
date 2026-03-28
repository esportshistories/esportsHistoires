/**
 * INR amounts: store as number with 2 decimal places (rupees).
 */

const roundInr = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  return Math.round(x * 100) / 100;
};

module.exports = { roundInr };
