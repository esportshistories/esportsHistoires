/**
 * Support Controller
 * Handles FAQ retrieval and support ticket/dispute management
 */

const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS, MESSAGES } = require('../constants');
const FAQ = require('../models/FAQ.model');
const SupportTicket = require('../models/SupportTicket.model');
const Tournament = require('../models/Tournament.model');
const User = require('../models/User.model');
const { broadcastTicketReply, broadcastTicketStatusUpdate } = require('../services/websocket.service');
const Logger = require('../utils/logger');

/**
 * Get all active FAQs
 * GET /api/support/faqs
 * Public endpoint - no authentication required
 */
const getFAQs = asyncHandler(async (req, res) => {
  const { category } = req.query;

  try {
    // Build query
    const query = { isActive: true };

    // Filter by category if provided
    if (category) {
      if (!['general', 'tournament', 'payment', 'account', 'technical'].includes(category)) {
        return res.badRequest('Invalid category. Must be one of: general, tournament, payment, account, technical');
      }
      query.category = category;
    }

    // Get FAQs sorted by order and creation date
    const faqs = await FAQ.find(query)
      .sort({ order: 1, createdAt: -1 })
      .select('-__v')
      .lean();

    res.success(HTTP_STATUS.OK, 'FAQs retrieved successfully', {
      faqs,
      total: faqs.length,
      category: category || 'all'
    });
  } catch (error) {
    Logger.error('Error getting FAQs', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to retrieve FAQs',
      null,
      error
    );
  }
});

/**
 * Create support ticket/dispute
 * POST /api/support/tickets
 * Requires authentication
 */
const createSupportTicket = asyncHandler(async (req, res) => {
  const { tournamentId, subject, issue, images } = req.body;
  const userId = req.userId;

  // Validation - subject and issue are required, tournamentId is optional
  if (!subject || !issue) {
    return res.badRequest('Subject and issue are required');
  }

  // Validate subject length
  if (subject.trim().length < 5 || subject.trim().length > 200) {
    return res.badRequest('Subject must be between 5 and 200 characters');
  }

  // Validate issue length
  if (issue.trim().length < 10 || issue.trim().length > 5000) {
    return res.badRequest('Issue description must be between 10 and 5000 characters');
  }

  // Validate images (max 2)
  if (images && Array.isArray(images)) {
    if (images.length > 2) {
      return res.badRequest('Maximum 2 images allowed');
    }
    // Validate each image is a string (base64 or URL)
    for (const image of images) {
      if (typeof image !== 'string' || image.trim().length === 0) {
        return res.badRequest('Invalid image format');
      }
    }
  }

  try {
    let hostId = null;
    let tournament = null;

    // If tournamentId is provided and not empty, validate it
    if (tournamentId && tournamentId !== null && tournamentId !== undefined && tournamentId !== '') {
      const trimmedTournamentId = String(tournamentId).trim();
      
      // Validate MongoDB ObjectId format
      const mongoIdRegex = /^[0-9a-fA-F]{24}$/;
      if (!mongoIdRegex.test(trimmedTournamentId)) {
        return res.badRequest('Invalid tournament ID format');
      }
      
      // Verify tournament exists
      tournament = await Tournament.findById(trimmedTournamentId);
      if (!tournament) {
        return res.notFound('Tournament not found');
      }

      // Verify user is a participant
      if (!tournament.participants.some(id => id.toString() === userId.toString())) {
        return res.badRequest('You are not a participant of this tournament');
      }

      // Get host ID from tournament (if exists)
      hostId = tournament.hostId || null;
    }

    // Create support ticket
    const ticket = await SupportTicket.create({
      userId,
      tournamentId: (tournamentId && tournamentId !== null && tournamentId !== undefined && tournamentId !== '') ? String(tournamentId).trim() : null,
      hostId: hostId,
      subject: subject.trim(),
      issue: issue.trim(),
      images: images && Array.isArray(images) ? images.map(img => img.trim()) : [],
      status: 'open'
    });

    // Populate user and tournament details for response
    await ticket.populate('userId', 'name email');
    if (ticket.tournamentId) {
      await ticket.populate('tournamentId', 'game mode subMode date startTime lobbyName');
      if (hostId) {
        await ticket.populate('hostId', 'name email');
      }
    }

    res.success(HTTP_STATUS.CREATED, 'Support ticket created successfully', {
      ticket: {
        _id: ticket._id,
        subject: ticket.subject,
        issue: ticket.issue,
        images: ticket.images,
        status: ticket.status,
        tournament: ticket.tournamentId || null,
        host: ticket.hostId || null,
        createdAt: ticket.createdAt
      }
    });
  } catch (error) {
    Logger.error('Error creating support ticket', error);
    
    // Handle CastError only if it's related to tournamentId
    if (error.name === 'CastError' && error.path === 'tournamentId') {
      return res.badRequest('Invalid tournament ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to create support ticket. Please try again later.',
      null,
      error
    );
  }
});

/**
 * Get user's support tickets
 * GET /api/support/tickets
 * Requires authentication
 */
const getUserTickets = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { page = 1, limit = 20, status } = req.query;

  // Validate pagination
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (pageNum < 1) {
    return res.badRequest('Page must be at least 1');
  }
  if (limitNum < 1 || limitNum > 100) {
    return res.badRequest('Limit must be between 1 and 100');
  }

  try {
    // Build query
    const query = { userId };

    // Filter by status if provided
    if (status) {
      if (!['open', 'closed'].includes(status)) {
        return res.badRequest('Invalid status. Must be one of: open, closed');
      }
      query.status = status;
    }

    // Calculate skip
    const skip = (pageNum - 1) * limitNum;

    // Get tickets with pagination
    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .populate('tournamentId', 'game mode subMode date startTime lobbyName')
        .populate('hostId', 'name email')
        .populate('messages.sentBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SupportTicket.countDocuments(query)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.success(HTTP_STATUS.OK, 'Support tickets retrieved successfully', {
      tickets,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage,
        hasPrevPage
      },
      filters: {
        status: status || null
      }
    });
  } catch (error) {
    Logger.error('Error getting user tickets', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to retrieve support tickets',
      null,
      error
    );
  }
});

