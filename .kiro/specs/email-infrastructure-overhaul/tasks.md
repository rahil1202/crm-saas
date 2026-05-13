# Implementation Plan: Email Infrastructure Overhaul

## Overview

Implement the rate-limited email campaign worker and SMTP email provider adapter. All changes are confined to `config.ts`, `email-runtime.ts`, and `automation-runtime.ts`. No new database tables are required. The implementation follows the design's target architecture: `processEmailCampaignQueue` handles throttled per-campaign dispatch, `SmtpEmailProvider` plugs into the existing `EmailProviderAdapter` interface, and `launchCampaign` wraps `queueCampaignDelivery` with status validation.

## Tasks

- [x] 1. Extend `config.ts` with SMTP and campaign-rate env vars
  - Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, and `EMAIL_CAMPAIGN_MPS` fields to the Zod `envSchema` in `src/lib/config.ts`
  - `SMTP_PORT`: `z.coerce.number().int().default(587)`
  - `SMTP_SECURE`: boolean-coerced from `"0"/"1"/"true"/"false"`, default `false` (mirror the existing `COOKIE_SECURE` pattern)
  - `SMTP_FROM_EMAIL`: `z.string().email().optional()`
  - `EMAIL_CAMPAIGN_MPS`: `z.coerce.number().positive().default(10)`
  - Add a `.superRefine` cross-field check: if `SMTP_HOST` is set and exactly one of `SMTP_USER`/`SMTP_PASS` is provided (but not both), throw a Zod validation error with a clear message
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 1.1 Write unit tests for the Zod schema additions
    - Test `SMTP_PORT` coercion from valid integer strings and rejection of non-integer strings
    - Test `SMTP_FROM_EMAIL` rejection of non-email strings
    - Test `SMTP_SECURE` boolean coercion for all four string values
    - Test `superRefine` cross-field validation: SMTP_HOST + only SMTP_USER → error; SMTP_HOST + only SMTP_PASS → error; SMTP_HOST + both → ok; SMTP_HOST + neither → ok
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [x] 2. Implement `SmtpEmailProvider` class in `email-runtime.ts`
  - Add `import nodemailer from "nodemailer"` at the top of `src/lib/email-runtime.ts`
  - Implement `class SmtpEmailProvider implements EmailProviderAdapter` with a single `async send(request: SendEmailRequest): Promise<EmailProviderResult>` method
  - At call time, read `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` from `env`; throw `AppError.conflict("SMTP_HOST is not configured")` if `SMTP_HOST` is absent
  - Create a nodemailer transporter using `nodemailer.createTransport({ host, port, secure, auth: { user, pass } })`; when `SMTP_USER`/`SMTP_PASS` are absent, omit the `auth` field (unauthenticated relay support)
  - Resolve the `from` address: use `env.SMTP_FROM_EMAIL` when set, otherwise fall back to `request.fromEmail`; include `fromName` in RFC 5322 format when available
  - Call `transporter.sendMail(...)` and extract `info.messageId`; fall back to `crypto.randomUUID()` if the server returns no message-id
  - Wrap nodemailer errors: connection/network errors → `AppError.conflict("SMTP connection failed: <message>")`; SMTP rejection errors → `AppError.conflict("SMTP send failed: <code> <message>")`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11_

  - [x]* 2.1 Write property test for `SmtpEmailProvider.send` — from-address override (Property 8)
    - **Property 8: SMTP from-address override**
    - Generate arbitrary `SendEmailRequest` objects and arbitrary `SMTP_FROM_EMAIL` values (set/unset); mock the nodemailer transport to capture the `from` field; assert that when `SMTP_FROM_EMAIL` is set it overrides `request.fromEmail`, and when absent `request.fromEmail` is used
    - **Validates: Requirements 3.11**

  - [x]* 2.2 Write property test for `SmtpEmailProvider.send` — non-empty `providerMessageId` (Property 10)
    - **Property 10: SMTP send always returns a non-empty providerMessageId**
    - Generate arbitrary `SendEmailRequest` objects; mock nodemailer transport to accept the message (with and without returning a `messageId`); assert `providerMessageId` is always a non-empty string
    - **Validates: Requirements 3.3**

  - [x]* 2.3 Write unit tests for `SmtpEmailProvider.send` error paths
    - Test that missing `SMTP_HOST` throws `AppError.conflict("SMTP_HOST is not configured")`
    - Test that a nodemailer connection error is wrapped as `AppError.conflict("SMTP connection failed: ...")`
    - Test that a nodemailer SMTP rejection error is wrapped as `AppError.conflict("SMTP send failed: ...")`
    - _Requirements: 3.4, 3.5, 3.10_

