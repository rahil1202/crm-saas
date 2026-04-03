CREATE TYPE auth_session_status AS ENUM ('active', 'revoked', 'expired');

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status auth_session_status NOT NULL DEFAULT 'active',
  ip_address varchar(64),
  user_agent varchar(512),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_status_idx ON auth_sessions(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS request_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope varchar(80) NOT NULL,
  bucket_key varchar(255) NOT NULL,
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS request_rate_limits_bucket_unique
  ON request_rate_limits(scope, bucket_key, window_start);
CREATE INDEX IF NOT EXISTS request_rate_limits_expires_idx
  ON request_rate_limits(expires_at);

CREATE TABLE IF NOT EXISTS webhook_replay_guards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(80) NOT NULL,
  replay_key varchar(255) NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_replay_guards_provider_key_unique
  ON webhook_replay_guards(provider, replay_key);
CREATE INDEX IF NOT EXISTS webhook_replay_guards_expires_idx
  ON webhook_replay_guards(expires_at);

CREATE TABLE IF NOT EXISTS security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id varchar(120),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  session_id uuid,
  route varchar(255) NOT NULL,
  action varchar(120) NOT NULL,
  result varchar(60) NOT NULL,
  ip_address varchar(64),
  user_agent varchar(512),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_logs_route_created_idx
  ON security_audit_logs(route, created_at);
CREATE INDEX IF NOT EXISTS security_audit_logs_company_created_idx
  ON security_audit_logs(company_id, created_at);
CREATE INDEX IF NOT EXISTS security_audit_logs_user_created_idx
  ON security_audit_logs(user_id, created_at);
