/**
 * Email Templates
 * HTML email templates for various purposes
 */

const APP_NAME = 'EsportsHistories';
const BRAND_TAGLINE = 'Tournaments, profiles, and competitive play in one place.';

/**
 * Generate OTP email HTML template
 * @param {Object} params - Template parameters
 * @param {string} params.otpCode - OTP code to display
 * @param {string} params.name - Recipient name
 * @param {string} params.purpose - Purpose: 'registration' or 'password_reset'
 * @returns {string} HTML email content
 */
const generateOTPEmailTemplate = ({ otpCode, name = 'User', purpose = 'registration' }) => {
  const isPasswordReset = purpose === 'password_reset';
  const bannerTitle = isPasswordReset ? 'Password reset' : 'Verify your email';
  const greeting = isPasswordReset ? 'Hello,' : `Hello ${name},`;
  const mainMessage = isPasswordReset
    ? `We received a request to reset the password for your ${APP_NAME} account. Enter the code below to continue. If you did not request this, you can ignore this email—your password will stay the same.`
    : `Thanks for joining ${APP_NAME}. Enter this one-time code in the app to confirm your email and finish setting up your account.`;
  const actionText = isPasswordReset ? 'Your password reset code' : 'Your verification code';
  const expirationText = isPasswordReset
    ? 'Use it promptly to complete your password reset.'
    : 'Use it promptly to finish your registration.';
  const warnBg = isPasswordReset ? '#faf0f0' : '#faf6ed';
  const warnBorder = isPasswordReset ? '#b45309' : '#9a7b0a';
  const warnText = isPasswordReset ? '#78350f' : '#713f12';
  const otpExpireMinutes = process.env.OTP_EXPIRE_MINUTES || 5;
  const currentYear = new Date().getFullYear();

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#e8e4dc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#e8e4dc;padding:48px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background-color:#fdfcfa;border:1px solid #d4cec3;">
              <tr>
                <td style="background-color:#12100e;padding:32px 28px;text-align:center;border-bottom:3px solid #c9a227;">
                  <p style="margin:0 0 10px 0;color:#c9a227;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;font-weight:600;">${APP_NAME}</p>
                  <h1 style="margin:0;color:#faf8f5;font-size:22px;font-weight:600;font-family:Georgia,'Times New Roman',Times,serif;letter-spacing:-0.02em;line-height:1.3;">${bannerTitle}</h1>
                  <p style="margin:14px 0 0 0;color:rgba(250,248,245,0.78);font-size:13px;line-height:1.5;">${BRAND_TAGLINE}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 32px 8px 32px;">
                  <p style="margin:0 0 8px 0;color:#6b6560;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">${isPasswordReset ? 'Security' : 'Sign-up'}</p>
                  <h2 style="margin:0 0 16px 0;color:#1a1816;font-size:20px;font-weight:600;font-family:Georgia,'Times New Roman',Times,serif;">${greeting}</h2>
                  <p style="margin:0 0 28px 0;color:#494540;font-size:15px;line-height:1.65;">${mainMessage}</p>
                  <p style="margin:0 0 12px 0;color:#6b6560;font-size:13px;font-weight:500;text-align:center;">${actionText}</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td align="center" style="padding:26px 16px;background-color:#f5f2ec;border:1px solid #d4cec3;">
                        <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:700;letter-spacing:0.22em;color:#1a1816;">${otpCode}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 32px 8px 32px;">
                  <div style="background-color:${warnBg};border-left:3px solid ${warnBorder};padding:14px 18px;">
                    <p style="margin:0;color:${warnText};font-size:13px;line-height:1.55;">
                      <strong>Important:</strong> This code expires in <strong>${otpExpireMinutes} minutes</strong>. ${expirationText}
                    </p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 32px 32px 32px;">
                  <p style="margin:0;color:#7a726a;font-size:12px;line-height:1.6;text-align:center;">
                    Do not share this code with anyone. ${APP_NAME} will never ask you for this code by phone or social media.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background-color:#f5f2ec;padding:24px 28px;text-align:center;border-top:1px solid #d4cec3;">
                  <p style="margin:0 0 6px 0;color:#1a1816;font-size:14px;font-family:Georgia,'Times New Roman',Times,serif;font-weight:600;">${APP_NAME}</p>
                  <p style="margin:0;color:#7a726a;font-size:11px;">© ${currentYear} ${APP_NAME}. All rights reserved.</p>
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
    ? `${APP_NAME} — Password reset code`
    : `${APP_NAME} — Your verification code`;
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
    <body style="margin:0;padding:0;background-color:#e8e4dc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#e8e4dc;padding:48px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background-color:#fdfcfa;border:1px solid #d4cec3;">
              <tr>
                <td style="background-color:#12100e;padding:32px 28px;text-align:center;border-bottom:3px solid #c9a227;">
                  <p style="margin:0 0 10px 0;color:#c9a227;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;font-weight:600;">${APP_NAME}</p>
                  <h1 style="margin:0;color:#faf8f5;font-size:22px;font-weight:600;font-family:Georgia,'Times New Roman',Times,serif;">Welcome</h1>
                  <p style="margin:14px 0 0 0;color:rgba(250,248,245,0.78);font-size:13px;line-height:1.5;">${BRAND_TAGLINE}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 32px 8px 32px;">
                  <h2 style="margin:0 0 16px 0;color:#1a1816;font-size:20px;font-weight:600;font-family:Georgia,'Times New Roman',Times,serif;">Hello ${name},</h2>
                  <p style="margin:0 0 16px 0;color:#494540;font-size:15px;line-height:1.65;">
                    Your ${APP_NAME} account was created with Google sign-in. You can keep using Google, or sign in with email and the temporary password below if you prefer.
                  </p>
                  <p style="margin:0 0 24px 0;color:#494540;font-size:15px;line-height:1.65;">
                    Please store this password somewhere safe. We recommend changing it after your first login.
                  </p>
                  <p style="margin:0 0 12px 0;color:#6b6560;font-size:13px;font-weight:500;text-align:center;">Your temporary password</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td align="center" style="padding:22px 16px;background-color:#f5f2ec;border:1px solid #d4cec3;">
                        <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:700;letter-spacing:0.06em;color:#1a1816;word-break:break-all;">${password}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 32px 8px 32px;">
                  <div style="background-color:#faf6ed;border-left:3px solid #9a7b0a;padding:14px 18px;">
                    <p style="margin:0;color:#713f12;font-size:13px;line-height:1.55;">
                      <strong>Important:</strong> Do not share this password. ${APP_NAME} will never ask for it by message or phone.
                    </p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 32px 32px 32px;">
                  <p style="margin:0;color:#7a726a;font-size:12px;line-height:1.6;text-align:center;">
                    For your security, treat this like any other account credential.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background-color:#f5f2ec;padding:24px 28px;text-align:center;border-top:1px solid #d4cec3;">
                  <p style="margin:0 0 6px 0;color:#1a1816;font-size:14px;font-family:Georgia,'Times New Roman',Times,serif;font-weight:600;">${APP_NAME}</p>
                  <p style="margin:0;color:#7a726a;font-size:11px;">© ${currentYear} ${APP_NAME}. All rights reserved.</p>
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
  return `${APP_NAME} — Welcome, your account is ready`;
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
    <body style="margin:0;padding:0;background-color:#e8e4dc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#e8e4dc;padding:48px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background-color:#fdfcfa;border:1px solid #d4cec3;">
              <tr>
                <td style="background-color:#12100e;padding:32px 28px;text-align:center;border-bottom:3px solid #c9a227;">
                  <p style="margin:0 0 10px 0;color:#c9a227;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;font-weight:600;">${APP_NAME}</p>
                  <h1 style="margin:0;color:#faf8f5;font-size:22px;font-weight:600;font-family:Georgia,'Times New Roman',Times,serif;">New inquiry</h1>
                  <p style="margin:14px 0 0 0;color:rgba(250,248,245,0.78);font-size:13px;line-height:1.5;">${BRAND_TAGLINE}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 32px 12px 32px;">
                  <h2 style="margin:0 0 12px 0;color:#1a1816;font-size:18px;font-weight:600;font-family:Georgia,'Times New Roman',Times,serif;">Contact form</h2>
                  <p style="margin:0;color:#6b6560;font-size:12px;"><strong style="color:#1a1816;">Date:</strong> ${formattedDate}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 20px 32px;">
                  <div style="background-color:#f5f2ec;border-left:3px solid #c9a227;padding:18px 16px;">
                    <p style="margin:0 0 10px 0;color:#1a1816;font-size:14px;font-weight:600;">From</p>
                    <p style="margin:0 0 6px 0;color:#494540;font-size:14px;"><strong>Name:</strong> ${name}</p>
                    <p style="margin:0;color:#494540;font-size:14px;">
                      <strong>Email:</strong> <a href="mailto:${email}" style="color:#6b4f00;text-decoration:underline;">${email}</a>
                    </p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 16px 32px;">
                  <p style="margin:0 0 6px 0;color:#1a1816;font-size:14px;font-weight:600;">Subject</p>
                  <p style="margin:0;color:#494540;font-size:14px;padding:12px 14px;background-color:#f5f2ec;border:1px solid #d4cec3;">${subject}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 24px 32px;">
                  <p style="margin:0 0 6px 0;color:#1a1816;font-size:14px;font-weight:600;">Message</p>
                  <div style="background-color:#f5f2ec;padding:16px;border:1px solid #d4cec3;">
                    <p style="margin:0;color:#494540;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 32px 32px;">
                  <div style="background-color:#faf6ed;border-left:3px solid #9a7b0a;padding:14px 18px;">
                    <p style="margin:0;color:#713f12;font-size:13px;line-height:1.55;">
                      <strong>Action:</strong> Reply to <a href="mailto:${email}" style="color:#6b4f00;text-decoration:underline;">${email}</a>
                    </p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="background-color:#f5f2ec;padding:24px 28px;text-align:center;border-top:1px solid #d4cec3;">
                  <p style="margin:0 0 6px 0;color:#1a1816;font-size:14px;font-family:Georgia,'Times New Roman',Times,serif;font-weight:600;">${APP_NAME}</p>
                  <p style="margin:0;color:#7a726a;font-size:11px;">© ${currentYear} ${APP_NAME}. All rights reserved.</p>
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
  return `${APP_NAME} — New inquiry: ${subject}`;
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

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#e8e4dc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#e8e4dc;padding:48px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background-color:#fdfcfa;border:1px solid #d4cec3;">
              <tr>
                <td style="background-color:#12100e;padding:32px 28px;text-align:center;border-bottom:3px solid #c9a227;">
                  <p style="margin:0 0 10px 0;color:#c9a227;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;font-weight:600;">${APP_NAME}</p>
                  <h1 style="margin:0;color:#faf8f5;font-size:22px;font-weight:600;font-family:Georgia,'Times New Roman',Times,serif;">Reply to your message</h1>
                  <p style="margin:14px 0 0 0;color:rgba(250,248,245,0.78);font-size:13px;line-height:1.5;">${BRAND_TAGLINE}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 32px 8px 32px;">
                  <h2 style="margin:0 0 16px 0;color:#1a1816;font-size:20px;font-weight:600;font-family:Georgia,'Times New Roman',Times,serif;">Hello ${name},</h2>
                  <p style="margin:0 0 24px 0;color:#494540;font-size:15px;line-height:1.65;">
                    Thank you for contacting ${APP_NAME}. Here is our reply to your inquiry.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 20px 32px;">
                  <div style="background-color:#f0eeea;border-left:3px solid #9a948a;padding:18px 16px;">
                    <p style="margin:0 0 10px 0;color:#1a1816;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;">Your message</p>
                    <p style="margin:0 0 8px 0;color:#494540;font-size:14px;"><strong>Subject:</strong> ${originalSubject}</p>
                    <p style="margin:0;color:#6b6560;font-size:14px;line-height:1.6;white-space:pre-wrap;">${originalMessage}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 24px 32px;">
                  <div style="background-color:#f5f2ec;border-left:3px solid #c9a227;padding:18px 16px;">
                    <p style="margin:0 0 10px 0;color:#1a1816;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;">Our reply</p>
                    <p style="margin:0;color:#1a1816;font-size:15px;line-height:1.65;white-space:pre-wrap;">${replyMessage}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 32px 32px;">
                  <div style="background-color:#faf6ed;border-left:3px solid #9a7b0a;padding:14px 18px;">
                    <p style="margin:0;color:#713f12;font-size:13px;line-height:1.55;">
                      If you need anything else, reply to this thread or use the contact form on ${APP_NAME} again.
                    </p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="background-color:#f5f2ec;padding:24px 28px;text-align:center;border-top:1px solid #d4cec3;">
                  <p style="margin:0 0 6px 0;color:#1a1816;font-size:14px;font-family:Georgia,'Times New Roman',Times,serif;font-weight:600;">${APP_NAME}</p>
                  <p style="margin:0;color:#7a726a;font-size:11px;">© ${currentYear} ${APP_NAME}. All rights reserved.</p>
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
  return `Re: ${originalSubject} — ${APP_NAME}`;
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
    <body style="margin:0;padding:0;background-color:#e8e4dc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#e8e4dc;padding:48px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background-color:#fdfcfa;border:1px solid #d4cec3;">
              <tr>
                <td style="background-color:#12100e;padding:32px 28px;text-align:center;border-bottom:3px solid #c9a227;">
                  <p style="margin:0 0 10px 0;color:#c9a227;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;font-weight:600;">${APP_NAME}</p>
                  <h1 style="margin:0;color:#faf8f5;font-size:22px;font-weight:600;font-family:Georgia,'Times New Roman',Times,serif;">Tournament is live</h1>
                  <p style="margin:14px 0 0 0;color:rgba(250,248,245,0.78);font-size:13px;line-height:1.5;">${lobbyLabel || 'Room credentials for your lobby'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 32px 8px 32px;">
                  <h2 style="margin:0 0 16px 0;color:#1a1816;font-size:20px;font-weight:600;font-family:Georgia,'Times New Roman',Times,serif;">Hello ${name},</h2>
                  <p style="margin:0 0 24px 0;color:#494540;font-size:15px;line-height:1.65;">
                    Your ${mode} ${subMode} tournament${lobbyLabel ? ` (${lobbyName})` : ''} at <strong>${startTime}</strong>${formattedDate ? ` on ${formattedDate}` : ''} is now live. Use the credentials below to join.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 24px 32px;">
                  <div style="background-color:#f5f2ec;border:1px solid #d4cec3;padding:22px 18px;">
                    <p style="margin:0 0 8px 0;color:#1a1816;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Room ID</p>
                    <p style="margin:0 0 20px 0;color:#1a1816;font-size:20px;font-weight:700;font-family:'Courier New',Courier,monospace;letter-spacing:0.08em;">${roomId || '—'}</p>
                    <p style="margin:0 0 8px 0;color:#1a1816;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Password</p>
                    <p style="margin:0;color:#1a1816;font-size:20px;font-weight:700;font-family:'Courier New',Courier,monospace;letter-spacing:0.08em;">${password || '—'}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 32px 32px;">
                  <div style="background-color:#faf6ed;border-left:3px solid #9a7b0a;padding:14px 18px;">
                    <p style="margin:0;color:#713f12;font-size:13px;line-height:1.55;">
                      <strong>Join now:</strong> The match has started—open the game and enter the room with the details above.
                    </p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="background-color:#f5f2ec;padding:24px 28px;text-align:center;border-top:1px solid #d4cec3;">
                  <p style="margin:0 0 6px 0;color:#1a1816;font-size:14px;font-family:Georgia,'Times New Roman',Times,serif;font-weight:600;">${APP_NAME}</p>
                  <p style="margin:0;color:#7a726a;font-size:11px;">© ${currentYear} ${APP_NAME}. All rights reserved.</p>
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
  return `${APP_NAME} — Live: room ID & password (${startTime})`;
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

