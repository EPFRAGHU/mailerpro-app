# MailerPro — Enterprise Bulk Emailer & Automated Scheduler

![MailerPro Banner](https://img.shields.io/badge/MailerPro-v1.0.0-6366f1?style=for-the-badge&logo=nodemailer&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green?style=for-the-badge&logo=node.js)
![Express](https://img.shields.io/badge/Express.js-4.19-lightgrey?style=for-the-badge&logo=express)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**MailerPro** is a modern, high-throughput bulk email dispatch and daily scheduling application built with Node.js, Express, Nodemailer, and node-cron. It provides an intuitive glassmorphic dashboard for dynamic email templating, CSV recipient parsing, attachment dispatching, multi-provider SMTP failover, and automated daily email campaigns.

---

## Key Features

### 🚀 1. Multi-Provider SMTP Connection Engine
- **Brevo (Sendinblue)**: Pre-configured multi-port auto-failover across ports `587`, `2525`, and `465 (SSL)` for instant cloud delivery.
- **Gmail**: Support for 16-character Google App Passwords.
- **Resend & Mailtrap**: Native integration templates for transactional email testing and delivery.
- **Custom SMTP**: Fully configurable host, port, and TLS options for corporate or cPanel SMTP servers.

### 🔒 2. Smart Security & Credential Protection
- **Locked Key Field**: Password input field is set to `readonly` by default to prevent accidental deletion or backspace overwrites. Includes a one-click **Lock/Unlock (<i class="fas fa-lock"></i>)** toggle button.
- **Permanent Browser Persistence**: Saves verified credentials locally in `localStorage` so the app automatically connects on browser startup.
- **Smart Diagnostics**:
  - Detects **`535 Authentication Failed`** errors and displays step-by-step resolution steps.
  - Detects **`525 Unauthorized IP Address`** errors and provides your current Public IP address to whitelist in Brevo.

### 📄 3. Dynamic Templating & CSV Recipient Import
- **CSV & Text File Drag-and-Drop**: Upload `.csv` or `.txt` recipient lists with automatic header column detection (`email`, `name`, `company`, etc.).
- **Manual Input Mode**: Paste line-separated email addresses directly.
- **Dynamic Variable Chips**: Insert handlebar variables (e.g. `{{name}}`, `{{company}}`, `{{email}}`) into email subjects and HTML bodies with a single click.

### 📎 4. File Attachment Dispatcher
- Multi-file attachment handling via `multer` (supports PDFs, images, DOCX, spreadsheets, etc.).

### ⏰ 5. Automated Daily Schedule Engine
- Schedule recurring daily email dispatches at any target 24-hour execution time (e.g. `09:00`).
- Built-in Schedule Manager to create, toggle pause/activate, or delete active campaigns.

### 🖥️ 6. Real-Time Transmission Terminal & Themes
- Live activity console tracking authentication logins, SMTP connection checks, and delivery success/failure counts.
- **4 Custom Themes**: Cyber Violet, Emerald Mint, Sunset Amber, and Light Crystal.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js, Nodemailer, `node-cron`, `multer`, `cors`, `dotenv`
- **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism design tokens), Bootstrap 5, FontAwesome 6
- **Deployment**: Railway / Render / Heroku / Node Server

---

## 📦 Installation & Setup

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher)
- **npm** (v9.0.0 or higher)

### 2. Clone Repository
```bash
git clone https://github.com/EPFRAGHU/mailerpro-app.git
cd mailerpro-app
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables (Optional)
Create a `.env` file in the root directory:
```env
PORT=3000
ADMIN_USER=admin@example.com
ADMIN_PASS=YourSecurePassword123*
```

### 5. Start Application
```bash
# Production mode
npm start

# Development mode (auto-reload)
npm run dev
```

Open your browser and navigate to: `http://localhost:3000`

---

## ☁️ Deployment

### Deploy to Railway
1. Push this repository to GitHub.
2. Log in to [Railway.app](https://railway.app/).
3. Click **New Project** &rarr; **Deploy from GitHub repo**.
4. Select `EPFRAGHU/mailerpro-app`.
5. Railway will automatically detect Node.js, install dependencies, and run `npm start`.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