/**
 * Get single ticket by ID (User)
 * GET /api/support/tickets/:ticketId
 * Requires authentication
 */
const getTicketById = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const userId = req.userId;

  if (!ticketId) {
    return res.badRequest('Ticket ID is required');
  }

  try {
    const ticket = await SupportTicket.findById(ticketId)
      .populate('userId', 'name email')
      .populate('tournamentId', 'game mode subMode date startTime lobbyName')
      .populate('hostId', 'name email')
      .populate('resolvedBy', 'name email')
      .populate('messages.sentBy', 'name email');

    if (!ticket) {
      return res.notFound('Support ticket not found');
    }

    // Verify user owns this ticket or is admin/host
    if (ticket.userId._id.toString() !== userId.toString()) {
      // Check if user is admin or host
      const user = await User.findById(userId);
      if (!user) {
        return res.unauthorized('User not found');
      }
      
      const isAdmin = user.role === 'admin';
      const isHost = ticket.hostId && ticket.hostId._id && ticket.hostId._id.toString() === userId.toString();
      
      if (!isAdmin && !isHost) {
        return res.forbidden('You do not have permission to view this ticket');
      }
    }

    res.success(HTTP_STATUS.OK, 'Support ticket retrieved successfully', {
      ticket
    });
  } catch (error) {
    Logger.error('Error getting ticket', error);
    
    if (error.name === 'CastError') {
      return res.badRequest('Invalid ticket ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to retrieve support ticket',
      null,
      error
    );
  }
});

/**
 * Get host's support tickets
 * GET /api/host/support/tickets
 * Requires authentication and host role
 */
const getHostTickets = asyncHandler(async (req, res) => {
  const hostId = req.userId;
  const { page = 1, limit = 20, status } = req.query;

  // Validate pagination
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (pageNum < 1) {
    return res.badRequest('Page must be at least 1');
  }
  if (limitNum < 1 || limitNum > 100) {
    return res.badRequest('Limit must be between 1 and 100');
  }

  try {
    // Build query
    const query = { hostId };

    // Filter by status if provided
    if (status) {
      if (!['open', 'closed'].includes(status)) {
        return res.badRequest('Invalid status. Must be one of: open, closed');
      }
      query.status = status;
    }

    // Calculate skip
    const skip = (pageNum - 1) * limitNum;

    // Get tickets with pagination
    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .populate('userId', 'name email')
        .populate('tournamentId', 'game mode subMode date startTime lobbyName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SupportTicket.countDocuments(query)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.success(HTTP_STATUS.OK, 'Support tickets retrieved successfully', {
      tickets,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage,
        hasPrevPage
      },
      filters: {
        status: status || null
      }
    });
  } catch (error) {
    Logger.error('Error getting host tickets', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to retrieve support tickets',
      null,
      error
    );
  }
});

