/**
 * Bank Statement Helper Utilities
 * Reusable helper functions for parsing and processing bank statement data
 */

/**
 * Normalize UTR (Unique Transaction Reference)
 * Trims whitespace and converts to uppercase
 * @param {string} utr - UTR string
 * @returns {string} Normalized UTR
 */
const normalizeUTR = (utr) => {
  if (!utr || typeof utr !== 'string') {
    return '';
  }
  return utr.trim().toUpperCase();
};

/**
 * Parse amount string (remove commas and parse to float)
 * @param {string|number} amountStr - Amount as string or number
 * @returns {number|null} Parsed amount or null if invalid
 */
const parseAmount = (amountStr) => {
  if (typeof amountStr === 'number') {
    return isNaN(amountStr) ? null : amountStr;
  }
  if (!amountStr) {
    return null;
  }
  const cleaned = String(amountStr).replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
};

/**
 * Find UTR in a row object by checking common column names
 * @param {Object} row - Row object with column data
 * @param {string} utrColumn - Preferred UTR column name
 * @returns {string|null} Found UTR or null
 */
const findUTRInRow = (row, utrColumn = 'UTR') => {
  if (!row) {
    return null;
  }

  const utrKeys = [
    utrColumn,
    'UTR',
    'utr',
    'Reference',
    'REF',
    'Transaction ID',
    'Txn ID',
    'TxnID',
    'TransactionId'
  ];

  for (const key of utrKeys) {
    if (row[key]) {
      const value = String(row[key]).trim();
      if (value) {
        return normalizeUTR(value);
      }
    }
  }

  return null;
};

/**
 * Find amount in a row object by checking credit/debit/amount columns
 * @param {Object} row - Row object with column data
 * @param {string} amountColumn - Preferred amount column name
 * @param {string} creditColumn - Credit column name
 * @param {string} debitColumn - Debit column name
 * @returns {number|null} Found amount or null
 */
const findAmountInRow = (row, amountColumn = 'Amount', creditColumn = 'Credit', debitColumn = 'Debit') => {
  if (!row) {
    return null;
  }

  let amount = null;

  // Check credit column first (positive amounts)
  if (creditColumn && row[creditColumn]) {
    const credit = parseAmount(row[creditColumn]);
    if (credit !== null && credit > 0) {
      amount = credit;
    }
  }

  // Check debit column if credit not found (positive amounts)
  if (!amount && debitColumn && row[debitColumn]) {
    const debit = parseAmount(row[debitColumn]);
    if (debit !== null && debit > 0) {
      amount = debit;
    }
  }

  // Check amount column as fallback (absolute value)
  if (!amount && amountColumn && row[amountColumn]) {
    const amt = parseAmount(row[amountColumn]);
    if (amt !== null && amt !== 0) {
      amount = Math.abs(amt);
    }
  }

  return amount;
};

/**
 * Find date in a row object by checking common column names
 * @param {Object} row - Row object with column data
 * @param {string} dateColumn - Preferred date column name
 * @returns {Date|null} Found date or null
 */
const findDateInRow = (row, dateColumn = 'Date') => {
  if (!row) {
    return null;
  }

  const dateKeys = [
    dateColumn,
    'Date',
    'date',
    'Transaction Date',
    'Txn Date',
    'TransactionDate',
    'TxnDate'
  ];

  for (const key of dateKeys) {
    if (row[key]) {
      const date = new Date(row[key]);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  return null;
};

/**
 * Find description in a row object by checking common column names
 * @param {Object} row - Row object with column data
 * @param {string} descriptionColumn - Preferred description column name
 * @returns {string} Found description or empty string
 */
const findDescriptionInRow = (row, descriptionColumn = 'Description') => {
  if (!row) {
    return '';
  }

  const descKeys = [
    descriptionColumn,
    'Description',
    'description',
    'Narration',
    'Remarks',
    'Memo',
    'Details'
  ];

  for (const key of descKeys) {
    if (row[key]) {
      const value = String(row[key]).trim();
      if (value) {
        return value;
      }
    }
  }

  return '';
};

/**
 * Validate UTR format
 * @param {string} utr - UTR to validate
 * @param {number} minLength - Minimum length (default: 8)
 * @param {number} maxLength - Maximum length (default: 20)
 * @returns {boolean} True if valid
 */
const validateUTR = (utr, minLength = 8, maxLength = 20) => {
  if (!utr || typeof utr !== 'string') {
    return false;
  }
  const normalized = normalizeUTR(utr);
  return normalized.length >= minLength && normalized.length <= maxLength;
};

/**
 * Calculate absolute difference between two amounts
 * @param {number} amount1 - First amount
 * @param {number} amount2 - Second amount
 * @returns {number} Absolute difference
 */
const calculateAmountDifference = (amount1, amount2) => {
  return Math.abs((amount1 || 0) - (amount2 || 0));
};

/**
 * Check if two amounts match within tolerance
 * @param {number} amount1 - First amount
 * @param {number} amount2 - Second amount
 * @param {number} tolerance - Tolerance value (default: 0.01)
 * @returns {boolean} True if amounts match within tolerance
 */
const isAmountMatch = (amount1, amount2, tolerance = 0.01) => {
  const diff = calculateAmountDifference(amount1, amount2);
  return diff <= tolerance;
};

module.exports = {
  normalizeUTR,
  parseAmount,
  findUTRInRow,
  findAmountInRow,
  findDateInRow,
  findDescriptionInRow,
  validateUTR,
  calculateAmountDifference,
  isAmountMatch
};
