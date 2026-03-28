/**
 * MongoDB transaction helper
 * Wraps operations in a session with startTransaction/commit/abort/endSession.
 * Requires a replica set (or single-node replica set for dev).
 */

const mongoose = require('mongoose');

/**
 * Run a function within a MongoDB transaction
 * @param {Function} fn - Async function receiving (session). Return value is passed through.
 * @returns {Promise<*>} Result of fn(session)
 */
async function runWithTransaction(fn) {
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

module.exports = { runWithTransaction };