- [x] 3. Update `getEmailProviderAdapter` factory to handle `"smtp"` provider
  - In the existing `getEmailProviderAdapter` function in `email-runtime.ts`, add a branch for `provider === "smtp"` before the existing `"resend"` branch
  - When `env.SMTP_HOST` is set, return `new SmtpEmailProvider()`; otherwise return `new MockEmailProvider()`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x]* 3.1 Write property test for `getEmailProviderAdapter` — SMTP selection (Property 6)
    - **Property 6: SMTP provider factory selection**
    - Generate arbitrary non-empty strings for `SMTP_HOST`; assert `getEmailProviderAdapter("smtp", {})` returns an instance of `SmtpEmailProvider`. When `SMTP_HOST` is absent, assert it returns `MockEmailProvider`
    - **Validates: Requirements 4.1, 4.2**

  - [x]* 3.2 Write property test for `getEmailProviderAdapter` — unknown provider fallback (Property 7)
    - **Property 7: Unknown provider always returns MockEmailProvider**
    - Generate arbitrary strings that are not `"resend"`, `"google"`, `"azure"`, or `"smtp"`; assert `getEmailProviderAdapter(provider, {})` returns an instance of `MockEmailProvider`
    - **Validates: Requirements 4.6**

  - [x]* 3.3 Write unit tests for `getEmailProviderAdapter` factory
    - Test `"resend"` → `ResendEmailProvider`
    - Test `"google"` with valid `accessToken` → `GmailOAuthProvider`; without `accessToken` → `MockEmailProvider`
    - Test `"azure"` with valid `accessToken` → `OutlookOAuthProvider`; without `accessToken` → `MockEmailProvider`
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

- [x] 4. Checkpoint — config and provider layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update `processQueuedEmailMessages` to skip tracking pixel for SMTP provider
  - In `processQueuedEmailMessages`, after resolving the adapter via `getEmailProviderAdapter`, check if the adapter is an instance of `SmtpEmailProvider`
  - When the adapter is `SmtpEmailProvider`, pass the original `item.htmlContent` to `adapter.send()` without calling `injectTrackingPixel`
  - For all other providers, retain the existing `injectTrackingPixel(item.htmlContent, item.trackingToken)` call
  - _Requirements: 7.4_

  - [x]* 5.1 Write property test for tracking pixel injection — provider-conditional (Property 9)
    - **Property 9: Tracking pixel injection is provider-conditional**
    - Generate arbitrary HTML strings; for each known provider type, mock the adapter and capture the HTML passed to `send()`; assert that `ResendEmailProvider`, `GmailOAuthProvider`, and `OutlookOAuthProvider` receive HTML containing the tracking pixel `<img>` tag, while `SmtpEmailProvider` receives the original HTML unchanged
    - **Validates: Requirements 7.4**

