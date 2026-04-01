CREATE TYPE company_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE membership_status AS ENUM ('active', 'invited', 'disabled');
CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
CREATE TYPE lead_status AS ENUM ('new', 'qualified', 'proposal', 'won', 'lost');

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  email varchar(320) NOT NULL,
  full_name varchar(180),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  timezone varchar(80) NOT NULL DEFAULT 'UTC',
  currency varchar(8) NOT NULL DEFAULT 'USD',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name varchar(180) NOT NULL,
  code varchar(64) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS stores_company_code_unique ON stores(company_id, code);

CREATE TABLE IF NOT EXISTS company_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role company_role NOT NULL DEFAULT 'member',
  status membership_status NOT NULL DEFAULT 'active',
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS company_memberships_company_user_unique ON company_memberships(company_id, user_id);
CREATE INDEX IF NOT EXISTS company_memberships_user_idx ON company_memberships(user_id);
CREATE INDEX IF NOT EXISTS company_memberships_company_idx ON company_memberships(company_id);

CREATE TABLE IF NOT EXISTS company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email varchar(320) NOT NULL,
  role company_role NOT NULL DEFAULT 'member',
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  token text NOT NULL,
  status invite_status NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL REFERENCES profiles(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_invites_token_unique ON company_invites(token);
CREATE INDEX IF NOT EXISTS company_invites_company_email_idx ON company_invites(company_id, email);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title varchar(180) NOT NULL,
  full_name varchar(180),
  email varchar(320),
  phone varchar(40),
  source varchar(100),
  status lead_status NOT NULL DEFAULT 'new',
  score integer NOT NULL DEFAULT 0,
  notes text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS leads_company_idx ON leads(company_id);
CREATE INDEX IF NOT EXISTS leads_company_status_idx ON leads(company_id, status);
CREATE INDEX IF NOT EXISTS leads_assigned_idx ON leads(assigned_to_user_id);

CREATE TABLE IF NOT EXISTS lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES profiles(id),
  type varchar(80) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
