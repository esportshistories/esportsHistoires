/**
 * Support Ticket Model Validations
 * Contains all validation rules and messages for SupportTicket model
 */

module.exports = {
  userId: {
    required: [true, 'User ID is required']
  },
  subject: {
    required: [true, 'Subject is required'],
    minlength: [5, 'Subject must be at least 5 characters'],
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  issue: {
    required: [true, 'Issue description is required'],
    minlength: [10, 'Issue description must be at least 10 characters'],
    maxlength: [5000, 'Issue description cannot exceed 5000 characters']
  },
  images: {
    maxlength: [1000000, 'Image data too large'], // Base64 can be large
    validate: {
      validator: function(images) {
        return !images || images.length <= 2;
      },
      message: 'Maximum 2 images allowed'
    }
  },
  status: {
    enum: ['open', 'closed'],
    default: 'open'
  },
  resolution: {
    maxlength: [5000, 'Resolution cannot exceed 5000 characters']
  },
  adminNotes: {
    maxlength: [2000, 'Admin notes cannot exceed 2000 characters']
  },
  hostNotes: {
    maxlength: [2000, 'Host notes cannot exceed 2000 characters']
  },
  messages: {
    message: {
      required: true,
      minlength: [1, 'Message cannot be empty'],
      maxlength: [5000, 'Message cannot exceed 5000 characters']
    },
    role: {
      enum: ['user', 'host', 'admin'],
      required: true
    }
  }
};
