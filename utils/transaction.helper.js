/**
 * Transaction Helper Utility
 * Provides utilities for transforming transaction data for user-facing responses
 */

/**
 * Transform transaction status for user-facing display
 * Converts internal status 'fail' to 'pending' for topup transactions awaiting admin approval
 * 
 * @param {Object} transaction - Transaction object (Mongoose document or plain object)
 * @returns {Object} Transaction with transformed status
 * 
 * @example
 * // Internal: { status: 'fail', verifiedBy: 'user' } 
 * // Returns: { status: 'pending', displayStatus: 'pending', ... }
 * 
 * // Internal: { status: 'fail', verifiedBy: 'admin' }
 * // Returns: { status: 'fail', ... } (rejected by admin)
 * 
 * // Internal: { status: 'success' }
 * // Returns: { status: 'success', ... }
 */
const transformTransactionStatus = (transaction) => {
  // Convert Mongoose document to plain object if needed
  const tx = transaction.toObject ? transaction.toObject() : transaction;
  
  // Only transform topup transactions
  if (tx.type === 'topup' && tx.status === 'fail' && tx.verifiedBy !== 'admin') {
    return {
      ...tx,
      status: 'pending', // Transform to pending for user-facing response
      displayStatus: 'pending' // Additional field for clarity
    };
  }
  
  // Return transaction as-is for other cases
  return tx;
};

/**
 * Transform multiple transactions for user-facing display
 * 
 * @param {Array} transactions - Array of transaction objects
 * @returns {Array} Array of transactions with transformed statuses
 */
const transformTransactionStatuses = (transactions) => {
  return transactions.map(transformTransactionStatus);
};

/**
 * Get display status for a transaction (without transforming the object)
 * Useful when you only need the status string
 * 
 * @param {Object} transaction - Transaction object
 * @returns {string} Display status ('pending', 'success', or 'fail')
 */
const getDisplayStatus = (transaction) => {
  const tx = transaction.toObject ? transaction.toObject() : transaction;
  
  // Transform status for topup transactions awaiting admin approval
  if (tx.type === 'topup' && tx.status === 'fail' && tx.verifiedBy !== 'admin') {
    return 'pending';
  }
  
  // Return original status for other cases
  return tx.status;
};

module.exports = {
  transformTransactionStatus,
  transformTransactionStatuses,
  getDisplayStatus
};
