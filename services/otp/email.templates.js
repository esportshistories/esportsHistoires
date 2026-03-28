/**
 * Email Templates
 * HTML email templates for various purposes
 */

/**
 * Generate OTP email HTML template
 * @param {Object} params - Template parameters
 * @param {string} params.otpCode - OTP code to display
 * @param {string} params.name - Recipient name
 * @param {string} params.purpose - Purpose: 'registration' or 'password_reset'
 * @returns {string} HTML email content
 */
const generateOTPEmailTemplate = ({ otpCode, name = 'User', purpose = 'registration' }) => {
  // Determine email content based on purpose
  const isPasswordReset = purpose === 'password_reset';
  const headerTitle = isPasswordReset ? 'Password Reset Request' : 'Welcome to BooyahX!';
  const mainTitle = isPasswordReset ? 'Reset Your Password' : `Hello ${name},`;
  const mainMessage = isPasswordReset 
    ? `We received a request to reset your password for your BooyahX account. Use the verification code below to reset your password. If you didn't request this, please ignore this email and your password will remain unchanged.`
    : `Welcome to BooyahX! We're excited to have you join our gaming community. To complete your registration and secure your account, please verify your email address using the code below.`;
  const actionText = isPasswordReset 
    ? 'Use this code to reset your password:'
    : 'Your OTP verification code is:';
  const expirationText = isPasswordReset
    ? 'Please use it promptly to reset your password.'
    : 'Please use it promptly to complete your verification.';
  
  const warningBgColor = isPasswordReset ? '#ffe6e6' : '#fff5e6';
  const warningBorderColor = isPasswordReset ? '#ef4444' : '#ffa726';
  const warningTextColor = isPasswordReset ? '#dc2626' : '#e65100';
  const otpExpireMinutes = process.env.OTP_EXPIRE_MINUTES || 5;
  const currentYear = new Date().getFullYear();

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <!-- Header with gradient -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">${headerTitle}</h1>
                  <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">Powered by GamingHub Allday</p>
                </td>
              </tr>
              
              <!-- Welcome Message -->
              <tr>
                <td style="padding: 40px 30px 20px 30px;">
                  <h2 style="margin: 0 0 15px 0; color: #1a202c; font-size: 24px; font-weight: 600;">${mainTitle}</h2>
                  <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                    ${mainMessage}
                  </p>
                </td>
              </tr>
              
              <!-- OTP Code Box -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <p style="margin: 0 0 15px 0; color: #4a5568; font-size: 14px; font-weight: 500; text-align: center;">${actionText}</p>
                  <div style="background: linear-gradient(135deg, #f6f8fb 0%, #e9ecef 100%); border: 2px solid #e2e8f0; border-radius: 10px; padding: 30px 20px; text-align: center; margin: 0 auto;">
                    <h1 style="margin: 0; letter-spacing: 8px; color: #667eea; font-size: 36px; font-weight: 700; font-family: 'Courier New', monospace;">${otpCode}</h1>
                  </div>
                </td>
              </tr>
              
              <!-- Expiration Notice -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <div style="background-color: ${warningBgColor}; border-left: 4px solid ${warningBorderColor}; padding: 15px 20px; border-radius: 6px;">
                    <p style="margin: 0; color: ${warningTextColor}; font-size: 14px; line-height: 1.5;">
                      <strong>⏰ Important:</strong> This code expires in <strong>${otpExpireMinutes} minutes</strong>. 
                      ${expirationText}
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Security Notice -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <p style="margin: 0; color: #718096; font-size: 13px; line-height: 1.6; text-align: center;">
                    For your security, never share this code with anyone. Our team will never ask for your OTP.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px 0; color: #718096; font-size: 14px;">
                    <strong style="color: #2d3748;">BooyahX</strong> - Your Ultimate Gaming Experience
                  </p>
                  <p style="margin: 0 0 10px 0; color: #a0aec0; font-size: 12px;">
                    Powered by <strong style="color: #667eea;">GamingHub Allday</strong>
                  </p>
                  <p style="margin: 15px 0 0 0; color: #cbd5e0; font-size: 11px;">
                    © ${currentYear} BooyahX. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Get email subject based on purpose
 * @param {string} purpose - Purpose: 'registration' or 'password_reset'
 * @returns {string} Email subject
 */
const getOTPEmailSubject = (purpose = 'registration') => {
  return purpose === 'password_reset' 
    ? 'Password Reset OTP - BooyahX'
    : 'Your OTP Verification Code - BooyahX';
};

/**
 * Generate welcome email HTML template for Google login users
 * @param {Object} params - Template parameters
 * @param {string} params.name - Recipient name
 * @param {string} params.password - Default password to display
 * @returns {string} HTML email content
 */
const generateWelcomeEmailTemplate = ({ name = 'User', password }) => {
  const currentYear = new Date().getFullYear();

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <!-- Header with gradient -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Welcome to BooyahX!</h1>
                  <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">Powered by GamingHub Allday</p>
                </td>
              </tr>
              
              <!-- Welcome Message -->
              <tr>
                <td style="padding: 40px 30px 20px 30px;">
                  <h2 style="margin: 0 0 15px 0; color: #1a202c; font-size: 24px; font-weight: 600;">Hello ${name},</h2>
                  <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                    Welcome to BooyahX! We're thrilled to have you join our gaming community. Your account has been successfully created using Google login.
                  </p>
                  <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                    For your convenience, we've generated a default password for your account. You can use this password to login directly without Google authentication if you prefer.
                  </p>
                </td>
              </tr>
              
              <!-- Password Box -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <p style="margin: 0 0 15px 0; color: #4a5568; font-size: 14px; font-weight: 500; text-align: center;">Your default password is:</p>
                  <div style="background: linear-gradient(135deg, #f6f8fb 0%, #e9ecef 100%); border: 2px solid #e2e8f0; border-radius: 10px; padding: 30px 20px; text-align: center; margin: 0 auto;">
                    <h1 style="margin: 0; letter-spacing: 2px; color: #667eea; font-size: 28px; font-weight: 700; font-family: 'Courier New', monospace; word-break: break-all;">${password}</h1>
                  </div>
                </td>
              </tr>
              
              <!-- Important Notice -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <div style="background-color: #fff5e6; border-left: 4px solid #ffa726; padding: 15px 20px; border-radius: 6px;">
                    <p style="margin: 0; color: #e65100; font-size: 14px; line-height: 1.5;">
                      <strong>🔐 Important:</strong> Please save this password securely. You can use it to login directly to your account without Google authentication. For security reasons, we recommend changing this password after your first login.
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Security Notice -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <p style="margin: 0; color: #718096; font-size: 13px; line-height: 1.6; text-align: center;">
                    For your security, never share this password with anyone. Our team will never ask for your password.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px 0; color: #718096; font-size: 14px;">
                    <strong style="color: #2d3748;">BooyahX</strong> - Your Ultimate Gaming Experience
                  </p>
                  <p style="margin: 0 0 10px 0; color: #a0aec0; font-size: 12px;">
                    Powered by <strong style="color: #667eea;">GamingHub Allday</strong>
                  </p>
                  <p style="margin: 15px 0 0 0; color: #cbd5e0; font-size: 11px;">
                    © ${currentYear} BooyahX. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Get welcome email subject
 * @returns {string} Email subject
 */
const getWelcomeEmailSubject = () => {
  return 'Welcome to BooyahX - Your Account Details';
};

/**
 * Generate inquiry notification email HTML template for admin
 * @param {Object} params - Template parameters
 * @param {string} params.name - Sender name
 * @param {string} params.email - Sender email
 * @param {string} params.subject - Inquiry subject
 * @param {string} params.message - Inquiry message
 * @returns {string} HTML email content
 */
const generateInquiryEmailTemplate = ({ name, email, subject, message }) => {
  const currentYear = new Date().getFullYear();
  const formattedDate = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <!-- Header with gradient -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">New Inquiry Received</h1>
                  <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">Powered by GamingHub Allday</p>
                </td>
              </tr>
              
              <!-- Inquiry Details -->
              <tr>
                <td style="padding: 40px 30px 20px 30px;">
                  <h2 style="margin: 0 0 20px 0; color: #1a202c; font-size: 24px; font-weight: 600;">Contact Form Inquiry</h2>
                  <p style="margin: 0 0 10px 0; color: #718096; font-size: 13px;">
                    <strong style="color: #2d3748;">Date:</strong> ${formattedDate}
                  </p>
                </td>
              </tr>
              
              <!-- Sender Information -->
              <tr>
                <td style="padding: 0 30px 20px 30px;">
                  <div style="background-color: #f7fafc; border-left: 4px solid #667eea; padding: 20px; border-radius: 6px;">
                    <p style="margin: 0 0 10px 0; color: #2d3748; font-size: 16px; font-weight: 600;">From:</p>
                    <p style="margin: 0 0 8px 0; color: #4a5568; font-size: 15px;">
                      <strong>Name:</strong> ${name}
                    </p>
                    <p style="margin: 0; color: #4a5568; font-size: 15px;">
                      <strong>Email:</strong> <a href="mailto:${email}" style="color: #667eea; text-decoration: none;">${email}</a>
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Subject -->
              <tr>
                <td style="padding: 0 30px 20px 30px;">
                  <p style="margin: 0 0 8px 0; color: #2d3748; font-size: 16px; font-weight: 600;">Subject:</p>
                  <p style="margin: 0; color: #4a5568; font-size: 15px; padding: 12px; background-color: #f7fafc; border-radius: 6px;">
                    ${subject}
                  </p>
                </td>
              </tr>
              
              <!-- Message -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <p style="margin: 0 0 8px 0; color: #2d3748; font-size: 16px; font-weight: 600;">Message:</p>
                  <div style="background-color: #f7fafc; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <p style="margin: 0; color: #4a5568; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                  </div>
                </td>
              </tr>
              
              <!-- Action Notice -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <div style="background-color: #fff5e6; border-left: 4px solid #ffa726; padding: 15px 20px; border-radius: 6px;">
                    <p style="margin: 0; color: #e65100; font-size: 14px; line-height: 1.5;">
                      <strong>📧 Action Required:</strong> Please review this inquiry and respond to the user at <a href="mailto:${email}" style="color: #667eea; text-decoration: none;">${email}</a>
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px 0; color: #718096; font-size: 14px;">
                    <strong style="color: #2d3748;">BooyahX</strong> - Your Ultimate Gaming Experience
                  </p>
                  <p style="margin: 0 0 10px 0; color: #a0aec0; font-size: 12px;">
                    Powered by <strong style="color: #667eea;">GamingHub Allday</strong>
                  </p>
                  <p style="margin: 15px 0 0 0; color: #cbd5e0; font-size: 11px;">
                    © ${currentYear} BooyahX. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Get inquiry email subject
 * @param {string} subject - Inquiry subject
 * @returns {string} Email subject
 */
const getInquiryEmailSubject = (subject) => {
  return `New Inquiry: ${subject} - BooyahX`;
};

/**
 * Generate inquiry reply email HTML template for user
 * @param {Object} params - Template parameters
 * @param {string} params.name - User name
 * @param {string} params.originalSubject - Original inquiry subject
 * @param {string} params.originalMessage - Original inquiry message
 * @param {string} params.replyMessage - Admin's reply message
 * @returns {string} HTML email content
 */
const generateInquiryReplyEmailTemplate = ({ name, originalSubject, originalMessage, replyMessage }) => {
  const currentYear = new Date().getFullYear();
  const formattedDate = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <!-- Header with gradient -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Response to Your Inquiry</h1>
                  <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">Powered by GamingHub Allday</p>
                </td>
              </tr>
              
              <!-- Greeting -->
              <tr>
                <td style="padding: 40px 30px 20px 30px;">
                  <h2 style="margin: 0 0 15px 0; color: #1a202c; font-size: 24px; font-weight: 600;">Hello ${name},</h2>
                  <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                    Thank you for contacting us. We have received your inquiry and are pleased to provide you with the following response.
                  </p>
                </td>
              </tr>
              
              <!-- Original Inquiry Reference -->
              <tr>
                <td style="padding: 0 30px 20px 30px;">
                  <div style="background-color: #f7fafc; border-left: 4px solid #cbd5e0; padding: 20px; border-radius: 6px;">
                    <p style="margin: 0 0 10px 0; color: #2d3748; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Your Original Inquiry</p>
                    <p style="margin: 0 0 8px 0; color: #4a5568; font-size: 15px;">
                      <strong>Subject:</strong> ${originalSubject}
                    </p>
                    <p style="margin: 0; color: #718096; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${originalMessage}</p>
                  </div>
                </td>
              </tr>
              
              <!-- Reply Message -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <div style="background-color: #f0f9ff; border-left: 4px solid #667eea; padding: 20px; border-radius: 6px;">
                    <p style="margin: 0 0 10px 0; color: #2d3748; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Our Response</p>
                    <p style="margin: 0; color: #1a202c; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${replyMessage}</p>
                  </div>
                </td>
              </tr>
              
              <!-- Additional Help -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <div style="background-color: #fff5e6; border-left: 4px solid #ffa726; padding: 15px 20px; border-radius: 6px;">
                    <p style="margin: 0; color: #e65100; font-size: 14px; line-height: 1.5;">
                      <strong>💬 Need Further Assistance?</strong> If you have any additional questions or concerns, please feel free to reach out to us again. We're here to help!
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px 0; color: #718096; font-size: 14px;">
                    <strong style="color: #2d3748;">BooyahX</strong> - Your Ultimate Gaming Experience
                  </p>
                  <p style="margin: 0 0 10px 0; color: #a0aec0; font-size: 12px;">
                    Powered by <strong style="color: #667eea;">GamingHub Allday</strong>
                  </p>
                  <p style="margin: 15px 0 0 0; color: #cbd5e0; font-size: 11px;">
                    © ${currentYear} BooyahX. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Get inquiry reply email subject
 * @param {string} originalSubject - Original inquiry subject
 * @returns {string} Email subject
 */
const getInquiryReplyEmailSubject = (originalSubject) => {
  return `Re: ${originalSubject} - BooyahX`;
};

/**
 * Generate tournament room credentials email (Room ID + Password)
 * Sent when tournament goes live at exact start time
 * @param {Object} params - Template parameters
 * @param {string} params.name - Participant name
 * @param {string} params.startTime - Tournament start time (e.g. "9:00 PM")
 * @param {string} params.roomId - Room ID
 * @param {string} params.password - Room password
 * @param {string} params.mode - Tournament mode (e.g. "BR")
 * @param {string} params.subMode - Sub mode (e.g. "squad")
 * @param {string} params.date - Tournament date
 * @param {string} [params.lobbyName] - Lobby name (e.g. "Lobby 1 75 10:15 PM")
 * @returns {string} HTML email content
 */
const generateRoomCredentialsEmailTemplate = ({ name, startTime, roomId, password, mode, subMode, date, lobbyName }) => {
  const currentYear = new Date().getFullYear();
  const formattedDate = date ? new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const lobbyLabel = lobbyName ? `Lobby: ${lobbyName}` : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Tournament is Live!</h1>
                  <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">${lobbyLabel || 'Room credentials for your lobby'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px 30px 20px 30px;">
                  <h2 style="margin: 0 0 15px 0; color: #1a202c; font-size: 24px; font-weight: 600;">Hello ${name},</h2>
                  <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                    Your ${mode} ${subMode} tournament${lobbyLabel ? ` (${lobbyName})` : ''} at <strong>${startTime}</strong>${formattedDate ? ` on ${formattedDate}` : ''} is now live! Join the room using the credentials below.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <div style="background: linear-gradient(135deg, #f6f8fb 0%, #e9ecef 100%); border: 2px solid #e2e8f0; border-radius: 10px; padding: 25px 20px;">
                    <p style="margin: 0 0 12px 0; color: #2d3748; font-size: 14px; font-weight: 600;">Room ID</p>
                    <p style="margin: 0 0 20px 0; color: #667eea; font-size: 22px; font-weight: 700; font-family: 'Courier New', monospace; letter-spacing: 2px;">${roomId || '—'}</p>
                    <p style="margin: 0 0 12px 0; color: #2d3748; font-size: 14px; font-weight: 600;">Password</p>
                    <p style="margin: 0; color: #667eea; font-size: 22px; font-weight: 700; font-family: 'Courier New', monospace; letter-spacing: 2px;">${password || '—'}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <div style="background-color: #fff5e6; border-left: 4px solid #ffa726; padding: 15px 20px; border-radius: 6px;">
                    <p style="margin: 0; color: #e65100; font-size: 14px; line-height: 1.5;">
                      <strong>⏰ Join now!</strong> The tournament has started. Open the game and join with the credentials above.
                    </p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px 0; color: #718096; font-size: 14px;"><strong style="color: #2d3748;">BooyahX</strong> - Your Ultimate Gaming Experience</p>
                  <p style="margin: 0; color: #cbd5e0; font-size: 11px;">© ${currentYear} BooyahX. All rights reserved.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

const getRoomCredentialsEmailSubject = (startTime) => {
  return `Tournament Live - Room ID & Password (${startTime}) - BooyahX`;
};

module.exports = {
  generateOTPEmailTemplate,
  getOTPEmailSubject,
  generateWelcomeEmailTemplate,
  getWelcomeEmailSubject,
  generateInquiryEmailTemplate,
  getInquiryEmailSubject,
  generateInquiryReplyEmailTemplate,
  getInquiryReplyEmailSubject,
  generateRoomCredentialsEmailTemplate,
  getRoomCredentialsEmailSubject
};

