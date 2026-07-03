# DefectTrack — Full-Stack Defect Tracking System

A modern, role-based defect tracking application built with React, Node.js/Express, and PostgreSQL.

---

## Features

- **4 Roles**: QA, Developer, PM, Admin — each with a tailored dashboard
- **Defect Lifecycle**: Open → Assigned → In Progress → Fixed → Retest → Reopen → Closed
- **Slack Integration**: `/raise-defect` slash command with Block Kit modal
- **Email Notifications**: On every status change via Nodemailer
- **CSV Export**: PM can export full defect list
- **Charts**: Defects by module, status, team, and time (Recharts)
- **Audit Trail**: Full chronological status history with colored pills
- **Comment Thread**: Chat-style discussion on each defect
- **File Attachments**: Multi-file upload per defect (Multer)
- **JWT Auth**: Token-based sessions, 8-hour expiry
- **Docker Support**: One-command spin-up

---

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React 18, React Router v6, Recharts, Axios |
| Backend  | Node.js, Express.js               |
| Database | PostgreSQL 15                     |
| Auth     | JWT (jsonwebtoken + bcryptjs)     |
| Email    | Nodemailer (SMTP)                 |
| Slack    | @slack/bolt SDK                   |
| Uploads  | Multer (disk storage)             |
| Deploy   | Docker + Nginx                    |

---

## Project Structure

```
defect-tracker/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── pool.js          # PostgreSQL connection pool
│   │   │   ├── migrate.js       # DB schema migrations
│   │   │   └── seed.js          # Initial seed data
│   │   ├── middleware/
│   │   │   └── auth.js          # JWT auth + role guard middleware
│   │   ├── routes/
│   │   │   ├── auth.js          # POST /login, GET /me
│   │   │   ├── users.js         # Admin user management
│   │   │   ├── projects.js      # Projects + modules CRUD
│   │   │   └── defects.js       # Full defect lifecycle API
│   │   ├── services/
│   │   │   ├── email.js         # Nodemailer email service
│   │   │   └── slack.js         # Slack Bolt integration
│   │   └── server.js            # Express app entry point
│   ├── uploads/                 # File attachment storage
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.js        # Collapsible sidebar + top bar
│   │   │   ├── Badges.js        # StatusBadge, SeverityBadge components
│   │   │   └── RaiseDefectModal.js  # Defect creation form modal
│   │   ├── context/
│   │   │   └── AuthContext.js   # Global auth state
│   │   ├── pages/
│   │   │   ├── LoginPage.js     # Clean login with JWT
│   │   │   ├── QADashboard.js   # My defects + raise button
│   │   │   ├── DevDashboard.js  # Team queue + inline status changes
│   │   │   ├── PMDashboard.js   # Charts + full defect table + export
│   │   │   ├── AdminPanel.js    # User management + module management
│   │   │   ├── DefectList.js    # Filterable defect table
│   │   │   └── DefectDetail.js  # 3-panel: Info | Comments | Audit Trail
│   │   ├── services/
│   │   │   └── api.js           # Axios instance with JWT interceptors
│   │   └── utils/
│   │       └── constants.js     # Status colors, role colors, formatDate
│   ├── public/
│   │   └── index.html
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
└── docker-compose.yml
```

---

## Quick Start — Docker (Recommended)

### 1. Clone and configure

```bash
git clone <your-repo>
cd defect-tracker
cp backend/.env.example backend/.env
# Edit backend/.env with your SMTP + Slack credentials
```

### 2. Start all services

```bash
docker-compose up -d
```

### 3. Run migrations + seed

```bash
docker-compose exec backend node src/db/migrate.js
docker-compose exec backend node src/db/seed.js
```

### 4. Open the app

- Frontend: http://localhost:3000
- API: http://localhost:5000

---

## Quick Start — Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL 15+

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database URL, JWT secret, SMTP, Slack

# Create the database
createdb defect_tracker

# Run migrations
npm run migrate

# Seed initial data
npm run seed

# Start dev server
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Ensure REACT_APP_API_URL=http://localhost:5000/api

