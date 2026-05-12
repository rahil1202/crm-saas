# WhatsApp CRM — Phase 1 setup guide

This document covers the Phase 1 foundation for the **WhatsApp CRM** module inside the existing CRM SaaS. It uses **only the official Meta WhatsApp Cloud API**. There is no Baileys, whatsapp-web.js, Venom, QR-code trick, or unofficial API anywhere in the stack.

## Scope of Phase 1

- Sidebar module with 9 submenus: Dashboard, Integrations, Inbox, Contacts, Campaigns, Templates, Flow Builder, Analytics, Settings
- Production-grade Dashboard with stat cards, weekly outbound chart, connection health, recent activity, recent webhook events
- Integrations page with Meta Embedded Signup, WABA/Phone Number mapping, per-workspace webhook URL + verify token, sync/disconnect/reconnect
- Multi-tenant database architecture (already shipped in earlier migrations: `whatsapp_workspaces`, `whatsapp_webhook_events`, `whatsapp_sessions`, `whatsapp_outbox`, `whatsapp_message_events`, `whatsapp_templates`, `whatsapp_media_assets`, `whatsapp_pricing_rate_cards`, plus `social_conversations` and `social_messages` for conversations/messages)
- Webhook system with per-workspace signed verify + HMAC and audit log
- Realtime foundation (polling bus today, ready for Supabase realtime / WS in Phase 2)
- Inbox, Contacts, Campaigns, Templates, Flow Builder, Analytics, Settings ship as scaffolded placeholder layouts (Phase 2)

## Architecture

```
frontend/src/app/dashboard/whatsapp-crm/          # Next.js app router pages
  page.tsx                                        # Dashboard
  integrations/page.tsx                           # Integrations (full)
  inbox/page.tsx                                  # Placeholder (Phase 2)
  contacts/page.tsx                               # Placeholder (Phase 2)
  campaigns/page.tsx                              # Placeholder (Phase 2)
  templates/page.tsx                              # Placeholder (Phase 2)
  flow-builder/page.tsx                           # Placeholder (Phase 2)
  analytics/page.tsx                              # Placeholder (Phase 2)
  settings/page.tsx                               # Placeholder (Phase 2)

frontend/src/features/whatsapp-crm/               # Shared feature module
  types.ts                                        # DTOs shared with backend
  format.ts                                       # Time, compact number, tone helpers
  realtime.ts                                     # Realtime subscription foundation
  dashboard-page.tsx                              # Dashboard implementation
  integrations-page.tsx                           # Integrations implementation
  components/                                     # Cards, charts, lists

backend/src/modules/whatsapp/                     # Hono module
  route.ts                                        # Tenant-isolated routes
  controller.ts                                   # Workspaces, templates, messaging
  dashboard-controller.ts                         # Stats, connections, events, activity
  schema.ts                                       # Zod request schemas

backend/src/lib/whatsapp-runtime.ts               # Graph API client, webhook verify,
                                                  # outbox, message state, session
                                                  # management
backend/src/lib/whatsapp-workspace.ts             # Workspace and phone mapping
backend/src/lib/whatsapp-pricing.ts               # Pricing and cost estimates
backend/src/lib/integration-crypto.ts             # Encrypted token storage
backend/src/middleware/auth.ts                    # requireAuth, requireTenant, requireRole
backend/src/middleware/security.ts                # protectWebhook, HMAC verification
```

## Required backend environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

```env
# Meta App used for Embedded Signup
WHATSAPP_META_APP_ID=
WHATSAPP_META_APP_SECRET=

# Embedded Signup configuration from App Dashboard → WhatsApp → Configuration
WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=
WHATSAPP_EMBEDDED_SIGNUP_REDIRECT_URI=http://localhost:3000/dashboard/whatsapp-crm/integrations

# Defaults only — per-workspace credentials are stored encrypted in the DB
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

# Graph API version
WHATSAPP_GRAPH_API_VERSION=v23.0

# Encrypted secret used to encrypt access tokens and app secrets at rest
INTEGRATION_CRYPTO_SECRET=
```

The frontend reads `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SUPABASE_URL` — already wired from `frontend/.env.example`.

## Meta App configuration

