DO $$ BEGIN
  CREATE TYPE social_platform AS ENUM ('instagram', 'facebook', 'whatsapp', 'linkedin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE social_account_status AS ENUM ('connected', 'disconnected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE social_conversation_status AS ENUM ('open', 'assigned', 'closed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE social_message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  account_name varchar(180) NOT NULL,
  handle varchar(180) NOT NULL,
  status social_account_status NOT NULL DEFAULT 'connected',
  access_mode varchar(40) NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS social_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  social_account_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  platform social_platform NOT NULL,
  contact_name varchar(180),
  contact_handle varchar(180) NOT NULL,
  status social_conversation_status NOT NULL DEFAULT 'open',
  subject varchar(240),
  latest_message text,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS social_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  direction social_message_direction NOT NULL,
  sender_name varchar(180),
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_accounts_company_idx ON social_accounts (company_id, created_at);
CREATE INDEX IF NOT EXISTS social_accounts_platform_idx ON social_accounts (company_id, platform);
CREATE INDEX IF NOT EXISTS social_conversations_company_idx ON social_conversations (company_id, last_message_at);
CREATE INDEX IF NOT EXISTS social_conversations_account_idx ON social_conversations (social_account_id, last_message_at);
CREATE INDEX IF NOT EXISTS social_conversations_assigned_idx ON social_conversations (company_id, assigned_to_user_id);
CREATE INDEX IF NOT EXISTS social_messages_conversation_idx ON social_messages (conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS social_messages_company_idx ON social_messages (company_id, sent_at);
