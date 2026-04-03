DO $$ BEGIN
  CREATE TYPE "public"."chatbot_flow_status" AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."chatbot_flow_entry_channel" AS ENUM ('whatsapp');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."chatbot_flow_version_state" AS ENUM ('draft', 'published');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."chatbot_flow_execution_status" AS ENUM ('running', 'paused', 'completed', 'failed', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "chatbot_flows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "name" varchar(180) NOT NULL,
  "status" "public"."chatbot_flow_status" NOT NULL DEFAULT 'draft',
  "entry_channel" "public"."chatbot_flow_entry_channel" NOT NULL DEFAULT 'whatsapp',
  "published_version_id" uuid,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "chatbot_flows_company_idx" ON "chatbot_flows" USING btree ("company_id", "updated_at");
CREATE INDEX IF NOT EXISTS "chatbot_flows_status_idx" ON "chatbot_flows" USING btree ("company_id", "status");

CREATE TABLE IF NOT EXISTS "chatbot_flow_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "flow_id" uuid NOT NULL REFERENCES "chatbot_flows"("id") ON DELETE cascade,
  "version_number" integer NOT NULL,
  "state" "public"."chatbot_flow_version_state" NOT NULL DEFAULT 'draft',
  "definition" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "validation_errors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "published_at" timestamp with time zone,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "chatbot_flow_versions_flow_version_unique" ON "chatbot_flow_versions" USING btree ("flow_id", "version_number");
CREATE INDEX IF NOT EXISTS "chatbot_flow_versions_flow_state_idx" ON "chatbot_flow_versions" USING btree ("flow_id", "state", "created_at");

CREATE TABLE IF NOT EXISTS "chatbot_flow_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "flow_id" uuid NOT NULL REFERENCES "chatbot_flows"("id") ON DELETE cascade,
  "flow_version_id" uuid NOT NULL REFERENCES "chatbot_flow_versions"("id") ON DELETE cascade,
  "conversation_state_id" uuid NOT NULL,
  "status" "public"."chatbot_flow_execution_status" NOT NULL DEFAULT 'running',
  "current_node_id" varchar(120) NOT NULL,
  "trigger_source" varchar(80) NOT NULL DEFAULT 'manual_test',
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_inbound_message_id" uuid,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "last_error" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chatbot_flow_executions_flow_idx" ON "chatbot_flow_executions" USING btree ("flow_id", "started_at");
CREATE INDEX IF NOT EXISTS "chatbot_flow_executions_conversation_idx" ON "chatbot_flow_executions" USING btree ("conversation_state_id", "updated_at");
CREATE INDEX IF NOT EXISTS "chatbot_flow_executions_status_idx" ON "chatbot_flow_executions" USING btree ("company_id", "status", "updated_at");

CREATE TABLE IF NOT EXISTS "chatbot_flow_execution_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "execution_id" uuid NOT NULL REFERENCES "chatbot_flow_executions"("id") ON DELETE cascade,
  "node_id" varchar(120),
  "event_type" varchar(80) NOT NULL,
  "message" varchar(240) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chatbot_flow_execution_logs_execution_idx" ON "chatbot_flow_execution_logs" USING btree ("execution_id", "created_at");
CREATE INDEX IF NOT EXISTS "chatbot_flow_execution_logs_company_idx" ON "chatbot_flow_execution_logs" USING btree ("company_id", "created_at");
