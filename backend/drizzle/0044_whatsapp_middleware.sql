DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_outbox_status') THEN
    CREATE TYPE whatsapp_outbox_status AS ENUM ('queued', 'sending', 'sent', 'retrying', 'failed', 'blocked', 'canceled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_webhook_event_status') THEN
    CREATE TYPE whatsapp_webhook_event_status AS ENUM ('queued', 'processing', 'processed', 'ignored', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_message_event_type') THEN
    CREATE TYPE whatsapp_message_event_type AS ENUM ('accepted', 'sent', 'delivered', 'read', 'failed');
  END IF;
END $$;

ALTER TABLE whatsapp_workspaces
  ADD COLUMN IF NOT EXISTS webhook_key varchar(120),
  ADD COLUMN IF NOT EXISTS verify_token_hash varchar(128),
  ADD COLUMN IF NOT EXISTS active_phone_number_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_workspaces_webhook_key_unique
  ON whatsapp_workspaces (webhook_key);

ALTER TABLE whatsapp_webhook_events
  ADD COLUMN IF NOT EXISTS event_type varchar(80) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS status whatsapp_webhook_event_status NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS raw_body text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE whatsapp_webhook_events
  ALTER COLUMN processed_at DROP NOT NULL,
  ALTER COLUMN processed_at DROP DEFAULT;

CREATE INDEX IF NOT EXISTS whatsapp_webhook_events_queue_idx
  ON whatsapp_webhook_events (status, received_at);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES whatsapp_workspaces(id) ON DELETE SET NULL,
  conversation_id uuid NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  phone_e164 varchar(24) NOT NULL,
  last_inbound_at timestamptz,
  service_window_expires_at timestamptz,
  state varchar(40) NOT NULL DEFAULT 'closed',
  last_outbound_at timestamptz,
  last_template_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_sessions_conversation_unique
  ON whatsapp_sessions (company_id, conversation_id);
CREATE INDEX IF NOT EXISTS whatsapp_sessions_phone_idx
  ON whatsapp_sessions (company_id, phone_e164);
CREATE INDEX IF NOT EXISTS whatsapp_sessions_window_idx
  ON whatsapp_sessions (company_id, service_window_expires_at);

CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES whatsapp_workspaces(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES social_conversations(id) ON DELETE SET NULL,
  social_message_id uuid REFERENCES social_messages(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  to_phone_e164 varchar(24) NOT NULL,
  mode varchar(24) NOT NULL DEFAULT 'auto',
  resolved_mode varchar(24) NOT NULL DEFAULT 'text',
  message_type varchar(40) NOT NULL DEFAULT 'text',
  status whatsapp_outbox_status NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 100,
  idempotency_key varchar(180),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_message_id varchar(180),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_outbox_company_idempotency_unique
  ON whatsapp_outbox (company_id, idempotency_key);
CREATE INDEX IF NOT EXISTS whatsapp_outbox_queue_idx
  ON whatsapp_outbox (status, next_attempt_at, priority, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_outbox_conversation_idx
  ON whatsapp_outbox (company_id, conversation_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_outbox_pair_idx
  ON whatsapp_outbox (workspace_id, to_phone_e164, sent_at);

CREATE TABLE IF NOT EXISTS whatsapp_message_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES whatsapp_workspaces(id) ON DELETE SET NULL,
  outbox_id uuid REFERENCES whatsapp_outbox(id) ON DELETE SET NULL,
  social_message_id uuid REFERENCES social_messages(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES social_conversations(id) ON DELETE SET NULL,
  provider_message_id varchar(180) NOT NULL,
  phone_number_id varchar(120),
  wa_id varchar(80),
  direction social_message_direction NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_message_links_provider_unique
  ON whatsapp_message_links (provider_message_id);
CREATE INDEX IF NOT EXISTS whatsapp_message_links_message_idx
  ON whatsapp_message_links (company_id, social_message_id);

CREATE TABLE IF NOT EXISTS whatsapp_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES whatsapp_workspaces(id) ON DELETE SET NULL,
  outbox_id uuid REFERENCES whatsapp_outbox(id) ON DELETE SET NULL,
  social_message_id uuid REFERENCES social_messages(id) ON DELETE SET NULL,
  provider_message_id varchar(180) NOT NULL,
  event_type whatsapp_message_event_type NOT NULL,
  event_key varchar(240) NOT NULL,
  provider_timestamp timestamptz,
  error_code varchar(80),
  error_message text,
  pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversation jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_message_events_key_unique
  ON whatsapp_message_events (company_id, event_key);
CREATE INDEX IF NOT EXISTS whatsapp_message_events_provider_idx
  ON whatsapp_message_events (provider_message_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_message_events_message_idx
  ON whatsapp_message_events (company_id, social_message_id, created_at);

CREATE TABLE IF NOT EXISTS whatsapp_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES whatsapp_workspaces(id) ON DELETE SET NULL,
  media_type varchar(40) NOT NULL,
  source_url text,
  checksum varchar(128),
  provider_media_id varchar(180),
  caption varchar(500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_media_assets_checksum_unique
  ON whatsapp_media_assets (company_id, workspace_id, checksum);
CREATE INDEX IF NOT EXISTS whatsapp_media_assets_provider_idx
  ON whatsapp_media_assets (provider_media_id);
