/**
 * Support Service
 * Handles support ticket operations including auto-closing tickets
 */

const SupportTicket = require('../models/SupportTicket.model');
const { broadcastTicketStatusUpdate } = require('./websocket.service');
const Logger = require('../utils/logger');

/**
 * Auto-close tickets where admin/host replied and user hasn't replied within 24 hours
 * This function checks for tickets where:
 * 1. Last reply was from admin or host (not user)
 * 2. Last reply was more than 24 hours ago
 * 3. Ticket status is not already 'closed' or 'resolved'
 * 4. User hasn't replied after the admin/host reply
 * 
 * @returns {Promise<Object>} Result with count of closed tickets
 */
const autoCloseInactiveTickets = async () => {
  try {
    // Check MongoDB connection
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      Logger.warn('Support Service: MongoDB not connected, skipping auto-close check');
      return {
        success: false,
        message: 'MongoDB not connected',
        closedCount: 0
      };
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find tickets where:
    // 1. Status is 'open' (not 'closed')
    // 2. lastReplyAt exists and is more than 24 hours ago
    // 3. lastRepliedBy exists (someone replied)
    const ticketsToCheck = await SupportTicket.find({
      status: 'open',
      lastReplyAt: { $exists: true, $lte: twentyFourHoursAgo },
      lastRepliedBy: { $exists: true, $ne: null }
    });

    let closedCount = 0;

    for (const ticket of ticketsToCheck) {
      // Check if messages array exists and has messages
      if (!ticket.messages || ticket.messages.length === 0) {
        continue;
      }

      // Get the last message from the messages array
      const lastMessage = ticket.messages[ticket.messages.length - 1];
      
      // Check if last message was from admin or host (not user)
      if (lastMessage.role !== 'admin' && lastMessage.role !== 'host') {
        continue; // Last message is from user, skip
      }

      // Verify that lastRepliedBy matches the last message's sentBy
      if (!ticket.lastRepliedBy || 
          ticket.lastRepliedBy.toString() !== lastMessage.sentBy.toString()) {
        continue; // Mismatch, skip
      }

      // Check if user has replied after this admin/host message
      // Since messages are in chronological order, we need to check if there's any user message
      // with a timestamp after the last admin/host message
      let userRepliedAfter = false;
      const lastAdminHostMessageTime = new Date(lastMessage.createdAt).getTime();

      // Iterate through all messages to find if user replied after the last admin/host message
      for (const msg of ticket.messages) {
        const msgTime = new Date(msg.createdAt).getTime();
        // If we find a user message created after the last admin/host message, user has replied
        if (msg.role === 'user' && msgTime > lastAdminHostMessageTime) {
          userRepliedAfter = true;
          break;
        }
      }

      // If user hasn't replied after admin/host message, close the ticket
      if (!userRepliedAfter) {
        ticket.status = 'closed';
        ticket.resolvedAt = new Date();
        ticket.resolvedBy = ticket.lastRepliedBy;
        await ticket.save();
        
        // Broadcast WebSocket event for ticket closure
        broadcastTicketStatusUpdate(ticket._id.toString(), {
          _id: ticket._id,
          status: ticket.status,
          resolvedAt: ticket.resolvedAt,
          resolvedBy: ticket.resolvedBy,
          lastReplyAt: ticket.lastReplyAt,
          lastRepliedBy: ticket.lastRepliedBy
        }, {
          userId: ticket.userId.toString(),
          hostId: ticket.hostId ? ticket.hostId.toString() : null,
          isAdmin: false,
          isAutoClosed: true
        });
        
        closedCount++;
      }
    }

    if (closedCount > 0) {
      Logger.info('Support Service: Auto-closed ticket(s) due to user inactivity', { closedCount });
    }

    return {
      success: true,
      closedCount,
      message: `Auto-closed ${closedCount} ticket(s)`
    };
  } catch (error) {
    Logger.error('Support Service: Error auto-closing tickets', error);
    return {
      success: false,
      message: error.message || 'Failed to auto-close tickets',
      error: error,
      closedCount: 0
    };
  }
};

/**
 * Delete closed tickets that have been closed for more than 24 hours
 * This function permanently deletes tickets from the database
 * 
 * @returns {Promise<Object>} Result with count of deleted tickets
 */
const deleteOldClosedTickets = async () => {
  try {
    // Check MongoDB connection
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      Logger.warn('Support Service: MongoDB not connected, skipping delete old closed tickets check');
      return {
        success: false,
        message: 'MongoDB not connected',
        deletedCount: 0
      };
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find tickets that are closed and were closed more than 24 hours ago
    // Use resolvedAt field which is set when ticket is closed
    const deleteResult = await SupportTicket.deleteMany({
      status: 'closed',
      resolvedAt: { $exists: true, $lte: twentyFourHoursAgo }
    });

    const deletedCount = deleteResult.deletedCount || 0;

    if (deletedCount > 0) {
      Logger.info('Support Service: Deleted closed ticket(s) older than 24 hours', { deletedCount });
    }

    return {
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} closed ticket(s)`
    };
  } catch (error) {
    Logger.error('Support Service: Error deleting old closed tickets', error);
    return {
      success: false,
      message: error.message || 'Failed to delete old closed tickets',
      error: error,
      deletedCount: 0
    };
  }
};

module.exports = {
  autoCloseInactiveTickets,
  deleteOldClosedTickets
};
