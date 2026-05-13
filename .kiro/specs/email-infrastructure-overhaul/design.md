# Design Document: Email Infrastructure Overhaul

## Overview

This overhaul addresses two tightly related gaps in the CRM's email infrastructure:

1. **Rate-Limited Email Campaign Worker** — the current `queueCampaignDelivery` fans out all campaign messages synchronously via `Promise.all`, then relies on the generic `processQueuedEmailMessages(25)` call in `runtimeTick` to drain them. There is no per-campaign throttle, no completion detection, and no conflict guard against double-launching. The new Campaign Worker mirrors the WhatsApp campaign engine pattern: it queries active campaigns on every tick, computes a per-campaign batch limit from `EMAIL_CAMPAIGN_MPS`, and calls `processQueuedEmailMessages` with a campaign-scoped filter.

2. **SMTP Email Provider** — a new `SmtpEmailProvider` adapter backed by nodemailer lets operators point the system at any SMTP server (Gmail SMTP relay, Mailgun, SendGrid SMTP, self-hosted Postfix, etc.) instead of being locked to Resend's 100/day free tier. The adapter plugs into the existing `EmailProviderAdapter` interface and is selected automatically by the factory when `SMTP_HOST` is present in the environment.

No new database tables are required. All changes are confined to `email-runtime.ts`, `automation-runtime.ts`, and `config.ts`.

---

## Architecture

### Current State

```
runtimeTick()
  └─ processQueuedEmailMessages(25)          ← drains ALL queued messages, no campaign awareness
  └─ processCampaignQueue()                  ← WhatsApp only

queueCampaignDelivery()
  └─ Promise.all(recipients.map(queueEmailMessage))  ← synchronous fan-out, no throttle
```

### Target State

```
runtimeTick()
  └─ processQueuedEmailMessages(25)          ← unchanged: transactional + automation emails
  └─ processEmailCampaignQueue()             ← NEW: per-campaign throttled dispatch
  └─ processCampaignQueue()                  ← unchanged: WhatsApp campaigns

queueCampaignDelivery()
  └─ guard: reject if campaign.status === 'active'
  └─ queueEmailMessage() per recipient       ← unchanged fan-out (messages sit in 'queued')
  └─ campaigns.status → 'active'

processEmailCampaignQueue()  [new, in email-runtime.ts]
  └─ SELECT active email campaigns (limit 10)
  └─ for each campaign:
       limit = ceil(clamp(EMAIL_CAMPAIGN_MPS, 1, 500) × (RUNTIME_POLL_INTERVAL_MS / 1000))
       processQueuedEmailMessages(limit, { campaignId })
       if no queued/sending remain → mark campaign completed + recalculateCampaignAnalytics()

getEmailProviderAdapter('smtp', ...)
  └─ SmtpEmailProvider (nodemailer)          ← NEW
```

### Key Design Decisions

**Why not stagger `nextAttemptAt` like the WhatsApp engine?**
The WhatsApp engine stagger-schedules outbox rows because the Meta API is called directly from the outbox worker. Email messages already sit in the `emailMessages` table and are drained by `processQueuedEmailMessages`, which processes them sequentially in a loop. Throttling is achieved by controlling the `limit` argument passed to that function on each tick — no schema changes needed.

**Why keep `processQueuedEmailMessages(25)` in `runtimeTick`?**
That call handles transactional emails (invites, meeting confirmations, automation emails) that have no `campaignId`. Campaign messages are now handled exclusively by `processEmailCampaignQueue`, which passes a `campaignId` filter. The two paths are disjoint because `processQueuedEmailMessages` with no filter will skip messages that are already `sending` (claimed by the campaign path).

**SMTP credentials from env vars, not `credentials` JSONB**
The `credentials` column is designed for per-account OAuth tokens. SMTP credentials are server-wide (one SMTP relay per deployment), so they live in env vars alongside `RESEND_API_KEY`. The `SmtpEmailProvider` reads them directly from `env` at send time.

---

