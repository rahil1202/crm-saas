# Requirements Document

## Introduction

This feature overhauls two interconnected parts of the CRM SaaS email infrastructure:

1. **Bulk Email Campaign Worker** — replaces the current synchronous `Promise.all` fan-out in `queueCampaignDelivery` with a proper rate-limited campaign worker that processes queued `emailMessages` in throttled batches, mirroring the WhatsApp campaign engine pattern.

2. **SMTP Email Provider** — adds a `SmtpEmailProvider` adapter so any SMTP server (Gmail SMTP, Mailgun, SendGrid, self-hosted) can be used instead of Resend, removing the 100/day free-tier constraint. All transactional and campaign emails continue to flow through the existing `queueEmailMessage` → `processQueuedEmailMessages` pipeline unchanged.

The backend runs on Bun + Hono + Drizzle + PostgreSQL. The runtime worker polls every `RUNTIME_POLL_INTERVAL_MS` (default 2 s) and calls `processQueuedEmailMessages` on each tick. No new database tables are required.

## Glossary

- **Campaign_Worker**: The portion of the runtime worker tick responsible for processing queued email campaign messages in rate-limited batches.
- **Email_Runtime**: The module `email-runtime.ts` containing `queueEmailMessage`, `processQueuedEmailMessages`, `queueCampaignDelivery`, and all email provider adapters.
- **EmailProviderAdapter**: The TypeScript interface with a single `send(request: SendEmailRequest): Promise<EmailProviderResult>` method that all email provider classes implement.
- **SmtpEmailProvider**: The new email provider adapter that sends email via SMTP using nodemailer.
- **Runtime_Worker**: The `setInterval`-based worker started by `startAutomationRuntimeWorker` that calls `runtimeTick` on each poll interval.
- **emailMessages**: The PostgreSQL table (and Drizzle schema) that stores all outbound email messages in statuses: `queued`, `sending`, `sent`, `delivered`, `failed`.
- **campaigns**: The PostgreSQL table storing email and WhatsApp campaign records with status `draft`, `scheduled`, `active`, `completed`, `paused`.
- **emailAccounts**: The PostgreSQL table storing per-company email provider credentials (provider, fromEmail, fromName, credentials JSONB).
- **Throttle_Rate**: The maximum number of campaign email messages the Campaign_Worker may dispatch per second, controlled by `EMAIL_CAMPAIGN_MPS` env var.
- **System_Email_Account**: An `emailAccounts` row created automatically by `ensureSystemEmailAccount` when no account exists for a company.
- **Nodemailer**: The npm package used to create SMTP transports and send email via the SMTP protocol.

---

## Requirements

### Requirement 1: Rate-Limited Email Campaign Worker

**User Story:** As a CRM operator, I want bulk email campaigns to be delivered at a controlled rate, so that I do not overwhelm the SMTP server or violate provider sending limits.

#### Acceptance Criteria

1. WHEN the Runtime_Worker tick executes, THE Campaign_Worker SHALL query `emailMessages` filtered by `campaignId` of each active campaign and `status = 'queued'`, then call `processQueuedEmailMessages` with that campaign-scoped filter and a batch size derived from the configured Throttle_Rate.

2. WHEN the Runtime_Worker tick executes, THE Campaign_Worker SHALL pass `limit = ceil(clamp(EMAIL_CAMPAIGN_MPS, 1, 500) × (RUNTIME_POLL_INTERVAL_MS / 1000))` as the `limit` argument to `processQueuedEmailMessages` for each active campaign.

3. WHEN `EMAIL_CAMPAIGN_MPS` is not set, THE Campaign_Worker SHALL default to a Throttle_Rate of 10 messages per second.

4. WHEN `EMAIL_CAMPAIGN_MPS` is set to a value less than 1, THE Email_Runtime SHALL clamp the Throttle_Rate to 1 message per second.

5. WHEN `EMAIL_CAMPAIGN_MPS` is set to a value greater than 500, THE Email_Runtime SHALL clamp the Throttle_Rate to 500 messages per second.

6. WHEN the Campaign_Worker dispatches messages for a campaign, the sole dispatch mechanism SHALL be calling `processQueuedEmailMessages` with the campaign-scoped filter — no separate send loop shall exist.

7. WHILE a campaign has the status `active` and has `emailMessages` with status `queued` or `sending`, THE Campaign_Worker SHALL continue processing on each Runtime_Worker tick.

8. WHEN all `emailMessages` for a campaign have status `sent`, `delivered`, or `failed` (none remain in `queued` or `sending`), THE Campaign_Worker SHALL update the campaign status to `completed` and set `completedAt` to the current timestamp.

9. WHEN `queueCampaignDelivery` is called for a campaign whose status is not `active`, THE Email_Runtime SHALL queue new `emailMessages` for all deliverable recipients and transition the campaign status to `active`, returning `{ campaignId, queuedCount }`.

10. IF `queueCampaignDelivery` is called for a campaign whose status is already `active`, THEN THE Email_Runtime SHALL return a conflict error with message "Campaign is already active" without inserting new `emailMessages` rows.

