/**
 * Inquiry Model Validations
 * Contains all validation rules and messages for Inquiry model
 */

module.exports = {
  name: {
    required: [true, 'Name is required'],
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    required: [true, 'Email is required'],
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  subject: {
    required: [true, 'Subject is required'],
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  message: {
    required: [true, 'Message is required'],
    minlength: [10, 'Message must be at least 10 characters'],
    maxlength: [5000, 'Message cannot exceed 5000 characters']
  },
  status: {
    enum: ['new', 'read', 'replied', 'resolved'],
    default: 'new'
  },
  adminNotes: {
    maxlength: [1000, 'Admin notes cannot exceed 1000 characters']
  },
  replyMessage: {
    maxlength: [5000, 'Reply message cannot exceed 5000 characters']
  }
};
