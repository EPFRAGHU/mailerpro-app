const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { testSmtpConnection, sendBulkEmails } = require('./services/mailerService');
const { initScheduler, addSchedule, getSchedules, deleteSchedule, toggleSchedule, timeToCron } = require('./services/schedulerService');

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

// --- AUTH API ROUTES ---
const ADMIN_USER = process.env.ADMIN_USER || 'raghunatha.maharana@gmail.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if ((username === ADMIN_USER || username === 'admin') && (password === ADMIN_PASS || password === 'admin')) {
    const token = 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2);
    addLog({
      type: 'AUTH_LOGIN',
      user: username,
      timestamp: new Date().toISOString()
    });
    return res.json({
      success: true,
      token,
      user: {
        email: username,
        name: username.includes('@') ? username.split('@')[0] : 'Administrator'
      }
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Invalid Username or Password. Please try again.'
  });
});

app.post('/api/auth/verify', (req, res) => {
  const { token } = req.body;
  if (token && token.startsWith('session-')) {
    return res.json({ success: true, valid: true });
  }
  return res.json({ success: false, valid: false });
});

// --- API ROUTES ---

// 1. Test SMTP Connection
app.post('/api/smtp/test', async (req, res) => {
  const smtpConfig = req.body;
  const result = await testSmtpConnection(smtpConfig);
  return res.json(result);
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

    addLog({
      type: 'CAMPAIGN_START',
      total: emailPayload.recipients?.length || 0,
      timestamp: new Date().toISOString()
    });

    const results = await sendBulkEmails(smtpConfig, emailPayload, (logEntry, currentResults) => {
      addLog({
        type: 'SEND_PROGRESS',
        logEntry,
        sent: currentResults.sent,
        failed: currentResults.failed,
        total: currentResults.total
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