/**
 * Update ticket status or add notes (Host)
 * PATCH /api/host/support/tickets/:ticketId
 * Requires authentication and host role
 */
const updateHostTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const hostId = req.userId;
  const { status, hostNotes } = req.body;

  if (!ticketId) {
    return res.badRequest('Ticket ID is required');
  }

  try {
    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.notFound('Support ticket not found');
    }

    // Verify host owns this ticket (only if ticket has a hostId)
    if (!ticket.hostId || ticket.hostId.toString() !== hostId.toString()) {
      return res.forbidden('You do not have permission to update this ticket');
    }

    // Update status if provided
    const statusChanged = status && ticket.status !== status;
    if (status) {
      if (!['open', 'closed'].includes(status)) {
        return res.badRequest('Invalid status. Must be one of: open, closed');
      }
      ticket.status = status;
      
      // If closed, set resolvedAt and resolvedBy
      if (status === 'closed' && !ticket.resolvedAt) {
        ticket.resolvedAt = new Date();
        ticket.resolvedBy = hostId;
      }
    }

    // Update host notes if provided
    if (hostNotes !== undefined) {
      if (hostNotes && hostNotes.trim().length > 2000) {
        return res.badRequest('Host notes cannot exceed 2000 characters');
      }
      ticket.hostNotes = hostNotes ? hostNotes.trim() : null;
    }

    await ticket.save();

    // Populate for response
    await ticket.populate('userId', 'name email');
    await ticket.populate('tournamentId', 'game mode subMode date startTime lobbyName');

    // Broadcast WebSocket event if status changed
    if (statusChanged) {
      broadcastTicketStatusUpdate(ticket._id.toString(), {
        _id: ticket._id,
        status: ticket.status,
        resolvedAt: ticket.resolvedAt,
        resolvedBy: ticket.resolvedBy,
        lastReplyAt: ticket.lastReplyAt,
        lastRepliedBy: ticket.lastRepliedBy
      }, {
        userId: ticket.userId.toString(),
        hostId: ticket.hostId ? ticket.hostId.toString() : null
      });
    }

    res.success(HTTP_STATUS.OK, 'Ticket updated successfully', {
      ticket: {
        _id: ticket._id,
        status: ticket.status,
        hostNotes: ticket.hostNotes,
        updatedAt: ticket.updatedAt
      }
    });
  } catch (error) {
    Logger.error('Error updating ticket', error);
    
    if (error.name === 'CastError') {
      return res.badRequest('Invalid ticket ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to update ticket',
      null,
      error
    );
  }
});

/**
 * Get all support tickets (Admin only)
 * GET /api/admin/support/tickets
 * Requires authentication and admin role
 */
const getAdminTickets = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search } = req.query;

  // Validate pagination
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (pageNum < 1) {
    return res.badRequest('Page must be at least 1');
  }
  if (limitNum < 1 || limitNum > 100) {
    return res.badRequest('Limit must be between 1 and 100');
  }

  try {
    // Build query
    const query = {};

    // Filter by status if provided
    if (status) {
      if (!['open', 'closed'].includes(status)) {
        return res.badRequest('Invalid status. Must be one of: open, closed');
      }
      query.status = status;
    }

    // Search by subject or issue
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { subject: searchRegex },
        { issue: searchRegex }
      ];
    }

    // Calculate skip
    const skip = (pageNum - 1) * limitNum;

    // Get tickets with pagination
    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .populate('userId', 'name email')
        .populate('tournamentId', 'game mode subMode date startTime lobbyName')
        .populate('hostId', 'name email')
        .populate('resolvedBy', 'name email')
        .populate('messages.sentBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SupportTicket.countDocuments(query)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.success(HTTP_STATUS.OK, 'Support tickets retrieved successfully', {
      tickets,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage,
        hasPrevPage
      },
      filters: {
        status: status || null,
        search: search || null
      }
    });
  } catch (error) {
    Logger.error('Error getting admin tickets', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to retrieve support tickets',
      null,
      error
    );
  }
});

/**
 * Update ticket status, resolution, or notes (Admin)
 * PATCH /api/admin/support/tickets/:ticketId
 * Requires authentication and admin role
 */
const updateAdminTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const adminId = req.userId;
  const { status, resolution, adminNotes } = req.body;

  if (!ticketId) {
    return res.badRequest('Ticket ID is required');
  }

  try {
    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.notFound('Support ticket not found');
    }

    // Update status if provided
    const statusChanged = status && ticket.status !== status;
    if (status) {
      if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
        return res.badRequest('Invalid status. Must be one of: open, in_progress, resolved, closed');
      }
      ticket.status = status;
      
      // If resolved, set resolvedAt and resolvedBy
      if (status === 'resolved' && !ticket.resolvedAt) {
        ticket.resolvedAt = new Date();
        ticket.resolvedBy = adminId;
      }
      
      // If closed, set resolvedAt and resolvedBy
      if (status === 'closed' && !ticket.resolvedAt) {
        ticket.resolvedAt = new Date();
        ticket.resolvedBy = adminId;
      }
    }

    // Update resolution if provided
    if (resolution !== undefined) {
      if (resolution && resolution.trim().length > 5000) {
        return res.badRequest('Resolution cannot exceed 5000 characters');
      }
      ticket.resolution = resolution ? resolution.trim() : null;
    }

    // Update admin notes if provided
    if (adminNotes !== undefined) {
      if (adminNotes && adminNotes.trim().length > 2000) {
        return res.badRequest('Admin notes cannot exceed 2000 characters');
      }
      ticket.adminNotes = adminNotes ? adminNotes.trim() : null;
    }

    await ticket.save();

    // Populate for response
    await ticket.populate('userId', 'name email');
    await ticket.populate('tournamentId', 'game mode subMode date startTime lobbyName');
    await ticket.populate('hostId', 'name email');
    await ticket.populate('resolvedBy', 'name email');

    // Broadcast WebSocket event if status changed
    if (statusChanged) {
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
        isAdmin: true
      });
    }

    res.success(HTTP_STATUS.OK, 'Ticket updated successfully', {
      ticket: {
        _id: ticket._id,
        status: ticket.status,
        resolution: ticket.resolution,
        adminNotes: ticket.adminNotes,
        resolvedBy: ticket.resolvedBy,
        resolvedAt: ticket.resolvedAt,
        updatedAt: ticket.updatedAt
      }
    });
  } catch (error) {
    Logger.error('Error updating ticket', error);
    
    if (error.name === 'CastError') {
      return res.badRequest('Invalid ticket ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to update ticket',
      null,
      error
    );
  }
});

/**
 * Reply to ticket (User)
 * POST /api/support/tickets/:ticketId/reply
 * Requires authentication
 */
const replyToTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { message } = req.body;
  const userId = req.userId;

  if (!ticketId) {
    return res.badRequest('Ticket ID is required');
  }

  if (!message || !message.trim()) {
    return res.badRequest('Message is required');
  }

  if (message.trim().length < 1 || message.trim().length > 5000) {
    return res.badRequest('Message must be between 1 and 5000 characters');
  }

  try {
    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.notFound('Support ticket not found');
    }

    // Verify user owns this ticket
    if (ticket.userId.toString() !== userId.toString()) {
      return res.forbidden('You can only reply to your own tickets');
    }

    // If ticket is closed, cannot reply
    if (ticket.status === 'closed') {
      return res.badRequest('Cannot reply to a closed ticket');
    }

    // Add message to messages array
    const newReply = {
      message: message.trim(),
      sentBy: userId,
      role: 'user',
      createdAt: new Date()
    };
    ticket.messages.push(newReply);

    // Update last reply info
    ticket.lastReplyAt = new Date();
    ticket.lastRepliedBy = userId;

    await ticket.save();

    // Broadcast WebSocket event for new reply
    const replyData = {
      message: newReply.message,
      sentBy: newReply.sentBy,
      role: newReply.role,
      createdAt: newReply.createdAt
    };
    broadcastTicketReply(ticket._id.toString(), {
      _id: ticket._id,
      status: ticket.status,
      lastReplyAt: ticket.lastReplyAt,
      lastRepliedBy: ticket.lastRepliedBy
    }, replyData, {
      userId: ticket.userId.toString(),
      hostId: ticket.hostId ? ticket.hostId.toString() : null
    });

    // Return minimal response - WebSocket handles real-time updates
    res.success(HTTP_STATUS.OK, 'Reply sent successfully', {
      ticketId: ticket._id.toString()
    });
  } catch (error) {
    Logger.error('Error replying to ticket', error);
    
    if (error.name === 'CastError') {
      return res.badRequest('Invalid ticket ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to send reply',
      null,
      error
    );
  }
});

/**
 * Reply to ticket (Host)
 * POST /api/host/support/tickets/:ticketId/reply
 * Requires authentication and host role
 */
