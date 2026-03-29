/**
 * Normalize wallet_history-shaped documents for API JSON (INR-only surface).
 * Drops legacy amountGC when present; fills amountINR from amountGC if needed.
 */

function normalizeWalletHistoryDoc(doc) {
  if (doc == null || typeof doc !== 'object') return doc;
  const out = { ...doc };
  if (out.amountINR == null && out.amountGC != null) {
    out.amountINR = out.amountGC;
  }
  delete out.amountGC;
  if (out.matchedTransactionId != null && typeof out.matchedTransactionId === 'object') {
    out.matchedTransactionId = normalizeWalletHistoryDoc(out.matchedTransactionId);
  }
  return out;
}

function normalizeWalletHistoryList(docs) {
  if (!Array.isArray(docs)) return docs;
  return docs.map((d) => normalizeWalletHistoryDoc(d));
}

module.exports = {
  normalizeWalletHistoryDoc,
  normalizeWalletHistoryList
};