1. Create a Meta App at https://developers.facebook.com/apps (type: Business).
2. Add **WhatsApp** as a product.
3. Enable **Embedded Signup** under WhatsApp → Configuration.
4. Copy the App ID into `WHATSAPP_META_APP_ID` and the App Secret into `WHATSAPP_META_APP_SECRET`.
5. Copy the Embedded Signup configuration ID into `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`.
6. Add the redirect URI `http(s)://<your-frontend>/dashboard/whatsapp-crm/integrations` to both the App Login Settings and `WHATSAPP_EMBEDDED_SIGNUP_REDIRECT_URI`.

## Webhook configuration

After connecting a WhatsApp account through Embedded Signup, the integrations page shows:

- `Callback URL`: `https://<backend>/api/v1/public/whatsapp/webhook/<webhookKey>`
- `Verify token`: a one-time token shown in the success toast and the Integrations page

Paste both into Meta App → WhatsApp → Configuration → Webhook, subscribe to `messages`, `message_status`, and optional fields. The backend automatically validates `x-hub-signature-256` using the per-workspace app secret stored encrypted.

## Running locally

```powershell
# Terminal 1 — backend (Bun + Hono)
cd backend
cp .env.example .env
# ... fill in .env ...
bun install
bun run db:push
bun run dev

# Terminal 2 — frontend (Next.js)
cd frontend
cp .env.example .env
# ... fill in .env ...
npm install
npm run dev
```

Then visit `http://localhost:3000/dashboard/whatsapp-crm`.

## API surface added in Phase 1

All endpoints are tenant-scoped via `requireAuth` + `requireTenant` and all writes require `requireRole("admin")`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/whatsapp/dashboard/stats` | Stat cards + 7-day send series |
| GET | `/api/v1/whatsapp/dashboard/connections` | Workspace summaries with status |
| GET | `/api/v1/whatsapp/dashboard/recent-events` | Recent webhook events (audit) |
| GET | `/api/v1/whatsapp/dashboard/recent-activity` | Recent inbound/outbound messages |

These join existing endpoints such as:

- `GET /api/v1/whatsapp/onboarding/status` — setup checklist
- `POST /api/v1/whatsapp/onboarding/embedded/exchange` — Embedded Signup token exchange
- `GET/POST/PATCH/DELETE /api/v1/whatsapp-workspaces` — account management
- `POST /api/v1/whatsapp/workspaces/:id/sync-meta` — refresh Meta status
- `GET /api/v1/public/whatsapp/webhook/:webhookKey` — signed webhook verify + receive

## Security posture

- **Tenant isolation**: every WhatsApp query is filtered by `companyId` resolved from the authenticated membership; cross-tenant access is rejected by `assertTenantStore`.
- **RBAC-ready**: writes require `admin`; reads are gated by `requireTenant`. Module access fits the existing `CompanyModuleKey` pattern and can be slotted into custom roles.
- **Secrets at rest**: access tokens, verify tokens, and app secrets are encrypted using `INTEGRATION_CRYPTO_SECRET` via `integration-crypto.ts`.
- **Webhook integrity**: per-workspace verify tokens and HMAC signatures; replay protection via `guardWebhookReplay`; rate limiting and max body size via `protectWebhook`.
- **Input validation**: every endpoint validates with Zod (`validateJson`, `validateQuery`).
- **Error handling**: consistent API envelope (`ok`, `ApiError`, `errorMiddleware`). Frontend maps these through `ApiError`.
- **Logging**: request IDs, security event audit, tenant isolation violation log.
- **Rate limiting**: already applied to webhook and auth-sensitive routes via `middleware/security.ts`.

## What's next (Phase 2+)

- Inbox with realtime message stream, typing indicators, service-window prompts, and template fallback
- Contacts directory and segment builder
- Campaigns with throttle-aware delivery and cost preview
- Template designer with Meta-approved categories, variables, and media
- Flow builder over the existing chatbot-flows engine
- Analytics drill-down reports, CSV export
- Supabase realtime or dedicated WebSocket gateway replacing the polling bus in `realtime.ts`


---

# Phase 2 — Live Chat Inbox + Contact Management

Phase 2 builds the realtime inbox, contact management, media messaging, internal notes, tags, priority, and team inbox features on top of the Phase 1 foundation.

## What's new

### Database (migration `drizzle/0048_whatsapp_inbox_phase2.sql`)

Additive migration, no breaking changes:

- `social_conversations` gains `pinned_at`, `archived_at`, `priority`, `agent_last_read_at`, `tag_ids`
- `social_messages` gains `edited_at`, `deleted_at`, `reactions`, `read_at`, `delivered_at`, `failed_at`
- New tables: `conversation_tags`, `conversation_notes`, `conversation_participants`, `message_attachments`, `message_status_logs`, `contact_tags`, `whatsapp_contact_profiles`

Every table carries `company_id` with cascade-on-delete and indexed hot paths.

### Backend architecture

```
backend/src/modules/whatsapp-inbox/         # New module
  route.ts                                  # Tenant + RBAC-gated routes
  controller.ts                             # HTTP surface
  schema.ts                                 # Zod request schemas

