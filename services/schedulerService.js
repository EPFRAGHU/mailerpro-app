const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { sendBulkEmails } = require('./mailerService');

const SCHEDULES_FILE = path.join(__dirname, '../data/schedules.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(SCHEDULES_FILE))) {
  fs.mkdirSync(path.dirname(SCHEDULES_FILE), { recursive: true });
}

let activeJobs = new Map(); // id -> cron.ScheduledTask

function loadSchedulesFromFile() {
  if (fs.existsSync(SCHEDULES_FILE)) {
    try {
      const raw = fs.readFileSync(SCHEDULES_FILE, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveSchedulesToFile(schedules) {
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf8');
}

function initScheduler(logCallback = () => {}) {
  const savedSchedules = loadSchedulesFromFile();
  savedSchedules.forEach(schedule => {
    if (schedule.enabled) {
      registerCronJob(schedule, logCallback);
    }
  });
}

function registerCronJob(schedule, logCallback = () => {}) {
  const { id, cronExpression, name, smtpConfig, emailPayload } = schedule;

  // Stop if existing
  if (activeJobs.has(id)) {
    activeJobs.get(id).stop();
    activeJobs.delete(id);
  }

  // Validate cron expression
  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  const task = cron.schedule(cronExpression, async () => {
    console.log(`[Scheduler] Executing scheduled daily campaign: ${name} (${id})`);
    logCallback({ type: 'SCHEDULE_START', scheduleId: id, name, timestamp: new Date().toISOString() });

    try {
      const results = await sendBulkEmails(smtpConfig, emailPayload, (logEntry) => {
        logCallback({ type: 'SCHEDULE_PROGRESS', scheduleId: id, name, logEntry });
      });

      // Update schedule stats
      const schedules = loadSchedulesFromFile();
      const target = schedules.find(s => s.id === id);
      if (target) {
        target.lastRun = new Date().toISOString();
        target.lastRunStatus = `Success: Sent ${results.sent}/${results.total}`;
        saveSchedulesToFile(schedules);
      }

      logCallback({ type: 'SCHEDULE_COMPLETE', scheduleId: id, name, results, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error(`[Scheduler] Error running schedule ${id}:`, error);

      const schedules = loadSchedulesFromFile();
      const target = schedules.find(s => s.id === id);
      if (target) {
        target.lastRun = new Date().toISOString();
        target.lastRunStatus = `Failed: ${error.message}`;
        saveSchedulesToFile(schedules);
      }

      logCallback({ type: 'SCHEDULE_ERROR', scheduleId: id, name, error: error.message, timestamp: new Date().toISOString() });
    }
  });

  activeJobs.set(id, task);
}

function addSchedule(scheduleData, logCallback = () => {}) {
  const schedules = loadSchedulesFromFile();
  const newSchedule = {
    id: scheduleData.id || 'sch_' + Date.now(),
    name: scheduleData.name || 'Daily Campaign',
    cronExpression: scheduleData.cronExpression || '0 9 * * *', // Default 9:00 AM every day
    dailyTime: scheduleData.dailyTime || '09:00',
    enabled: scheduleData.enabled !== undefined ? scheduleData.enabled : true,
    smtpConfig: scheduleData.smtpConfig,
    emailPayload: scheduleData.emailPayload,
    createdAt: new Date().toISOString(),
    lastRun: null,
    lastRunStatus: null
  };

  schedules.push(newSchedule);
  saveSchedulesToFile(schedules);

  if (newSchedule.enabled) {
    registerCronJob(newSchedule, logCallback);
  }

  return newSchedule;
}

function getSchedules() {
  return loadSchedulesFromFile().map(s => ({
    id: s.id,
    name: s.name,
    cronExpression: s.cronExpression,
    dailyTime: s.dailyTime,
    enabled: s.enabled,
    recipientCount: s.emailPayload?.recipients?.length || 0,
    subject: s.emailPayload?.subject || '',
    lastRun: s.lastRun,
    lastRunStatus: s.lastRunStatus,
    createdAt: s.createdAt
  }));
}

function deleteSchedule(id) {
  if (activeJobs.has(id)) {
    activeJobs.get(id).stop();
    activeJobs.delete(id);
  }

  let schedules = loadSchedulesFromFile();
  schedules = schedules.filter(s => s.id !== id);
  saveSchedulesToFile(schedules);
  return { success: true };
}

function toggleSchedule(id, enabled, logCallback = () => {}) {
  const schedules = loadSchedulesFromFile();
  const target = schedules.find(s => s.id === id);
  if (!target) throw new Error('Schedule not found');

  target.enabled = enabled;
  saveSchedulesToFile(schedules);

  if (enabled) {
    registerCronJob(target, logCallback);
  } else if (activeJobs.has(id)) {
    activeJobs.get(id).stop();
    activeJobs.delete(id);
  }

  return target;
}

// Convert "09:30" (24h format) to cron expression "30 9 * * *"
function timeToCron(timeStr) {
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  return `${min} ${hour} * * *`;
}

module.exports = {
  initScheduler,
  addSchedule,
  getSchedules,
  deleteSchedule,
  toggleSchedule,
  timeToCron
};
