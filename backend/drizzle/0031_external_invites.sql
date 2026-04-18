CREATE TYPE external_invite_channel AS ENUM ('email', 'whatsapp', 'link');
CREATE TYPE external_invite_status AS ENUM ('pending', 'completed', 'canceled');

CREATE TABLE external_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  channel external_invite_channel NOT NULL DEFAULT 'email',
  status external_invite_status NOT NULL DEFAULT 'pending',
  contact_name varchar(180),
  email varchar(320),
  phone varchar(40),
  invite_link_token varchar(120) NOT NULL,
  message text,
  invited_by uuid NOT NULL REFERENCES profiles(id),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX external_invites_link_token_unique ON external_invites(invite_link_token);
CREATE INDEX external_invites_company_created_idx ON external_invites(company_id, created_at);
CREATE INDEX external_invites_company_status_idx ON external_invites(company_id, status, created_at);
CREATE INDEX external_invites_expires_idx ON external_invites(expires_at);
