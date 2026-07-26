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
      auth: { user, pass }
    };
  } else if (provider === 'brevo') {
    const selectedPort = parseInt(port, 10) || 587;
    transportOptions = {
      host: 'smtp-relay.brevo.com',
      port: selectedPort,
      secure: selectedPort === 465,
      auth: { user, pass }
    };
  } else if (provider === 'resend') {
    transportOptions = {
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass }
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
      tls: { rejectUnauthorized: false }
    };
  }

  // 8-second timeout per port attempt
  transportOptions.connectionTimeout = 8000;
  transportOptions.greetingTimeout = 8000;
  transportOptions.socketTimeout = 8000;

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

let cachedServerIp = null;
async function getServerPublicIp() {
  if (cachedServerIp) return cachedServerIp;
  return new Promise((resolve) => {
    require('https').get('https://api.ipify.org', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        cachedServerIp = data.trim();
        resolve(cachedServerIp);
      });
    }).on('error', () => resolve('your server IP'));
  });
}

/**
 * Verifies SMTP credentials with multi-port auto-failover (587, 2525, 465).
 */
async function testSmtpConnection(config) {
  const portsToTry = config.provider === 'brevo' ? [587, 2525, 465] : [config.port || 587];
  let lastError = null;

  for (const p of portsToTry) {
    try {
      const testConfig = { ...config, port: p };
      const transporter = createTransporter(testConfig);
      const verifyPromise = transporter.verify();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Port ${p} timed out`)), 7000)
      );
      await Promise.race([verifyPromise, timeoutPromise]);
      config.port = p;
      return { success: true, message: `SMTP Connection verified successfully (via Port ${p})!` };
    } catch (err) {
      lastError = err;
      const errMsg = err.message || '';
      const isIpError = err.responseCode === 525 || errMsg.includes('525') || errMsg.includes('Unauthorized IP address');
      const isAuthError = err.code === 'EAUTH' || err.responseCode === 535 || errMsg.includes('535') || errMsg.includes('Authentication failed') || (errMsg.includes('Invalid login') && !isIpError);
      
      if (isIpError) {
        const serverIp = await getServerPublicIp();
        return {
          success: false,
          ipError: true,
          serverIp,
          message: `Unauthorized IP Address (525 5.7.1): Brevo requires authorizing your application server IP (${serverIp}). Please go to Brevo -> SMTP & API -> Authorized IP addresses and click "Authorize IP address" to add ${serverIp}.`
        };
      }

      if (isAuthError) {
        let hintMessage = `Invalid Login (535 Authentication Failed): The SMTP server rejected your credentials.`;
        if (config.provider === 'brevo') {
          hintMessage += ` Please check your Brevo SMTP Login email and paste a valid non-revoked Brevo SMTP Key (starts with xsmtpsib-...).`;
        } else if (config.provider === 'gmail') {
          hintMessage += ` For Gmail, you must use a 16-character App Password (not your regular account password).`;
        } else if (config.provider === 'resend') {
          hintMessage += ` For Resend, set username to "resend" and use your API key (re_...) as the password.`;
        }
        return { success: false, message: hintMessage, authError: true };
      }
    }
  }

  return { success: false, message: lastError?.message || 'Failed to connect to SMTP server.' };
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