backend/src/lib/whatsapp-inbox.ts           # Phase 2 business logic
backend/src/lib/whatsapp-realtime.ts        # In-process SSE pub/sub
backend/src/lib/whatsapp-media.ts           # Supabase / local media storage
```

### API routes (Phase 2)

All routes are tenant-scoped via `requireAuth` + `requireTenant`. Mutations require `requireRole("admin")`.

**Realtime**

| Method | Path | Description |
| --- | --- | --- |
| GET | `/whatsapp/realtime` | Server-Sent Events stream, per-tenant |

**Inbox + conversations**

| Method | Path | Description |
| --- | --- | --- |
| GET | `/whatsapp/inbox` | Paginated list, filters: status, priority, tag, pinned, archived, assignedToMe, unassigned, search, cursor |
| GET | `/whatsapp/inbox/:conversationId` | Conversation detail |
| GET | `/whatsapp/inbox/:conversationId/messages` | Paginated messages (cursor by `sentAt`) with attachments |
| PATCH | `/whatsapp/inbox/:conversationId` | Update status, assignee, priority, pinned/archived, tags, takeover |
| POST | `/whatsapp/inbox/:conversationId/read` | Clear unread + set agent cursor |
| POST | `/whatsapp/inbox/:conversationId/typing` | Emit typing indicator |

**Send**

| Method | Path | Description |
| --- | --- | --- |
| POST | `/whatsapp/inbox/:conversationId/messages/text` | Send text message |
| POST | `/whatsapp/inbox/:conversationId/messages/template` | Send approved template |
| POST | `/whatsapp/inbox/:conversationId/messages/media` | Send media by `attachmentId` |
| POST | `/whatsapp/inbox/:conversationId/messages/interactive` | Send interactive payload |

**Notes + mentions**

| Method | Path | Description |
| --- | --- | --- |
| GET | `/whatsapp/inbox/:conversationId/notes` | List internal notes |
| POST | `/whatsapp/inbox/:conversationId/notes` | Post a note with optional mentions |
| DELETE | `/whatsapp/inbox/notes/:noteId` | Soft-delete a note |

**Tags**

| Method | Path | Description |
| --- | --- | --- |
| GET | `/whatsapp/tags` | List tags |
| POST | `/whatsapp/tags` | Create tag |
| PATCH | `/whatsapp/tags/:tagId` | Update tag |
| DELETE | `/whatsapp/tags/:tagId` | Soft-delete tag and unlink |

**Contacts**

| Method | Path | Description |
| --- | --- | --- |
| GET | `/whatsapp/contacts` | Filter: search, tagId, engagementStatus, optInStatus, cursor |
| POST | `/whatsapp/contacts` | Upsert contact profile |
| POST | `/whatsapp/contacts/bulk-import` | Bulk import up to 2000 rows |
| GET | `/whatsapp/contacts/export` | CSV export |
| PUT | `/whatsapp/contacts/:contactHandle/tags` | Replace a contact's tags |

**Attachments**

| Method | Path | Description |
| --- | --- | --- |
| POST | `/whatsapp/attachments` | Upload a file (multipart, ≤ 95 MB) |
| GET | `/whatsapp/attachments/:attachmentId/content` | Download or stream attachment |

### Realtime event types

Published by the backend whenever inbox state changes:

- `message.created` — new inbound or outbound message
- `message.status` — delivery lifecycle (sent, delivered, read, failed)
- `conversation.updated` — any mutation (pin, archive, priority, tags, status)
- `conversation.assigned` — assignee change
- `conversation.note` — new internal note
- `conversation.typing` — typing indicator
- `contact.updated` — contact profile changed

### Frontend architecture

```
frontend/src/app/dashboard/whatsapp-crm/inbox/page.tsx     # full realtime inbox
frontend/src/app/dashboard/whatsapp-crm/contacts/page.tsx  # contact manager