npm start
```

---

## Default Credentials

| Username | Password   | Role  |
|----------|------------|-------|
| admin    | Admin@123  | admin |

> ⚠️ Change the admin password immediately after first login.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable             | Description                              |
|----------------------|------------------------------------------|
| `DATABASE_URL`       | PostgreSQL connection string             |
| `JWT_SECRET`         | Secret key for JWT signing               |
| `SMTP_HOST`          | SMTP server hostname                     |
| `SMTP_PORT`          | SMTP port (587 for TLS, 465 for SSL)     |
| `SMTP_USER`          | SMTP username/email                      |
| `SMTP_PASS`          | SMTP password / app password             |
| `SLACK_BOT_TOKEN`    | Slack Bot OAuth token (xoxb-...)         |
| `SLACK_SIGNING_SECRET` | Slack app signing secret               |
| `SLACK_CHANNEL_ID`   | Channel ID for notifications             |
| `APP_BASE_URL`       | Frontend URL (for email/Slack links)     |
| `PORT`               | Backend server port (default: 5000)      |

### Frontend (`frontend/.env`)

| Variable              | Description                   |
|-----------------------|-------------------------------|
| `REACT_APP_API_URL`   | Backend API URL               |

---

## API Reference

### Auth
| Method | Endpoint         | Description          |
|--------|------------------|----------------------|
| POST   | /api/auth/login  | Login, get JWT token |
| GET    | /api/auth/me     | Get current user     |

### Defects
| Method | Endpoint                     | Description                      |
|--------|------------------------------|----------------------------------|
| GET    | /api/defects                 | List defects (role-filtered)     |
| POST   | /api/defects                 | Create defect (QA/Admin)         |
| GET    | /api/defects/:id             | Get defect with comments + audit |
| PATCH  | /api/defects/:id/status      | Update defect status             |
| POST   | /api/defects/:id/comments    | Add comment                      |
| POST   | /api/defects/:id/attachments | Upload files                     |
| GET    | /api/defects/stats           | Aggregated stats (PM/Admin)      |
| GET    | /api/defects/export/csv      | Export to CSV (PM/Admin)         |

### Projects
| Method | Endpoint                    | Description             |
|--------|-----------------------------|-------------------------|
| GET    | /api/projects               | List projects           |
| POST   | /api/projects               | Create project (Admin)  |
| GET    | /api/projects/:id/modules   | List modules            |
| POST   | /api/projects/:id/modules   | Add module (Admin)      |

### Users
| Method | Endpoint            | Description             |
|--------|---------------------|-------------------------|
| GET    | /api/users          | List users (Admin)      |
| POST   | /api/users          | Create user (Admin)     |
| PATCH  | /api/users/:id      | Update/deactivate user  |
| PUT    | /api/users/:id/password | Reset password     |

---

## Slack Setup

1. Create a Slack app at https://api.slack.com/apps
2. Add a **Slash Command**: `/raise-defect` → Request URL: `https://your-domain/slack/events`
3. Enable **Interactivity** → Request URL: `https://your-domain/slack/events`
4. Add **Bot Token Scopes**: `commands`, `chat:write`, `views:open`, `views:publish`
5. Install the app to your workspace
6. Set `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID` in `.env`
7. Map Slack user IDs to system users via `slack_user_id` in the Admin panel

---

## Seeded Data

On first `npm run seed`:

- **Projects**: "Regression Defects", "PR Defects"
- **Modules per project**: Login, Dashboard, Reports, Lubes Indent, M&P Activity, Customer Profile
- **Admin user**: username `admin`, password `Admin@123`

---

## Role Permissions

| Action                    | QA | Developer | PM | Admin |
|---------------------------|:--:|:---------:|:--:|:-----:|
| Raise defect              | ✅ |            |    | ✅    |
| View own defects          | ✅ |            |    | ✅    |
| View team defects         |    | ✅         |    | ✅    |
| View all defects          |    |            | ✅ | ✅    |
| Change status (Dev flow)  |    | ✅         |    | ✅    |
| Change status (QA flow)   | ✅ |            |    | ✅    |
| Export CSV                |    |            | ✅ | ✅    |
| View charts               |    |            | ✅ | ✅    |
| Manage users              |    |            |    | ✅    |
| Manage modules            |    |            |    | ✅    |

---

## Status Flow

```
Open → Assigned → In Progress → Fixed → Retest → Closed
         ↑          ↑    ↓              ↓    ↓
         └──────────┴── Reopen ────────┘    ↓
                                        Reopen → ...
```

## Color System

| Color    | Meaning                          |
|----------|----------------------------------|
| Teal     | QA actions, success states       |
| Purple   | Developer actions, In Progress   |
| Amber    | PM / Reports / Retest            |
| Red      | Critical / Reopen / Sev1         |
| Green    | Closed / Fixed / Active          |

---

## License

MIT
