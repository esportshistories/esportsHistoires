/**
 * Bank Statement Email Parser Service
 * Parses bank statement emails with CSV/Excel attachments and extracts transactions
 * Uses IMAP to connect to email server and process incoming bank statements
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const bankStatementParser = require('./bankStatementParser.service');
const BankStatementTransaction = require('../models/BankStatementTransaction.model');
const Logger = require('../utils/logger');
const { normalizeUTR, parseAmount, validateUTR } = require('../utils/bankStatement.helper');

/**
 * Connect to IMAP email server
 * @returns {Promise<Imap>} IMAP connection instance
 */
const connectToEmail = () => {
  return new Promise((resolve, reject) => {
    const emailHost = process.env.BANK_STATEMENT_EMAIL_HOST || 'imap.gmail.com';
    const emailPort = parseInt(process.env.BANK_STATEMENT_EMAIL_PORT || '993');
    const emailUser = process.env.BANK_STATEMENT_EMAIL;
    const emailPassword = process.env.BANK_STATEMENT_EMAIL_PASSWORD;

    if (!emailUser || !emailPassword) {
      return reject(new Error('BANK_STATEMENT_EMAIL and BANK_STATEMENT_EMAIL_PASSWORD must be set'));
    }

    const imap = new Imap({
      user: emailUser,
      password: emailPassword,
      host: emailHost,
      port: emailPort,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    imap.once('ready', () => {
      Logger.info('Email connection established');
      resolve(imap);
    });

    imap.once('error', (err) => {
      Logger.error('Email connection error:', err);
      reject(err);
    });

    imap.connect();
  });
};

/**
 * Parse email attachments and extract bank statement transactions
 * @param {Object} email - Parsed email object from mailparser
 * @param {string} emailMessageId - Email message ID
 * @returns {Promise<Array>} Array of parsed transactions
 */
const parseEmailAttachments = async (email, emailMessageId) => {
  const transactions = [];
  const attachments = email.attachments || [];

  for (const attachment of attachments) {
    try {
      const filename = attachment.filename || attachment.name || 'unknown';
      const ext = path.extname(filename).toLowerCase();

      // Only process CSV and Excel files
      if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
        Logger.warn(`Skipping attachment ${filename} - unsupported format`);
        continue;
      }

      // Save attachment to temporary file
      const tempDir = path.join(__dirname, '../temp');
      if (!fsSync.existsSync(tempDir)) {
        await fs.mkdir(tempDir, { recursive: true });
      }

      const tempFilePath = path.join(tempDir, `statement_${Date.now()}_${filename}`);
      await fs.writeFile(tempFilePath, attachment.content);

      // Parse bank statement
      const parsedTransactions = await bankStatementParser.parseBankStatement(tempFilePath);

      // Enrich with email metadata
      for (const txn of parsedTransactions) {
        transactions.push({
          ...txn,
          emailSource: emailMessageId,
          emailSubject: email.subject,
          emailDate: email.date,
          attachmentFilename: filename,
          bankName: extractBankName(email.subject, email.from?.text || '')
        });
      }

      // Clean up temp file
      await fs.unlink(tempFilePath);
    } catch (error) {
      Logger.error(`Error parsing attachment ${attachment.filename}:`, error);
      // Continue with other attachments
    }
  }

  return transactions;
};

/**
 * Extract UTR and amount from email body/text
 * @param {string} emailBody - Email body text
 * @param {Object} emailInfo - Email information (from, subject, date)
 * @param {string} emailInfo.from - Email sender
 * @param {string} emailInfo.subject - Email subject
 * @returns {Object|null} Object with utr, amount, date or null if not found
 */
const extractTransactionFromEmailBody = (emailBody, emailInfo = {}) => {
  if (!emailBody || typeof emailBody !== 'string') {
    return null;
  }

  // Clean HTML tags if present and normalize whitespace
  const text = emailBody.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  let utr = null;
  let amount = null;
  let date = null;

  // Extract UTR - supports "(UPI 327832974310)" format from gethelpbooyahx@gmail.com emails
  // Also supports simple formats like "UTR: 123456789012" or "UTR 123456789012"
  const utrPatterns = [
    /\(UPI\s+(\d{10,20})\)/i,  // Pattern for "(UPI 327832974310)" format
    /UPI\s+(\d{10,20})/i,  // Pattern for "UPI 327832974310" without parentheses
    /transaction reference number is\s*(\d{10,20})/i,
    /UPI transaction reference number is\s*(\d{10,20})/i,
    /reference number is\s*(\d{10,20})/i,
    /reference[:\s]+(\d{10,20})/i,
    /UTR[:\s]+(\d{8,20})/i,  // Made more flexible (8-20 digits)
    /txn[:\s]+(\d{10,20})/i,
    /transaction[:\s]+id[:\s]+(\d{8,20})/i,
    /txn[:\s]+id[:\s]+(\d{8,20})/i,
    /(\d{12})/g // Generic 12 digit UTR (must be last as fallback)
  ];

  for (const pattern of utrPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Validate UTR length (8-20 characters) and numeric format
      if (validateUTR(candidate, 8, 20) && /^\d+$/.test(candidate)) {
        utr = candidate;
        break;
      }
    }
  }

  // Extract amount - supports "Rs.5.00 credited" format from gethelpbooyahx@gmail.com emails
  // Also supports simple formats like "Amount: 5000" or "Amount 5000"
  const amountPatterns = [
    /Rs\.?\s*(\d+(?:\.\d{2})?)\s*credited/i,  // Pattern for "Rs.5.00 credited" format
    /Rs\.?\s*(\d+(?:\.\d{2})?)\s*has been/i,
    /Rs\.?\s*(\d+(?:\.\d{2})?)\s*debited/i,
    /amount[:\s]+Rs\.?\s*(\d+(?:\.\d{2})?)/i,
    /amount[:\s]+(\d+(?:\.\d{2})?)/i,  // Added: "Amount: 5000" format
    /Rs\.?\s*(\d+(?:\.\d{2})?)/i,
    /INR[:\s]*(\d+(?:\.\d{2})?)/i,
    /₹[:\s]*(\d+(?:\.\d{2})?)/i
  ];

  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const parsedAmount = parseAmount(match[1]);
      if (parsedAmount !== null && parsedAmount > 0) {
        amount = parsedAmount;
        break;
      }
    }
  }

  // Extract date - try to find date in email
  const datePatterns = [
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,
    /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/,
    /on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const parsedDate = new Date(match[1]);
      if (!isNaN(parsedDate.getTime())) {
        date = parsedDate;
        break;
      }
    }
  }

  // If we found UTR and amount, return transaction
  if (utr && amount) {
    const normalizedUTR = normalizeUTR(utr);
    
    Logger.debug('PAYMENT EMAIL RECEIVED', { from: emailInfo.from, subject: emailInfo.subject, utr: normalizedUTR, amount });

    return {
      utr: normalizedUTR,
      amount: amount,
      date: date || new Date(),
      description: text.substring(0, 200) // First 200 chars as description
    };
  }

  return null;
};