- [x] 6. Add `computeCampaignBatchLimit` pure function and `processEmailCampaignQueue` to `email-runtime.ts`
  - Extract a pure helper `function computeCampaignBatchLimit(mps: number, intervalMs: number): number` that returns `Math.ceil(Math.max(1, Math.min(500, mps)) * (intervalMs / 1000))`; export it so it can be unit-tested
  - Implement `export async function processEmailCampaignQueue(): Promise<void>`:
    1. Query `campaigns` where `channel = 'email'`, `status = 'active'`, `deletedAt IS NULL`, limit 10
    2. For each campaign, compute `limit = computeCampaignBatchLimit(env.EMAIL_CAMPAIGN_MPS, env.RUNTIME_POLL_INTERVAL_MS)`
    3. Call `await processQueuedEmailMessages(limit, { campaignId: campaign.id })`
    4. Query `emailMessages` for this campaign where `status IN ('queued', 'sending')`; if none remain, `UPDATE campaigns SET status='completed', completedAt=now()` and call `recalculateCampaignAnalytics`
    5. Wrap each campaign's processing in a `try/catch`; on error, `console.error` with the campaign ID and continue to the next campaign
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.11, 2.5_

  - [x]* 6.1 Write property test for `computeCampaignBatchLimit` — batch limit formula (Property 1)
    - **Property 1: Batch limit formula is correct for all valid inputs**
    - Generate arbitrary `mps` values (including negative, zero, fractional, >500) and positive `intervalMs` values; assert the result equals `Math.ceil(Math.max(1, Math.min(500, mps)) * (intervalMs / 1000))`
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**

  - [x]* 6.2 Write property test for `processEmailCampaignQueue` — campaign completion detection (Property 2)
    - **Property 2: Campaign completion detection**
    - Generate a campaign with N messages all in terminal status (`sent`, `delivered`, or `failed`); mock the DB queries accordingly; assert that after one call to `processEmailCampaignQueue` the campaign's `status` is `completed` and `completedAt` is a non-null timestamp
    - **Validates: Requirements 1.8, 2.5**

  - [x]* 6.3 Write property test for `processEmailCampaignQueue` — error isolation (Property 5)
    - **Property 5: Error isolation — one campaign failure does not halt others**
    - Generate M active campaigns where one is configured to throw during processing; assert all other campaigns are still processed and no error propagates to the caller
    - **Validates: Requirements 1.11**

  - [x]* 6.4 Write unit tests for `processEmailCampaignQueue`
    - Test that campaigns with remaining `queued`/`sending` messages are NOT marked completed
    - Test that `recalculateCampaignAnalytics` is called when a campaign completes
    - Test that non-email campaigns are not processed
    - _Requirements: 1.7, 1.8, 2.5_

- [x] 7. Update `queueCampaignDelivery` with conflict guard and status transition
  - At the top of the email branch in `queueCampaignDelivery` (after loading the campaign), add: if `campaign.status === 'active'`, throw `AppError.conflict("Campaign is already active")`
  - Ensure the `UPDATE campaigns SET status='active', launchedAt=now()` at the end of the email branch always fires (it already does for the non-active path; the guard above ensures it only runs once)
  - Return `{ campaignId, queuedCount }` as before
  - _Requirements: 1.9, 1.10_

  - [x]* 7.1 Write property test for `queueCampaignDelivery` — no double-queue (Property 3)
    - **Property 3: Campaign launch is idempotent — no double-queue**
    - Generate a campaign already in `active` status; assert `queueCampaignDelivery` throws a conflict error and the `emailMessages` row count is unchanged
    - **Validates: Requirements 1.10**

  - [x]* 7.2 Write unit tests for `queueCampaignDelivery` conflict guard
    - Test that calling with an `active` campaign throws `AppError.conflict("Campaign is already active")`
    - Test that calling with a `draft` campaign succeeds and transitions to `active`
    - _Requirements: 1.9, 1.10_

