// Global State
let parsedRecipients = [];
let parsedVariables = ['name', 'company', 'email'];
let uploadedAttachments = [];
let isSmtpVerified = false;

document.addEventListener('DOMContentLoaded', () => {
  // Load saved theme preference
  const savedTheme = localStorage.getItem('mailler_theme') || 'violet';
  setTheme(savedTheme);

  // Check auth session status first
  checkAuthSession().then(authenticated => {
    if (authenticated) {
      initAppComponents();
    }
  });

  // Auto-refresh logs every 10s if on logs tab
  setInterval(() => {
    const logsTab = document.getElementById('logs-pane');
    if (logsTab && logsTab.classList.contains('active')) {
      loadLogs();
    }
  }, 10000);
});

/**
 * Initialize Dashboard Components
 */
function initAppComponents() {
  const providerSelect = document.getElementById('smtpProvider');
  if (providerSelect) {
    providerSelect.value = 'brevo';
    onSmtpProviderChange();
  }

  const defaultBrevoUser = 'b32ede001@smtp-brevo.com';

  const smtpUserInput = document.getElementById('smtpUser');
  if (smtpUserInput) {
    const savedUser = localStorage.getItem('mailler_smtp_user') || defaultBrevoUser;
    smtpUserInput.value = savedUser;
  }

  const smtpPassInput = document.getElementById('smtpPass');
  if (smtpPassInput) {
    const savedPass = localStorage.getItem('mailler_smtp_pass') || '';
    smtpPassInput.value = savedPass;
  }

  const fromEmailInput = document.getElementById('fromEmail');
  if (fromEmailInput && !fromEmailInput.value) {
    fromEmailInput.value = 'raghunatha.maharana@gmail.com';
  }

  const fromNameInput = document.getElementById('fromName');
  if (fromNameInput && !fromNameInput.value) {
    fromNameInput.value = 'District Office Cuttack - EPFO';
  }

  renderVariableChips();
  loadSchedules();
  loadLogs();
  loadCampaignExplorer();

  // Automatically connect & verify SMTP on login
  autoVerifySmtp();
}

/**
 * Save SMTP Credentials & Key to Local Browser Storage
 */
function saveSmtpCredentials() {
  const user = document.getElementById('smtpUser').value.trim();
  const pass = document.getElementById('smtpPass').value.trim();
  const alertBox = document.getElementById('smtpTestAlert');

  if (!pass) {
    if (alertBox) {
      alertBox.className = 'alert alert-warning mt-3';
      alertBox.textContent = 'Please paste your SMTP Password / Key before saving.';
      alertBox.classList.remove('d-none');
    }
    return;
  }

  localStorage.setItem('mailler_smtp_user', user);
  localStorage.setItem('mailler_smtp_pass', pass);

  // Automatically lock input field after saving
  lockPassField();

  if (alertBox) {
    alertBox.className = 'alert alert-success mt-3';
    alertBox.innerHTML = '<i class="fas fa-check-circle me-2"></i>SMTP Credentials & Key saved & locked in your browser!';
    alertBox.classList.remove('d-none');
  }

  autoVerifySmtp();
}

/**
 * Auto-verify SMTP connection without user click
 */
async function autoVerifySmtp() {
  const config = getSmtpConfigFromForm();
  const badge = document.getElementById('smtpStatusBadge');
  
  if (config.user && config.pass) {
    if (badge) {
      badge.className = 'status-badge status-offline';
      const textEl = badge.querySelector('.status-text');
      if (textEl) textEl.textContent = 'Connecting SMTP...';
    }
    
    try {
      const res = await fetch('/api/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      
      if (data.success) {
        updateSmtpStatus(true, 'SMTP Connected');
      } else {
        updateSmtpStatus(false, data.message || 'SMTP Not Connected');
      }
    } catch (err) {
      updateSmtpStatus(false, 'SMTP Offline');
    }
  }
}

/**
 * AUTHENTICATION MODULE
 */
async function checkAuthSession() {
  const token = localStorage.getItem('mailler_token') || sessionStorage.getItem('mailler_token');
  const loginScreen = document.getElementById('loginScreenContainer');
  const mainApp = document.getElementById('mainAppWrapper');

  if (!token) {
    if (loginScreen) loginScreen.classList.remove('d-none');
    if (mainApp) mainApp.classList.add('d-none');
    return false;
  }

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();

    if (data.success && data.valid) {
      if (loginScreen) loginScreen.classList.add('d-none');
      if (mainApp) mainApp.classList.remove('d-none');
      return true;
    } else {
      handleLogout();
      return false;
    }
  } catch (err) {
    // If server check ok
    if (loginScreen) loginScreen.classList.add('d-none');
    if (mainApp) mainApp.classList.remove('d-none');
    return true;
  }
}

async function handleLogin(e) {
  if (e) e.preventDefault();
  const user = document.getElementById('loginUsername').value.trim();
  const pass = document.getElementById('loginPassword').value.trim();
  const alertBox = document.getElementById('loginAlert');
  const btn = document.getElementById('btnLogin');

  if (!user || !pass) {
    alertBox.textContent = 'Please enter both Username and Password.';
    alertBox.classList.remove('d-none');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Authenticating...';
  alertBox.classList.add('d-none');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();

    if (data.success) {
      localStorage.setItem('mailler_token', data.token);
      document.getElementById('loginScreenContainer').classList.add('d-none');
      document.getElementById('mainAppWrapper').classList.remove('d-none');
      
      initAppComponents();
    } else {
      alertBox.textContent = data.message || 'Login failed.';
      alertBox.classList.remove('d-none');
    }
  } catch (err) {
    alertBox.textContent = 'Network or server error: ' + err.message;
    alertBox.classList.remove('d-none');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-shield-alt me-2"></i>Sign In to MaillerPRO';
  }
}

