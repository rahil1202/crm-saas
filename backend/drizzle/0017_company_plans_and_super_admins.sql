CREATE TYPE company_plan_status AS ENUM ('trial', 'active', 'past_due', 'canceled');
CREATE TYPE company_plan_interval AS ENUM ('monthly', 'yearly', 'custom');

CREATE TABLE company_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_code varchar(80) NOT NULL DEFAULT 'starter',
  plan_name varchar(120) NOT NULL DEFAULT 'Starter',
  status company_plan_status NOT NULL DEFAULT 'trial',
  billing_interval company_plan_interval NOT NULL DEFAULT 'monthly',
  seat_limit integer NOT NULL DEFAULT 5,
  monthly_price integer NOT NULL DEFAULT 0,
  currency varchar(8) NOT NULL DEFAULT 'USD',
  trial_ends_at timestamptz,
  renewal_date timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX company_plans_company_unique ON company_plans(company_id);
CREATE INDEX company_plans_status_idx ON company_plans(status);

CREATE TABLE super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email varchar(320) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX super_admins_user_unique ON super_admins(user_id);
CREATE UNIQUE INDEX super_admins_email_unique ON super_admins(email);
CREATE INDEX super_admins_active_idx ON super_admins(is_active);
