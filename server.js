const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { testSmtpConnection, sendBulkEmails, autoAuthorizeBrevoIp } = require('./services/mailerService');
const { initScheduler, addSchedule, getSchedules, deleteSchedule, toggleSchedule, timeToCron } = require('./services/schedulerService');
const { 
  authenticateUser, 
  getUsers, 
  createUser, 
  updateUser, 
  deleteUser, 
  getSystemConfig, 
  updateSystemConfig, 
  addAuditLog, 
  getAuditLogs 
} = require('./services/auditService');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup directories
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Storage for uploaded attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// In-memory activity log store for live feeds
const activityLogs = [];
function addLog(log) {
  activityLogs.unshift(log);
  if (activityLogs.length > 200) activityLogs.pop();
}

// Initialize Scheduler
initScheduler((event) => {
  addLog(event);
});

// --- AUTH & RBAC API ROUTES ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await authenticateUser(username, password);

  if (user) {
    const token = 'session-' + user.id + '-' + Date.now();
    addLog({
      type: 'AUTH_LOGIN',
      user: user.email,
      role: user.role,
      timestamp: new Date().toISOString()
    });
    return res.json({
      success: true,
      token,
      user
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Invalid Email/Username or Password. Please try again.'
  });
});

app.post('/api/auth/verify', (req, res) => {
  const { token } = req.body;
  if (token && token.startsWith('session-')) {
    return res.json({ success: true, valid: true });
  }
  return res.json({ success: false, valid: false });
});

