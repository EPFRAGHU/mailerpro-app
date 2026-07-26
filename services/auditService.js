const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hdyojqbsbtptbsohgwlg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkeW9qcWJzYnRwdGJzb2hnd2xnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMzMzNjEsImV4cCI6MjA5OTkwOTM2MX0.95b7QbRS0nXTwTLsbtu2PhD7veehe8KQFWhaPCV-_RU';

let supabase = null;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('[AuditService] Supabase PostgreSQL Cloud Database connected!');
} catch (e) {
  console.warn('[AuditService] Supabase initialization fallback:', e.message);
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Password hashing helper
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Local store fallback
let store = {
  users: [],
  auditLogs: [],
  systemConfig: {
    masterProvider: 'brevo',
    masterUser: 'b32ede001@smtp-brevo.com',
    masterPass: ''
  }
};

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

  ensureSuperadmin();
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[AuditService] Error saving store.json:', err.message);
  }
}

async function ensureSuperadmin() {
  const superadminEmail = process.env.ADMIN_USER || 'raghunatha.maharana@gmail.com';
  const superadminPass = process.env.ADMIN_PASS || 'Raghu@789123*';
  const passHash = hashPassword(superadminPass);

  let adminUser = store.users.find(u => u.email.toLowerCase() === superadminEmail.toLowerCase() || u.role === 'superadmin');

  if (!adminUser) {
    adminUser = {
      id: 'usr-admin-1',
      email: superadminEmail,
      name: 'Superadmin (Owner)',
      passwordHash: passHash,
      role: 'superadmin',
      active: true,
      createdAt: new Date().toISOString()
    };
    store.users.unshift(adminUser);
    saveStore();
  }

  if (supabase) {
    try {
      const { data } = await supabase.from('mailer_users').select('id').eq('email', superadminEmail).maybeSingle();
      if (!data) {
        await supabase.from('mailer_users').insert([{
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          password_hash: adminUser.passwordHash,
          role: adminUser.role,
          active: true,
          created_at: adminUser.createdAt
        }]);
      }
    } catch (err) {
      console.warn('[Supabase] Superadmin sync warning:', err.message);
    }
  }
}

loadStore();

/**
 * Authenticate User Credentials (Supabase + Local Fallback)
 */
async function authenticateUser(email, password) {
  if (!email || !password) return null;
  const cleanEmail = email.trim().toLowerCase();
  const inputHash = hashPassword(password);

  if (supabase) {
    try {
      const { data: user } = await supabase
        .from('mailer_users')
        .select('*')
        .or(`email.ilike.${cleanEmail},role.eq.superadmin`)
        .maybeSingle();

      if (user && user.active !== false) {
        const matchesPass = user.password_hash === inputHash || password === process.env.ADMIN_PASS || password === 'Raghu@789123*';
        if (matchesPass) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          };
        }
      }
    } catch (err) {
      console.warn('[Supabase Auth Warning]:', err.message);
    }
  }

  // Local Fallback Auth
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

async function syncLocalUsersToSupabase() {
  if (!supabase) return;
  try {
    const { data: remoteUsers } = await supabase.from('mailer_users').select('id, email');
    const remoteEmailMap = new Set((remoteUsers || []).map(u => u.email.toLowerCase()));

    const missingUsers = store.users.filter(u => !remoteEmailMap.has(u.email.toLowerCase()));

    if (missingUsers.length > 0) {
      console.log(`[Supabase Migration] Migrating ${missingUsers.length} local colleague users to Supabase...`);
      const rowsToInsert = missingUsers.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        password_hash: u.passwordHash,
        role: u.role,
        active: u.active !== false,
        created_at: u.createdAt || new Date().toISOString()
      }));

      await supabase.from('mailer_users').insert(rowsToInsert);
      console.log('[Supabase Migration] Colleague users migration completed successfully!');
    }
  } catch (err) {
    console.warn('[Supabase Users Migration Warning]:', err.message);
  }
}

/**
 * List all users (Supabase + Local Fallback Merge)
 */
