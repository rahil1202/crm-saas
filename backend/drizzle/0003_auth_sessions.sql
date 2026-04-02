CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  token_hash varchar(128) NOT NULL,
  jti uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_token_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_refresh_tokens_token_hash_unique ON auth_refresh_tokens(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS auth_refresh_tokens_jti_unique ON auth_refresh_tokens(jti);
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_session_idx ON auth_refresh_tokens(user_id, session_id);
