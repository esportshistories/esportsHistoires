/**
 * Inquiry Controller
 * Handles user inquiry submissions and admin inquiry management
 */

const { asyncHandler } = require('../utils/response.helper');
const { HTTP_STATUS, MESSAGES } = require('../constants');
const Inquiry = require('../models/Inquiry.model');
const inquiryService = require('../services/inquiry.service');
const Logger = require('../utils/logger');

/**
 * Submit inquiry
 * POST /api/inquiry
 * Public endpoint - no authentication required
 */
const submitInquiry = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;

  // Validation
  if (!name || !email || !subject || !message) {
    return res.badRequest('Name, email, subject, and message are required');
  }

  // Validate email format
  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    return res.badRequest('Please provide a valid email address');
  }

  // Validate name length
  if (name.trim().length < 2 || name.trim().length > 100) {
    return res.badRequest('Name must be between 2 and 100 characters');
  }

  // Validate subject length
  if (subject.trim().length < 1 || subject.trim().length > 200) {
    return res.badRequest('Subject must be between 1 and 200 characters');
  }

  // Validate message length
  if (message.trim().length < 10 || message.trim().length > 5000) {
    return res.badRequest('Message must be between 10 and 5000 characters');
  }

  try {
    // Create inquiry in database
    const inquiry = await Inquiry.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      subject: subject.trim(),
      message: message.trim(),
      status: 'new'
    });

    res.success(HTTP_STATUS.CREATED, 'Inquiry submitted successfully. We will get back to you soon.', {
      inquiryId: inquiry._id,
      submittedAt: inquiry.createdAt
    });
  } catch (error) {
    Logger.error('Error submitting inquiry', error);
    
    // Handle duplicate key error (if email index causes issues)
    if (error.code === 11000) {
      return res.error(
        HTTP_STATUS.CONFLICT,
        'An inquiry with this information already exists',
        null,
        error
      );
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to submit inquiry. Please try again later.',
      null,
      error
    );
  }
});

/**
 * Get all inquiries (Admin only)
 * GET /api/admin/inquiries
 * Requires authentication and admin role
 */
const getInquiries = asyncHandler(async (req, res) => {
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
      if (!['new', 'read', 'replied', 'resolved'].includes(status)) {
        return res.badRequest('Invalid status. Must be one of: new, read, replied, resolved');
      }
      query.status = status;
    }

    // Search by name, email, or subject
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { subject: searchRegex },
        { message: searchRegex }
      ];
    }

    // Calculate skip
    const skip = (pageNum - 1) * limitNum;

    // Get inquiries with pagination
    const [inquiries, total] = await Promise.all([
      Inquiry.find(query)
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Inquiry.countDocuments(query)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.success(HTTP_STATUS.OK, 'Inquiries retrieved successfully', {
      inquiries,
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
    Logger.error('Error getting inquiries', error);
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to retrieve inquiries',
      null,
      error
    );
  }
});

/**
 * Get single inquiry by ID (Admin only)
 * GET /api/admin/inquiries/:inquiryId
 * Requires authentication and admin role
 */