frontend/src/features/whatsapp-crm/
  inbox-page.tsx                                           # 3-column inbox
  contacts-page.tsx                                        # contacts UI
  use-realtime-inbox.ts                                    # EventSource SSE client
  inbox/
    conversation-list.tsx                                  # sidebar list with pins, tags, unread
    message-bubble.tsx                                     # bubble with tick states + media
    composer.tsx                                           # text, emoji, media composer
    conversation-details.tsx                               # assign, tag, priority, notes sidebar
```

The inbox uses a 3-column layout (conversations | chat | details) on desktop and single-column on mobile. Every mutation is optimistic when safe and relies on the SSE channel for fan-out to other agents viewing the same company.

### Security + multi-tenant posture

- Every query carries `companyId` from `requireTenant`. New tables all have `company_id` with FK cascade.
- SSE stream scopes events by `companyId`; subscribers only receive their tenant's events.
- Media upload honors Meta's 95 MB cap and defaults to Supabase Storage with a local fallback in dev.
- Tag deletion unlinks from `social_conversations.tag_ids` and `contact_tags` atomically.
- Admin-gated write routes: PATCH, POST (send/media/tags/contacts/attachments) require `admin`.
- Member-readable endpoints: inbox, messages, notes, contacts listings, tags, realtime stream, attachment content.
- Webhook ingest (`ingestWhatsappReply`) now also publishes realtime events and upserts contact engagement — best-effort, wrapped in try/catch so webhook ingest never fails because of downstream features.

### What shipped as placeholder vs. full

| Submenu | Phase 2 status |
| --- | --- |
| Dashboard | Full (Phase 1) |
| Integrations | Full (Phase 1) |
| **Inbox** | **Full (Phase 2)** |
| **Contacts** | **Full (Phase 2)** |
| Campaigns | Placeholder |
| Templates | Placeholder |
| Flow Builder | Placeholder |
| Analytics | Placeholder |
| Settings | Placeholder |

### Running Phase 2

No new env vars required. The migration runs on next `bun run db:push` or via `bun run src/db/scripts/migrate.ts`.

```powershell
# Apply migrations
cd backend
bun run src/db/scripts/migrate.ts

# Start backend + frontend as before
bun run dev
cd ../frontend
npm run dev
```

Visit `/dashboard/whatsapp-crm/inbox` to see the live chat inbox, and `/dashboard/whatsapp-crm/contacts` for contact management. The SSE stream at `/api/v1/whatsapp/realtime` drives live updates.

### What's next (Phase 3+)

- Campaigns with audience builder, throttled sending, pre-flight cost
- Template designer with Meta-approved category workflow
- Flow Builder visual canvas over chatbot-flows engine
- Analytics drill-down with CSV export
- Settings for routing rules, auto-reply, realtime transport
- Redis or Supabase Realtime backing the SSE bus for multi-node deployments


---

# Phase 3 — Campaigns + Template System + Analytics

Phase 3 builds the broadcast campaign engine, template management UI, queue system, scheduling, audience segmentation, retry system, delivery tracking, and analytics dashboard.

## Architecture

```
Campaign → Fan-out into whatsapp_campaign_contacts
         → Queue into whatsapp_outbox (staggered by MPS)
         → Existing outbox worker (processQueuedWhatsappOutbox) handles rate-limited delivery
         → Message events (webhook) update campaign_contacts delivery state
         → Analytics aggregated from campaign counters + daily snapshots