/**
 * Extract bank name from email subject or sender
 * @param {string} subject - Email subject
 * @param {string} from - Email sender
 * @returns {string} Bank name or 'Unknown'
 */
const extractBankName = (subject, from) => {
  const text = `${subject} ${from}`.toLowerCase();
  
    const bankPatterns = {
      'SBI': /sbi|state bank/i,
      'ICICI': /icici/i,
      'Axis': /axis/i,
      'Kotak': /kotak/i,
      'PhonePe': /phonepe/i,
      'Google Pay': /google pay|gpay/i,
      'BHIM': /bhim/i
    };

  for (const [bankName, pattern] of Object.entries(bankPatterns)) {
    if (pattern.test(text)) {
      return bankName;
    }
  }

  return 'Unknown';
};

/**
 * Check if email has already been processed
 * @param {string} emailMessageId - Email message ID
 * @returns {Promise<boolean>} True if already processed
 */
const isEmailProcessed = async (emailMessageId) => {
  const existing = await BankStatementTransaction.findOne({
    emailSource: emailMessageId
  });
  return !!existing;
};

/**
 * Process emails from inbox and extract bank statement transactions
 * @param {Object} options - Processing options
 * @param {number} options.maxEmails - Maximum number of emails to process (default: 50)
 * @param {boolean} options.markAsRead - Mark emails as read (default: true)
 * @returns {Promise<Object>} Processing results
 */
