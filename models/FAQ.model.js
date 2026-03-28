/**
 * FAQ Model (MongoDB)
 * Stores frequently asked questions and answers for help and support section
 */

const mongoose = require('mongoose');
const validations = require('../validations/faq.validations');

/**
 * FAQ Schema
 * Defines the structure for FAQ documents in MongoDB
 */
const faqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: validations.question.required,
    trim: true,
    minlength: validations.question.minlength,
    maxlength: validations.question.maxlength
  },
  answer: {
    type: String,
    required: validations.answer.required,
    trim: true,
    minlength: validations.answer.minlength,
    maxlength: validations.answer.maxlength
  },
  category: {
    type: String,
    enum: validations.category.enum,
    default: validations.category.default,
    index: true
  },
  order: {
    type: Number,
    default: validations.order.default,
    index: true
  },
  isActive: {
    type: Boolean,
    default: validations.isActive.default,
    index: true
  }
}, {
  timestamps: true,
  collection: 'faqs'
});

// Indexes for better query performance
faqSchema.index({ category: 1, order: 1, isActive: 1 });
faqSchema.index({ isActive: 1, order: 1 });

const FAQ = mongoose.model('FAQ', faqSchema);

module.exports = FAQ;

