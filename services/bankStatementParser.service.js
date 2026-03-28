/**
 * Bank Statement Parser Service
 * Parses bank statement files (CSV/Excel) and extracts UTR, amount, and date
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const {
  findUTRInRow,
  findAmountInRow,
  findDateInRow,
  findDescriptionInRow,
  validateUTR,
  isAmountMatch
} = require('../utils/bankStatement.helper');
const Logger = require('../utils/logger');

/**
 * Parse CSV bank statement
 * Expected format: Date, Description, UTR, Amount, Balance (columns may vary)
 * @param {string|Buffer} filePath - Path to CSV file or file buffer
 * @param {Object} options - Parsing options
 * @returns {Promise<Array>} Array of parsed transactions
 */
const parseCSV = async (filePath, options = {}) => {
  return new Promise((resolve, reject) => {
    const transactions = [];
    const {
      dateColumn = 'Date',
      descriptionColumn = 'Description',
      utrColumn = 'UTR',
      amountColumn = 'Amount',
      creditColumn = 'Credit',
      debitColumn = 'Debit',
      skipRows = 0 // Number of header rows to skip
    } = options;

    const stream = fs.createReadStream(filePath)
      .pipe(csv({ skipLines: skipRows }))
      .on('data', (row) => {
        try {
          // Use helper functions to extract data from row
          const utr = findUTRInRow(row, utrColumn);
          const amount = findAmountInRow(row, amountColumn, creditColumn, debitColumn);
          const date = findDateInRow(row, dateColumn);
          const description = findDescriptionInRow(row, descriptionColumn);

          // Only add if we have UTR and amount (minimum required)
          if (utr && validateUTR(utr) && amount && amount > 0) {
            transactions.push({
              utr: utr,
              amount: amount,
              date: date || new Date(),
              description: description,
              rawRow: row
            });
          }
        } catch (error) {
          Logger.warn('Error parsing row', { errName: error.name });
          // Continue parsing other rows
        }
      })
      .on('end', () => {
        resolve(transactions);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

/**
 * Parse Excel bank statement
 * @param {string|Buffer} filePath - Path to Excel file or file buffer
 * @param {Object} options - Parsing options
 * @returns {Promise<Array>} Array of parsed transactions
 */
const parseExcel = async (filePath, options = {}) => {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    const transactions = [];
    const {
      dateColumn = 'Date',
      descriptionColumn = 'Description',
      utrColumn = 'UTR',
      amountColumn = 'Amount',
      creditColumn = 'Credit',
      debitColumn = 'Debit'
    } = options;

    for (const row of data) {
      try {
        // Use helper functions to extract data from row
        const utr = findUTRInRow(row, utrColumn);
        const amount = findAmountInRow(row, amountColumn, creditColumn, debitColumn);
        const date = findDateInRow(row, dateColumn);
        const description = findDescriptionInRow(row, descriptionColumn);

        // Only add if we have UTR and amount
        if (utr && validateUTR(utr) && amount && amount > 0) {
          transactions.push({
            utr: utr,
            amount: amount,
            date: date || new Date(),
            description: description,
            rawRow: row
          });
        }
      } catch (error) {
        Logger.warn('Error parsing row', { errName: error.name });
        // Continue parsing other rows
      }
    }

    return transactions;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

/**
 * Parse bank statement file (auto-detect format)
 * @param {string} filePath - Path to file
 * @param {Object} options - Parsing options
 * @returns {Promise<Array>} Array of parsed transactions
 */
const parseBankStatement = async (filePath, options = {}) => {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.csv') {
    return await parseCSV(filePath, options);
  } else if (ext === '.xlsx' || ext === '.xls') {
    return await parseExcel(filePath, options);
  } else {
    throw new Error(`Unsupported file format: ${ext}. Supported formats: CSV, XLSX, XLS`);
  }
};

/**
 * Match transactions from bank statement with pending payments
 * @param {Array} bankTransactions - Transactions from bank statement
 * @param {Array} pendingTransactions - Pending payment transactions from database
 * @returns {Array} Matched transactions with verification status
 */
const matchTransactions = (bankTransactions, pendingTransactions) => {
  const matches = [];
  const unmatchedBank = [];
  const unmatchedPending = [...pendingTransactions];

  for (const bankTxn of bankTransactions) {
    let matched = false;

    for (let i = 0; i < unmatchedPending.length; i++) {
      const pendingTxn = unmatchedPending[i];
      
      // Match by UTR (exact match)
      if (pendingTxn.utr && bankTxn.utr === pendingTxn.utr) {
        // Also check amount (with tolerance)
        if (isAmountMatch(bankTxn.amount, pendingTxn.amountINR, 0.01)) { // 1 paisa tolerance
          matches.push({
            bankTransaction: bankTxn,
            pendingTransaction: pendingTxn,
            matchType: 'utr_and_amount',
            confidence: 'high'
          });
          unmatchedPending.splice(i, 1);
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      unmatchedBank.push(bankTxn);
    }
  }

  return {
    matches,
    unmatchedBank,
    unmatchedPending
  };
};

module.exports = {
  parseCSV,
  parseExcel,
  parseBankStatement,
  matchTransactions
};