const processEmails = async (options = {}) => {
  const { maxEmails = 50, markAsRead = true } = options;
  const results = {
    processed: 0,
    transactions: 0,
    errors: [],
    skipped: 0
  };

  let imap;
  try {
    imap = await connectToEmail();

    return new Promise((resolve, reject) => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          Logger.error('Error opening inbox:', err);
          imap.end();
          return reject(err);
        }

        // Search for emails from today (we'll filter by sender in code)
        // Removing 'UNSEEN' so even if user opens the mail, backend still reads it
        const today = new Date();
        // Search for emails from today - we'll filter by sender (gethelpbooyahx@gmail.com) in code
        const searchCriteria = [['SINCE', today]];
        
        Logger.info('Searching for emails from today - filtering for gethelpbooyahx@gmail.com (last 5 minutes sequentially)');
        
        imap.search(searchCriteria, async (err, results) => {
          if (err) {
            // Fallback to broader search if the specific one fails
            Logger.warn('Specific IMAP search failed, falling back to UNSEEN');
            imap.search(['UNSEEN'], async (err2, results2) => {
              if (err2) {
                Logger.error('Error searching emails:', err2);
                imap.end();
                return reject(err2);
              }
              processSearchResults(results2);
            });
            return;
          }
          processSearchResults(results);
        });

        const processSearchResults = async (results) => {
          if (!results || results.length === 0) {
            Logger.info('No new emails from gethelpbooyahx@gmail.com to process');
            imap.end();
            return resolve({
              processed: 0,
              transactions: 0,
              errors: [],
              skipped: 0,
              message: 'No new emails found'
            });
          }

          // Sort by newest first (descending UID/sequence number)
          const sortedIds = [...results].sort((a, b) => b - a);
          const emailIds = sortedIds.slice(0, maxEmails);
          
          let processedSuccessfully = 0;
          let totalTransactions = 0;

          // Sequential processing to stop immediately after hitting an email > 5 mins old
          for (let i = 0; i < emailIds.length; i++) {
            const seqno = emailIds[i];
            
            try {
              // Wrap single fetch in promise for sequential execution
              const emailData = await new Promise((msgResolve, msgReject) => {
                const f = imap.fetch(seqno, { bodies: '' });
                let buffer = '';
                
                f.on('message', (msg) => {
                  msg.on('body', (stream) => {
                    stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); });
                  });
                  msg.once('end', () => {});
                });
                
                f.once('error', (err) => msgReject(err));
                f.once('end', () => msgResolve(buffer));
              });

              const parsed = await simpleParser(emailData);
              const emailMessageId = parsed.messageId || `email_${Date.now()}_${seqno}`;

              // Get email from address (keep original case for display)
              const emailFromAddress = parsed.from?.text || parsed.from?.value?.[0]?.address || 'Unknown';
              
              // Filter: ONLY process emails from gethelpbooyahx@gmail.com
              const emailFromLower = emailFromAddress.toLowerCase();
              const isBooyahX = emailFromLower.includes('gethelpbooyahx@gmail.com');
              
              if (!isBooyahX) {
                continue; // Skip all other emails silently
              }

              // Filter: STRICTLY process emails from last 5 minutes
              const emailDate = parsed.date || new Date();
              const now = new Date();
              const diffMinutes = Math.floor((now - emailDate) / (1000 * 60));
              
              if (diffMinutes > 5) {
                Logger.info(`🛑 STOPPING: Email ${seqno} is ${diffMinutes} mins old (> 5 mins). Stopping sequential scan.`);
                break; // Stop processing any further emails
              }

              // Check if already processed
              if (await isEmailProcessed(emailMessageId)) {
                Logger.info(`Email ${emailMessageId} already processed, skipping`);
                continue;
              }

              // Extract transactions
              const emailSubject = parsed.subject || 'No Subject';
              
              let transactions = await parseEmailAttachments(parsed, emailMessageId);
              if (transactions.length === 0) {
                const bodyText = parsed.text || parsed.html || '';
                const bodyTxn = extractTransactionFromEmailBody(bodyText, {
                  from: emailFromAddress,
                  subject: emailSubject
                });
                if (bodyTxn) {
                  transactions.push({
                    ...bodyTxn,
                    emailSource: emailMessageId,
                    emailSubject: parsed.subject,
                    emailDate: parsed.date,
                    bankName: extractBankName(parsed.subject, parsed.from?.text || '')
                  });
                }
              }

              // Save to DB
              for (const txn of transactions) {
                const exists = await BankStatementTransaction.findOne({ utr: txn.utr, amount: txn.amount });
                if (!exists) {
                  await BankStatementTransaction.create({
                    ...txn,
                    processed: false
                  });
                  totalTransactions++;
                  Logger.info(`✅ Saved transaction from email: UTR ${txn.utr}, Amount ₹${txn.amount}`);
                }
              }

              processedSuccessfully++;

              // Mark as read
              if (markAsRead) {
                await new Promise((flagResolve) => {
                  imap.addFlags(seqno, '\\Seen', (err) => flagResolve());
                });
              }
            } catch (err) {
              Logger.error(`Error processing email ${seqno}:`, err);
            }
          }

          imap.end();
          resolve({
            processed: processedSuccessfully,
            transactions: totalTransactions,
            message: 'Sequential processing completed'
          });
        };
      });
    });
  } catch (error) {
    Logger.error('Error in processEmails:', error);
    if (imap) {
      imap.end();
    }
    throw error;
  }
};

/**
 * Process a single email by message ID (for manual processing)
 * @param {string} messageId - Email message ID
 * @returns {Promise<Object>} Processing result
 */
const processSingleEmail = async (messageId) => {
  // This would require additional IMAP implementation
  // For now, return error suggesting to use processEmails
  throw new Error('Single email processing not yet implemented. Use processEmails to process all emails.');
};

module.exports = {
  connectToEmail,
  processEmails,
  processSingleEmail,
  parseEmailAttachments,
  extractTransactionFromEmailBody,
  extractBankName,
  isEmailProcessed
};
