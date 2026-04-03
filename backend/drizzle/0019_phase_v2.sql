DO $$ BEGIN
  CREATE TYPE "public"."whatsapp_template_status" AS ENUM ('draft', 'approved', 'rejected', 'paused');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."sequence_status" AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."sequence_step_channel" AS ENUM ('email', 'whatsapp');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."sequence_run_status" AS ENUM ('queued', 'running', 'completed', 'failed', 'skipped', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "name" varchar(180) NOT NULL,
  "phone_number_id" varchar(120) NOT NULL,
  "business_account_id" varchar(120),
  "access_token" text,
  "verify_token" varchar(240),
  "app_secret" varchar(240),
  "is_active" boolean NOT NULL DEFAULT true,
  "is_verified" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_workspaces_company_phone_unique" ON "whatsapp_workspaces" USING btree ("company_id", "phone_number_id");
CREATE INDEX IF NOT EXISTS "whatsapp_workspaces_company_active_idx" ON "whatsapp_workspaces" USING btree ("company_id", "is_active");

CREATE TABLE IF NOT EXISTS "whatsapp_phone_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "phone_e164" varchar(24) NOT NULL,
  "lead_id" uuid REFERENCES "leads"("id") ON DELETE set null,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "social_conversation_id" uuid REFERENCES "social_conversations"("id") ON DELETE set null,
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_phone_mappings_company_phone_unique" ON "whatsapp_phone_mappings" USING btree ("company_id", "phone_e164");
CREATE INDEX IF NOT EXISTS "whatsapp_phone_mappings_lookup_idx" ON "whatsapp_phone_mappings" USING btree ("company_id", "lead_id", "customer_id");

CREATE TABLE IF NOT EXISTS "whatsapp_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "workspace_id" uuid REFERENCES "whatsapp_workspaces"("id") ON DELETE set null,
  "name" varchar(180) NOT NULL,
  "category" varchar(80),
  "language" varchar(16) NOT NULL DEFAULT 'en',
  "status" "public"."whatsapp_template_status" NOT NULL DEFAULT 'draft',
  "body" text NOT NULL,
  "variables" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "provider_template_id" varchar(180),
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "whatsapp_templates_company_idx" ON "whatsapp_templates" USING btree ("company_id", "status", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_templates_company_name_lang_unique" ON "whatsapp_templates" USING btree ("company_id", "name", "language");

CREATE TABLE IF NOT EXISTS "whatsapp_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "workspace_id" uuid REFERENCES "whatsapp_workspaces"("id") ON DELETE set null,
  "event_key" varchar(220) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "processed_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_webhook_events_company_key_unique" ON "whatsapp_webhook_events" USING btree ("company_id", "event_key");

CREATE TABLE IF NOT EXISTS "lead_scoring_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "name" varchar(180) NOT NULL,
  "event_type" varchar(80) NOT NULL,
  "channel" varchar(40),
  "conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "weight" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "priority" integer NOT NULL DEFAULT 100,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "lead_scoring_rules_company_event_idx" ON "lead_scoring_rules" USING btree ("company_id", "event_type", "is_active", "priority");

CREATE TABLE IF NOT EXISTS "lead_score_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "event_type" varchar(80) NOT NULL,
  "channel" varchar(40),
  "source_id" varchar(180),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "lead_score_events_lead_idx" ON "lead_score_events" USING btree ("company_id", "lead_id", "created_at");

CREATE TABLE IF NOT EXISTS "lead_score_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "previous_score" integer NOT NULL DEFAULT 0,
  "new_score" integer NOT NULL DEFAULT 0,
  "delta" integer NOT NULL DEFAULT 0,
  "reason" varchar(240),
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "lead_score_history_lead_idx" ON "lead_score_history" USING btree ("company_id", "lead_id", "created_at");

CREATE TABLE IF NOT EXISTS "lead_routing_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "name" varchar(180) NOT NULL,
  "priority" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "strategy" varchar(40) NOT NULL DEFAULT 'rule_match',
  "predicates" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "assignment_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "lead_routing_rules_company_priority_idx" ON "lead_routing_rules" USING btree ("company_id", "is_active", "priority");

CREATE TABLE IF NOT EXISTS "lead_assignment_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "previous_assigned_to_user_id" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "new_assigned_to_user_id" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "rule_id" uuid REFERENCES "lead_routing_rules"("id") ON DELETE set null,
  "reason" varchar(180),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "lead_assignment_audits_lead_idx" ON "lead_assignment_audits" USING btree ("company_id", "lead_id", "created_at");

CREATE TABLE IF NOT EXISTS "sequence_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "name" varchar(180) NOT NULL,
  "status" "public"."sequence_status" NOT NULL DEFAULT 'draft',
  "description" text,
  "trigger_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "analytics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "sequence_definitions_company_status_idx" ON "sequence_definitions" USING btree ("company_id", "status");

CREATE TABLE IF NOT EXISTS "sequence_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "sequence_id" uuid NOT NULL REFERENCES "sequence_definitions"("id") ON DELETE cascade,
  "step_index" integer NOT NULL,
  "channel" "public"."sequence_step_channel" NOT NULL,
  "step_type" varchar(80) NOT NULL,
  "delay_minutes" integer NOT NULL DEFAULT 0,
  "conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sequence_steps_sequence_index_unique" ON "sequence_steps" USING btree ("sequence_id", "step_index");

CREATE TABLE IF NOT EXISTS "sequence_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "sequence_id" uuid NOT NULL REFERENCES "sequence_definitions"("id") ON DELETE cascade,
  "lead_id" uuid REFERENCES "leads"("id") ON DELETE set null,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "status" "public"."sequence_run_status" NOT NULL DEFAULT 'queued',
  "current_step_index" integer NOT NULL DEFAULT 0,
  "next_run_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_run_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sequence_enrollments_company_status_idx" ON "sequence_enrollments" USING btree ("company_id", "status", "next_run_at");
CREATE INDEX IF NOT EXISTS "sequence_enrollments_target_idx" ON "sequence_enrollments" USING btree ("company_id", "lead_id", "customer_id");

CREATE TABLE IF NOT EXISTS "sequence_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "sequence_id" uuid NOT NULL REFERENCES "sequence_definitions"("id") ON DELETE cascade,
  "enrollment_id" uuid NOT NULL REFERENCES "sequence_enrollments"("id") ON DELETE cascade,
  "step_id" uuid REFERENCES "sequence_steps"("id") ON DELETE set null,
  "step_index" integer NOT NULL DEFAULT 0,
  "status" "public"."sequence_run_status" NOT NULL DEFAULT 'queued',
  "run_at" timestamp with time zone NOT NULL DEFAULT now(),
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "error_message" text,
  "output" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sequence_runs_company_status_idx" ON "sequence_runs" USING btree ("company_id", "status", "run_at");
CREATE INDEX IF NOT EXISTS "sequence_runs_enrollment_idx" ON "sequence_runs" USING btree ("enrollment_id", "created_at");

CREATE TABLE IF NOT EXISTS "email_analytics_daily" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE set null,
  "day" date NOT NULL,
  "sent_count" integer NOT NULL DEFAULT 0,
  "delivered_count" integer NOT NULL DEFAULT 0,
  "opened_count" integer NOT NULL DEFAULT 0,
  "clicked_count" integer NOT NULL DEFAULT 0,
  "replied_count" integer NOT NULL DEFAULT 0,
  "bounced_count" integer NOT NULL DEFAULT 0,
  "engagement_score" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_analytics_daily_company_campaign_day_unique" ON "email_analytics_daily" USING btree ("company_id", "campaign_id", "day");
CREATE INDEX IF NOT EXISTS "email_analytics_daily_company_day_idx" ON "email_analytics_daily" USING btree ("company_id", "day");

ALTER TABLE "social_conversations"
  ADD COLUMN IF NOT EXISTS "human_takeover_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "bot_state" varchar(40) NOT NULL DEFAULT 'bot_active',
  ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_outbound_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "message_status_summary" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "social_messages"
  ADD COLUMN IF NOT EXISTS "delivery_status" varchar(40) NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS "provider_message_id" varchar(180),
  ADD COLUMN IF NOT EXISTS "message_type" varchar(40) NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS "parent_message_id" uuid REFERENCES "social_messages"("id") ON DELETE set null;

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "sequence_definition_id" uuid REFERENCES "sequence_definitions"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "channel_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "reply_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bounce_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "engagement_score" integer NOT NULL DEFAULT 0;

ALTER TABLE "automations"
  ADD COLUMN IF NOT EXISTS "test_mode_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "branch_mode" varchar(40) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "channel_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "social_conversations_takeover_idx" ON "social_conversations" USING btree ("company_id", "human_takeover_enabled", "last_message_at");
CREATE INDEX IF NOT EXISTS "social_messages_delivery_idx" ON "social_messages" USING btree ("company_id", "delivery_status", "sent_at");
