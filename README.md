# MailerPro — Enterprise Bulk Emailer & Automated Scheduler

![MailerPro Banner](https://img.shields.io/badge/MailerPro-v1.0.0-6366f1?style=for-the-badge&logo=nodemailer&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green?style=for-the-badge&logo=node.js)
![Express](https://img.shields.io/badge/Express.js-4.19-lightgrey?style=for-the-badge&logo=express)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**MailerPro** is a modern, enterprise-grade bulk email dispatch, multi-user team collaboration, and daily scheduling application built with Node.js, Express, Nodemailer, and node-cron. It provides a glassmorphic dashboard for dynamic email templating, CSV recipient parsing, attachment dispatching, multi-provider SMTP/HTTPS API failover, and automated campaign tracking.

---

## 🌟 Key Features

### 🚀 1. Dual Delivery Engine: HTTPS REST API (Port 443) & SMTP
- **Brevo HTTPS REST API (`xkeysib-...`)**: Dispatches directly over Port 443 HTTPS REST API, completely bypassing raw SMTP cloud firewall blocks (Port 587/465) on hosts like Railway.
- **Resend HTTPS REST API (`re_...`)**: Native Port 443 REST API integration for high-deliverability transactional email dispatches.
- **Multi-Port SMTP Auto-Failover**: Pre-configured automatic failover across ports `587`, `2525`, and `465 (SSL)` for Brevo, Gmail App Passwords, Mailtrap, and Custom Corporate SMTP servers.

### 📜 2. Left-Side Past Campaigns Explorer Panel
- **1-Click Auto-Load**: A dedicated Explorer panel positioned on the left side of the Composer canvas displays all past sent campaigns. Clicking any campaign item automatically populates its **Subject Line**, **Full HTML/Text Body**, **Sender Details**, and **Recipient Email**.
- **Instant Search Filter**: Search through past campaigns by subject keywords or recipient email addresses.
- **Auto-Sync**: Automatically refreshes as soon as any campaign is dispatched.

### ⚡ 3. 1-Click Campaign Re-Use & History Reload
- **Audit Log Re-Use**: Click **"Re-use"** on any past entry in the Audit Logs table or Audit Email Inspector Modal to reload the entire email campaign into the Composer canvas.
- **Auto-Scroll & Focus**: Smoothly aligns the screen to the top of the Mail Composer for rapid review and resending.

### 👥 4. Multi-User Team Collaboration & Role-Based Access Control (RBAC)
- **Superadmin (Owner)**: Create, edit, and delete colleague user accounts, set initial passwords, and toggle account active/disabled states.
- **Shared Master SMTP Key**: Office colleagues log in with their own office email & password and send emails using the Superadmin's shared Brevo API key without needing individual Brevo accounts.
- **Colleague Activity Tracking**: Superadmins can inspect all colleague email activity logs, while colleagues view their own dispatch history.

### ⚙️ 5. Collapsible Compact SMTP Settings Card
- **Space-Saving UI**: SMTP Settings card stays neatly collapsed by default (`SMTP Settings [Connected] [Edit Keys]`) to maximize screen space for the Past Campaigns Explorer and Recipient list. Click **"Edit Keys"** to expand and edit credentials anytime.

### 📄 6. Dynamic Templating & CSV Recipient Import
- **CSV & Text Drag-and-Drop**: Upload `.csv` or `.txt` recipient lists with automatic header column detection (`email`, `name`, `company`, etc.).
- **Manual Input Mode**: Paste line-separated email addresses directly.
- **Dynamic Variable Chips**: Insert handlebar variables (e.g. `{{name}}`, `{{company}}`, `{{email}}`) into email subjects and HTML bodies with a single click.

### ⏰ 7. Automated Daily Schedule Engine
- Schedule recurring daily email dispatches at any target 24-hour execution time (e.g. `09:00`).
- Built-in Schedule Manager to create, toggle pause/activate, or delete active campaigns.

### 📜 8. Persistent Audit Log & Email Content Inspector
- **Full Email Trail**: Records every sent email (`Sender`, `Recipient`, `Subject`, `HTML Body`, `Timestamp`, `Status`, `MessageId`).
- **Date & Colleague Filtering**: Search and filter sent audit logs by single date (`yyyy-mm-dd`), colleague name/email, recipient, or keyword.
- **Modal Content Inspector**: Click **"View Body"** on any audit entry to inspect the exact subject, recipient, and HTML email body dispatched on that day.
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
ADMIN_USER=raghunatha.maharana@gmail.com
ADMIN_PASS=Raghu@789123*
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

## ☁️ Deployment to Railway

1. Push this repository to GitHub.
2. Log in to [Railway.app](https://railway.app/).
3. Click **New Project** &rarr; **Deploy from GitHub repo**.
4. Select `EPFRAGHU/mailerpro-app`.
5. Railway will automatically detect Node.js, install dependencies, and run `npm start`.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).

