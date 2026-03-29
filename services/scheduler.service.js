/**
 * Scheduler Service
 * Handles event-driven tournament status updates + periodic checks
 * 
 * HYBRID APPROACH:
 * - Event-driven: Checks when room is updated (immediate check)
 * - Periodic: Checks every minute to catch tournaments at start time (9:00)
 */

const tournamentService = require('./tournament.service');
const { checkAndBroadcastTournamentStatus } = require('./websocket.service');
const paymentVerificationService = require('./paymentVerification.service');
const supportService = require('./support.service');
const bankStatementEmailParser = require('./bankStatementEmailParser.service');
const paymentService = require('./payment.service');
const { PAYMENT } = require('../constants');
const Logger = require('../utils/logger');

/**
 * Check and update tournament status from upcoming to live
 * This is called event-driven: When room is updated (immediate check)
 * 
 * @param {string|null} tournamentId - Optional specific tournament to check
 */
const checkTournamentStatus = async (tournamentId = null) => {
  try {
    // Check MongoDB connection
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      Logger.warn('Scheduler: MongoDB not connected, skipping tournament status check');
      return;
    }

    // ✅ CRITICAL ORDER: Try to make live FIRST, then mark expired LAST
    // At 9:00 (start time): check room + min teams → live else cancelled. Host updates at 8:50.
    // 1. Cancel insufficient teams (before making live)
    const cancelledCount = await tournamentService.checkAndCancelInsufficientTeams(tournamentId);
    // 2. Make tournaments live (room published + min teams, check at start time 9:00)
    const updatedCount = await tournamentService.autoUpdateTournamentStatus(tournamentId);
    // 3. THEN mark expired (only those STILL upcoming/locked after above - never got room or never went live)
    const expiredCount = await tournamentService.markExpiredTournaments(tournamentId);
    
    if (updatedCount > 0) {
      await checkAndBroadcastTournamentStatus(tournamentId);
      Logger.info('Scheduler: Updated tournament(s) to live status', { updatedCount });
    }
    if (cancelledCount > 0) {
      Logger.info('Scheduler: Cancelled tournament(s) due to insufficient teams', { cancelledCount });
    }
    if (expiredCount > 0) {
      Logger.info('Scheduler: Marked expired tournament(s) (date passed, did not start)', { expiredCount });
    }
  } catch (error) {
    Logger.error('Scheduler: Error checking tournament status', { message: error?.message, stack: error?.stack });
    // Don't throw - let scheduler continue
  }
};

/**
 * Initialize scheduler (hybrid: event-driven + periodic checks)
 * - Event-driven: Checks when room is updated (immediate check)
 * - Periodic: Checks every minute to catch tournaments at start time (9:00)
 */
