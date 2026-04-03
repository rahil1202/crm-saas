ALTER TYPE "public"."automation_run_status" ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE "public"."automation_run_status" ADD VALUE IF NOT EXISTS 'running';
ALTER TYPE "public"."automation_run_status" ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE "public"."automation_run_status" ADD VALUE IF NOT EXISTS 'canceled';

-- Intentionally skip status backfill in this migration because PostgreSQL
-- does not allow using newly added enum values in the same transaction block.

DO $$ BEGIN
  CREATE TYPE "public"."automation_step_status" AS ENUM ('pending', 'running', 'completed', 'failed', 'canceled', 'scheduled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."email_account_status" AS ENUM ('connected', 'disconnected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."email_message_status" AS ENUM ('queued', 'sending', 'sent', 'delivered', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."email_event_type" AS ENUM ('sent', 'delivered', 'opened', 'clicked', 'replied', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."conversation_state_status" AS ENUM ('active', 'paused', 'completed', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "automation_runs"
  ADD COLUMN IF NOT EXISTS "trigger_type" varchar(80) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "current_action_index" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_retries" integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "correlation_key" varchar(180),
  ADD COLUMN IF NOT EXISTS "next_run_at" timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "canceled_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_error" text,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE "social_conversations"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "social_messages"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "automation_runs_status_idx" ON "automation_runs" USING btree ("company_id", "status", "next_run_at");
CREATE INDEX IF NOT EXISTS "automation_runs_correlation_idx" ON "automation_runs" USING btree ("company_id", "correlation_key");

CREATE TABLE IF NOT EXISTS "automation_run_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "automation_run_id" uuid NOT NULL REFERENCES "automation_runs"("id") ON DELETE cascade,
  "action_index" integer NOT NULL,
  "action_type" varchar(80) NOT NULL,
  "status" "public"."automation_step_status" NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "parallel_key" varchar(80),
  "next_attempt_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "last_error" text,
  "output" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "automation_run_steps_run_action_unique" ON "automation_run_steps" USING btree ("automation_run_id", "action_index");
CREATE INDEX IF NOT EXISTS "automation_run_steps_run_idx" ON "automation_run_steps" USING btree ("automation_run_id", "action_index");
CREATE INDEX IF NOT EXISTS "automation_run_steps_company_status_idx" ON "automation_run_steps" USING btree ("company_id", "status");

CREATE TABLE IF NOT EXISTS "automation_trigger_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "trigger_type" varchar(80) NOT NULL,
  "event_key" varchar(180) NOT NULL,
  "entity_type" varchar(80),
  "entity_id" uuid,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "automation_trigger_events_key_unique" ON "automation_trigger_events" USING btree ("company_id", "event_key");
CREATE INDEX IF NOT EXISTS "automation_trigger_events_trigger_idx" ON "automation_trigger_events" USING btree ("company_id", "trigger_type", "created_at");

CREATE TABLE IF NOT EXISTS "email_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "user_id" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "label" varchar(180) NOT NULL,
  "provider" varchar(80) NOT NULL DEFAULT 'mock',
  "from_name" varchar(180),
  "from_email" varchar(320) NOT NULL,
  "status" "public"."email_account_status" NOT NULL DEFAULT 'connected',
  "is_default" boolean NOT NULL DEFAULT false,
  "credentials" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "email_accounts_company_idx" ON "email_accounts" USING btree ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "email_accounts_default_idx" ON "email_accounts" USING btree ("company_id", "is_default");
CREATE UNIQUE INDEX IF NOT EXISTS "email_accounts_company_email_unique" ON "email_accounts" USING btree ("company_id", "from_email");

CREATE TABLE IF NOT EXISTS "email_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE set null,
  "automation_id" uuid REFERENCES "automations"("id") ON DELETE set null,
  "automation_run_id" uuid REFERENCES "automation_runs"("id") ON DELETE set null,
  "email_account_id" uuid REFERENCES "email_accounts"("id") ON DELETE set null,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "lead_id" uuid REFERENCES "leads"("id") ON DELETE set null,
  "recipient_email" varchar(320) NOT NULL,
  "recipient_name" varchar(180),
  "subject" varchar(240) NOT NULL,
  "html_content" text NOT NULL,
  "text_content" text,
  "status" "public"."email_message_status" NOT NULL DEFAULT 'queued',
  "provider" varchar(80) NOT NULL DEFAULT 'mock',
  "provider_message_id" varchar(180),
  "tracking_token" varchar(180) NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "queued_at" timestamp with time zone NOT NULL DEFAULT now(),
  "scheduled_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "last_error" text,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_messages_tracking_token_unique" ON "email_messages" USING btree ("tracking_token");
CREATE INDEX IF NOT EXISTS "email_messages_status_idx" ON "email_messages" USING btree ("company_id", "status", "queued_at");
CREATE INDEX IF NOT EXISTS "email_messages_campaign_idx" ON "email_messages" USING btree ("campaign_id", "created_at");
CREATE INDEX IF NOT EXISTS "email_messages_run_idx" ON "email_messages" USING btree ("automation_run_id", "created_at");

CREATE TABLE IF NOT EXISTS "email_tracking_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "email_message_id" uuid NOT NULL REFERENCES "email_messages"("id") ON DELETE cascade,
  "event_type" "public"."email_event_type" NOT NULL,
  "tracking_token" varchar(180) NOT NULL,
  "event_key" varchar(180) NOT NULL,
  "url" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_tracking_events_key_unique" ON "email_tracking_events" USING btree ("event_key");
CREATE INDEX IF NOT EXISTS "email_tracking_events_message_idx" ON "email_tracking_events" USING btree ("email_message_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "email_tracking_events_company_type_idx" ON "email_tracking_events" USING btree ("company_id", "event_type", "occurred_at");

CREATE TABLE IF NOT EXISTS "conversation_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "social_conversation_id" uuid NOT NULL REFERENCES "social_conversations"("id") ON DELETE cascade,
  "automation_id" uuid REFERENCES "automations"("id") ON DELETE set null,
  "automation_run_id" uuid REFERENCES "automation_runs"("id") ON DELETE set null,
  "session_key" varchar(180) NOT NULL,
  "current_node" varchar(120) NOT NULL DEFAULT 'start',
  "status" "public"."conversation_state_status" NOT NULL DEFAULT 'active',
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "expires_at" timestamp with time zone,
  "last_message_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resumed_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_states_session_key_unique" ON "conversation_states" USING btree ("company_id", "session_key");
CREATE INDEX IF NOT EXISTS "conversation_states_conversation_idx" ON "conversation_states" USING btree ("social_conversation_id", "updated_at");
CREATE INDEX IF NOT EXISTS "conversation_states_status_idx" ON "conversation_states" USING btree ("company_id", "status", "expires_at");
