const nodemailer = require('nodemailer');
const fs = require('fs');

/**
 * Creates a Nodemailer Transporter based on provided configuration.
 */
function createTransporter(config) {
  const { provider, host, port, secure, user, pass } = config;

  let transportOptions = {};

  if (provider === 'gmail') {
    transportOptions = {
      service: 'gmail',
      auth: {
        user: user,
        pass: pass
      }
    };
  } else if (provider === 'brevo') {
    transportOptions = {
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user, pass }
    };
  } else if (provider === 'resend') {
    transportOptions = {
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: pass
      }
    };
  } else if (provider === 'mailtrap') {
    transportOptions = {
      host: 'sandbox.smtp.mailtrap.io',
      port: 2525,
      auth: { user, pass }
    };
  } else {
    // Custom SMTP
    transportOptions = {
      host: host,
      port: parseInt(port, 10) || 587,
      secure: Boolean(secure),
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false
      }
    };
  }

  // 15-second timeouts for cloud server TLS handshakes
  transportOptions.connectionTimeout = 15000;
  transportOptions.greetingTimeout = 15000;
  transportOptions.socketTimeout = 15000;

  return nodemailer.createTransport(transportOptions);
}

/**
 * Replaces handlebars-style placeholders like {{name}}, {{email}}, {{company}} in text.
 */
function replacePlaceholders(templateStr, data = {}) {
  if (!templateStr) return '';
  return templateStr.replace(/\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}/g, (match, key) => {
    const val = data[key] !== undefined ? data[key] : (data[key.toLowerCase()] !== undefined ? data[key.toLowerCase()] : match);
    return val;
  });
}

/**
 * Verifies SMTP credentials with 15-second timeout for cloud servers.
 */
async function testSmtpConnection(config) {
  try {
    const transporter = createTransporter(config);
    const verifyPromise = transporter.verify();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timed out after 15 seconds. Check Brevo key or network.')), 15000)
    );
    await Promise.race([verifyPromise, timeoutPromise]);
    return { success: true, message: 'SMTP Connection verified successfully!' };
  } catch (error) {
    return { success: false, message: error.message || 'Failed to connect to SMTP server.' };
  }
}

/**
 * Sends bulk custom emails to a list of recipients with throttling.
 */
async function sendBulkEmails(smtpConfig, emailPayload, onProgress = () => {}) {
  const { fromName, fromEmail, replyToEmail, subject, bodyHtml, bodyText, recipients, attachments = [], delaySeconds = 1 } = emailPayload;

  const transporter = createTransporter(smtpConfig);
  const results = {
    total: recipients.length,
    sent: 0,
    failed: 0,
    details: []
  };

  const senderString = fromName ? `"${fromName}" <${fromEmail || smtpConfig.user}>` : (fromEmail || smtpConfig.user);
  const replyToString = replyToEmail ? (fromName ? `"${fromName}" <${replyToEmail}>` : replyToEmail) : senderString;

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const targetEmail = typeof recipient === 'string' ? recipient.trim() : recipient.email;
    const recipientData = typeof recipient === 'object' ? recipient : { email: targetEmail };

    const customSubject = replacePlaceholders(subject, recipientData);
    const customHtml = replacePlaceholders(bodyHtml, recipientData);
    const customText = replacePlaceholders(bodyText, recipientData);

    const mailOptions = {
      from: senderString,
      to: targetEmail,
      replyTo: replyToString,
      subject: customSubject,
      html: customHtml,
      text: customText || undefined,
      attachments: attachments.map(att => ({
        filename: att.originalname || att.filename,
        path: att.path
      }))
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      results.sent++;
      const logEntry = {
        index: i + 1,
        email: targetEmail,
        status: 'SUCCESS',
        messageId: info.messageId,
        timestamp: new Date().toISOString()
      };
      results.details.push(logEntry);
      onProgress(logEntry, results);
    } catch (err) {
      results.failed++;
      const logEntry = {
        index: i + 1,
        email: targetEmail,
        status: 'FAILED',
        error: err.message,
        timestamp: new Date().toISOString()
      };
      results.details.push(logEntry);
      onProgress(logEntry, results);
    }

    // Delay between emails if not the last one
    if (i < recipients.length - 1 && delaySeconds > 0) {
      await new Promise(res => setTimeout(res, delaySeconds * 1000));
    }
  }

  return results;
}

module.exports = {
  testSmtpConnection,
  sendBulkEmails,
  replacePlaceholders
};
