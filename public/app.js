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

  const smtpUserInput = document.getElementById('smtpUser');
  if (smtpUserInput && !smtpUserInput.value) {
    smtpUserInput.value = 'b32ede001@smtp-brevo.com';
  }

  const smtpPassInput = document.getElementById('smtpPass');
  if (smtpPassInput && !smtpPassInput.value) {
    smtpPassInput.value = 'xsmtpsib-87b5c59b240d7432322ba9994935df584963f26b2f3323b8894e9204a901e4b7-WYYDEDcjGBlTOK7f';
  }

  const fromEmailInput = document.getElementById('fromEmail');
  if (fromEmailInput && !fromEmailInput.value) {
    fromEmailInput.value = 'raghunatha.maharana@gmail.com';
  }

  const fromNameInput = document.getElementById('fromName');
  if (fromNameInput && !fromNameInput.value) {
    fromNameInput.value = 'Raghunatha Maharana';
  }

  renderVariableChips();
  loadSchedules();
  loadLogs();
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
      userInput.value = 'b32ede001@smtp-brevo.com';
      passInput.value = 'xsmtpsib-87b5c59b240d7432322ba9994935df584963f26b2f3323b8894e9204a901e4b7-WYYDEDcjGBlTOK7f';
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
      alertBox.innerHTML = `<i class="fas fa-exclamation-triangle me-2"></i>${data.message}`;
      updateSmtpStatus(false, 'Connection Failed');
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
