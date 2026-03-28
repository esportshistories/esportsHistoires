/**
 * Inquiry Model (MongoDB)
 * Stores user inquiries/messages from contact form
 */

const mongoose = require('mongoose');
const validations = require('../validations/inquiry.validations');

/**
 * Inquiry Schema
 * Defines the structure for inquiry documents in MongoDB
 */
const inquirySchema = new mongoose.Schema({
  name: {
    type: String,
    required: validations.name.required,
    trim: true,
    minlength: validations.name.minlength,
    maxlength: validations.name.maxlength
  },
  email: {
    type: String,
    required: validations.email.required,
    lowercase: true,
    trim: true,
    match: validations.email.match
  },
  subject: {
    type: String,
    required: validations.subject.required,
    trim: true,
    maxlength: validations.subject.maxlength
  },
  message: {
    type: String,
    required: validations.message.required,
    trim: true,
    minlength: validations.message.minlength,
    maxlength: validations.message.maxlength
  },
  // Status to track if inquiry has been read/responded to
  status: {
    type: String,
    enum: validations.status.enum,
    default: validations.status.default
  },
  // Optional: Admin can add notes
  adminNotes: {
    type: String,
    trim: true,
    maxlength: validations.adminNotes.maxlength
  },
  // Reply tracking
  replyMessage: {
    type: String,
    trim: true,
    maxlength: validations.replyMessage.maxlength
  },
  repliedAt: {
    type: Date,
    default: null
  },
  repliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  collection: 'inquiries'
});

// Indexes for better query performance
inquirySchema.index({ email: 1 });
inquirySchema.index({ status: 1 });
inquirySchema.index({ createdAt: -1 });
inquirySchema.index({ subject: 1 });

// Note: updatedAt is automatically managed by timestamps: true option

const Inquiry = mongoose.model('Inquiry', inquirySchema);

module.exports = Inquiry;
