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
  const pass = (config.pass || '').trim();

  // 1. Brevo HTTPS REST API Key (xkeysib-...)
  if (pass.startsWith('xkeysib-')) {
    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': pass, 'accept': 'application/json' }
      });
      if (res.ok) {
        return { success: true, message: 'Brevo API Key verified successfully via HTTPS (Port 443)!' };
      }
      const data = await res.json().catch(() => ({}));
      const msg = data.message || `Brevo API returned status ${res.status}`;
      const isIpErr = msg.includes('unrecognised IP') || msg.includes('authorised_ips');

      if (isIpErr) {
        const serverIp = await getServerPublicIp();
        return {
          success: false,
          ipError: true,
          serverIp,
          message: `${msg} | Add Railway dynamic IP ${serverIp} (or CIDR 152.55.0.0/16) at https://app.brevo.com/security/authorised_ips`
        };
      }

      return { success: false, authError: true, message: msg };
    } catch (err) {
      return { success: false, message: 'Brevo API Connection Error: ' + err.message };
    }
  }

  // 2. Resend HTTPS REST API Key (re_...)
  if (pass.startsWith('re_')) {
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { 'Authorization': `Bearer ${pass}` }
      });
      if (res.status === 200 || res.status === 403) {
        return { success: true, message: 'Resend API Key verified successfully via HTTPS (Port 443)!' };
      }
      if (res.status === 401) {
        return { success: false, authError: true, message: 'Invalid Resend API Key (401 Unauthorized).' };
      }
      return { success: true, message: 'Resend API Key verified successfully via HTTPS (Port 443)!' };
    } catch (err) {
      return { success: false, message: 'Resend API Connection Error: ' + err.message };
    }
  }

  // 3. Nodemailer SMTP Fallback
  let portsToTry = [parseInt(config.port, 10) || 587];
  if (config.provider === 'brevo') {
    portsToTry = [587, 2525, 465]; // Lead with Port 587 STARTTLS as specified in Brevo settings
  } else if (config.provider === 'resend' || config.provider === 'gmail') {
    portsToTry = [465]; // Resend and Gmail use Port 465 SSL
  }

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
      const isAuthError = err.code === 'EAUTH' || err.responseCode === 535 || (errMsg.includes('535') && !errMsg.includes('525'));
      if (isAuthError) {
        break;
      }
    }
  }

  const errMsg = lastError?.message || '';
  const isIpError = lastError?.responseCode === 525 || errMsg.includes('525') || errMsg.includes('Unauthorized IP address');
  const isAuthError = lastError?.code === 'EAUTH' || lastError?.responseCode === 535 || errMsg.includes('535') || errMsg.includes('Authentication failed');

  if (isIpError) {
    const serverIp = await getServerPublicIp();
    return {
      success: false,
      ipError: true,
      serverIp,
      message: `Unauthorized IP Address (525 5.7.1): Brevo SMTP is restricting cloud host IP (${serverIp}). Tip: Generate a Brevo API Key (xkeysib-...) under Brevo -> SMTP & API -> API Keys to connect instantly over HTTPS!`
    };
  }

  if (isAuthError) {
    let hintMessage = `Invalid Login (535 Authentication Failed): The SMTP server rejected your credentials.`;
    if (config.provider === 'brevo') {
      hintMessage += ` Please check your Brevo SMTP Login email and paste a valid non-revoked Brevo SMTP Key (xsmtpsib-...) or API Key (xkeysib-...).`;
    } else if (config.provider === 'gmail') {
      hintMessage += ` For Gmail, you must use a 16-character App Password (not your regular account password).`;
    } else if (config.provider === 'resend') {
      hintMessage += ` For Resend, set username to "resend" and use your API key (re_...) as the password.`;
    }
    return { success: false, message: hintMessage, authError: true };
  }

  if (errMsg.includes('timed out')) {
    return {
      success: false,
      message: `Connection Timed Out: Railway's cloud network blocks raw SMTP ports (587, 2525, 465). To send emails reliably on Railway, use a Brevo API Key (xkeysib-...) or Resend API Key (re_...) which connects instantly over Port 443 HTTPS!`
    };
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
      let info;
      const pass = (smtpConfig.pass || '').trim();

      if (pass.startsWith('xkeysib-')) {
        info = await sendViaBrevoApi(pass, {
          fromName,
          fromEmail: fromEmail || smtpConfig.user,
          to: targetEmail,
          subject: customSubject,
          html: customHtml,
          text: customText
        });
      } else if (pass.startsWith('re_')) {
        info = await sendViaResendApi(pass, {
          fromName,
          fromEmail: fromEmail || smtpConfig.user,
          to: targetEmail,
          subject: customSubject,
          html: customHtml,
          text: customText
        });
      } else {
        info = await transporter.sendMail(mailOptions);
      }

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

async function sendViaBrevoApi(apiKey, mailOptions) {
  const payload = {
    sender: { name: mailOptions.fromName || 'MailerPro', email: mailOptions.fromEmail },
    to: [{ email: mailOptions.to }],
    subject: mailOptions.subject,
    htmlContent: mailOptions.html,
    textContent: mailOptions.text
  };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    return { messageId: data.messageId || 'brevo-api-sent' };
  }
  throw new Error(data.message || `Brevo API Error (${res.status})`);
}

async function sendViaResendApi(apiKey, mailOptions) {
  const payload = {
    from: mailOptions.fromName ? `${mailOptions.fromName} <${mailOptions.fromEmail}>` : mailOptions.fromEmail,
    to: [mailOptions.to],
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    return { messageId: data.id || 'resend-api-sent' };
  }
  throw new Error(data.message || `Resend API Error (${res.status})`);
}

module.exports = {
  testSmtpConnection,
  sendBulkEmails,
  replacePlaceholders
};
