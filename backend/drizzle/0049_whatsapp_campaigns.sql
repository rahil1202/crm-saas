-- Phase 3: WhatsApp CRM — Campaign engine, template management, analytics.
-- Additive migration. Adds campaign tables, campaign-contact audience,
-- per-message delivery logs, analytics snapshots, and a campaign_id FK on
-- the existing whatsapp_outbox for attribution.

-- ---------- whatsapp_campaigns -----------------------------------
CREATE TABLE IF NOT EXISTS "whatsapp_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "whatsapp_workspaces"("id") ON DELETE SET NULL,
  "template_id" uuid REFERENCES "whatsapp_templates"("id") ON DELETE SET NULL,
  "name" varchar(180) NOT NULL,
  "description" text,
  "status" varchar(40) NOT NULL DEFAULT 'draft',
  "audience_type" varchar(40) NOT NULL DEFAULT 'manual',
  "audience_filter" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "template_name" varchar(180),
  "template_language" varchar(16) NOT NULL DEFAULT 'en',
  "template_variables" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "schedule_type" varchar(20) NOT NULL DEFAULT 'immediate',
  "scheduled_at" timestamptz,
  "recurring_cron" varchar(120),
  "recurring_until" timestamptz,
  "throttle_mps" integer NOT NULL DEFAULT 30,
  "retry_max_attempts" integer NOT NULL DEFAULT 3,
  "retry_backoff_seconds" integer NOT NULL DEFAULT 60,
  "total_audience" integer NOT NULL DEFAULT 0,
  "sent_count" integer NOT NULL DEFAULT 0,
  "delivered_count" integer NOT NULL DEFAULT 0,
  "read_count" integer NOT NULL DEFAULT 0,
  "replied_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,
  "estimated_cost" numeric(18,8) NOT NULL DEFAULT 0,
  "actual_cost" numeric(18,8) NOT NULL DEFAULT 0,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "paused_at" timestamptz,
  "canceled_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "whatsapp_campaigns_company_idx"
  ON "whatsapp_campaigns" ("company_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "whatsapp_campaigns_schedule_idx"
  ON "whatsapp_campaigns" ("status", "scheduled_at")
  WHERE "status" IN ('scheduled', 'sending');

-- ---------- whatsapp_campaign_contacts ---------------------------
CREATE TABLE IF NOT EXISTS "whatsapp_campaign_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE,
  "phone_e164" varchar(32) NOT NULL,
  "contact_name" varchar(180),
  "variables" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(40) NOT NULL DEFAULT 'pending',
  "outbox_id" uuid REFERENCES "whatsapp_outbox"("id") ON DELETE SET NULL,
  "provider_message_id" varchar(180),
  "sent_at" timestamptz,
  "delivered_at" timestamptz,
  "read_at" timestamptz,
  "replied_at" timestamptz,
  "failed_at" timestamptz,
  "error_message" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "cost" numeric(18,8),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "whatsapp_campaign_contacts_campaign_idx"
  ON "whatsapp_campaign_contacts" ("campaign_id", "status");

CREATE INDEX IF NOT EXISTS "whatsapp_campaign_contacts_phone_idx"
  ON "whatsapp_campaign_contacts" ("company_id", "phone_e164", "campaign_id");

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_campaign_contacts_unique"
  ON "whatsapp_campaign_contacts" ("campaign_id", "phone_e164");

-- ---------- whatsapp_campaign_logs -------------------------------
CREATE TABLE IF NOT EXISTS "whatsapp_campaign_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE,
  "event_type" varchar(40) NOT NULL,
  "message" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "whatsapp_campaign_logs_campaign_idx"
  ON "whatsapp_campaign_logs" ("campaign_id", "created_at");

-- ---------- whatsapp_analytics_snapshots -------------------------
CREATE TABLE IF NOT EXISTS "whatsapp_analytics_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "whatsapp_workspaces"("id") ON DELETE SET NULL,
  "campaign_id" uuid REFERENCES "whatsapp_campaigns"("id") ON DELETE SET NULL,
  "snapshot_date" date NOT NULL,
  "period" varchar(20) NOT NULL DEFAULT 'daily',
  "sent" integer NOT NULL DEFAULT 0,
  "delivered" integer NOT NULL DEFAULT 0,
  "read" integer NOT NULL DEFAULT 0,
  "replied" integer NOT NULL DEFAULT 0,
  "failed" integer NOT NULL DEFAULT 0,
  "cost" numeric(18,8) NOT NULL DEFAULT 0,
  "template_name" varchar(180),
  "category" varchar(80),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_analytics_snapshots_unique"
  ON "whatsapp_analytics_snapshots" ("company_id", "workspace_id", "campaign_id", "snapshot_date", "period", "template_name");

CREATE INDEX IF NOT EXISTS "whatsapp_analytics_snapshots_company_idx"
  ON "whatsapp_analytics_snapshots" ("company_id", "snapshot_date");

-- ---------- whatsapp_outbox: add campaign_id FK ------------------
ALTER TABLE "whatsapp_outbox"
  ADD COLUMN IF NOT EXISTS "campaign_id" uuid REFERENCES "whatsapp_campaigns"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "whatsapp_outbox_campaign_idx"
  ON "whatsapp_outbox" ("campaign_id", "status")
  WHERE "campaign_id" IS NOT NULL;