- [x] 8. Add `launchCampaign` export to `email-runtime.ts`
  - Implement `export async function launchCampaign(companyId: string, campaignId: string, createdBy: string): Promise<{ campaignId: string; queuedCount: number }>`
  - Load the campaign; throw `AppError.notFound` if missing
  - If `campaign.status` is not `'draft'` or `'scheduled'`, throw `AppError.conflict("Campaign cannot be launched from status '<status>'")`
  - Query deliverable recipients (customers with non-null email linked to the campaign); if zero, throw `AppError.conflict("Campaign has no deliverable email recipients")`
  - Delegate to `queueCampaignDelivery({ companyId, campaignId, createdBy })` and return its result
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x]* 8.1 Write property test for `launchCampaign` — status transition for launchable campaigns (Property 4)
    - **Property 4: Campaign launch transitions status for launchable campaigns**
    - Generate campaigns in `draft` or `scheduled` status with K recipients (K ≥ 1) each having a non-null email; assert `launchCampaign` returns `queuedCount = K` and the campaign transitions to `active` with `launchedAt` set
    - **Validates: Requirements 1.9, 2.1, 2.2**

  - [x]* 8.2 Write unit tests for `launchCampaign` error paths
    - Test `completed` status → conflict error
    - Test `active` status → conflict error
    - Test `paused` status → conflict error
    - Test zero deliverable recipients → conflict error
    - _Requirements: 2.3, 2.4_

- [x] 9. Update `ensureSystemEmailAccount` with SMTP-first priority logic
  - Replace the current Resend-only logic in `ensureSystemEmailAccount` with the priority chain from the design:
    1. If `env.SMTP_HOST` is set: upsert `emailAccounts` with `provider='smtp'`, `fromEmail=env.SMTP_FROM_EMAIL`, `fromName=env.SMTP_FROM_NAME`, `label='System Email (SMTP)'`, `credentials={}`, conflict target `(companyId, fromEmail)`; return the upserted row
    2. Else if `env.RESEND_API_KEY` is set: retain existing Resend upsert logic
    3. Else: return `null`
  - The existing early-return for an already-connected account (`getDefaultEmailAccount` check) is preserved as-is
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x]* 9.1 Write property test for `ensureSystemEmailAccount` — idempotency (Property 11)
    - **Property 11: ensureSystemEmailAccount is idempotent for connected accounts**
    - Generate an existing connected `emailAccounts` row; mock `getDefaultEmailAccount` to return it; assert `ensureSystemEmailAccount` returns that exact row without performing any DB write
    - **Validates: Requirements 5.5**

  - [x]* 9.2 Write unit tests for `ensureSystemEmailAccount` priority logic
    - Test SMTP_HOST set → upserts SMTP account, returns it
    - Test SMTP_HOST + RESEND_API_KEY both set → upserts SMTP account only (no Resend row)
    - Test only RESEND_API_KEY set → upserts Resend account
    - Test neither set → returns `null`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 10. Update `runtimeTick` in `automation-runtime.ts` to call `processEmailCampaignQueue`
  - Add `processEmailCampaignQueue` to the import from `@/lib/email-runtime` alongside the existing `processQueuedEmailMessages` import
  - In `runtimeTick`, add `await processEmailCampaignQueue()` immediately after the existing `await processQueuedEmailMessages(25)` call
  - _Requirements: 1.1, 1.6_

  - [x]* 10.1 Write unit tests for `runtimeTick` integration
    - Test that `processEmailCampaignQueue` is called on each tick
    - Test that an error in `processEmailCampaignQueue` does not halt the rest of the tick (the outer `try/catch` in `runtimeTick` already handles this)
    - _Requirements: 1.1, 1.11_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per property; each test file should include the comment `// Feature: email-infrastructure-overhaul, Property N: <title>` above each `fc.assert` call
- `computeCampaignBatchLimit` must be exported so property tests can import it directly without mocking DB calls
- The `SmtpEmailProvider` creates a fresh nodemailer transporter per `send()` call (stateless); connection pooling can be added later
- `processQueuedEmailMessages` with no `campaignId` filter continues to handle transactional and automation emails; the two dispatch paths are disjoint
- When `SMTP_FROM_EMAIL` is not set and `SmtpEmailProvider` falls back to `request.fromEmail`, the nodemailer `from` field should still include `fromName` in RFC 5322 format if available: `"Name <email>"`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "3.1", "3.2", "3.3"] },
    { "id": 2, "tasks": ["5.1", "6.1", "7.1", "7.2", "8.1", "8.2", "9.1", "9.2", "10.1"] },
    { "id": 3, "tasks": ["6.2", "6.3", "6.4"] }
  ]
}
```