## Components and Interfaces

### EmailProviderAdapter (existing, unchanged)

```typescript
interface SendEmailRequest {
  fromName?: string | null;
  fromEmail: string;
  toEmail: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string | null;
}

interface EmailProviderResult {
  providerMessageId: string;
  deliveredAt?: Date;
}

interface EmailProviderAdapter {
  send(request: SendEmailRequest): Promise<EmailProviderResult>;
}
```

### SmtpEmailProvider (new)

```typescript
class SmtpEmailProvider implements EmailProviderAdapter {
  async send(request: SendEmailRequest): Promise<EmailProviderResult>
}
```

- Reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` from `env` at call time.
- Creates a nodemailer transporter on each call (stateless; nodemailer handles connection pooling internally when `pool: true` is set, but for simplicity the initial implementation creates a fresh transport per send — this is acceptable for campaign batch sizes and can be optimised later).
- Throws `AppError` on connection failure or SMTP rejection.
- Returns `{ providerMessageId }` where `providerMessageId` is the `messageId` header from the nodemailer `SentMessageInfo`, falling back to `crypto.randomUUID()` if the server does not return one.

### getEmailProviderAdapter (updated factory)

```typescript
function getEmailProviderAdapter(
  provider: string,
  credentials?: Record<string, unknown>
): EmailProviderAdapter
```

Updated switch logic:

| `provider` | Condition | Returns |
|---|---|---|
| `"smtp"` | `env.SMTP_HOST` is set | `SmtpEmailProvider` |
| `"smtp"` | `env.SMTP_HOST` not set | `MockEmailProvider` |
| `"resend"` | — | `ResendEmailProvider` |
| `"google"` | `credentials.accessToken` non-empty | `GmailOAuthProvider(token)` |
| `"azure"` | `credentials.accessToken` non-empty | `OutlookOAuthProvider(token)` |
| anything else | — | `MockEmailProvider` |

### processEmailCampaignQueue (new, in email-runtime.ts)

```typescript
export async function processEmailCampaignQueue(): Promise<void>
```

Algorithm:

```
1. SELECT campaigns WHERE channel='email' AND status='active' AND deletedAt IS NULL LIMIT 10
2. For each campaign:
   a. limit = ceil(clamp(EMAIL_CAMPAIGN_MPS, 1, 500) * (RUNTIME_POLL_INTERVAL_MS / 1000))
   b. processed = await processQueuedEmailMessages(limit, { campaignId: campaign.id })
   c. Check if any emailMessages remain with status IN ('queued', 'sending') for this campaign
   d. If none remain:
      - UPDATE campaigns SET status='completed', completedAt=now() WHERE id=campaign.id
      - await recalculateCampaignAnalytics(campaign.companyId, campaign.id)
3. Errors for a single campaign are caught, logged, and do not halt the loop
```

### queueCampaignDelivery (updated)

The existing function gains two changes:

1. **Conflict guard** — if `campaign.status === 'active'`, throw `AppError.conflict("Campaign is already active")` before inserting any rows.
2. **Status transition** — after inserting `emailMessages`, set `campaign.status = 'active'` and `campaign.launchedAt = now()` (already done for the non-active path; the guard ensures this only runs once).

The `Promise.all` fan-out for email recipients is retained as-is — it only inserts rows into `emailMessages` (fast DB inserts), it does not send emails. Actual sending is deferred to `processEmailCampaignQueue`.

### launchCampaign (new export from email-runtime.ts)

```typescript
export async function launchCampaign(
  companyId: string,
  campaignId: string,
  createdBy: string
): Promise<{ campaignId: string; queuedCount: number }>
```

This is a thin wrapper that:
1. Loads the campaign and validates status is `draft` or `scheduled`.
2. Validates at least one deliverable recipient exists.
3. Delegates to `queueCampaignDelivery`.

### ensureSystemEmailAccount (updated)

Priority logic:

```
if SMTP_HOST is set:
  upsert emailAccounts with provider='smtp', fromEmail=SMTP_FROM_EMAIL, fromName=SMTP_FROM_NAME
  return
