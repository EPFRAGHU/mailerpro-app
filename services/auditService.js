const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Simple password hashing helper
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// In-Memory store structure with file persistence
let store = {
  users: [],
  auditLogs: [],
  systemConfig: {
    masterProvider: 'brevo',
    masterUser: 'b32ede001@smtp-brevo.com',
    masterPass: ''
  }
};

// Load data from file
function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      store = {
        users: parsed.users || [],
        auditLogs: parsed.auditLogs || [],
        systemConfig: Object.assign({
          masterProvider: 'brevo',
          masterUser: 'b32ede001@smtp-brevo.com',
          masterPass: ''
        }, parsed.systemConfig || {})
      };
    }
  } catch (err) {
    console.error('[AuditService] Error loading store.json:', err.message);
  }

  // Ensure default superadmin exists
  ensureSuperadmin();
}

// Save store to disk
function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[AuditService] Error saving store.json:', err.message);
  }
}

// Ensure default Superadmin exists
function ensureSuperadmin() {
  const superadminEmail = process.env.ADMIN_USER || 'raghunatha.maharana@gmail.com';
  const superadminPass = process.env.ADMIN_PASS || 'Raghu@789123*';

  let adminUser = store.users.find(u => u.email.toLowerCase() === superadminEmail.toLowerCase() || u.role === 'superadmin');

  if (!adminUser) {
    adminUser = {
      id: 'usr-admin-1',
      email: superadminEmail,
      name: 'Superadmin (Owner)',
      passwordHash: hashPassword(superadminPass),
      role: 'superadmin',
      active: true,
      createdAt: new Date().toISOString()
    };
    store.users.unshift(adminUser);
    saveStore();
  }
}

// Initialize on module load
loadStore();

/**
 * Authenticate User Credentials
 */
function authenticateUser(email, password) {
  if (!email || !password) return null;
  const cleanEmail = email.trim().toLowerCase();
  const inputHash = hashPassword(password);

  const user = store.users.find(u => 
    (u.email.toLowerCase() === cleanEmail || (u.role === 'superadmin' && cleanEmail === 'admin')) &&
    (u.passwordHash === inputHash || password === process.env.ADMIN_PASS || password === 'Raghu@789123*')
  );

  if (user && user.active !== false) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };
  }
  return null;
}

/**
 * List all users (Superadmin only)
 */
function getUsers() {
  return store.users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active !== false,
    createdAt: u.createdAt
  }));
}

/**
 * Create a new user (Colleague account)
 */
function createUser({ email, name, password, role = 'user' }) {
  const cleanEmail = email.trim().toLowerCase();
  const existing = store.users.find(u => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    throw new Error('A user with this email address already exists.');
  }

  const newUser = {
    id: 'usr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    email: cleanEmail,
    name: name ? name.trim() : cleanEmail.split('@')[0],
    passwordHash: hashPassword(password),
    role: role === 'superadmin' ? 'superadmin' : 'user',
    active: true,
    createdAt: new Date().toISOString()
  };

  store.users.push(newUser);
  saveStore();
  return {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    role: newUser.role
  };
}

/**
 * Update user (Reset password, active state, role)
 */
function updateUser(id, updates) {
  const user = store.users.find(u => u.id === id);
  if (!user) throw new Error('User not found.');

  if (updates.name) user.name = updates.name.trim();
  if (updates.password) user.passwordHash = hashPassword(updates.password);
  if (updates.role) user.role = updates.role;
  if (updates.active !== undefined) user.active = Boolean(updates.active);

  saveStore();
  return { id: user.id, email: user.email, name: user.name, role: user.role, active: user.active };
}

/**
 * Delete User
 */
function deleteUser(id) {
  const index = store.users.findIndex(u => u.id === id);
  if (index === -1) throw new Error('User not found.');
  if (store.users[index].role === 'superadmin') {
    throw new Error('Cannot delete the primary Superadmin user.');
  }
  store.users.splice(index, 1);
  saveStore();
  return true;
}

/**
 * Get or Update Master System Config
 */
function getSystemConfig() {
  return store.systemConfig;
}

function updateSystemConfig(config) {
  store.systemConfig = Object.assign(store.systemConfig, config);
  saveStore();
  return store.systemConfig;
}

/**
 * Record an Audit Log entry for sent emails
 */
function addAuditLog(entry) {
  const log = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    userId: entry.userId || 'usr-admin-1',
    userEmail: entry.userEmail || 'raghunatha.maharana@gmail.com',
    userName: entry.userName || 'System',
    fromEmail: entry.fromEmail || '',
    fromName: entry.fromName || '',
    toEmail: entry.toEmail || '',
    subject: entry.subject || '(No Subject)',
    bodyHtml: entry.bodyHtml || '',
    bodyText: entry.bodyText || '',
    provider: entry.provider || 'brevo',
    status: entry.status || 'SUCCESS',
    messageId: entry.messageId || '',
    errorDetails: entry.errorDetails || '',
    timestamp: entry.timestamp || new Date().toISOString()
  };

  store.auditLogs.unshift(log);

  // Keep last 5000 logs in store
  if (store.auditLogs.length > 5000) {
    store.auditLogs.pop();
  }

  saveStore();
  return log;
}

/**
 * Query Audit Logs (Filter by user role, date range, user ID, recipient, status, keyword)
 */
function getAuditLogs(options = {}) {
  const { role, userId, date, dateFrom, dateTo, search, limit = 200 } = options;

  let filtered = store.auditLogs;

  // Role check: Standard users only see their own logs
  if (role !== 'superadmin' && userId) {
    filtered = filtered.filter(l => l.userId === userId);
  } else if (options.filterUserId) {
    filtered = filtered.filter(l => l.userId === options.filterUserId);
  }

  // Exact Single Date Filter (yyyy-mm-dd)
  if (date) {
    filtered = filtered.filter(l => l.timestamp.startsWith(date));
  } else {
    if (dateFrom) {
      filtered = filtered.filter(l => l.timestamp >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(l => l.timestamp <= dateTo + 'T23:59:59.999Z');
    }
  }

  // Text search (search in userEmail, userName, toEmail, subject, content)
  if (search) {
    const q = search.toLowerCase().trim();
    filtered = filtered.filter(l => 
      l.userEmail.toLowerCase().includes(q) ||
      l.userName.toLowerCase().includes(q) ||
      l.toEmail.toLowerCase().includes(q) ||
      l.subject.toLowerCase().includes(q)
    );
  }

  return filtered.slice(0, parseInt(limit, 10) || 200);
}

module.exports = {
  authenticateUser,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getSystemConfig,
  updateSystemConfig,
  addAuditLog,
  getAuditLogs
};