11. WHEN the Campaign_Worker encounters an error processing a batch for a specific campaign, THE Email_Runtime SHALL record the error against that campaign (e.g. update `lastError` or log it) and continue processing other active campaigns without halting the Runtime_Worker tick. The campaign SHALL remain in `active` status.

---

### Requirement 2: Campaign Status Lifecycle

**User Story:** As a CRM user, I want campaign status to accurately reflect the delivery lifecycle, so that I can monitor progress and know when a campaign has finished.

#### Acceptance Criteria

1. WHEN `launchCampaign` is called for a campaign with status `draft`, THE Email_Runtime SHALL transition the campaign status to `active` and set `launchedAt` to the current timestamp.

2. WHEN `launchCampaign` is called for a campaign with status `scheduled`, THE Email_Runtime SHALL transition the campaign status to `active` and set `launchedAt` to the current timestamp.

3. IF `launchCampaign` is called for a campaign with status `completed`, `active`, or `paused`, THEN THE Email_Runtime SHALL return a conflict error without modifying the campaign record.

4. IF a campaign has zero deliverable email recipients (no linked customers with a non-null email address) at the time `launchCampaign` is called, THEN THE Email_Runtime SHALL return a conflict error and SHALL NOT transition the campaign status or insert any `emailMessages` rows.

5. WHEN the runtime worker determines that all `emailMessages` for a campaign have reached a terminal status (none remain in `queued` or `sending`), THE Email_Runtime SHALL set `status = 'completed'`, `completedAt = now()`, and recalculate `sentCount`, `deliveredCount`, `openedCount`, and `clickedCount` from the `emailTrackingEvents` table using the existing `recalculateCampaignAnalytics` function.

---

### Requirement 3: SMTP Email Provider Adapter

**User Story:** As a CRM operator, I want to send all transactional and campaign emails through any SMTP server, so that I am not limited to Resend's free-tier sending quota.

#### Acceptance Criteria

1. THE SmtpEmailProvider SHALL implement the EmailProviderAdapter interface, providing a `send(request: SendEmailRequest): Promise<EmailProviderResult>` method.

2. WHEN `send` is called on SmtpEmailProvider, THE SmtpEmailProvider SHALL open an SMTP connection to the configured host and deliver the message, returning only after the server has accepted the message.

3. WHEN the SMTP server accepts the message, THE SmtpEmailProvider SHALL return an `EmailProviderResult` containing a non-empty `providerMessageId` string (the message-id header value or a generated UUID if the server does not return one).

4. IF the SMTP server refuses the connection (e.g. wrong host, port unreachable), THEN THE SmtpEmailProvider SHALL throw an `AppError` that includes the underlying network error message.

5. IF the SMTP server rejects the message (e.g. authentication failure, recipient rejected, relay denied), THEN THE SmtpEmailProvider SHALL throw an `AppError` that includes the SMTP response code and message.