const getInquiryById = asyncHandler(async (req, res) => {
  const { inquiryId } = req.params;

  if (!inquiryId) {
    return res.badRequest('Inquiry ID is required');
  }

  try {
    const inquiry = await Inquiry.findById(inquiryId);

    if (!inquiry) {
      return res.notFound('Inquiry not found');
    }

    res.success(HTTP_STATUS.OK, 'Inquiry retrieved successfully', {
      inquiry
    });
  } catch (error) {
    Logger.error('Error getting inquiry', error);
    
    if (error.name === 'CastError') {
      return res.badRequest('Invalid inquiry ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to retrieve inquiry',
      null,
      error
    );
  }
});

/**
 * Update inquiry status (Admin only)
 * PATCH /api/admin/inquiries/:inquiryId/status
 * Requires authentication and admin role
 */
const updateInquiryStatus = asyncHandler(async (req, res) => {
  const { inquiryId } = req.params;
  const { status, adminNotes } = req.body;

  if (!inquiryId) {
    return res.badRequest('Inquiry ID is required');
  }

  if (!status) {
    return res.badRequest('Status is required');
  }

  if (!['new', 'read', 'replied', 'resolved'].includes(status)) {
    return res.badRequest('Invalid status. Must be one of: new, read, replied, resolved');
  }

  try {
    const inquiry = await Inquiry.findById(inquiryId);

    if (!inquiry) {
      return res.notFound('Inquiry not found');
    }

    // Update status
    inquiry.status = status;

    // Update admin notes if provided
    if (adminNotes !== undefined) {
      if (adminNotes && adminNotes.trim().length > 1000) {
        return res.badRequest('Admin notes cannot exceed 1000 characters');
      }
      inquiry.adminNotes = adminNotes ? adminNotes.trim() : null;
    }

    await inquiry.save();

    res.success(HTTP_STATUS.OK, 'Inquiry status updated successfully', {
      inquiry: {
        _id: inquiry._id,
        status: inquiry.status,
        adminNotes: inquiry.adminNotes,
        updatedAt: inquiry.updatedAt
      }
    });
  } catch (error) {
    Logger.error('Error updating inquiry status', error);
    
    if (error.name === 'CastError') {
      return res.badRequest('Invalid inquiry ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to update inquiry status',
      null,
      error
    );
  }
});

/**
 * Reply to inquiry (Admin only)
 * POST /api/admin/inquiries/:inquiryId/reply
 * Requires authentication and admin role
 * Sends email reply to user
 */
const replyToInquiry = asyncHandler(async (req, res) => {
  const { inquiryId } = req.params;
  const { replyMessage } = req.body;
  const adminId = req.userId; // Admin user ID from auth middleware

  if (!inquiryId) {
    return res.badRequest('Inquiry ID is required');
  }

  if (!replyMessage || !replyMessage.trim()) {
    return res.badRequest('Reply message is required');
  }

  if (replyMessage.trim().length < 10) {
    return res.badRequest('Reply message must be at least 10 characters');
  }

  if (replyMessage.trim().length > 5000) {
    return res.badRequest('Reply message cannot exceed 5000 characters');
  }

  try {
    const inquiry = await Inquiry.findById(inquiryId);

    if (!inquiry) {
      return res.notFound('Inquiry not found');
    }

    // Update inquiry with reply information
    inquiry.replyMessage = replyMessage.trim();
    inquiry.repliedAt = new Date();
    inquiry.repliedBy = adminId;
    inquiry.status = 'replied'; // Update status to replied

    await inquiry.save();

    // Send email reply to user (non-blocking)
    // Don't fail the request if email fails
    inquiryService.sendInquiryReplyEmail(
      inquiry.name,
      inquiry.email,
      inquiry.subject,
      inquiry.message,
      inquiry.replyMessage
    ).then(result => {
      if (!result.success) {
        Logger.error('Failed to send inquiry reply email', { message: result.message });
      } else {
        Logger.info('Inquiry reply email sent successfully', { messageId: result.messageId });
      }
    }).catch(error => {
      Logger.error('Error sending inquiry reply email', error);
      // Continue even if email fails
    });

    res.success(HTTP_STATUS.OK, 'Reply sent successfully to user', {
      inquiry: {
        _id: inquiry._id,
        status: inquiry.status,
        replyMessage: inquiry.replyMessage,
        repliedAt: inquiry.repliedAt,
        repliedBy: inquiry.repliedBy,
        updatedAt: inquiry.updatedAt
      }
    });
  } catch (error) {
    Logger.error('Error replying to inquiry', error);
    
    if (error.name === 'CastError') {
      return res.badRequest('Invalid inquiry ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to send reply. Please try again later.',
      null,
      error
    );
  }
});

/**
 * Delete inquiry (Admin only)
 * DELETE /api/admin/inquiries/:inquiryId
 * Requires authentication and admin role
 */
const deleteInquiry = asyncHandler(async (req, res) => {
  const { inquiryId } = req.params;

  if (!inquiryId) {
    return res.badRequest('Inquiry ID is required');
  }

  try {
    const inquiry = await Inquiry.findByIdAndDelete(inquiryId);

    if (!inquiry) {
      return res.notFound('Inquiry not found');
    }

    res.success(HTTP_STATUS.OK, 'Inquiry deleted successfully', {
      inquiryId: inquiry._id
    });
  } catch (error) {
    Logger.error('Error deleting inquiry', error);
    
    if (error.name === 'CastError') {
      return res.badRequest('Invalid inquiry ID format');
    }
    
    return res.error(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to delete inquiry',
      null,
      error
    );
  }
});

module.exports = {
  submitInquiry,
  getInquiries,
  getInquiryById,
  updateInquiryStatus,
  replyToInquiry,
  deleteInquiry
};