const replyToTicketAsHost = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { message } = req.body;
  const hostId = req.userId;

  if (!ticketId) {
    return res.badRequest('Ticket ID is required');
  }

  if (!message || !message.trim()) {
    return res.badRequest('Message is required');
  }

  if (message.trim().length < 1 || message.trim().length > 5000) {
    return res.badRequest('Message must be between 1 and 5000 characters');
  }

  try {
    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.notFound('Support ticket not found');
    }

    // Verify host owns this ticket
    if (!ticket.hostId || ticket.hostId.toString() !== hostId.toString()) {
      return res.forbidden('You do not have permission to reply to this ticket');
    }

    // Check if ticket is closed
    if (ticket.status === 'closed') {
      return res.badRequest('Cannot reply to a closed ticket');
    }

    // Add message to messages array
    const newReply = {
      message: message.trim(),
      sentBy: hostId,
      role: 'host',
      createdAt: new Date()
    };
    ticket.messages.push(newReply);

    // Update last reply info
    ticket.lastReplyAt = new Date();
    ticket.lastRepliedBy = hostId;

    await ticket.save();

    // Broadcast WebSocket event for new reply
    const replyData = {
      message: newReply.message,
      sentBy: newReply.sentBy,
      role: newReply.role,
      createdAt: newReply.createdAt
    };
    broadcastTicketReply(ticket._id.toString(), {
      _id: ticket._id,
      status: ticket.status,
      lastReplyAt: ticket.lastReplyAt,
      lastRepliedBy: ticket.lastRepliedBy
    }, replyData, {
      userId: ticket.userId.toString(),
      hostId: ticket.hostId ? ticket.hostId.toString() : null
    });

    // Return minimal response - WebSocket handles real-time updates
    res.success(HTTP_STATUS.OK, 'Reply sent successfully', {
      ticketId: ticket._id.toString()
    });
  } catch (error) {
    Logger.error('Error replying to ticket', error);
    
    if (error.name === 'CastError') {
      return res.badRequest('Invalid ticket ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to send reply',
      null,
      error
    );
  }
});

/**
 * Reply to ticket (Admin)
 * POST /api/admin/support/tickets/:ticketId/reply
 * Requires authentication and admin role
 */
const replyToTicketAsAdmin = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { message } = req.body;
  const adminId = req.userId;

  if (!ticketId) {
    return res.badRequest('Ticket ID is required');
  }

  if (!message || !message.trim()) {
    return res.badRequest('Message is required');
  }

  if (message.trim().length < 1 || message.trim().length > 5000) {
    return res.badRequest('Message must be between 1 and 5000 characters');
  }

  try {
    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.notFound('Support ticket not found');
    }

    // Check if ticket is closed
    if (ticket.status === 'closed') {
      return res.badRequest('Cannot reply to a closed ticket');
    }

    // Add message to messages array
    const newReply = {
      message: message.trim(),
      sentBy: adminId,
      role: 'admin',
      createdAt: new Date()
    };
    ticket.messages.push(newReply);

    // Update last reply info
    ticket.lastReplyAt = new Date();
    ticket.lastRepliedBy = adminId;

    await ticket.save();

    // Broadcast WebSocket event for new reply
    const replyData = {
      message: newReply.message,
      sentBy: newReply.sentBy,
      role: newReply.role,
      createdAt: newReply.createdAt
    };
    broadcastTicketReply(ticket._id.toString(), {
      _id: ticket._id,
      status: ticket.status,
      lastReplyAt: ticket.lastReplyAt,
      lastRepliedBy: ticket.lastRepliedBy
    }, replyData, {
      userId: ticket.userId.toString(),
      hostId: ticket.hostId ? ticket.hostId.toString() : null,
      isAdmin: true
    });

    // Return minimal response - WebSocket handles real-time updates
    res.success(HTTP_STATUS.OK, 'Reply sent successfully', {
      ticketId: ticket._id.toString()
    });
  } catch (error) {
    Logger.error('Error replying to ticket', error);
    
    if (error.name === 'CastError') {
      return res.badRequest('Invalid ticket ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to send reply',
      null,
      error
    );
  }
});

module.exports = {
  getFAQs,
  createSupportTicket,
  getUserTickets,
  getTicketById,
  getHostTickets,
  updateHostTicket,
  getAdminTickets,
  updateAdminTicket,
  replyToTicket,
  replyToTicketAsHost,
  replyToTicketAsAdmin
};

