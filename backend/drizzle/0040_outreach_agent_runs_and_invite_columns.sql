ALTER TABLE company_invites
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resent_at timestamptz,
  ADD COLUMN IF NOT EXISTS resend_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS outreach_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status varchar(40) NOT NULL DEFAULT 'running',
  trigger_type varchar(40) NOT NULL DEFAULT 'manual',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  queued_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_agent_runs_company_started_idx ON outreach_agent_runs(company_id, started_at);