```

**Key design decision**: campaigns NEVER send messages in a loop. They enqueue into the existing `whatsapp_outbox` with time-staggered `nextAttemptAt` values calculated from the campaign's `throttle_mps`. The outbox worker handles actual Meta API calls with exponential backoff and retry.

## Database (migration `drizzle/0049_whatsapp_campaigns.sql`)

New tables:
- `whatsapp_campaigns` — campaign definition, lifecycle, counters, cost tracking
- `whatsapp_campaign_contacts` — per-contact delivery state (pending → queued → sent → delivered → read → replied | failed)
- `whatsapp_campaign_logs` — audit log of campaign events
- `whatsapp_analytics_snapshots` — daily aggregated metrics

Additive change:
- `whatsapp_outbox` gains `campaign_id` FK for attribution

## Backend

### Service layer (`lib/whatsapp-campaign-engine.ts`)

- `createCampaign` — create with template, schedule, throttle config
- `addCampaignAudience` — manual phone list (deduped, batched 500)
- `addAudienceFromSegment` — pull from `whatsapp_contact_profiles` by engagement/opt-in/tag
- `startCampaign` → `fanOutCampaignBatch` — stagger-enqueue into outbox
- `pauseCampaign` — cancel queued outbox items
- `cancelCampaign` — cancel all pending
- `duplicateCampaign` — copy config as new draft
- `processCampaignQueue` — called by runtime worker, continues fan-out for active campaigns
- `processScheduledCampaigns` — starts campaigns whose `scheduled_at` has arrived
- `updateCampaignContactStatus` — webhook callback updates per-contact delivery state + campaign counters
- `getCampaignAnalytics` — funnel + rates for a single campaign
- `getGlobalAnalytics` — aggregate totals, daily series, template performance

### Runtime worker integration

`processCampaignQueue()` and `processScheduledCampaigns()` are called every tick in the existing `automation-runtime.ts` worker loop, right after `processQueuedWhatsappOutbox`. This means:
- Scheduled campaigns auto-start when their time arrives
- Active campaigns continue fan-out in batches of 500
- The outbox worker handles actual delivery with rate limiting

### Rate limiting strategy

1. **Campaign-level**: `throttle_mps` (default 30) controls how many messages per second are enqueued
2. **Workspace-level**: existing `WHATSAPP_PHONE_MPS` (default 60) in the outbox worker caps actual API calls
3. **Retry**: `retry_max_attempts` (default 3) with `retry_backoff_seconds` (default 60) exponential backoff
4. **Priority**: campaign messages use priority 200 (lower than inbox messages at 100, test sends at 50)

### API routes (`modules/whatsapp-campaigns/`)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/whatsapp/campaigns` | List campaigns (filter by status) |
| GET | `/whatsapp/campaigns/:id` | Get campaign detail |
| POST | `/whatsapp/campaigns` | Create campaign |
| PATCH | `/whatsapp/campaigns/:id` | Update draft campaign |
| DELETE | `/whatsapp/campaigns/:id` | Soft-delete |
| GET | `/whatsapp/campaigns/:id/audience` | List audience contacts |
| POST | `/whatsapp/campaigns/:id/audience` | Add manual audience |
| POST | `/whatsapp/campaigns/:id/audience/segment` | Add from contact segment |
| POST | `/whatsapp/campaigns/:id/start` | Start sending |
| POST | `/whatsapp/campaigns/:id/pause` | Pause (cancel queued) |
| POST | `/whatsapp/campaigns/:id/cancel` | Cancel campaign |
| POST | `/whatsapp/campaigns/:id/duplicate` | Duplicate as draft |
| GET | `/whatsapp/campaigns/:id/analytics` | Campaign funnel + rates |
| GET | `/whatsapp/campaigns/:id/logs` | Campaign event log |
| GET | `/whatsapp/analytics` | Global analytics (days param) |
| POST | `/whatsapp/templates/test-send` | Test send a template |

## Frontend

### Campaigns page (`/dashboard/whatsapp-crm/campaigns`)
- Campaign builder: name, template picker, schedule, throttle, audience (paste phones)
- Campaign list with status badges, delivery stats, action buttons (start/pause/cancel/duplicate/delete)
- Audience can also be added from segments after creation

### Templates page (`/dashboard/whatsapp-crm/templates`)
- Grid of all templates with status badges, body preview, variables, quality score
- Sync from Meta button (pulls all templates from WABA)
- Filter by status (approved/draft/rejected/paused)
- Test send panel: pick template, enter phone, send

### Analytics page (`/dashboard/whatsapp-crm/analytics`)
- Period selector (7/14/30/90 days)
- Stat cards: campaigns, messages sent, delivery rate, read rate
- Daily send volume chart (SparkBars)
- Delivery funnel visualization (sent → delivered → read → replied → failed)
- Template performance table with delivery % and read %