// --- USER MANAGEMENT API ROUTES (SUPERADMIN) ---
app.get('/api/users', async (req, res) => {
  try {
    const users = await getUsers();
    return res.json({ success: true, users });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { email, name, password, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    const newUser = await createUser({ email, name, password, role });
    return res.json({ success: true, user: newUser, message: 'Colleague user account created successfully.' });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await updateUser(id, req.body);
    return res.json({ success: true, user: updated, message: 'User updated successfully.' });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteUser(id);
    return res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// --- AUDIT LOG EXPLORER API ROUTES ---
app.get('/api/audit/logs', async (req, res) => {
  try {
    const { role, userId, date, dateFrom, dateTo, search, filterUserId } = req.query;
    const logs = await getAuditLogs({ role, userId, date, dateFrom, dateTo, search, filterUserId });
    return res.json({ success: true, logs });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// --- API ROUTES ---

// 1. Test SMTP Connection
app.post('/api/smtp/test', async (req, res) => {
  const smtpConfig = req.body;
  console.log(`[SMTP Test] Provider: ${smtpConfig.provider}, User: "${smtpConfig.user}", Pass length: ${smtpConfig.pass?.length}, Prefix: "${smtpConfig.pass?.substring(0, 12)}..."`);
  const result = await testSmtpConnection(smtpConfig);
  return res.json(result);
});

// 1b. 1-Click Brevo IP Self-Authorization Endpoint
app.post('/api/brevo/authorize-ip', async (req, res) => {
  try {
    const { apiKey, ip } = req.body;
    if (!apiKey || !ip) {
      return res.status(400).json({ success: false, message: 'Brevo API Key and IP address are required.' });
    }

    const success = await autoAuthorizeBrevoIp(apiKey, ip);
    if (success) {
      return res.json({ success: true, message: `IP Address ${ip} successfully authorized in your Brevo account!` });
    } else {
      return res.status(400).json({
        success: false,
        message: `Unable to auto-authorize IP via Brevo API. Please make sure to add 152.55.0.0/16 or your exact IP at https://app.brevo.com/security/authorised_ips.`
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Direct Bulk Mail Dispatch (with file attachments support)
app.post('/api/mail/send', upload.array('attachments'), async (req, res) => {
  try {
    const smtpConfig = JSON.parse(req.body.smtpConfig || '{}');
    const emailPayload = JSON.parse(req.body.emailPayload || '{}');

    // Attach uploaded files if any
    const attachments = (req.files || []).map(file => ({
      originalname: file.originalname,
      filename: file.filename,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size
    }));

    emailPayload.attachments = attachments;

    const senderUser = req.body.senderUser ? JSON.parse(req.body.senderUser) : null;

    addLog({
      type: 'CAMPAIGN_START',
      user: senderUser?.email || 'System',
      total: emailPayload.recipients?.length || 0,
      timestamp: new Date().toISOString()
    });

    const results = await sendBulkEmails(smtpConfig, emailPayload, async (logEntry, currentResults) => {
      addLog({
        type: 'SEND_PROGRESS',
        logEntry,
        sent: currentResults.sent,
        failed: currentResults.failed,
        total: currentResults.total
      });

      // Record in persistent Audit Store & Supabase Cloud PostgreSQL
      await addAuditLog({
        userId: senderUser?.id || 'usr-admin-1',
        userEmail: senderUser?.email || 'raghunatha.maharana@gmail.com',
        userName: senderUser?.name || 'Superadmin (Owner)',
        fromEmail: emailPayload.fromEmail || smtpConfig.user,
        fromName: emailPayload.fromName || '',
        toEmail: logEntry.email,
        subject: emailPayload.subject,
        bodyHtml: emailPayload.bodyHtml,
        bodyText: emailPayload.bodyText,
        provider: smtpConfig.provider,
        status: logEntry.status,
        messageId: logEntry.messageId || '',
        errorDetails: logEntry.error || '',
        timestamp: logEntry.timestamp || new Date().toISOString()
      });
    });

    addLog({
      type: 'CAMPAIGN_COMPLETE',
      results,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, results });
  } catch (error) {
    console.error('Error in /api/mail/send:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Create Daily Schedule
app.post('/api/schedule', upload.array('attachments'), async (req, res) => {
  try {
    const { name, dailyTime, smtpConfig: smtpRaw, emailPayload: payloadRaw } = req.body;
    
    const smtpConfig = typeof smtpRaw === 'string' ? JSON.parse(smtpRaw) : smtpRaw;
    const emailPayload = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw;

    const attachments = (req.files || []).map(file => ({
      originalname: file.originalname,
      filename: file.filename,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size
    }));

    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const cronExpr = timeToCron(dailyTime || '09:00');

    const schedule = addSchedule({
      name: name || `Daily Mailer (${dailyTime || '09:00'})`,
      dailyTime: dailyTime || '09:00',
      cronExpression: cronExpr,
      smtpConfig,
      emailPayload,
      enabled: true
    }, (event) => addLog(event));

    addLog({
      type: 'SCHEDULE_CREATED',
      scheduleId: schedule.id,
      name: schedule.name,
      dailyTime: schedule.dailyTime,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, schedule });
  } catch (error) {
    console.error('Error creating schedule:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Get Schedules List
app.get('/api/schedule', (req, res) => {
  return res.json({ success: true, schedules: getSchedules() });
});

// 5. Delete Schedule
app.delete('/api/schedule/:id', (req, res) => {
  const result = deleteSchedule(req.params.id);
  addLog({
    type: 'SCHEDULE_DELETED',
    scheduleId: req.params.id,
    timestamp: new Date().toISOString()
  });
  return res.json(result);
});

// 6. Toggle Schedule State
app.patch('/api/schedule/:id/toggle', (req, res) => {
  try {
    const { enabled } = req.body;
    const schedule = toggleSchedule(req.params.id, enabled, (event) => addLog(event));
    return res.json({ success: true, schedule });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 7. Get Activity Logs
app.get('/api/logs', (req, res) => {
  return res.json({ success: true, logs: activityLogs });
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` 🚀 Bulk Custom Mailer App running on port ${PORT}`);
  console.log(` 🌐 Open Web UI: http://localhost:${PORT}`);
  console.log(`=================================================`);
});