if RESEND_API_KEY is set:
  upsert emailAccounts with provider='resend', fromEmail=RESEND_FROM_EMAIL, fromName=RESEND_FROM_NAME
  return
return null
```

The existing early-return for an already-connected account is preserved.

### runtimeTick (updated, in automation-runtime.ts)

```typescript
// Before (existing):
await processQueuedEmailMessages(25);

// After:
await processQueuedEmailMessages(25);          // transactional / automation emails (no campaignId)
await processEmailCampaignQueue();             // campaign emails (throttled, per-campaign)
```

The import of `processEmailCampaignQueue` is added alongside the existing `processQueuedEmailMessages` import.

---

## Data Models

No new tables. The following existing columns are used:

### campaigns

| Column | Type | Role |
|---|---|---|
| `status` | `campaign_status` enum | `draft → active → completed` lifecycle |
| `launchedAt` | `timestamp` | Set when campaign transitions to `active` |
| `completedAt` | `timestamp` | Set by `processEmailCampaignQueue` when all messages reach terminal status |
| `sentCount` | `integer` | Recalculated by `recalculateCampaignAnalytics` on completion |
| `deliveredCount` | `integer` | Recalculated on completion |
| `openedCount` | `integer` | Recalculated on completion |
| `clickedCount` | `integer` | Recalculated on completion |

### emailMessages

| Column | Type | Role |
|---|---|---|
| `campaignId` | `uuid` | Filter key for `processEmailCampaignQueue` |
| `status` | `email_message_status` enum | `queued → sending → sent/delivered/failed` |

### emailAccounts

| Column | Type | Role |
|---|---|---|
| `provider` | `varchar(80)` | `"smtp"` for the new SMTP provider |
| `fromEmail` | `varchar(320)` | Populated from `SMTP_FROM_EMAIL` |
| `fromName` | `varchar(180)` | Populated from `SMTP_FROM_NAME` |
| `credentials` | `jsonb` | Empty `{}` for SMTP (credentials live in env vars) |

### config.ts — new env fields

| Field | Zod type | Default | Notes |
|---|---|---|---|
| `SMTP_HOST` | `z.string().optional()` | — | Required for SMTP to activate |
| `SMTP_PORT` | `z.coerce.number().int().default(587)` | `587` | Coerced from string |
| `SMTP_USER` | `z.string().optional()` | — | |
| `SMTP_PASS` | `z.string().optional()` | — | |
| `SMTP_SECURE` | boolean-coerced from `"0"/"1"/"true"/"false"`, default `false` | `false` | |
| `SMTP_FROM_EMAIL` | `z.string().email().optional()` | — | |
| `SMTP_FROM_NAME` | `z.string().optional()` | — | |
| `EMAIL_CAMPAIGN_MPS` | `z.coerce.number().positive().default(10)` | `10` | Messages per second |

Cross-field validation (Zod `.superRefine`): if `SMTP_HOST` is set and exactly one of `SMTP_USER`/`SMTP_PASS` is provided, throw a validation error.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Batch limit formula is correct for all valid inputs

*For any* value of `EMAIL_CAMPAIGN_MPS` (including values outside [1, 500]) and any positive `RUNTIME_POLL_INTERVAL_MS`, the computed batch limit SHALL equal `Math.ceil(Math.max(1, Math.min(500, mps)) * (intervalMs / 1000))`.

**Validates: Requirements 1.2, 1.3, 1.4, 1.5**

### Property 2: Campaign completion detection

*For any* email campaign where every `emailMessages` row has a terminal status (`sent`, `delivered`, or `failed`), after one call to `processEmailCampaignQueue`, the campaign's `status` SHALL be `completed` and `completedAt` SHALL be set to a non-null timestamp.

**Validates: Requirements 1.8, 2.5**

### Property 3: Campaign launch is idempotent — no double-queue

*For any* campaign that is already in `active` status, calling `queueCampaignDelivery` SHALL return a conflict error and SHALL NOT insert any new `emailMessages` rows.

**Validates: Requirements 1.10**

### Property 4: Campaign launch transitions status for launchable campaigns

*For any* campaign in `draft` or `scheduled` status with at least one deliverable recipient, calling `launchCampaign` SHALL transition the campaign to `active`, set `launchedAt`, and return a `queuedCount` equal to the number of recipients with a non-null email address.

**Validates: Requirements 1.9, 2.1, 2.2**

### Property 5: Error isolation — one campaign failure does not halt others

*For any* set of active campaigns where one campaign's processing throws an error, `processEmailCampaignQueue` SHALL still process all remaining campaigns in the set and SHALL NOT propagate the error to the caller.

**Validates: Requirements 1.11**

### Property 6: SMTP provider factory selection

*For any* non-empty string value of `SMTP_HOST`, calling `getEmailProviderAdapter("smtp", {})` SHALL return an instance of `SmtpEmailProvider`. When `SMTP_HOST` is absent, it SHALL return an instance of `MockEmailProvider`.

**Validates: Requirements 4.1, 4.2**

### Property 7: Unknown provider always returns MockEmailProvider

*For any* string that is not one of `"resend"`, `"google"`, `"azure"`, or `"smtp"`, calling `getEmailProviderAdapter(provider, {})` SHALL return an instance of `MockEmailProvider`.

**Validates: Requirements 4.6**

### Property 8: SMTP from-address override

*For any* `SendEmailRequest`, when `SMTP_FROM_EMAIL` is set in the environment, the nodemailer transport SHALL be called with the `from` field set to `SMTP_FROM_EMAIL` (ignoring `request.fromEmail`). When `SMTP_FROM_EMAIL` is absent, the `from` field SHALL equal `request.fromEmail`.

**Validates: Requirements 3.11**

### Property 9: Tracking pixel injection is provider-conditional

*For any* HTML email content, when the resolved provider is `ResendEmailProvider`, `GmailOAuthProvider`, or `OutlookOAuthProvider`, the HTML passed to `adapter.send()` SHALL contain the tracking pixel `<img>` tag. When the resolved provider is `SmtpEmailProvider`, the HTML passed to `adapter.send()` SHALL be identical to the original content with no tracking pixel injected.

**Validates: Requirements 7.4**

### Property 10: SMTP send always returns a non-empty providerMessageId

*For any* valid `SendEmailRequest` where the nodemailer transport accepts the message, `SmtpEmailProvider.send()` SHALL return an `EmailProviderResult` with a `providerMessageId` that is a non-empty string.

**Validates: Requirements 3.3**

### Property 11: ensureSystemEmailAccount is idempotent for connected accounts

*For any* company that already has a `connected` `emailAccounts` row, calling `ensureSystemEmailAccount` SHALL return that existing row without performing any database write.

**Validates: Requirements 5.5**

---

## Error Handling

### SmtpEmailProvider

| Condition | Behaviour |
|---|---|
| `SMTP_HOST` not set | Throw `AppError.conflict("SMTP_HOST is not configured")` |
| Connection refused / network error | Catch nodemailer error, throw `AppError.conflict("SMTP connection failed: <message>")` |
| SMTP authentication failure | Catch nodemailer error, throw `AppError.conflict("SMTP send failed: <code> <message>")` |
| Recipient rejected / relay denied | Same as above |
| Server accepts but returns no message-id | Return `crypto.randomUUID()` as `providerMessageId` |

### processEmailCampaignQueue

| Condition | Behaviour |
|---|---|
| Error processing a single campaign | `console.error` the error with campaign ID; continue to next campaign |
| No active email campaigns | Return immediately (no-op) |
| `processQueuedEmailMessages` returns 0 but messages still queued | No completion transition; retry on next tick |

### queueCampaignDelivery / launchCampaign

| Condition | Behaviour |
|---|---|
| Campaign not found | `AppError.notFound("Campaign not found")` |
| Campaign already `active` | `AppError.conflict("Campaign is already active")` |
| Campaign in `completed`, `paused` | `AppError.conflict("Campaign cannot be launched from status '<status>'")` |
| Zero deliverable recipients | `AppError.conflict("Campaign has no deliverable email recipients")` |

### Config validation (Zod)

| Condition | Behaviour |
|---|---|
| `SMTP_PORT` is non-integer string | Zod parse error at startup |
| `SMTP_FROM_EMAIL` is not a valid email | Zod parse error at startup |
| `SMTP_HOST` set + exactly one of `SMTP_USER`/`SMTP_PASS` | Zod `superRefine` error at startup |

---

## Testing Strategy

### Unit Tests

Focus on pure logic and factory behaviour:

- `getEmailProviderAdapter` factory: verify correct class is returned for each provider string and env combination.
- `computeCampaignBatchLimit(mps, intervalMs)` (extracted pure function): verify clamp and ceil arithmetic.
- `ensureSystemEmailAccount`: verify SMTP-first priority, Resend fallback, null when neither, idempotency for existing connected account.
- `launchCampaign` error paths: already-active conflict, zero-recipient conflict, invalid status conflict.
- `SmtpEmailProvider.send` with mocked nodemailer transport: verify from-address override logic, providerMessageId fallback, AppError wrapping for connection and SMTP errors.
- Zod schema: verify `SMTP_PORT` coercion, `SMTP_FROM_EMAIL` email validation, `SMTP_USER`/`SMTP_PASS` cross-field validation.

### Property-Based Tests

Use a property-based testing library (e.g., [fast-check](https://github.com/dubzzz/fast-check) for TypeScript) with a minimum of 100 iterations per property.

Each test is tagged with the property it validates:

```
// Feature: email-infrastructure-overhaul, Property 1: Batch limit formula is correct for all valid inputs
```

Properties to implement as PBT:

- **Property 1** — Generate arbitrary `mps` (including negative, zero, fractional, >500) and `intervalMs` (positive integers); assert computed limit equals the reference formula.
- **Property 2** — Generate a campaign with N messages all in terminal status; assert `processEmailCampaignQueue` marks it completed.
- **Property 3** — Generate an active campaign; assert `queueCampaignDelivery` throws conflict and message count is unchanged.
- **Property 4** — Generate a draft/scheduled campaign with K recipients (K ≥ 1); assert `launchCampaign` returns `queuedCount = K` and campaign is active.
- **Property 5** — Generate M campaigns where one is configured to throw; assert all others are processed.
- **Property 6** — Generate arbitrary non-empty `SMTP_HOST` strings; assert factory returns `SmtpEmailProvider`.
- **Property 7** — Generate arbitrary strings not in the known provider set; assert factory returns `MockEmailProvider`.
- **Property 8** — Generate arbitrary `SendEmailRequest` and arbitrary `SMTP_FROM_EMAIL` values (set/unset); assert from-address selection is correct.
- **Property 9** — Generate arbitrary HTML strings; assert tracking pixel presence/absence based on provider type.
- **Property 10** — Generate arbitrary `SendEmailRequest`; mock nodemailer to accept; assert `providerMessageId` is non-empty.
- **Property 11** — Generate an existing connected account; assert `ensureSystemEmailAccount` returns it unchanged.

### Integration Tests

- End-to-end SMTP send against a local SMTP server (e.g., [smtp4dev](https://github.com/rnwood/smtp4dev) or Mailhog) to verify nodemailer transport wiring.
- `processEmailCampaignQueue` against a test database: seed active campaigns with queued messages, run the function, assert messages transition to `sent` and campaign transitions to `completed`.

### Regression Tests

- Verify `processQueuedEmailMessages` with no filter still processes transactional emails (no `campaignId`) correctly after the campaign worker is added.
- Verify existing callers (`queueLeadEmail`, automation `email.send` action, outreach agent) are unaffected by the new SMTP provider path.
