/**
 * User Model Validations
 * Contains all validation rules and messages for User model
 */

module.exports = {
  email: {
    required: [true, 'Email is required'],
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  name: {
    required: [true, 'Name is required'],
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  password: {
    required: false, // Password is set during verify-otp, not during registration
    minlength: [8, 'Password must be at least 8 characters with at least one capital letter, one number, and one special character']
  },
  ign: {
    maxlength: [50, 'IGN cannot exceed 50 characters']
  },
  phoneNumber: {
    match: [/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Please provide a valid phone number']
  },
  gender: {
    enum: ['male', 'female', 'other', 'prefer_not_to_say']
  },
  age: {
    min: [13, 'Age must be at least 13'],
    max: [120, 'Age must be valid']
  },
  authProvider: {
    enum: ['email', 'google', 'both'],
    default: 'email'
  },
  role: {
    enum: ['user', 'host', 'admin', 'org_manager'],
    default: 'user'
  }
};