## Campaign lifecycle

```
draft → scheduled (if scheduleType=scheduled)
draft → sending (immediate start)
scheduled → sending (auto-start by worker when time arrives)
sending → paused (cancel queued outbox items)
paused → sending (resume fan-out)
sending → completed (all contacts processed)
any → canceled (cancel all pending)
```

## What shipped as full vs. placeholder

| Submenu | Status |
| --- | --- |
| Dashboard | Full (Phase 1) |
| Integrations | Full (Phase 1) |
| Inbox | Full (Phase 2) |
| Contacts | Full (Phase 2) |
| **Campaigns** | **Full (Phase 3)** |
| **Templates** | **Full (Phase 3)** |
| **Analytics** | **Full (Phase 3)** |
| Flow Builder | Placeholder |
| Settings | Placeholder |

## Verification

- Backend `tsc --noEmit` → 0 errors
- Frontend `tsc --noEmit` → 0 errors in WhatsApp CRM scope
- ESLint → 0 errors, 0 warnings after cleanup
- Migration is additive, applies on next `bun run src/db/scripts/migrate.ts`


---

# Phase 4 — Flow Builder + Automations + AI Workflows

Phase 4 extends the existing chatbot-flow engine with 10 new node types, keyword automation, automation rules, AI reply architecture, human handoff, and a visual flow builder UI.

## Architecture

```
Inbound message → ingestWhatsappReply
  → evaluateKeywordTriggers (exact/contains/starts_with/regex)
    → matched? → execute action (reply, assign_flow, assign_agent, assign_tag, human_handoff, create_task)
  → evaluateAutomationRules (condition-based)
    → matched? → execute action
  → resumeActiveChatbotFlowForConversation (existing flow engine)
```

The automation evaluation is best-effort and wrapped in try/catch so webhook ingest is never blocked.

## New node types (added to chatbot-flows schema)

| Node type | Description |
| --- | --- |
| `delay` | Wait N seconds before continuing |
| `send_template` | Send an approved Meta template |
| `webhook` | Call an external URL (GET/POST/PUT) |
| `crm_update` | Create/update lead, customer, deal, or contact |
| `assign_agent` | Assign conversation to a specific user or round-robin |
| `assign_tag` | Add a tag to the conversation |
| `create_task` | Create a CRM task with due date |
| `human_handoff` | Enable human takeover + optional assignment |
| `ai_reply` | Generate a reply using an LLM (architecture ready, pluggable) |
| `keyword_trigger` | Match keywords to route flow branches |

All node types are validated by the existing `validateFlowDefinition` function and execute within the `executeFlowUntilPauseOrEnd` runtime.

## Database (migration `drizzle/0050_whatsapp_flow_builder_phase4.sql`)

New tables:
- `whatsapp_keyword_triggers` — keyword → action mapping with match types
- `whatsapp_automation_rules` — condition-based rules with trigger/action config
- `whatsapp_flow_analytics_daily` — per-flow daily execution metrics

## Backend

### Service layer (`lib/whatsapp-flow-automation.ts`)

- `evaluateKeywordTriggers` — match inbound message against active triggers
- `evaluateAutomationRules` — evaluate condition-based rules
- `executeKeywordAction` / `executeRuleAction` — dispatch actions
- CRUD: `listKeywordTriggers`, `upsertKeywordTrigger`, `deleteKeywordTrigger`
- CRUD: `listAutomationRules`, `upsertAutomationRule`, `deleteAutomationRule`

### API routes (`modules/whatsapp-flows/`)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/whatsapp/keyword-triggers` | List keyword triggers |
| POST | `/whatsapp/keyword-triggers` | Create trigger |
| PATCH | `/whatsapp/keyword-triggers/:triggerId` | Update trigger |
| DELETE | `/whatsapp/keyword-triggers/:triggerId` | Delete trigger |
| GET | `/whatsapp/automation-rules` | List automation rules |
| POST | `/whatsapp/automation-rules` | Create rule |
| PATCH | `/whatsapp/automation-rules/:ruleId` | Update rule |
| DELETE | `/whatsapp/automation-rules/:ruleId` | Delete rule |
| GET | `/whatsapp/flow-analytics` | Per-flow execution stats |

