-- Phase 4: WhatsApp CRM — Flow Builder + Automations + AI Workflows.
-- Extends the existing chatbot_flows engine with keyword triggers,
-- automation rules, and execution analytics.

-- ---------- whatsapp_keyword_triggers ----------------------------
CREATE TABLE IF NOT EXISTS "whatsapp_keyword_triggers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "whatsapp_workspaces"("id") ON DELETE SET NULL,
  "keyword" varchar(120) NOT NULL,
  "match_type" varchar(20) NOT NULL DEFAULT 'exact',
  "action_type" varchar(40) NOT NULL DEFAULT 'reply',
  "reply_body" text,
  "flow_id" uuid REFERENCES "chatbot_flows"("id") ON DELETE SET NULL,
  "assign_to_user_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "tag_id" uuid REFERENCES "conversation_tags"("id") ON DELETE SET NULL,
  "priority" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_keyword_triggers_company_keyword_unique"
  ON "whatsapp_keyword_triggers" ("company_id", lower("keyword"))
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "whatsapp_keyword_triggers_active_idx"
  ON "whatsapp_keyword_triggers" ("company_id", "is_active", "priority");

-- ---------- whatsapp_automation_rules ----------------------------
CREATE TABLE IF NOT EXISTS "whatsapp_automation_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" varchar(180) NOT NULL,
  "description" text,
  "trigger_type" varchar(40) NOT NULL,
  "trigger_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "action_type" varchar(40) NOT NULL,
  "action_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "conditions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "priority" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "run_count" integer NOT NULL DEFAULT 0,
  "last_run_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "whatsapp_automation_rules_active_idx"
  ON "whatsapp_automation_rules" ("company_id", "is_active", "trigger_type", "priority");

-- ---------- whatsapp_flow_analytics_daily ------------------------
CREATE TABLE IF NOT EXISTS "whatsapp_flow_analytics_daily" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "flow_id" uuid NOT NULL REFERENCES "chatbot_flows"("id") ON DELETE CASCADE,
  "snapshot_date" date NOT NULL,
  "executions_started" integer NOT NULL DEFAULT 0,
  "executions_completed" integer NOT NULL DEFAULT 0,
  "executions_failed" integer NOT NULL DEFAULT 0,
  "messages_sent" integer NOT NULL DEFAULT 0,
  "avg_duration_seconds" integer,
  "conversion_count" integer NOT NULL DEFAULT 0,
  "handoff_count" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_flow_analytics_daily_unique"
  ON "whatsapp_flow_analytics_daily" ("company_id", "flow_id", "snapshot_date");
