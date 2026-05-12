PHASE 1 — FOUNDATION + WHATSAPP INTEGRATION

You are a senior SaaS architect and full-stack engineer.

I already have an existing CRM SaaS.

Current stack:

Frontend:

* Next.js
* React
* TypeScript

Backend:

* Node.js
* Hono
* TypeScript
* Drizzle ORM
* Supabase PostgreSQL

Your task is to build a production-grade “WhatsApp CRM” module inside the existing CRM using ONLY the official Meta WhatsApp Cloud API.

DO NOT use:

* Baileys
* whatsapp-web.js
* Venom
* QR-code WhatsApp hacks
* unofficial APIs

Add a new sidebar module:

WhatsApp CRM

Create the foundational architecture and integration system.

Build:

1. Sidebar Integration
2. WhatsApp Dashboard
3. WhatsApp Account Integration
4. Meta Embedded Signup
5. Webhook System
6. Database Architecture
7. Realtime Infrastructure
8. Basic Contact Sync
9. Core Backend APIs
10. Secure Multi-Tenant Architecture

Add new sidebar section:

WhatsApp CRM

Submenus:

* Dashboard
* Integrations
* Inbox
* Contacts
* Campaigns
* Templates
* Flow Builder
* Analytics
* Settings

Only build pages needed for Phase 1.
Other pages can use placeholder layouts.

====================================================

1. DASHBOARD PAGE
   ====================================================

Create a clean WhatsApp dashboard showing:

* Connected WhatsApp accounts
* Messages sent today
* Active conversations
* Connection status
* Recent activity
* Recent webhook events

Add:

* modern cards
* charts
* responsive UI
* SaaS design system

Implement official Meta WhatsApp Cloud API integration.

Build:

* Meta Embedded Signup flow
* WABA connection
* Phone number connection
* Access token storage
* Business profile sync
* Connection status
* Disconnect/reconnect

Build webhook endpoints using Hono.

Handle:

* incoming messages
* delivery status
* read receipts
* message failures
* template updates

Store ALL webhook events in database.

Create scalable Drizzle schemas.

Required tables:

* whatsapp_accounts
* whatsapp_webhook_logs
* whatsapp_contacts
* conversations
* messages
* workspace_integrations

Each table must support:

* multi-tenant SaaS architecture
* workspace isolation
* audit timestamps

Build realtime architecture for future inbox system.

Use:

* Socket.IO or websocket-compatible architecture
* realtime events
* typing states foundation
* live message sync foundation

Use:

* Hono
* TypeScript
* Drizzle ORM
* Supabase PostgreSQL

Build:

* modular architecture
* service layer
* repository pattern
* validation layer
* error handling
* logging
* secure token storage

Generate complete API routes for:

* integration connect
* webhook verify
* webhook receive
* account sync
* contacts sync
* dashboard stats

Use:

* Next.js App Router
* TypeScript
* reusable components
* clean folder structure
* modern dashboard UI
* responsive layout

Create:

* integration screens
* dashboard widgets
* connection flow UI
* loading/error states

Implement:

* workspace isolation
* RBAC-ready structure
* secure token handling
* validation
* rate limiting
* API protection

Generate:

1. Full folder structure
2. Drizzle schemas
3. Hono routes
4. Services
5. Meta integration logic
6. Webhook handlers
7. Frontend pages
8. UI components
9. Environment variables
10. Setup guide
11. Step-by-step implementation

Build this as scalable production-grade SaaS architecture.