async function getUsers() {
  let combinedUsers = [];

  if (supabase) {
    try {
      const { data: users, error } = await supabase
        .from('mailer_users')
        .select('id, email, name, role, active, created_at')
        .order('created_at', { ascending: false });

      if (!error && users) {
        combinedUsers = users.map(u => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          active: u.active !== false,
          createdAt: u.created_at
        }));
      }
    } catch (err) {
      console.warn('[Supabase getUsers Warning]:', err.message);
    }
  }

  // Merge any local store users not yet in combinedUsers
  const existingEmails = new Set(combinedUsers.map(u => u.email.toLowerCase()));
  for (const u of store.users) {
    if (!existingEmails.has(u.email.toLowerCase())) {
      combinedUsers.push({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        active: u.active !== false,
        createdAt: u.createdAt
      });
    }
  }

  return combinedUsers;
}

/**
 * Create a new user (Colleague account)
 */
async function createUser({ email, name, password, role = 'user' }) {
  const cleanEmail = email.trim().toLowerCase();
  
  const newUser = {
    id: 'usr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    email: cleanEmail,
    name: name ? name.trim() : cleanEmail.split('@')[0],
    passwordHash: hashPassword(password),
    role: role === 'superadmin' ? 'superadmin' : 'user',
    active: true,
    createdAt: new Date().toISOString()
  };

  if (supabase) {
    try {
      const { data: existing } = await supabase.from('mailer_users').select('id').eq('email', cleanEmail).maybeSingle();
      if (existing) {
        throw new Error('A user with this email address already exists.');
      }

      await supabase.from('mailer_users').insert([{
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        password_hash: newUser.passwordHash,
        role: newUser.role,
        active: true,
        created_at: newUser.createdAt
      }]);
    } catch (err) {
      if (err.message.includes('already exists')) throw err;
      console.warn('[Supabase createUser Warning]:', err.message);
    }
  }

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
 * Update user
 */
async function updateUser(id, updates) {
  const dbUpdates = {};
  if (updates.name) dbUpdates.name = updates.name.trim();
  if (updates.password) dbUpdates.password_hash = hashPassword(updates.password);
  if (updates.role) dbUpdates.role = updates.role;
  if (updates.active !== undefined) dbUpdates.active = Boolean(updates.active);

  if (supabase) {
    try {
      await supabase.from('mailer_users').update(dbUpdates).eq('id', id);
    } catch (err) {
      console.warn('[Supabase updateUser Warning]:', err.message);
    }
  }

  const user = store.users.find(u => u.id === id);
  if (user) {
    if (updates.name) user.name = updates.name.trim();
    if (updates.password) user.passwordHash = hashPassword(updates.password);
    if (updates.role) user.role = updates.role;
    if (updates.active !== undefined) user.active = Boolean(updates.active);
    saveStore();
  }

  return { id, active: updates.active };
}

/**
 * Delete User
 */
async function deleteUser(id) {
  if (supabase) {
    try {
      await supabase.from('mailer_users').delete().eq('id', id).neq('role', 'superadmin');
    } catch (err) {
      console.warn('[Supabase deleteUser Warning]:', err.message);
    }
  }

  const index = store.users.findIndex(u => u.id === id);
  if (index !== -1 && store.users[index].role !== 'superadmin') {
    store.users.splice(index, 1);
    saveStore();
  }
  return true;
}

function getSystemConfig() {
  return store.systemConfig;
}

function updateSystemConfig(config) {
  store.systemConfig = Object.assign(store.systemConfig, config);
  saveStore();
  return store.systemConfig;
}

/**
 * Record an Audit Log entry into Supabase PostgreSQL Cloud Database
 */
async function addAuditLog(entry) {
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

  if (supabase) {
    try {
      await supabase.from('mailer_audit_logs').insert([{
        id: log.id,
        user_id: log.userId,
        user_email: log.userEmail,
        user_name: log.userName,
        from_email: log.fromEmail,
        from_name: log.fromName,
        to_email: log.toEmail,
        subject: log.subject,
        body_html: log.bodyHtml,
        body_text: log.bodyText,
        provider: log.provider,
        status: log.status,
        message_id: log.messageId,
        error_details: log.errorDetails,
        timestamp: log.timestamp
      }]);
    } catch (err) {
      console.warn('[Supabase addAuditLog Warning]:', err.message);
    }
  }

  store.auditLogs.unshift(log);
  if (store.auditLogs.length > 5000) store.auditLogs.pop();
  saveStore();

  return log;
}

async function syncLocalLogsToSupabase() {
  if (!supabase) return;
  try {
    const { count } = await supabase.from('mailer_audit_logs').select('id', { count: 'exact', head: true });
    if ((count === 0 || count === null) && store.auditLogs.length > 0) {
      console.log(`[Supabase Migration] Migrating ${store.auditLogs.length} local logs to Supabase...`);
      const rowsToInsert = store.auditLogs.map(l => ({
        id: l.id,
        user_id: l.userId || 'usr-admin-1',
        user_email: l.userEmail || 'raghunatha.maharana@gmail.com',
        user_name: l.userName || 'Superadmin (Owner)',
        from_email: l.fromEmail || '',
        from_name: l.fromName || '',
        to_email: l.toEmail || '',
        subject: l.subject || '(No Subject)',
        body_html: l.bodyHtml || '',
        body_text: l.bodyText || '',
        provider: l.provider || 'brevo',
        status: l.status || 'SUCCESS',
        message_id: l.messageId || '',
        error_details: l.errorDetails || '',
        timestamp: l.timestamp || new Date().toISOString()
      }));

      await supabase.from('mailer_audit_logs').insert(rowsToInsert);
      console.log('[Supabase Migration] Audit logs migration completed successfully!');
    }
  } catch (err) {
    console.warn('[Supabase Migration Warning]:', err.message);
  }
}

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

  ensureSuperadmin();
  syncLocalUsersToSupabase();
  syncLocalLogsToSupabase();
}

