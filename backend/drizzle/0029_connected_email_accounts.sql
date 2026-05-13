-- Gmail OAuth connected accounts
-- Stores per-user Gmail connections for outreach campaigns.
-- Tokens are encrypted at rest using AES-256-GCM (integration-crypto).

CREATE TABLE IF NOT EXISTS connected_email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL DEFAULT 'google',
  email varchar(320) NOT NULL,
  -- AES-256-GCM encrypted blobs (enc:v1:... prefix)
  access_token_enc text NOT NULL,
  refresh_token_enc text NOT NULL,
  token_expiry timestamptz NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active Gmail account per user (can be extended to multi-account later)
CREATE UNIQUE INDEX IF NOT EXISTS connected_email_accounts_user_provider_email_unique
  ON connected_email_accounts(user_id, provider, email);

CREATE INDEX IF NOT EXISTS connected_email_accounts_user_idx
  ON connected_email_accounts(user_id);

CREATE INDEX IF NOT EXISTS connected_email_accounts_user_active_idx
  ON connected_email_accounts(user_id, is_active);
