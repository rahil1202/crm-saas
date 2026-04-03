CREATE TYPE follow_up_status AS ENUM ('pending', 'completed', 'missed', 'canceled');
CREATE TYPE partner_access_level AS ENUM ('restricted', 'standard', 'manager');

CREATE TABLE follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  subject varchar(180) NOT NULL,
  channel varchar(40) NOT NULL DEFAULT 'call',
  status follow_up_status NOT NULL DEFAULT 'pending',
  scheduled_at timestamptz NOT NULL,
  completed_at timestamptz,
  notes text,
  outcome varchar(240),
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX follow_ups_company_idx ON follow_ups(company_id, scheduled_at);
CREATE INDEX follow_ups_status_idx ON follow_ups(company_id, status);
CREATE INDEX follow_ups_assigned_idx ON follow_ups(company_id, assigned_to_user_id);

CREATE TABLE partner_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_company_id uuid NOT NULL REFERENCES partner_companies(id) ON DELETE CASCADE,
  full_name varchar(180) NOT NULL,
  email varchar(320) NOT NULL,
  phone varchar(40),
  title varchar(120),
  status partner_status NOT NULL DEFAULT 'active',
  access_level partner_access_level NOT NULL DEFAULT 'restricted',
  permissions jsonb NOT NULL DEFAULT '{"leads":true,"deals":true,"reports":false,"documents":false}'::jsonb,
  last_access_at timestamptz,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX partner_users_partner_email_unique ON partner_users(partner_company_id, email);
CREATE INDEX partner_users_company_idx ON partner_users(company_id, created_at);
CREATE INDEX partner_users_partner_idx ON partner_users(partner_company_id, created_at);
CREATE INDEX partner_users_status_idx ON partner_users(company_id, status);