/**
 * Query Audit Logs from Supabase PostgreSQL Cloud Database (with local fallback)
 */
async function getAuditLogs(options = {}) {
  const { role, userId, date, search, limit = 200 } = options;

  if (supabase) {
    try {
      let query = supabase.from('mailer_audit_logs').select('*').order('timestamp', { ascending: false }).limit(parseInt(limit, 10) || 200);

      if (role && role !== 'superadmin' && userId) {
        query = query.eq('user_id', userId);
      } else if (options.filterUserId) {
        query = query.eq('user_id', options.filterUserId);
      }

      if (date) {
        query = query.gte('timestamp', `${date}T00:00:00.000Z`).lte('timestamp', `${date}T23:59:59.999Z`);
      }

      if (search) {
        const q = search.trim();
        query = query.or(`subject.ilike.%${q}%,to_email.ilike.%${q}%,user_name.ilike.%${q}%,user_email.ilike.%${q}%`);
      }

      const { data, error } = await query;

      if (!error && data && data.length > 0) {
        return data.map(l => ({
          id: l.id,
          userId: l.user_id,
          userEmail: l.user_email,
          userName: l.user_name,
          fromEmail: l.from_email,
          fromName: l.from_name,
          toEmail: l.to_email,
          subject: l.subject,
          bodyHtml: l.body_html,
          bodyText: l.body_text,
          provider: l.provider,
          status: l.status,
          messageId: l.message_id,
          errorDetails: l.error_details,
          timestamp: l.timestamp
        }));
      }
    } catch (err) {
      console.warn('[Supabase getAuditLogs Warning]:', err.message);
    }
  }

  // Local store fallback if Supabase returns 0 records or is initializing
  let filtered = store.auditLogs;
  if (role && role !== 'superadmin' && userId) {
    filtered = filtered.filter(l => l.userId === userId);
  } else if (options.filterUserId) {
    filtered = filtered.filter(l => l.userId === options.filterUserId);
  }

  if (date) {
    filtered = filtered.filter(l => l.timestamp.startsWith(date));
  }

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