function toggleLoginPass() {
  const passInput = document.getElementById('loginPassword');
  const icon = document.getElementById('loginPassEye');
  if (passInput.type === 'password') {
    passInput.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    passInput.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

function handleLogout() {
  localStorage.removeItem('mailler_token');
  sessionStorage.removeItem('mailler_token');
  const userIn = document.getElementById('loginUsername');
  const passIn = document.getElementById('loginPassword');
  if (userIn) userIn.value = '';
  if (passIn) passIn.value = '';
  document.getElementById('mainAppWrapper').classList.add('d-none');
  document.getElementById('loginScreenContainer').classList.remove('d-none');
}

/**
 * Set Active Theme Palette
 */
function setTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('mailler_theme', themeName);

  const themeLabels = {
    'violet': 'Cyber Violet',
    'emerald': 'Emerald Mint',
    'amber': 'Sunset Amber',
    'light': 'Light Crystal'
  };

  const labelEl = document.getElementById('currentThemeLabel');
  if (labelEl) {
    labelEl.textContent = themeLabels[themeName] || 'Cyber Violet';
  }
}

/**
 * Handle Provider Change
 */
function onSmtpProviderChange() {
  const provider = document.getElementById('smtpProvider').value;
  const customFields = document.getElementById('customSmtpFields');
  const userLabel = document.querySelector('label[for="smtpUser"]') || document.getElementById('smtpUser')?.previousElementSibling;
  const passLabel = document.querySelector('label[for="smtpPass"]') || document.getElementById('smtpPass')?.previousElementSibling;
  const userInput = document.getElementById('smtpUser');
  const passInput = document.getElementById('smtpPass');

  if (provider === 'custom') {
    customFields.classList.remove('d-none');
    if (userLabel) userLabel.textContent = 'SMTP Username';
    if (passLabel) passLabel.textContent = 'SMTP Password';
    userInput.placeholder = 'username';
    passInput.placeholder = 'password';
  } else {
    customFields.classList.add('d-none');

    if (provider === 'gmail') {
      if (userLabel) userLabel.textContent = 'Gmail Address';
      if (passLabel) passLabel.textContent = '16-char App Password';
      userInput.placeholder = 'your.name@gmail.com';
      passInput.placeholder = '16-character App Password';
    } else if (provider === 'brevo') {
      if (userLabel) userLabel.textContent = 'Brevo SMTP Login';
      if (passLabel) passLabel.textContent = 'Brevo SMTP Key (xsmtpsib-...)';
      const savedUser = localStorage.getItem('mailler_smtp_user') || 'b32ede001@smtp-brevo.com';
      const savedPass = localStorage.getItem('mailler_smtp_pass') || '';
      userInput.value = savedUser;
      passInput.value = savedPass;
      userInput.placeholder = 'b32ede001@smtp-brevo.com';
      passInput.placeholder = 'xsmtpsib-xxxxxxxxxxxxxxxxxxxx';
    } else if (provider === 'resend') {
      if (userLabel) userLabel.textContent = 'Resend User (default: resend)';
      if (passLabel) passLabel.textContent = 'Resend API Key (re_...)';
      userInput.placeholder = 'resend';
      passInput.placeholder = 're_123456789...';
    } else if (provider === 'mailtrap') {
      if (userLabel) userLabel.textContent = 'Mailtrap API Username';
      if (passLabel) passLabel.textContent = 'Mailtrap API Password';
      userInput.placeholder = 'mailtrap-username';
      passInput.placeholder = 'mailtrap-password';
    }
  }

  updateSmtpStatus(false, 'Not Tested');
}

/**
 * Toggle Password Visibility
 */
function togglePassVisibility() {
  const passInput = document.getElementById('smtpPass');
  const icon = document.getElementById('passEyeIcon');
  if (passInput.type === 'password') {
    passInput.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    passInput.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

/**
 * Toggle Lock/Unlock for Password Field
 */
function togglePassLock() {
  const passInput = document.getElementById('smtpPass');
  const lockIcon = document.getElementById('passLockIcon');
  const lockBadge = document.getElementById('passLockBadge');
  const lockBtn = document.getElementById('btnTogglePassLock');

  if (!passInput) return;

  if (passInput.hasAttribute('readonly')) {
    passInput.removeAttribute('readonly');
    passInput.focus();
    if (lockIcon) lockIcon.className = 'fas fa-lock-open text-info';
    if (lockBadge) {
      lockBadge.className = 'badge bg-info bg-opacity-10 text-info border border-info-subtle extra-small';
      lockBadge.innerHTML = '<i class="fas fa-lock-open me-1"></i>Unlocked for Editing';
    }
    if (lockBtn) lockBtn.title = 'Click to Lock Key';
  } else {
    lockPassField();
  }
}

/**
 * Lock Password Field
 */
function lockPassField() {
  const passInput = document.getElementById('smtpPass');
  const lockIcon = document.getElementById('passLockIcon');
  const lockBadge = document.getElementById('passLockBadge');
  const lockBtn = document.getElementById('btnTogglePassLock');

  if (passInput) passInput.setAttribute('readonly', 'readonly');
  if (lockIcon) lockIcon.className = 'fas fa-lock text-warning';
  if (lockBadge) {
    lockBadge.className = 'badge bg-warning bg-opacity-10 text-warning border border-warning-subtle extra-small';
    lockBadge.innerHTML = '<i class="fas fa-lock me-1"></i>Locked & Secured';
  }
  if (lockBtn) lockBtn.title = 'Click to Unlock & Edit';
}

/**
 * Get current SMTP Config object from form
 */
function getSmtpConfigFromForm() {
  const provider = document.getElementById('smtpProvider').value;
  return {
    provider,
    host: document.getElementById('smtpHost')?.value || '',
    port: document.getElementById('smtpPort')?.value || 587,
    secure: document.getElementById('smtpSecure')?.checked || false,
    user: document.getElementById('smtpUser').value.trim(),
    pass: document.getElementById('smtpPass').value.trim()
  };
}

/**
 * Update SMTP Status Badge
 */
function updateSmtpStatus(verified, message) {
  isSmtpVerified = verified;
  const badge = document.getElementById('smtpStatusBadge');
  const text = badge.querySelector('.status-text');

  if (verified) {
    badge.className = 'status-badge status-online';
    text.textContent = 'SMTP Connected';
  } else {
    badge.className = 'status-badge status-offline';
    text.textContent = message || 'SMTP Not Tested';
  }
}

/**
 * Test SMTP Credentials API
 */
async function testSmtp() {
  const btn = document.getElementById('btnTestSmtp');
  const alertBox = document.getElementById('smtpTestAlert');
  const config = getSmtpConfigFromForm();

  if (!config.user || !config.pass) {
    alertBox.className = 'alert alert-warning mt-3';
    alertBox.textContent = 'Please enter both Username/Email and Password/Key.';
    alertBox.classList.remove('d-none');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Testing Connection...';
  alertBox.classList.add('d-none');

  try {
    const res = await fetch('/api/smtp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await res.json();

    if (data.success) {
      alertBox.className = 'alert alert-success mt-3';
      alertBox.innerHTML = `<i class="fas fa-check-circle me-2"></i>${data.message}`;
      updateSmtpStatus(true, 'SMTP Ready');
    } else {
      alertBox.className = 'alert alert-danger mt-3';
      const isIpErr = data.ipError || (data.message && (data.message.includes('525') || data.message.includes('Unauthorized IP address')));
      const isAuthErr = data.authError || (data.message && data.message.includes('535'));
      
      if (isIpErr) {
        const ipToAuthorize = data.serverIp || '152.55.0.0/16';
        const brevoIpInput = document.getElementById('brevoIpInput');
        if (brevoIpInput) {
          brevoIpInput.value = ipToAuthorize;
        }

        alertBox.innerHTML = `
          <div class="d-flex flex-column gap-1">
            <div><i class="fas fa-shield-alt me-2"></i><strong>IP Address Restriction Detected (525)</strong></div>
            <div class="small">${data.message}</div>
            <div class="mt-2 pt-2 border-top border-danger-subtle small">
              <strong><i class="fas fa-magic text-warning me-1"></i>1-Click Direct Fix (No Brevo Login Required):</strong>
              <div class="mt-1 extra-small text-light">
                Simply click the <strong><i class="fas fa-user-shield text-warning"></i> Authorize IP</strong> button below in your SMTP Card to automatically register IP <code class="user-select-all">${ipToAuthorize}</code> into Brevo!
              </div>
            </div>
          </div>
        `;
        updateSmtpStatus(false, 'IP Blocked');
      } else if (isAuthErr) {
        let helpText = '';
        if (config.provider === 'brevo') {
          helpText = `
            <div class="mt-2 pt-2 border-top border-danger-subtle small">
              <strong><i class="fas fa-key me-1"></i>How to Fix Brevo SMTP Authentication:</strong>
              <ol class="mb-0 ps-3 mt-1 extra-small">
                <li>Log in to your <strong>Brevo Dashboard</strong>.</li>
                <li>Go to <strong>Transactional &rarr; Settings &rarr; SMTP & API</strong>.</li>
                <li>Copy the exact <strong>SMTP Login</strong> (e.g., <code>b32ede001@smtp-brevo.com</code> or account email).</li>
                <li>Generate or copy a fresh <strong>SMTP Key</strong> (starts with <code>xsmtpsib-...</code>).</li>
                <li>Paste the SMTP key in the password field, click <strong>Save Key</strong>, and re-test!</li>
              </ol>
            </div>`;
        } else if (config.provider === 'gmail') {
          helpText = `
            <div class="mt-2 pt-2 border-top border-danger-subtle small">
              <strong><i class="fas fa-key me-1"></i>How to Fix Gmail Authentication:</strong>
              <ol class="mb-0 ps-3 mt-1 extra-small">
                <li>Enable <strong>2-Step Verification</strong> in Google Account &rarr; Security.</li>
                <li>Search for <strong>App Passwords</strong> and generate a 16-character code.</li>
                <li>Paste the 16-char code as password (without spaces) and click <strong>Save Key</strong>.</li>
              </ol>
            </div>`;
        }

        alertBox.innerHTML = `
          <div class="d-flex flex-column gap-1">
            <div><i class="fas fa-exclamation-triangle me-2"></i><strong>Authentication Failed (535)</strong></div>
            <div class="small">${data.message}</div>
            ${helpText}
          </div>
        `;
        updateSmtpStatus(false, 'Auth Failed');
      } else {
        alertBox.innerHTML = `<i class="fas fa-exclamation-triangle me-2"></i>${data.message}`;
        updateSmtpStatus(false, 'Connection Failed');
      }
      updateSmtpStatus(false, 'Auth Failed');
    }
  } catch (err) {
    alertBox.className = 'alert alert-danger mt-3';
    alertBox.textContent = 'Network or server error: ' + err.message;
    updateSmtpStatus(false, 'Error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plug me-2"></i>Test SMTP Connection';
    alertBox.classList.remove('d-none');
  }
}

/**
 * 1-Click Brevo IP Whitelister from MailerPro UI (No Brevo Login Required)
 */
async function handleQuickAuthorizeIp() {
  const ipInput = document.getElementById('brevoIpInput');
  const alertBox = document.getElementById('quickIpAlert');
  const btn = document.getElementById('btnQuickAuthorizeIp');
  const pass = document.getElementById('smtpPass').value.trim();

  const ip = ipInput ? ipInput.value.trim() : '';

  if (!ip) {
    alertBox.className = 'alert alert-warning p-2 extra-small mt-2';
    alertBox.textContent = 'Please enter an IP address or CIDR range (e.g. 152.55.0.0/16 or 152.55.177.35).';
    alertBox.classList.remove('d-none');
    return;
  }

  if (!pass.startsWith('xkeysib-')) {
    alertBox.className = 'alert alert-warning p-2 extra-small mt-2';
    alertBox.textContent = 'Auto-whitelisting requires a Brevo API key (xkeysib-...). Please switch provider to Brevo and unlock your API key.';
    alertBox.classList.remove('d-none');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Authorizing...';
  alertBox.classList.add('d-none');

  try {
    const res = await fetch('/api/brevo/authorize-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: pass, ip })
    });

    const data = await res.json();
    if (data.success) {
      alertBox.className = 'alert alert-success p-2 extra-small mt-2';
      alertBox.innerHTML = `<i class="fas fa-check-circle me-1"></i>${data.message}`;
      // Re-test SMTP connection automatically after successful authorization
      setTimeout(() => testSmtp(), 1000);
    } else {
      alertBox.className = 'alert alert-danger p-2 extra-small mt-2';
      alertBox.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i>${data.message}`;
    }
    alertBox.classList.remove('d-none');
  } catch (err) {
    alertBox.className = 'alert alert-danger p-2 extra-small mt-2';
    alertBox.textContent = 'Error sending authorization request: ' + err.message;
    alertBox.classList.remove('d-none');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-shield me-1"></i>Authorize IP';
  }
}

/**
 * Handle CSV File Drop / Select
 */
function handleCsvFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    parseCsvContent(content);
  };
  reader.readAsText(file);
}

/**
 * Parse CSV Content string into JSON array of recipient objects
 */
function parseCsvContent(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return;

  // Header detection
  const delimiter = content.includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  let emailIndex = headers.findIndex(h => h === 'email' || h === 'e-mail' || h === 'mail');
  if (emailIndex === -1) emailIndex = 0; // Fallback to first column

  parsedRecipients = [];
  parsedVariables = Array.from(new Set([...headers]));

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(delimiter).map(cell => cell.trim().replace(/^["']|["']$/g, ''));
    if (row.length === 0 || !row[emailIndex]) continue;

    const recipientObj = {};
    headers.forEach((h, idx) => {
      recipientObj[h] = row[idx] || '';
    });
    recipientObj.email = row[emailIndex];

    parsedRecipients.push(recipientObj);
  }

  updateRecipientUI();
}

/**
 * Parse Manual Input Text (lines of email, name, company)
 */
function parseManualRecipients() {
  const text = document.getElementById('manualRecipientsInput').value;
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

  parsedRecipients = [];
  parsedVariables = ['name', 'company', 'email'];

  lines.forEach(line => {
    const parts = line.split(',').map(p => p.trim());
    if (parts[0] && parts[0].includes('@')) {
      parsedRecipients.push({
        email: parts[0],
        name: parts[1] || parts[0].split('@')[0],
        company: parts[2] || 'Organization'
      });
    }
  });

  updateRecipientUI();
}

/**
 * Update UI for parsed recipients
 */
function updateRecipientUI() {
  const badge = document.getElementById('recipientCountBadge');
  const previewBox = document.getElementById('recipientsPreviewBox');

  badge.textContent = `${parsedRecipients.length} recipients`;

  if (parsedRecipients.length > 0) {
    previewBox.classList.remove('d-none');
    previewBox.innerHTML = parsedRecipients.slice(0, 10).map((r, idx) => `
      <div class="d-flex justify-content-between border-bottom border-secondary border-opacity-20 py-1 extra-small">
        <span class="text-truncate" style="max-width: 180px;"><i class="fas fa-envelope text-muted me-1"></i>${r.email}</span>
        <span class="text-info text-truncate">${r.name || ''}</span>
      </div>
    `).join('') + (parsedRecipients.length > 10 ? `<div class="text-center text-muted extra-small mt-1">+ ${parsedRecipients.length - 10} more recipients</div>` : '');
  } else {
    previewBox.classList.add('d-none');
  }

  renderVariableChips();
}

/**
 * Render Variable Chips that user can click to insert handlebars
 */
function renderVariableChips() {
  const container = document.getElementById('variableChips');
  const wrapper = document.getElementById('placeholdersContainer');

  if (!parsedVariables || parsedVariables.length === 0) {
    wrapper.classList.add('d-none');
    return;
  }

  wrapper.classList.remove('d-none');
  container.innerHTML = parsedVariables.map(v => `
    <span class="var-chip" onclick="insertVariable('{{${v}}}')"><i class="fas fa-plus me-1"></i>{{${v}}}</span>
  `).join('');
}

/**
 * Insert variable placeholder at active cursor in body or subject
 */
function insertVariable(varText) {
  const subjectInput = document.getElementById('emailSubject');
  const bodyTextarea = document.getElementById('emailBody');

  // Check active element
  if (document.activeElement === subjectInput) {
    insertAtCursor(subjectInput, varText);
  } else {
    insertAtCursor(bodyTextarea, varText);
  }

  updateLivePreview();
}

function insertAtCursor(field, text) {
  if (field.selectionStart || field.selectionStart === 0) {
    const startPos = field.selectionStart;
    const endPos = field.selectionEnd;
    field.value = field.value.substring(0, startPos) + text + field.value.substring(endPos, field.value.length);
    field.selectionStart = startPos + text.length;
    field.selectionEnd = startPos + text.length;
    field.focus();
  } else {
    field.value += text;
  }
}

/**
 * Switch Body Mode (Edit vs Preview)
 */
function switchBodyMode(mode) {
  const editContainer = document.getElementById('bodyEditContainer');
  const previewContainer = document.getElementById('bodyPreviewContainer');
  const btnEdit = document.getElementById('btnEditTab');
  const btnPreview = document.getElementById('btnPreviewTab');

  if (mode === 'preview') {
    editContainer.classList.add('d-none');
    previewContainer.classList.remove('d-none');
    btnEdit.classList.remove('active');
    btnPreview.classList.add('active');
    updateLivePreview();
  } else {
    previewContainer.classList.add('d-none');
    editContainer.classList.remove('d-none');
    btnPreview.classList.remove('active');
    btnEdit.classList.add('active');
  }
}

/**
 * Render Live Body Preview with sample recipient variable substitution
 */
function updateLivePreview() {
  const bodyText = document.getElementById('emailBody').value;
  const sampleRecipient = parsedRecipients[0] || { name: 'John Doe', company: 'Acme Corp', email: 'john@example.com' };

  let replaced = bodyText;
  Object.keys(sampleRecipient).forEach(k => {
    const reg = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'gi');
    replaced = replaced.replace(reg, sampleRecipient[k]);
  });

  // Simple newline to br conversion if no html tags
  if (!/<[a-z][\s\S]*>/i.test(replaced)) {
    replaced = replaced.replace(/\n/g, '<br>');
  }

  document.getElementById('liveBodyPreview').innerHTML = replaced || '<em class="text-muted">Empty body content preview...</em>';
}

/**
 * Handle Attachment file input
 */
function renderAttachmentChips() {
  const fileInput = document.getElementById('attachmentInput');
  const chipsContainer = document.getElementById('attachmentChips');

  uploadedAttachments = Array.from(fileInput.files);
  chipsContainer.innerHTML = uploadedAttachments.map((f, idx) => `
    <div class="att-chip">
      <i class="fas fa-file-alt text-info"></i>
      <span class="text-truncate" style="max-width: 150px;">${f.name}</span>
      <span class="text-muted extra-small">(${Math.round(f.size / 1024)} KB)</span>
    </div>
  `).join('');
}

/**
 * Load Presets HTML Templates
 */
function loadHtmlTemplate(type = 'outreach') {
  const subjectInput = document.getElementById('emailSubject');
  const bodyTextarea = document.getElementById('emailBody');

  if (parsedRecipients.length === 0) {
    document.getElementById('manualRecipientsInput').value = 
`john@example.com, John Doe, Acme Corp
sarah@example.com, Sarah Smith, Globex Corp
mike@example.com, Mike Ross, Stark Industries`;
    parseManualRecipients();
  }

  if (type === 'newsletter') {
    subjectInput.value = '📰 Weekly Tech Insights for {{company}}, {{name}}!';
    bodyTextarea.value = 
`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; color: #1e293b;">
  <div style="background: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%); padding: 30px; text-align: center; color: #ffffff;">
    <h1 style="margin: 0; font-size: 24px; font-weight: 700;">Weekly Digest</h1>
    <p style="margin-top: 8px; opacity: 0.9; font-size: 14px;">Handpicked trends & updates for {{name}} at {{company}}</p>
  </div>
  <div style="padding: 24px;">
    <h2 style="font-size: 18px; color: #0f172a;">Hello {{name}},</h2>
    <p style="line-height: 1.6; color: #475569;">Here are the top engineering and growth highlights for this week designed to keep <strong>{{company}}</strong> ahead of the curve:</p>
    
    <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 14px; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin: 0 0 6px 0; font-size: 16px; color: #1e293b;">🚀 Scalable Cloud Architecture Tips</h3>
      <p style="margin: 0; font-size: 14px; color: #64748b;">Learn how leading companies reduce latency by 40% using automated workflow engines.</p>
    </div>

    <div style="text-align: center; margin-top: 30px;">
      <a href="https://example.com" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">Read Full Edition</a>
    </div>
  </div>
  <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
    Sent to {{email}} | © 2026 Mailler Pro Newsletter
  </div>
</div>`;
  } else if (type === 'announcement') {
    subjectInput.value = '⚡ Big News for {{company}}! Introducing Mailler Pro 2.0';
    bodyTextarea.value = 
`<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; border-radius: 16px; overflow: hidden; color: #f8fafc;">
  <div style="padding: 40px 30px; text-align: center; background: radial-gradient(circle, rgba(99,102,241,0.3) 0%, rgba(15,23,42,1) 100%);">
    <span style="background-color: #6366f1; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">Product Launch</span>
    <h1 style="margin: 16px 0 8px 0; font-size: 28px; color: #ffffff;">Mailler Pro 2.0 is Live!</h1>
    <p style="color: #94a3b8; font-size: 16px;">Built to empower {{company}} with high-speed automated email outreach.</p>
  </div>
  <div style="padding: 0 30px 30px 30px;">
    <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">Hi {{name}},</p>
    <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">We're thrilled to give {{name}} exclusive early access to our next-generation bulk custom dispatch engine.</p>
    
    <div style="margin: 24px 0;">
      <div style="display: flex; margin-bottom: 12px;">
        <span style="color: #10b981; font-weight: bold; margin-right: 8px;">✓</span>
        <span style="color: #e2e8f0;">Dynamic Variable Substitution ({{name}}, {{company}})</span>
      </div>
      <div style="display: flex; margin-bottom: 12px;">
        <span style="color: #10b981; font-weight: bold; margin-right: 8px;">✓</span>
        <span style="color: #e2e8f0;">Automated Daily Execution & Live Monitoring</span>
      </div>
      <div style="display: flex;">
        <span style="color: #10b981; font-weight: bold; margin-right: 8px;">✓</span>
        <span style="color: #e2e8f0;">Instant SMTP Verification & Brevo Integration</span>
      </div>
    </div>

    <div style="text-align: center; margin-top: 32px;">
      <a href="https://example.com" style="background: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 15px; display: inline-block;">Try Mailler Pro Now →</a>
    </div>
  </div>
</div>`;
  } else if (type === 'event') {
    subjectInput.value = '📅 Invitation: Executive Growth Masterclass for {{company}}';
    bodyTextarea.value = 
`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 30px; color: #1e293b;">
  <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
    <span style="color: #8b5cf6; font-weight: bold; font-size: 13px; text-transform: uppercase;">Live Webinar Invitation</span>
    <h2 style="margin: 8px 0 0 0; color: #0f172a; font-size: 22px;">Scaling Customer Outreach in 2026</h2>
  </div>
  
  <p style="font-size: 15px; line-height: 1.6; color: #475569;">Dear {{name}},</p>
  <p style="font-size: 15px; line-height: 1.6; color: #475569;">You are cordially invited to represent <strong>{{company}}</strong> at our upcoming exclusive virtual masterclass.</p>

  <div style="background-color: #f8fafc; padding: 20px; border-radius: 10px; margin: 24px 0; border: 1px solid #cbd5e1;">
    <p style="margin: 0 0 8px 0; font-weight: bold; color: #0f172a;">📍 Details:</p>
    <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Date:</strong> Thursday, August 15, 2026</p>
    <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Time:</strong> 10:00 AM EST (45 Mins)</p>
    <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Host:</strong> Senior Industry Strategists</p>
  </div>

  <div style="text-align: center; margin-top: 28px;">
    <a href="https://example.com" style="background-color: #8b5cf6; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reserve Seat for {{name}}</a>
  </div>
</div>`;
  } else {
    // Outreach Default
    subjectInput.value = 'Exclusive Growth Opportunity for {{company}}, {{name}}!';
    bodyTextarea.value = 
`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #334155;">
  <p style="font-size: 15px;">Hi <strong>{{name}}</strong>,</p>
  <p style="font-size: 15px; line-height: 1.6;">Hope you are having a great week!</p>
  <p style="font-size: 15px; line-height: 1.6;">We noticed your team at <strong>{{company}}</strong> is expanding outreach capabilities. We would love to present a customized workflow integration tailored specifically for {{company}}.</p>
  
  <p style="font-size: 15px; font-weight: bold; margin-top: 20px;">Key Value for {{name}}:</p>
  <ul style="line-height: 1.8; color: #475569;">
    <li>300% improvement in campaign deliverability</li>
    <li>Dynamic CSV data parsing & personalized variables</li>
    <li>Automated daily scheduling engine</li>
  </ul>

  <p style="font-size: 15px; margin-top: 24px;">Would you be open to a 10-minute quick chat this week?</p>
  
  <div style="margin-top: 28px;">
    <a href="https://example.com" style="background-color: #059669; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">Schedule 10-Min Demo</a>
  </div>

  <p style="font-size: 14px; margin-top: 30px; color: #64748b;">Best regards,<br><strong>Raghunatha Maharana</strong></p>
</div>`;
  }

  switchBodyMode('edit');
  updateLivePreview();
}

function loadSampleTemplate() {
  loadHtmlTemplate('outreach');
}

/**
 * Send Now Action
 */
async function sendNow() {
  const smtpConfig = getSmtpConfigFromForm();
  const fromName = document.getElementById('fromName').value.trim();
  const fromEmail = document.getElementById('fromEmail').value.trim();
  const replyToEmail = document.getElementById('replyToEmail')?.value.trim() || '';
  const subject = document.getElementById('emailSubject').value.trim();
  const bodyHtml = document.getElementById('emailBody').value;
  const delaySeconds = parseInt(document.getElementById('throttleDelay').value, 10);

  if (!smtpConfig.user || !smtpConfig.pass) {
    alert('Please enter your SMTP Username and Password/Key before sending.');
    return;
  }

  if (parsedRecipients.length === 0) {
    alert('Please add at least one recipient (CSV upload or Manual List).');
    return;
  }

  if (!subject) {
    alert('Please provide an email subject line.');
    return;
  }

  const formData = new FormData();
  formData.append('smtpConfig', JSON.stringify(smtpConfig));
  if (currentUser) {
    formData.append('senderUser', JSON.stringify(currentUser));
  }
  formData.append('emailPayload', JSON.stringify({
    fromName,
    fromEmail,
    replyToEmail,
    subject,
    bodyHtml,
    recipients: parsedRecipients,
    delaySeconds
  }));

  const fileInput = document.getElementById('attachmentInput');
  for (let i = 0; i < fileInput.files.length; i++) {
    formData.append('attachments', fileInput.files[i]);
  }

  const btnSend = document.getElementById('btnSendNow');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressCount = document.getElementById('progressCount');
  const progressText = document.getElementById('progressText');

  btnSend.disabled = true;
  btnSend.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Dispatching Emails...';
  progressContainer.classList.remove('d-none');
  progressBar.style.width = '20%';
  progressCount.textContent = `0 / ${parsedRecipients.length}`;

  try {
    const res = await fetch('/api/mail/send', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      progressBar.style.width = '100%';
      progressBar.className = 'progress-bar bg-success';
      progressCount.textContent = `${data.results.sent} / ${data.results.total}`;
      progressText.textContent = 'Bulk dispatch completed successfully!';
      alert(`Bulk Email Dispatch Complete!\n\nSent: ${data.results.sent}\nFailed: ${data.results.failed}`);
      loadLogs();
      loadCampaignExplorer();
    } else {
      alert('Failed to send bulk email: ' + data.message);
    }
  } catch (err) {
    alert('Error connecting to mailer backend: ' + err.message);
  } finally {
    btnSend.disabled = false;
    btnSend.innerHTML = '<i class="fas fa-rocket me-2"></i>Send Now';
  }
}

/**
 * Open Schedule Modal
 */
function openScheduleModal() {
  if (parsedRecipients.length === 0) {
    alert('Please add at least one recipient first.');
    return;
  }
  const modal = new bootstrap.Modal(document.getElementById('scheduleModal'));
  modal.show();
}

/**
 * Confirm Daily Schedule Creation
 */
async function confirmSchedule() {
  const name = document.getElementById('schName').value.trim() || 'Daily Bulk Campaign';
  const dailyTime = document.getElementById('schTime').value;
  const smtpConfig = getSmtpConfigFromForm();

  const fromName = document.getElementById('fromName').value.trim();
  const fromEmail = document.getElementById('fromEmail').value.trim();
  const replyToEmail = document.getElementById('replyToEmail')?.value.trim() || '';
  const subject = document.getElementById('emailSubject').value.trim();
  const bodyHtml = document.getElementById('emailBody').value;

  const formData = new FormData();
  formData.append('name', name);
  formData.append('dailyTime', dailyTime);
  formData.append('smtpConfig', JSON.stringify(smtpConfig));
  formData.append('emailPayload', JSON.stringify({
    fromName,
    fromEmail,
    replyToEmail,
    subject,
    bodyHtml,
    recipients: parsedRecipients
  }));

  const fileInput = document.getElementById('attachmentInput');
  for (let i = 0; i < fileInput.files.length; i++) {
    formData.append('attachments', fileInput.files[i]);
  }

  try {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      alert(`Daily Schedule Created!\n\nName: ${name}\nDaily Execution Time: ${dailyTime}`);
      const modalEl = document.getElementById('scheduleModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      modal.hide();
      loadSchedules();
    } else {
      alert('Error creating schedule: ' + data.message);
    }
  } catch (err) {
    alert('Failed to connect to backend: ' + err.message);
  }
}

/**
 * Load Active Schedules
 */
async function loadSchedules() {
  const tbody = document.getElementById('schedulesTableBody');
  const badge = document.getElementById('scheduleBadge');

  try {
    const res = await fetch('/api/schedule');
    const data = await res.json();

    if (data.success && data.schedules) {
      badge.textContent = data.schedules.length;
      if (data.schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No active daily schedules found. Click "Schedule Daily" in composer to create one.</td></tr>';
        return;
      }

      tbody.innerHTML = data.schedules.map(s => `
        <tr>
          <td class="fw-semibold text-light"><i class="fas fa-calendar-check text-primary me-2"></i>${s.name}</td>
          <td><span class="badge bg-dark border border-secondary text-info"><i class="fas fa-clock me-1"></i>Every day @ ${s.dailyTime}</span></td>
          <td><span class="badge bg-secondary">${s.recipientCount} recipients</span></td>
          <td class="text-truncate" style="max-width: 180px;">${s.subject}</td>
          <td class="small text-muted">${s.lastRun ? new Date(s.lastRun).toLocaleString() : 'Not executed yet'}</td>
          <td>
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" ${s.enabled ? 'checked' : ''} onchange="toggleSchedule('${s.id}', this.checked)">
              <label class="form-check-label extra-small text-muted">${s.enabled ? 'Active' : 'Paused'}</label>
            </div>
          </td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-danger" onclick="deleteSchedule('${s.id}')"><i class="fas fa-trash-alt"></i></button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Error loading schedules: ${err.message}</td></tr>`;
  }
}

/**
 * Toggle Schedule On/Off
 */
async function toggleSchedule(id, enabled) {
  try {
    await fetch(`/api/schedule/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    loadSchedules();
  } catch (err) {
    alert('Failed to update schedule status.');
  }
}

/**
 * Delete Schedule
 */
async function deleteSchedule(id) {
  if (!confirm('Are you sure you want to delete this schedule?')) return;
  try {
    await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
    loadSchedules();
  } catch (err) {
    alert('Failed to delete schedule.');
  }
}

/**
 * Load Transmission Logs
 */
async function loadLogs() {
  const consoleEl = document.getElementById('logsConsole');
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();

    if (data.success && data.logs) {
      if (data.logs.length === 0) {
        consoleEl.innerHTML = '<div class="text-muted">[System Ready] Waiting for transmission events...</div>';
        return;
      }

      consoleEl.innerHTML = data.logs.map(log => {
        const time = new Date(log.timestamp || Date.now()).toLocaleTimeString();
        if (log.type === 'SEND_PROGRESS') {
          const statusClass = log.logEntry.status === 'SUCCESS' ? 'log-success' : 'log-failed';
          return `<div class="log-entry ${statusClass}">[${time}] ${log.logEntry.status} -> ${log.logEntry.email} (${log.sent}/${log.total} sent) ${log.logEntry.error ? '- Error: ' + log.logEntry.error : ''}</div>`;
        } else if (log.type === 'CAMPAIGN_START') {
          return `<div class="log-entry log-info">[${time}] 🚀 Campaign started for ${log.total} recipients.</div>`;
        } else if (log.type === 'CAMPAIGN_COMPLETE') {
          return `<div class="log-entry log-info">[${time}] ✨ Campaign finished. Sent: ${log.results.sent}, Failed: ${log.results.failed}</div>`;
        } else {
          return `<div class="log-entry text-muted">[${time}] Event: ${log.type} ${log.name ? '- ' + log.name : ''}</div>`;
        }
      }).join('');
    }
  } catch (err) {
    consoleEl.innerHTML = `<div class="text-danger">[Error] Could not load logs: ${err.message}</div>`;
  }
}

// --- MULTI-USER AUTH & RBAC SESSION CONTROLLER ---
let currentUser = null;

async function checkAuthSession() {
  const token = localStorage.getItem('mailler_auth_token');
  const userJson = localStorage.getItem('mailler_auth_user');

  if (token && userJson) {
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();

      if (data.valid) {
        currentUser = JSON.parse(userJson);
        showMainApp();
        return true;
      }
    } catch (e) {
      console.error('Session check failed:', e);
    }
  }

  showLoginScreen();
  return false;
}

function showLoginScreen() {
  const screen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainAppWrapper');
  if (screen) {
    screen.classList.remove('d-none');
    screen.style.setProperty('display', 'flex', 'important');
  }
  if (mainApp) {
    mainApp.classList.add('d-none');
    mainApp.style.setProperty('display', 'none', 'important');
  }
}

function showMainApp() {
  const screen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainAppWrapper');
  if (screen) {
    screen.classList.add('d-none');
    screen.style.setProperty('display', 'none', 'important');
  }
  if (mainApp) {
    mainApp.classList.remove('d-none');
    mainApp.style.setProperty('display', 'block', 'important');
  }

  // Handle RBAC visibility for Superadmin vs Colleague
  const usersTabLi = document.getElementById('usersTabLi');
  if (usersTabLi) {
    if (currentUser && currentUser.role === 'superadmin') {
      usersTabLi.classList.remove('d-none');
    } else {
      usersTabLi.classList.add('d-none');
    }
  }

  // Load Past Campaigns Explorer for authenticated session
  loadCampaignExplorer();
}

async function handleLogin(event) {
  if (event) event.preventDefault();
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const alertBox = document.getElementById('loginAlert');
  const btn = document.getElementById('btnLogin');

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    if (alertBox) {
      alertBox.textContent = 'Please enter both login email and password.';
      alertBox.classList.remove('d-none');
    }
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Authenticating...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('mailler_auth_token', data.token);
      localStorage.setItem('mailler_auth_user', JSON.stringify(data.user));

      showMainApp();
      initAppComponents();
    } else {
      if (alertBox) {
        alertBox.textContent = data.message || 'Invalid Username or Password.';
        alertBox.classList.remove('d-none');
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = 'Backend Error: ' + err.message;
      alertBox.classList.remove('d-none');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-shield-alt me-2"></i>Sign In to MaillerPRO';
  }
}

/**
 * Reset Composer Form & Clear Recipients
 */
function resetComposerForm() {
  parsedRecipients = [];
  uploadedAttachments = [];
  
  const subjectInput = document.getElementById('emailSubject');
  const bodyTextarea = document.getElementById('emailBody');
  const fileInput = document.getElementById('attachmentInput');
  const manualInput = document.getElementById('manualRecipientsInput');

  if (subjectInput) subjectInput.value = '';
  if (bodyTextarea) bodyTextarea.value = '';
  if (fileInput) fileInput.value = '';
  if (manualInput) manualInput.value = '';

  updateRecipientUI();
  updateLivePreview();
}

function handleLogout() {
  localStorage.removeItem('mailler_auth_token');
  localStorage.removeItem('mailler_auth_user');
  currentUser = null;
  resetComposerForm();
  showLoginScreen();
}

function toggleLoginPass() {
  const input = document.getElementById('loginPassword');
  const icon = document.getElementById('loginPassEye');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

/**
 * Load Colleague Users (Superadmin Only)
 */
async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  const userSelect = document.getElementById('auditFilterUser');
  if (!tbody) return;

  try {
    const res = await fetch('/api/users');
    const data = await res.json();

    if (data.success && data.users) {
      if (userSelect) {
        userSelect.innerHTML = '<option value="">All Colleagues</option>' + 
          data.users.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('');
      }

      if (data.users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No colleague accounts created yet. Click "Add Colleague Account" to create one.</td></tr>';
        return;
      }

      tbody.innerHTML = data.users.map(u => `
        <tr>
          <td class="fw-bold text-white"><i class="fas fa-user-circle me-2 text-info fs-5 align-middle"></i>${u.name}</td>
          <td><code class="text-info bg-dark bg-opacity-75 px-2 py-1 rounded border border-secondary font-monospace fs-6">${u.email}</code></td>
          <td>
            <span class="badge ${u.role === 'superadmin' ? 'bg-warning text-dark' : 'bg-primary'} fw-bold px-2 py-1">
              ${u.role === 'superadmin' ? 'Superadmin Owner' : 'Colleague'}
            </span>
          </td>
          <td>
            <span class="badge ${u.active ? 'bg-success' : 'bg-danger'} px-2 py-1">
              ${u.active ? 'Active' : 'Disabled'}
            </span>
          </td>
          <td class="small text-light fw-semibold">${new Date(u.createdAt).toLocaleDateString()}</td>
          <td class="text-end">
            ${u.role !== 'superadmin' ? `
              <button class="btn btn-sm btn-outline-warning me-1 rounded-pill" onclick="toggleUserActive('${u.id}', ${!u.active})" title="Toggle Active/Disable">
                <i class="fas ${u.active ? 'fa-user-slash' : 'fa-user-check'}"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger rounded-pill" onclick="deleteUserAccount('${u.id}')" title="Delete Colleague Account">
                <i class="fas fa-trash-alt"></i>
              </button>
            ` : '<span class="badge bg-secondary text-light border border-secondary px-2 py-1">Primary Superadmin</span>'}
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Error loading users: ${err.message}</td></tr>`;
  }
}

async function confirmAddUser() {
  const name = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;

  if (!email || !password) {
    alert('Please enter both Office Email Address and Password for the colleague.');
    return;
  }

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });
    const data = await res.json();

    if (data.success) {
      alert(data.message);
      const modalEl = document.getElementById('addUserModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();

      document.getElementById('newUserName').value = '';
      document.getElementById('newUserEmail').value = '';
      document.getElementById('newUserPassword').value = '';

      loadUsers();
    } else {
      alert('Error: ' + data.message);
    }
  } catch (err) {
    alert('Failed to create user: ' + err.message);
  }
}

async function toggleUserActive(id, active) {
  try {
    await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active })
    });
    loadUsers();
  } catch (err) {
    alert('Failed to update user state.');
  }
}

async function deleteUserAccount(id) {
  if (!confirm('Are you sure you want to delete this colleague user account?')) return;
  try {
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    loadUsers();
  } catch (err) {
    alert('Failed to delete user.');
  }
}

let cachedAuditLogs = [];
async function loadAuditLogs() {
  const tbody = document.getElementById('auditTableBody');
  const dateVal = document.getElementById('auditFilterDate')?.value || '';
  const userVal = document.getElementById('auditFilterUser')?.value || '';
  const searchVal = document.getElementById('auditSearchQuery')?.value || '';

  if (!tbody) return;

  try {
    const role = currentUser?.role || 'user';
    const userId = currentUser?.id || '';

    const query = new URLSearchParams({
      role,
      userId,
      date: dateVal,
      filterUserId: userVal,
      search: searchVal
    });

    const res = await fetch(`/api/audit/logs?${query.toString()}`);
    const data = await res.json();

    if (data.success && data.logs) {
      cachedAuditLogs = data.logs;
      if (data.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No audit log records found for the selected date/filter criteria.</td></tr>';
        return;
      }

      tbody.innerHTML = data.logs.map(l => `
        <tr>
          <td class="small text-light fw-semibold">${new Date(l.timestamp).toLocaleString()}</td>
          <td class="fw-bold text-white"><i class="fas fa-user-circle me-1 text-info fs-6"></i>${l.userName} <span class="small text-muted font-monospace">(${l.userEmail})</span></td>
          <td><code class="text-info bg-dark bg-opacity-75 px-2 py-1 rounded border border-secondary font-monospace fs-6">${l.toEmail}</code></td>
          <td class="text-truncate fw-bold text-white" style="max-width: 220px;" title="${l.subject}">${l.subject}</td>
          <td>
            <span class="badge ${l.status === 'SUCCESS' ? 'bg-success' : 'bg-danger'} px-2 py-1">
              ${l.status}
            </span>
          </td>
          <td class="text-end text-nowrap">
            <button class="btn btn-sm btn-outline-primary rounded-pill px-3 me-1 fw-semibold" onclick="reloadCampaignToComposer('${l.id}')" title="Load Subject, Body & Recipient into Composer">
              <i class="fas fa-redo me-1"></i>Re-use
            </button>
            <button class="btn btn-sm btn-outline-info rounded-pill px-3 fw-semibold" onclick="viewAuditDetail('${l.id}')">
              <i class="fas fa-eye me-1"></i>View Body
            </button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Error loading audit logs: ${err.message}</td></tr>`;
  }
}

let activeModalAuditLog = null;

function viewAuditDetail(logId) {
  const log = cachedAuditLogs.find(l => l.id === logId);
  if (!log) return;

  activeModalAuditLog = log;

  document.getElementById('audModalSender').textContent = `${log.userName} <${log.userEmail}>`;
  document.getElementById('audModalRecipient').textContent = log.toEmail;
  document.getElementById('audModalTime').textContent = new Date(log.timestamp).toLocaleString();
  document.getElementById('audModalStatus').className = `badge ${log.status === 'SUCCESS' ? 'bg-success' : 'bg-danger'}`;
  document.getElementById('audModalStatus').textContent = log.status;
  document.getElementById('audModalSubject').textContent = log.subject;

  const bodyEl = document.getElementById('audModalBody');
  if (log.bodyHtml) {
    bodyEl.innerHTML = log.bodyHtml;
  } else {
    bodyEl.textContent = log.bodyText || '(No content recorded)';
  }

  const modalEl = document.getElementById('auditDetailModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

/**
 * 1-Click Reload Past Campaign into Composer Canvas
 */
function reloadCampaignToComposer(logId) {
  // Check cachedExplorerLogs first, then fallback to cachedAuditLogs
  let log = cachedExplorerLogs.find(l => String(l.id) === String(logId));
  if (!log) {
    log = cachedAuditLogs.find(l => String(l.id) === String(logId));
  }
  if (!log) {
    console.warn('Campaign log not found for ID:', logId);
    alert('Unable to locate campaign details. Please refresh the page and try again.');
    return;
  }

  // 1. Fill Subject Line
  const subjectInput = document.getElementById('emailSubject');
  if (subjectInput) subjectInput.value = log.subject || '';

  // 2. Fill Email Body (HTML / Text)
  const bodyTextarea = document.getElementById('emailBody');
  if (bodyTextarea) bodyTextarea.value = log.bodyHtml || log.bodyText || '';

  // 3. Fill From Name & Email
  const fromNameInput = document.getElementById('fromName');
  const fromEmailInput = document.getElementById('fromEmail');
  if (fromNameInput && log.fromName) fromNameInput.value = log.fromName;
  if (fromEmailInput && log.fromEmail) fromEmailInput.value = log.fromEmail;

  // 4. Fill Recipient List & Manual Textarea
  if (log.toEmail) {
    parsedRecipients = [{ email: log.toEmail, name: log.toEmail.split('@')[0] }];
    const manualInput = document.getElementById('manualRecipientsInput');
    if (manualInput) {
      manualInput.value = log.toEmail;
    }
    updateRecipientUI();
  }

  updateLivePreview();

  // 5. Switch view back to Composer Tab
  const composerTabBtn = document.getElementById('composer-tab');
  if (composerTabBtn) {
    const tab = bootstrap.Tab.getInstance(composerTabBtn) || new bootstrap.Tab(composerTabBtn);
    tab.show();
  }

  // 6. Smooth scroll to top of Composer canvas
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function reloadCampaignFromModal() {
  if (activeModalAuditLog) {
    const modalEl = document.getElementById('auditDetailModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    reloadCampaignToComposer(activeModalAuditLog.id);
  }
}

/**
 * Left-Side Past Campaigns Explorer Engine
 */
let cachedExplorerLogs = [];

async function loadCampaignExplorer() {
  const container = document.getElementById('campaignExplorerList');
  if (!container) return;

  try {
    const role = currentUser?.role || 'user';
    const userId = currentUser?.id || '';
    const res = await fetch(`/api/audit/logs?role=${role}&userId=${userId}`);
    const data = await res.json();

    if (data.success && data.logs) {
      cachedExplorerLogs = data.logs;
      renderCampaignExplorerList(data.logs);
    }
  } catch (err) {
    container.innerHTML = `<div class="text-danger extra-small p-2">Failed to load: ${err.message}</div>`;
  }
}

function renderCampaignExplorerList(logs) {
  const container = document.getElementById('campaignExplorerList');
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-3 extra-small">
        <i class="fas fa-inbox fs-4 d-block mb-1 text-secondary"></i>No past campaigns found.
      </div>`;
    return;
  }

  container.innerHTML = logs.map(l => `
    <div class="campaign-item p-2 mb-2 rounded border border-secondary" onclick="reloadCampaignToComposer('${l.id}')" title="Click to load into Composer">
      <div class="d-flex align-items-center justify-content-between mb-1">
        <strong class="text-white extra-small text-truncate me-2" style="max-width: 170px;" title="${l.subject}">${l.subject || '(No Subject)'}</strong>
        <span class="badge bg-dark border border-secondary text-info extra-small">${new Date(l.timestamp).toLocaleDateString()}</span>
      </div>
      <div class="d-flex align-items-center justify-content-between extra-small text-muted">
        <span class="text-truncate" style="max-width: 170px;"><i class="fas fa-paper-plane me-1 text-primary"></i>${l.toEmail}</span>
        <span class="text-cyan fw-bold"><i class="fas fa-file-import me-1"></i>Load</span>
      </div>
    </div>
  `).join('');
}

function filterCampaignExplorer() {
  const query = (document.getElementById('campaignSearchInput')?.value || '').toLowerCase().trim();
  if (!query) {
    renderCampaignExplorerList(cachedExplorerLogs);
    return;
  }

  const filtered = cachedExplorerLogs.filter(l => 
    (l.subject && l.subject.toLowerCase().includes(query)) ||
    (l.toEmail && l.toEmail.toLowerCase().includes(query)) ||
    (l.userName && l.userName.toLowerCase().includes(query))
  );

  renderCampaignExplorerList(filtered);
}
