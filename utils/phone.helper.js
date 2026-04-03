/**
 * Normalize phone numbers for uniqueness checks (one number ↔ one account).
 * Strips non-digits; collapses common India formats to 10-digit national form.
 *
 * @param {string|null|undefined} value
 * @returns {string|null} Canonical digit string, or null if empty/invalid input
 */
function normalizePhoneForUniqueness(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;

  let digits = s.replace(/\D/g, '');
  if (!digits.length) return null;

  // India: +91 9876543210 → 9876543210
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // Leading 0 (some local formats)
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length < 10) return null;
  return digits;
}

module.exports = {
  normalizePhoneForUniqueness
};
