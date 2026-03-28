/**
 * Sanitization Helper
 * Provides utilities for sanitizing user input to prevent security vulnerabilities
 */

/**
 * Escape special regex characters in a string
 * Prevents ReDoS (Regular Expression Denial of Service) attacks
 * by escaping characters that have special meaning in regex patterns
 * 
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for use in regex patterns
 * 
 * @example
 * escapeRegex('user@example.com') // Returns 'user@example\\.com'
 * escapeRegex('test(123)') // Returns 'test\\(123\\)'
 */
const escapeRegex = (str) => {
  if (typeof str !== 'string') {
    return '';
  }
  
  // Escape all regex special characters
  // Characters that need escaping: . * + ? ^ $ { } [ ] \ | ( )
  return str.replace(/[.*+?^${}()[\]\\|]/g, '\\$&');
};

/**
 * Sanitize search term for MongoDB regex queries
 * Trims whitespace and escapes regex special characters
 * 
 * @param {string} searchTerm - Search term to sanitize
 * @returns {string} Sanitized search term safe for MongoDB $regex queries
 */
const sanitizeSearchTerm = (searchTerm) => {
  if (!searchTerm || typeof searchTerm !== 'string') {
    return '';
  }
  
  // Trim whitespace
  const trimmed = searchTerm.trim();
  
  // Escape regex special characters
  return escapeRegex(trimmed);
};

module.exports = {
  escapeRegex,
  sanitizeSearchTerm
};