### Webhook integration

`ingestWhatsappReply` now calls `evaluateKeywordTriggers` → `evaluateAutomationRules` after contact upkeep. If a keyword matches, the automation rules are skipped (first-match wins). Both are best-effort.

## Frontend (`/dashboard/whatsapp-crm/flow-builder`)

- Execution stats (total, completed, failed, completion rate)
- Node type palette showing all 13 supported node types
- Keyword trigger builder (keyword, match type, action, reply body)
- Keyword trigger list with delete
- Automation rules list with run count and last-run time
- Flow list with per-flow execution metrics (total, completion %, failed, running)
- Links to existing Chatbot Flows module for visual canvas editing

## AI architecture

The `ai_reply` node type is schema-ready with:
- `systemPrompt` — configurable per node
- `model` — defaults to `gpt-4o-mini`, swappable
- `maxTokens`, `temperature` — generation params
- `captureKey` — store AI response in flow context
- `fallbackBody` — sent if AI call fails

The runtime execution for `ai_reply` nodes will call an LLM provider (OpenAI, Anthropic, etc.) when the integration is configured. The architecture is pluggable — add a `lib/whatsapp-ai.ts` service that the flow engine calls, with provider selection from env vars.

## Scalability design

- **Keyword evaluation**: O(n) scan of active triggers per inbound message. For high-volume tenants, add a trie or Redis-backed lookup.
- **Automation rules**: evaluated sequentially by priority. First match wins.
- **Flow execution**: async, persisted to `conversation_states`. Resumes on next inbound message.
- **Multi-tenant**: all queries scoped by `companyId`. Triggers and rules are per-tenant.
- **Distributed workers**: the runtime worker loop already handles fan-out. For multi-node, add Redis-backed job claiming on the outbox and campaign queue.

## What shipped as full vs. placeholder

| Submenu | Status |
| --- | --- |
| Dashboard | Full (Phase 1) |
| Integrations | Full (Phase 1) |
| Inbox | Full (Phase 2) |
| Contacts | Full (Phase 2) |
| Campaigns | Full (Phase 3) |
| Templates | Full (Phase 3) |
| Analytics | Full (Phase 3) |
| **Flow Builder** | **Full (Phase 4)** |
| Settings | Placeholder |

## Verification

- Backend `tsc --noEmit` → 0 errors
- Frontend `tsc --noEmit` → 0 errors in WhatsApp CRM scope
- ESLint → 0 errors, 0 warnings after cleanup
- Migration is additive, applies on next `bun run src/db/scripts/migrate.ts`


---

# Phase 5 — Settings (final page)

The last placeholder page is now a full implementation.

## Database (`drizzle/0051_whatsapp_crm_settings.sql`)

New table: `whatsapp_crm_settings` — per-company singleton with:
- Default workspace, priority, auto-archive
- Auto-reply (enabled, body, outside-hours-only, business hours with timezone + schedule)
- Assignment routing (manual, round_robin, least_busy) with max concurrent and timeout
- Webhook health alerting (enabled, threshold)
- Realtime transport preference (sse, polling, websocket)
- Campaign compliance (opt-in required)

## API routes (`modules/whatsapp-settings/`)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/whatsapp/settings` | Get or create settings singleton |
| PATCH | `/whatsapp/settings` | Update any subset of settings |

## Frontend (`/dashboard/whatsapp-crm/settings`)

6 settings cards:
- **General**: default workspace, priority, auto-archive, realtime transport
- **Auto-reply**: enable/disable, message body, outside-hours toggle, timezone
- **Assignment routing**: strategy, max concurrent, unassigned timeout
- **Webhook health**: alert toggle, failure threshold
- **Campaign compliance**: opt-in requirement toggle

All changes save immediately on interaction (no submit button needed).

## Final module status

| Submenu | Status |
| --- | --- |
| Dashboard | ✅ Full |
| Integrations | ✅ Full |
| Inbox | ✅ Full |
| Contacts | ✅ Full |
| Campaigns | ✅ Full |
| Templates | ✅ Full |
| Analytics | ✅ Full |
| Flow Builder | ✅ Full |
| **Settings** | **✅ Full** |

**All 9 submenus of the WhatsApp CRM module are now production-grade implementations.**
