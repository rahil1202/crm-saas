CREATE TYPE deal_status AS ENUM ('open', 'won', 'lost');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done', 'overdue');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  full_name varchar(180) NOT NULL,
  email varchar(320),
  phone varchar(40),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS customers_company_idx ON customers(company_id);
CREATE INDEX IF NOT EXISTS customers_lead_idx ON customers(lead_id);
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email);

CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title varchar(180) NOT NULL,
  pipeline varchar(100) NOT NULL DEFAULT 'default',
  stage varchar(100) NOT NULL DEFAULT 'new',
  status deal_status NOT NULL DEFAULT 'open',
  value integer NOT NULL DEFAULT 0,
  expected_close_date timestamptz,
  lost_reason varchar(250),
  notes text,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS deals_company_idx ON deals(company_id);
CREATE INDEX IF NOT EXISTS deals_company_status_idx ON deals(company_id, status);
CREATE INDEX IF NOT EXISTS deals_assigned_idx ON deals(assigned_to_user_id);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title varchar(180) NOT NULL,
  description text,
  status task_status NOT NULL DEFAULT 'todo',
  priority task_priority NOT NULL DEFAULT 'medium',
  due_at timestamptz,
  completed_at timestamptz,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule varchar(120),
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS tasks_company_idx ON tasks(company_id);
CREATE INDEX IF NOT EXISTS tasks_company_status_idx ON tasks(company_id, status);
CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks(due_at);
