-- Phase 2: WhatsApp CRM — Live chat inbox + contact management.
-- Additive migration. Adds inbox ergonomics columns to social_conversations,
-- message attachments, contact tags, conversation notes and mentions, and
-- message read receipts. Multi-tenant safe: all tables carry company_id and
-- foreign-key onto companies(id) ON DELETE CASCADE, plus indexes for hot paths.

-- ---------- social_conversations: pin, archive, priority, agent read cursor ----
ALTER TABLE "social_conversations"
  ADD COLUMN IF NOT EXISTS "pinned_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "priority" varchar(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "agent_last_read_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "tag_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "social_conversations_pinned_idx"
  ON "social_conversations" ("company_id", "pinned_at")
  WHERE "pinned_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "social_conversations_archived_idx"
  ON "social_conversations" ("company_id", "archived_at")
  WHERE "archived_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "social_conversations_priority_idx"
  ON "social_conversations" ("company_id", "priority", "last_message_at");

-- ---------- social_messages: edited, deleted, reactions ----------------------
ALTER TABLE "social_messages"
  ADD COLUMN IF NOT EXISTS "edited_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "reactions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "read_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "failed_at" timestamptz;

-- ---------- conversation_tags: per-company tag dictionary ---------------------
CREATE TABLE IF NOT EXISTS "conversation_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "color" varchar(32) NOT NULL DEFAULT 'emerald',
  "description" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_tags_company_name_unique"
  ON "conversation_tags" ("company_id", "name")
  WHERE "deleted_at" IS NULL;

-- ---------- conversation_notes: internal notes + mentions ---------------------
CREATE TABLE IF NOT EXISTS "conversation_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "conversation_id" uuid NOT NULL REFERENCES "social_conversations"("id") ON DELETE CASCADE,
  "author_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "mentions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "conversation_notes_conversation_idx"
  ON "conversation_notes" ("company_id", "conversation_id", "created_at");

-- ---------- conversation_participants: agents watching a conversation ---------
CREATE TABLE IF NOT EXISTS "conversation_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "conversation_id" uuid NOT NULL REFERENCES "social_conversations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "role" varchar(40) NOT NULL DEFAULT 'watcher',
  "last_read_at" timestamptz,
  "muted" boolean NOT NULL DEFAULT false,
  "joined_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_participants_unique"
  ON "conversation_participants" ("conversation_id", "user_id");

CREATE INDEX IF NOT EXISTS "conversation_participants_user_idx"
  ON "conversation_participants" ("company_id", "user_id");

-- ---------- message_attachments: media assets linked to messages --------------
CREATE TABLE IF NOT EXISTS "message_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "message_id" uuid REFERENCES "social_messages"("id") ON DELETE CASCADE,
  "conversation_id" uuid REFERENCES "social_conversations"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "whatsapp_workspaces"("id") ON DELETE SET NULL,
  "media_type" varchar(20) NOT NULL,
  "mime_type" varchar(120),
  "size_bytes" bigint,
  "original_name" varchar(240),
  "storage_provider" varchar(40) NOT NULL DEFAULT 'supabase',
  "storage_bucket" varchar(120),
  "storage_object_path" text NOT NULL,
  "provider_media_id" varchar(180),
  "source_url" text,
  "caption" text,
  "width" integer,
  "height" integer,
  "duration_ms" integer,
  "thumbnail_object_path" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "message_attachments_message_idx"
  ON "message_attachments" ("message_id");

CREATE INDEX IF NOT EXISTS "message_attachments_company_idx"
  ON "message_attachments" ("company_id", "created_at");

-- ---------- message_status_logs: full audit of delivery + read transitions ----
CREATE TABLE IF NOT EXISTS "message_status_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "social_messages"("id") ON DELETE CASCADE,
  "status" varchar(40) NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "source" varchar(40) NOT NULL DEFAULT 'provider',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "message_status_logs_message_idx"
  ON "message_status_logs" ("message_id", "occurred_at");

-- ---------- contact_tags: link WhatsApp contacts to conversation tags ---------
CREATE TABLE IF NOT EXISTS "contact_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "contact_handle" varchar(180) NOT NULL,
  "tag_id" uuid NOT NULL REFERENCES "conversation_tags"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "contact_tags_unique"
  ON "contact_tags" ("company_id", "contact_handle", "tag_id");

CREATE INDEX IF NOT EXISTS "contact_tags_handle_idx"
  ON "contact_tags" ("company_id", "contact_handle");

-- ---------- whatsapp_contact_profiles: opt-in, custom fields, engagement ------
CREATE TABLE IF NOT EXISTS "whatsapp_contact_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "phone_e164" varchar(32) NOT NULL,
  "display_name" varchar(180),
  "avatar_url" text,
  "locale" varchar(16),
  "opt_in_status" varchar(20) NOT NULL DEFAULT 'unknown',
  "opt_in_source" varchar(80),
  "opt_in_at" timestamptz,
  "opt_out_at" timestamptz,
  "engagement_score" integer NOT NULL DEFAULT 0,
  "engagement_status" varchar(20) NOT NULL DEFAULT 'cold',
  "last_inbound_at" timestamptz,
  "last_outbound_at" timestamptz,
  "custom_fields" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_contact_profiles_unique"
  ON "whatsapp_contact_profiles" ("company_id", "phone_e164")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "whatsapp_contact_profiles_engagement_idx"
  ON "whatsapp_contact_profiles" ("company_id", "engagement_status", "last_inbound_at");
