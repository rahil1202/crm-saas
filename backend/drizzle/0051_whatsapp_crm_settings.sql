-- Phase 5: WhatsApp CRM — Module settings.
-- Stores per-company WhatsApp CRM module configuration.

CREATE TABLE IF NOT EXISTS "whatsapp_crm_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "default_workspace_id" uuid REFERENCES "whatsapp_workspaces"("id") ON DELETE SET NULL,
  "auto_reply_enabled" boolean NOT NULL DEFAULT false,
  "auto_reply_body" text,
  "auto_reply_outside_hours" boolean NOT NULL DEFAULT false,
  "business_hours" jsonb NOT NULL DEFAULT '{"timezone":"UTC","schedule":[]}'::jsonb,
  "assignment_strategy" varchar(40) NOT NULL DEFAULT 'manual',
  "assignment_user_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "max_concurrent_per_agent" integer NOT NULL DEFAULT 20,
  "unassigned_timeout_minutes" integer NOT NULL DEFAULT 30,
  "webhook_health_alert_enabled" boolean NOT NULL DEFAULT true,
  "webhook_health_alert_threshold" integer NOT NULL DEFAULT 5,
  "realtime_transport" varchar(20) NOT NULL DEFAULT 'sse',
  "default_priority" varchar(20) NOT NULL DEFAULT 'normal',
  "auto_archive_after_hours" integer NOT NULL DEFAULT 0,
  "opt_in_required_for_campaigns" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_crm_settings_company_unique"
  ON "whatsapp_crm_settings" ("company_id");
