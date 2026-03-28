/**
 * FAQ Model Validations
 * Contains all validation rules and messages for FAQ model
 */

module.exports = {
  question: {
    required: [true, 'Question is required'],
    minlength: [5, 'Question must be at least 5 characters'],
    maxlength: [500, 'Question cannot exceed 500 characters']
  },
  answer: {
    required: [true, 'Answer is required'],
    minlength: [10, 'Answer must be at least 10 characters'],
    maxlength: [5000, 'Answer cannot exceed 5000 characters']
  },
  category: {
    enum: ['general', 'tournament', 'payment', 'account', 'technical'],
    default: 'general'
  },
  order: {
    default: 0
  },
  isActive: {
    default: true
  }
};
