/**
 * MongoDB transaction helper.
 * Multi-document transactions require a replica set or mongos.
 * Local `mongodb://localhost:27017` (standalone) throws — we fall back to non-transactional fn(null).
 */

const mongoose = require('mongoose');

/**
 * @returns {boolean} true if server topology supports multi-document transactions
 */
function mongoSupportsTransactions() {
  if (process.env.MONGODB_DISABLE_TRANSACTIONS === 'true') {
    return false;
  }
  const conn = mongoose.connection;
  if (conn.readyState !== 1) {
    return false;
  }
  try {
    const desc = conn.client?.topology?.description;
    const type = desc?.type != null ? String(desc.type) : '';
    if (type === 'Single' || type === 'Standalone') {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Run a function within a MongoDB transaction when supported; otherwise run with session=null (no txn).
 * Callback must use optional session: only call .session(session) and pass { session } when session is truthy.
 * @param {function(import('mongoose').ClientSession|null): Promise<*>} fn
 * @returns {Promise<*>}
 */
async function runWithTransaction(fn) {
  if (!mongoSupportsTransactions()) {
    return fn(null);
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

module.exports = { runWithTransaction, mongoSupportsTransactions };