const initializeScheduler = () => {
  Logger.info('Scheduler initialized (hybrid: event-driven + periodic checks)', {
    autoVerify: PAYMENT.AUTO_VERIFY_ENABLED,
    bankEmailPolling: PAYMENT.ENABLE_BANK_STATEMENT_EMAIL_POLLING,
    legacyUpiTopup: PAYMENT.ENABLE_LEGACY_UPI_TOPUP
  });
  // Start periodic check every minute (60000 ms)
  // At start time (9:00): check room + min teams → live; else cancelled
  const periodicCheckInterval = setInterval(async () => {
    try {
      // Check MongoDB connection
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        Logger.warn('Scheduler: MongoDB not connected, skipping periodic checks');
        return;
      }

      // ✅ CRITICAL ORDER: Try to make live FIRST, then mark expired LAST (same as checkTournamentStatus)
      const cancelledCount = await tournamentService.checkAndCancelInsufficientTeams(null);
      const updatedCount = await tournamentService.autoUpdateTournamentStatus(null);
      const expiredCount = await tournamentService.markExpiredTournaments(null);
      
      if (updatedCount > 0) {
        await checkAndBroadcastTournamentStatus(null);
        Logger.info('Periodic check: Updated tournament(s) to live status', { updatedCount });
      }
      if (cancelledCount > 0) {
        Logger.info('Periodic check: Cancelled tournament(s) due to insufficient teams', { cancelledCount });
      }
      if (expiredCount > 0) {
        Logger.info('Periodic check: Marked expired tournament(s) (date passed, did not start)', { expiredCount });
      }

      // ✅ 10-MINUTE RULE: Publish room details for tournaments within publication window
      const notifiedCount = await tournamentService.publishRoomDetails();
      if (notifiedCount > 0) {
        Logger.info('Periodic check: Published room details for tournament(s)', { notifiedCount });
      }
    } catch (error) {
      Logger.error('Scheduler: Error in periodic tournament status check', { message: error?.message, stack: error?.stack });
      // Don't throw - let scheduler continue
    }
  }, 60000); // Check every minute (60000 ms)

  // Bank statement email IMAP polling — opt-in (ENABLE_BANK_STATEMENT_EMAIL_POLLING=true)
  if (PAYMENT.ENABLE_BANK_STATEMENT_EMAIL_POLLING) {
    setInterval(async () => {
      try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
          return;
        }

        if (process.env.BANK_STATEMENT_EMAIL && process.env.BANK_STATEMENT_EMAIL_PASSWORD) {
          const result = await bankStatementEmailParser.processEmails({
            maxEmails: 50,
            markAsRead: true
          });

          if (result.processed > 0 || result.transactions > 0) {
            Logger.info(`📧 Email parsing: Processed ${result.processed} emails, extracted ${result.transactions} transactions`);

            if (result.transactions > 0 && PAYMENT.AUTO_VERIFY_ENABLED) {
              const matchResult = await paymentVerificationService.processBankStatementQueue();
              if (matchResult.verified > 0) {
                Logger.info(`✅ Instant verification: Verified ${matchResult.verified} payments from new emails`);
              }
            }
          }
        }
      } catch (error) {
        Logger.error('❌ Scheduler: Error in email parsing:', error);
      }
    }, PAYMENT.EMAIL_PARSING_INTERVAL * 60 * 1000);
  } else {
    Logger.info('Scheduler: bank statement email IMAP polling is disabled (set ENABLE_BANK_STATEMENT_EMAIL_POLLING=true to enable)');
  }

  // UTR / bank-statement queue matching (every 5 min) — only if legacy UPI or email polling is in use
  if (
    PAYMENT.AUTO_VERIFY_ENABLED &&
    (PAYMENT.ENABLE_LEGACY_UPI_TOPUP || PAYMENT.ENABLE_BANK_STATEMENT_EMAIL_POLLING)
  ) {
    setInterval(async () => {
      try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
          return;
        }

        const matchResult = await paymentVerificationService.processBankStatementQueue({ fromCron: true });

        if (matchResult.matched > 0 || matchResult.verified > 0) {
          Logger.info(`✅ Payment verification: Matched ${matchResult.matched} transactions, verified ${matchResult.verified} payments`);
        }

        const verifyResult = await paymentVerificationService.autoVerifyPending({ forCron: true });

        if (verifyResult.checked > 0) {
          Logger.info(`📊 Payment check: ${verifyResult.checked} pending transactions with UTR found, ${verifyResult.verified} verified`);
        }
      } catch (error) {
        Logger.error('❌ Scheduler: Error in payment verification check:', error);
      }
    }, 5 * 60 * 1000);
  } else {
    Logger.info('Scheduler: UTR/bank-queue periodic verification is disabled (enable ENABLE_LEGACY_UPI_TOPUP and/or ENABLE_BANK_STATEMENT_EMAIL_POLLING)');
  }

  // Expire stale manual UPI / QR requests — only when that flow is enabled
  if (PAYMENT.ENABLE_LEGACY_UPI_TOPUP) {
    setInterval(async () => {
      try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
          return;
        }

        const expiredCount = await paymentService.expireOldQRCodes();
        if (expiredCount > 0) {
          Logger.info(`⏰ QR expiration: Expired ${expiredCount} old QR codes`);
        }
      } catch (error) {
        Logger.error('❌ Scheduler: Error in QR code expiration:', error);
      }
    }, 10 * 60 * 1000);
  }

  // Support ticket auto-close check (every hour)
  // This checks for tickets where admin/host replied and user hasn't replied within 24 hours
  const supportTicketCheckInterval = setInterval(async () => {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        return; // Skip if DB not connected
      }

      const result = await supportService.autoCloseInactiveTickets();
      
      if (result.closedCount > 0) {
        Logger.info('Support ticket check: Auto-closed ticket(s) due to user inactivity', { closedCount: result.closedCount });
      }
    } catch (error) {
      Logger.error('Scheduler: Error in support ticket auto-close check', error);
      // Don't throw - let scheduler continue
    }
  }, 60 * 60 * 1000); // Check every hour

  // Delete old closed tickets (once daily at midnight 12:00 AM)
  // This permanently deletes tickets that have been closed for more than 24 hours
  const scheduleDailyCleanup = () => {
    const runCleanup = async () => {
      try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
          return; // Skip if DB not connected
        }

        const result = await supportService.deleteOldClosedTickets();
        
        if (result.deletedCount > 0) {
          Logger.info('Support ticket cleanup: Deleted closed ticket(s) older than 24 hours', { deletedCount: result.deletedCount });
        }
      } catch (error) {
        Logger.error('Scheduler: Error in delete old closed tickets check', error);
        // Don't throw - let scheduler continue
      }
    };

    // Calculate milliseconds until next midnight (12:00 AM)
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0); // Set to today's midnight
    midnight.setDate(midnight.getDate() + 1); // Move to next midnight (tomorrow)
    
    const msUntilMidnight = midnight.getTime() - now.getTime();

    // Run cleanup at midnight, then schedule it to run every 24 hours
    setTimeout(() => {
      runCleanup(); // Run immediately at midnight
      // Then set interval to run every 24 hours
      setInterval(runCleanup, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    Logger.info('Scheduled ticket cleanup to run daily at midnight', { minutesUntil: Math.round(msUntilMidnight / 1000 / 60) });
  };

  scheduleDailyCleanup();
  
  // Store interval ID for potential cleanup (though we don't need to clear it in normal operation)
  // This is useful if we need to stop the scheduler for testing or graceful shutdown
  if (global.schedulerInterval) {
    clearInterval(global.schedulerInterval);
  }
  global.schedulerInterval = periodicCheckInterval;
};

/**
 * Check tournament status immediately (event-driven)
 * Called when room is updated or tournament is created
 * @param {string|null} tournamentId - Optional tournament ID to check specific tournament
 */
const checkTournamentStatusImmediate = async (tournamentId = null) => {
  return await checkTournamentStatus(tournamentId);
};

module.exports = {
  initializeScheduler,
  checkTournamentStatus,
  checkTournamentStatusImmediate // For event-driven calls
};