6. THE SmtpEmailProvider SHALL read SMTP connection parameters exclusively from the following env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`.

7. WHEN `SMTP_SECURE` is set to `"true"` or `"1"`, THE SmtpEmailProvider SHALL establish a TLS-on-connect connection (typically port 465) with no STARTTLS upgrade.

8. WHEN `SMTP_SECURE` is not set or is set to `"false"` or `"0"`, THE SmtpEmailProvider SHALL establish a plain connection with STARTTLS upgrade enabled (typically port 587).

9. WHEN `SMTP_PORT` is not set, THE SmtpEmailProvider SHALL default to port 587.

10. IF `SMTP_HOST` is absent when `send` is called, THEN THE SmtpEmailProvider SHALL throw an `AppError` with message "SMTP_HOST is not configured".

11. IF `SMTP_FROM_EMAIL` is absent when `send` is called, THEN THE SmtpEmailProvider SHALL use the `fromEmail` field from the `SendEmailRequest` as the `from` address. IF `SMTP_FROM_EMAIL` is set, THEN THE SmtpEmailProvider SHALL use `SMTP_FROM_EMAIL` as the `from` address, ignoring the `fromEmail` field on the request.

---

### Requirement 4: SMTP Provider Selection and Factory

**User Story:** As a CRM operator, I want the system to automatically select the SMTP provider when SMTP credentials are configured, so that I do not need to manually reconfigure each email account.

#### Acceptance Criteria

1. WHEN `getEmailProviderAdapter` is called with `provider = "smtp"` and `SMTP_HOST` is set in the environment, THE Email_Runtime SHALL return a SmtpEmailProvider instance.

2. WHEN `getEmailProviderAdapter` is called with `provider = "smtp"` and `SMTP_HOST` is not set in the environment, THE Email_Runtime SHALL return a MockEmailProvider instance.

3. WHEN `getEmailProviderAdapter` is called with `provider = "resend"`, THE Email_Runtime SHALL return a ResendEmailProvider instance.

4. WHEN `getEmailProviderAdapter` is called with `provider = "google"` and the credentials object contains a non-empty string `accessToken`, THE Email_Runtime SHALL return a GmailOAuthProvider instance initialised with that token.

5. WHEN `getEmailProviderAdapter` is called with `provider = "azure"` and the credentials object contains a non-empty string `accessToken`, THE Email_Runtime SHALL return an OutlookOAuthProvider instance initialised with that token.

6. WHEN `getEmailProviderAdapter` is called with an unrecognised provider string, or with `provider = "google"` / `"azure"` but the credentials object lacks a non-empty `accessToken`, THE Email_Runtime SHALL return a MockEmailProvider instance.

---

### Requirement 5: System Email Account Preference

**User Story:** As a CRM operator, I want the system to automatically provision an SMTP email account when SMTP is configured, so that emails are sent via SMTP without manual setup.

#### Acceptance Criteria

1. WHEN `ensureSystemEmailAccount` is called and `SMTP_HOST` is set in the environment, THE Email_Runtime SHALL upsert an `emailAccounts` row with `provider = "smtp"`, `fromEmail = SMTP_FROM_EMAIL`, `fromName = SMTP_FROM_NAME`, using `(companyId, fromEmail)` as the conflict target.

2. IF both `SMTP_HOST` and `RESEND_API_KEY` are set in the environment, THEN `ensureSystemEmailAccount` SHALL upsert the SMTP account (criterion 1) and SHALL NOT create a Resend account.

3. WHEN `ensureSystemEmailAccount` is called and `SMTP_HOST` is not set but `RESEND_API_KEY` is set, THE Email_Runtime SHALL upsert an `emailAccounts` row with `provider = "resend"`, `fromEmail = RESEND_FROM_EMAIL`, `fromName = RESEND_FROM_NAME`, using `(companyId, fromEmail)` as the conflict target.

4. WHEN `ensureSystemEmailAccount` is called and neither `SMTP_HOST` nor `RESEND_API_KEY` is set, THE Email_Runtime SHALL return `null` without inserting any row.

5. WHEN `ensureSystemEmailAccount` is called and a row with `status = 'connected'` already exists for the company, THE Email_Runtime SHALL return that existing row without performing any upsert.

---

### Requirement 6: SMTP Environment Configuration

**User Story:** As a CRM operator, I want SMTP credentials to be validated at startup, so that misconfigured SMTP settings are caught early rather than at send time.

#### Acceptance Criteria

1. THE Zod env schema in `config.ts` SHALL declare the following SMTP fields: `SMTP_HOST` (optional string), `SMTP_PORT` (coerced integer, default 587), `SMTP_USER` (optional string), `SMTP_PASS` (optional string), `SMTP_SECURE` (boolean-coerced from `"0"/"1"/"true"/"false"`, default `false`), `SMTP_FROM_EMAIL` (optional email string), `SMTP_FROM_NAME` (optional string).

2. WHEN `SMTP_PORT` is provided as a non-integer string (e.g. `"abc"`), THE Zod schema SHALL throw a validation error at process startup before any request is handled.

3. WHEN `SMTP_FROM_EMAIL` is provided but is not a valid email address format, THE Zod schema SHALL throw a validation error at process startup.

4. WHEN `SMTP_HOST` is set and exactly one of `SMTP_USER` or `SMTP_PASS` is provided (but not both), THE Zod schema SHALL throw a validation error at process startup with a message indicating that both must be provided together.

5. WHEN `SMTP_HOST` is set and neither `SMTP_USER` nor `SMTP_PASS` is provided, THE Zod schema SHALL accept the configuration (supporting unauthenticated SMTP relays) without error.

---

### Requirement 7: Existing Pipeline Compatibility

**User Story:** As a developer, I want invite emails, meeting emails, and campaign emails to continue flowing through the existing `queueEmailMessage` → `processQueuedEmailMessages` pipeline without any changes to their call sites, so that the SMTP migration is transparent to all callers.

#### Acceptance Criteria

1. THE Email_Runtime SHALL NOT change the TypeScript parameter types, return type shape, or required parameters of `queueEmailMessage`, `processQueuedEmailMessages`, `queueLeadEmail`, or `queueCampaignDelivery`.

2. WHEN `processQueuedEmailMessages` resolves the email provider for a message, THE Email_Runtime SHALL call `getEmailProviderAdapter(account.provider, account.credentials)` using the `provider` and `credentials` fields from the resolved `emailAccounts` row.

3. WHEN an `emailAccounts` row has `provider = "smtp"`, THE Email_Runtime SHALL instantiate SmtpEmailProvider using SMTP connection parameters from env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`) rather than from the `credentials` JSONB column.

4. WHEN the email provider is Resend, GmailOAuth, or OutlookOAuth, THE Email_Runtime SHALL inject the tracking pixel into the HTML content before calling `send`. WHEN the email provider is SmtpEmailProvider, THE Email_Runtime SHALL call `send` with the original HTML content without injecting a tracking pixel.

5. WHEN `processQueuedEmailMessages` successfully sends a message via SmtpEmailProvider, THE Email_Runtime SHALL insert a `sent` tracking event into `emailTrackingEvents` with the `providerMessageId` returned by SmtpEmailProvider, using the same logic path as for Resend and OAuth providers.
