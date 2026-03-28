/**
 * Inquiry Service
 * Handles sending inquiry notification emails to admin and reply emails to users
 */

const { Resend } = require('resend');
const { generateInquiryEmailTemplate, getInquiryEmailSubject, generateInquiryReplyEmailTemplate, getInquiryReplyEmailSubject } = require('./otp/email.templates');
const Logger = require('../utils/logger');

/**
 * Send inquiry notification email to admin
 * @param {string} name - Sender name
 * @param {string} email - Sender email
 * @param {string} subject - Inquiry subject
 * @param {string} message - Inquiry message
 * @returns {Promise<Object>} Email send result
 */
const sendInquiryEmail = async (name, email, subject, message) => {
  try {
    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.trim() === '') {
      Logger.warn('RESEND_API_KEY not configured. Skipping inquiry email.');
      return {
        success: false,
        message: 'Email service not configured'
      };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const senderEmail = process.env.EMAIL_FROM || 'no-reply@gaminghuballday.buzz';
    const senderName = process.env.EMAIL_SENDER_NAME || 'BooyahX';
    
    // Admin email - can be configured via environment variable
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || 'admin@gaminghuballday.buzz';

    // Generate email template
    const htmlContent = generateInquiryEmailTemplate({
      name,
      email,
      subject,
      message
    });

    const emailSubject = getInquiryEmailSubject(subject);

    const { data, error } = await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: adminEmail,
      replyTo: email, // Set reply-to to sender's email so admin can reply directly
      subject: emailSubject,
      html: htmlContent,
    });

    if (error) {
      // Handle domain verification errors gracefully
      if (error.statusCode === 403 && error.message?.includes('domain is not verified')) {
        Logger.warn('Resend: Domain not verified. Email service unavailable.');
        return {
          success: false,
          message: 'Email service not configured (domain not verified)'
        };
      }
      // For other errors, log but don't throw
      Logger.error('Resend Error', { errName: error.name });
      return {
        success: false,
        message: error.message || 'Failed to send inquiry email via Resend',
        error: error
      };
    }

    return {
      success: true,
      messageId: data.id,
    };

  } catch (error) {
    // Only log unexpected errors, don't throw
    Logger.error('Error sending inquiry email', { errName: error.name });
    return {
      success: false,
      message: error.message || 'Unknown error sending inquiry email'
    };
  }
};

/**
 * Send inquiry reply email to user
 * @param {string} name - User name
 * @param {string} email - User email
 * @param {string} originalSubject - Original inquiry subject
 * @param {string} originalMessage - Original inquiry message
 * @param {string} replyMessage - Admin's reply message
 * @returns {Promise<Object>} Email send result
 */
const sendInquiryReplyEmail = async (name, email, originalSubject, originalMessage, replyMessage) => {
  try {
    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.trim() === '') {
      Logger.warn('RESEND_API_KEY not configured. Skipping inquiry reply email.');
      return {
        success: false,
        message: 'Email service not configured'
      };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const senderEmail = process.env.EMAIL_FROM || 'no-reply@gaminghuballday.buzz';
    const senderName = process.env.EMAIL_SENDER_NAME || 'BooyahX';

    // Generate email template
    const htmlContent = generateInquiryReplyEmailTemplate({
      name,
      originalSubject,
      originalMessage,
      replyMessage
    });

    const emailSubject = getInquiryReplyEmailSubject(originalSubject);

    const { data, error } = await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: email,
      subject: emailSubject,
      html: htmlContent,
    });

    if (error) {
      // Handle domain verification errors gracefully
      if (error.statusCode === 403 && error.message?.includes('domain is not verified')) {
        Logger.warn('Resend: Domain not verified. Email service unavailable.');
        return {
          success: false,
          message: 'Email service not configured (domain not verified)'
        };
      }
      // For other errors, log but don't throw
      Logger.error('Resend Error', { errName: error.name });
      return {
        success: false,
        message: error.message || 'Failed to send inquiry reply email via Resend',
        error: error
      };
    }

    return {
      success: true,
      messageId: data.id,
    };

  } catch (error) {
    // Only log unexpected errors, don't throw
    Logger.error('Error sending inquiry reply email', { errName: error.name });
    return {
      success: false,
      message: error.message || 'Unknown error sending inquiry reply email'
    };
  }
};

module.exports = {
  sendInquiryEmail,
  sendInquiryReplyEmail
};
