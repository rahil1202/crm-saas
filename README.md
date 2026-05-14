# CRM SaaS

A full-stack multi-tenant CRM platform with workflow automation, outreach, forms, document management, partner access controls, and a dedicated WhatsApp CRM workspace.

This repository is split into:
- `frontend/` - Next.js 16 + React 19 application
- `backend/` - Bun + Hono API server with Drizzle ORM and PostgreSQL

## Table of Contents
- [What This Project Includes](#what-this-project-includes)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Quick Start (Local Development)](#quick-start-local-development)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [Database and Migrations](#database-and-migrations)
- [Testing](#testing)
- [Key Backend API Domains](#key-backend-api-domains)
- [Security and Multi-Tenancy Notes](#security-and-multi-tenancy-notes)
- [Troubleshooting](#troubleshooting)
- [Contributing Notes](#contributing-notes)

## What This Project Includes
Core CRM modules available in the product include:
- Dashboard and analytics
- Leads, deals, customers, and tasks
- Meetings and booking pages
- Campaigns and templates
- Automation and sequences
- Documents and file management
- Forms and public form capture
- Partners and role-scoped access
- Notifications
- Social and integrations
- WhatsApp CRM (inbox, contacts, templates, campaigns, flow builder, settings, analytics)
- Outreach and lead intelligence

## Architecture
- **Frontend**: Next.js App Router UI that consumes backend APIs
- **Backend**: Hono REST API mounted under `/api/v1`
- **Database**: PostgreSQL accessed through Drizzle ORM
- **Auth**: Supabase-backed authentication + JWT/session handling on backend
- **Background worker**: Optional runtime worker for automation polling/execution
- **Integrations**: Pluggable modules for WhatsApp (Meta Cloud API), Gmail OAuth outreach, SMTP/Resend, and others

## Tech Stack
### Frontend (`frontend/`)
- Next.js `^16.0.0`
- React `^19.0.0`
- TypeScript `^5.9.0`
- Tailwind CSS 4 + ESLint

### Backend (`backend/`)
- Bun runtime
- Hono web framework
- Drizzle ORM + drizzle-kit migrations
- PostgreSQL
- Zod validation

## Repository Structure
```text
crm-saas/
  frontend/               # Next.js frontend
    src/app/              # App Router routes/pages
    src/features/         # Domain feature modules
  backend/                # Bun + Hono backend
    src/app/              # Hono app bootstrap and route mounting
    src/modules/          # API domains (auth, leads, deals, whatsapp, etc.)
    src/lib/              # Shared services/runtime logic
    src/db/               # DB client, schema, migrate/seed scripts
    drizzle/              # SQL migrations
    tests/                # Test suites
```

## Prerequisites
Install the following before setup:
- Node.js 20+
- Bun 1.2+
- PostgreSQL 14+
- A Supabase project (for auth/storage integration)

Optional but recommended for full feature coverage:
- Meta developer app + WhatsApp Cloud API credentials
- Google OAuth credentials (Gmail outreach integration)
- Resend and/or SMTP credentials for email sending

## Quick Start (Local Development)
### 1) Clone and install dependencies
```bash
git clone <your-repo-url>
cd crm-saas

cd frontend
npm install

cd ../backend
bun install
```

### 2) Configure environment files
```bash
# from repository root
copy frontend\.env.example frontend\.env
copy backend\.env.example backend\.env
```
On macOS/Linux use `cp` instead of `copy`.

### 3) Create local PostgreSQL database
Create a database named `crm_saas` (or adjust `DATABASE_URL` in `backend/.env`).

### 4) Start both services
Terminal 1:
```bash
cd backend
bun run dev
```

Terminal 2:
```bash
cd frontend
npm run dev
```

### 5) Access local apps
- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8787/health`
- Backend API base: `http://localhost:8787/api/v1`

## Environment Configuration
Use the provided `.env.example` files as the source of truth:
- `frontend/.env.example`
- `backend/.env.example`

### Critical backend variables
- `DATABASE_URL` - PostgreSQL connection string
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`
- `FRONTEND_URL`, `BACKEND_URL`
- `AUTH_CALLBACK_URL`

### Optional integration variables
- WhatsApp: `WHATSAPP_*`
- Gmail OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_GMAIL_REDIRECT_URI`
- Email fallback/provider: `RESEND_*` and/or `SMTP_*`
- Runtime worker controls: `RUNTIME_WORKER_ENABLED`, `RUNTIME_POLL_INTERVAL_MS`

## Running the Application
### Frontend scripts (`frontend/package.json`)
- `npm run dev` - Start Next.js dev server (Turbopack)
- `npm run build` - Production build
- `npm run start` - Start production server
- `npm run lint` - Lint frontend

### Backend scripts (`backend/package.json`)
- `bun run dev` - Start API with watch mode
- `bun run start` - Start API once
- `bun run check` - Type-check TypeScript
- `bun run build` - Compile TypeScript
- `bun run test` - Run test suite
- `bun run db:migrate` - Apply migrations
- `bun run db:seed` - Seed local data

## Database and Migrations
The backend runs migrations at startup from `backend/src/index.ts`.

Manual commands are also available:
```bash
cd backend
bun run db:migrate
bun run db:seed
```

Migration SQL files live in `backend/drizzle/`.

## Testing
Backend test suites are located in `backend/tests/`.

Run tests with:
```bash
cd backend
bun run test
```

Recommended local validation before opening PRs:
```bash
cd frontend && npm run lint
cd ../backend && bun run check && bun run test
```

## Key Backend API Domains
Mounted under `/api/v1`, including but not limited to:
- auth, admin, companies, company-roles, users
- customers, leads, deals, tasks, meetings
- campaigns, templates, automation, sequences
- reports, notifications, settings, documents, forms
- partners, social, outreach, lead-intelligence
- WhatsApp (`whatsapp`, `whatsapp-inbox`, `whatsapp-campaigns`, `whatsapp-flows`, `whatsapp-settings`)
- google integrations and public runtime endpoints

See implementations under `backend/src/modules/`.

## Security and Multi-Tenancy Notes
- Keep secrets only in `.env`; never commit real credentials.
- Use strong token secrets in non-local environments.
- Restrict CORS using the correct `FRONTEND_URL`.
- Review company/role boundaries when changing access logic.
- Validate all new environment fields through backend config parsing.

## Troubleshooting
- **Frontend cannot reach backend**: Verify `NEXT_PUBLIC_API_URL`, backend port, and CORS (`FRONTEND_URL`).
- **Supabase auth errors**: Re-check Supabase URL and keys in both frontend and backend env files.
- **Database connection failures**: Confirm PostgreSQL is running and `DATABASE_URL` is correct.
- **OAuth callback mismatch**: Ensure redirect URLs exactly match provider console settings.
- **WhatsApp webhook failures**: Validate webhook tokens/app secret and public callback reachability.

## Contributing Notes
- Keep runtime code isolated within this repo (no external app runtime imports).
- Prefer feature-oriented changes (`frontend/src/features`, `backend/src/modules`).
- Add migration files for schema changes and tests for backend behavior updates.
- Update `.env.example` whenever adding/changing required environment variables.
