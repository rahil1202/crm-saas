CREATE TABLE IF NOT EXISTS company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  default_deal_pipeline varchar(100) NOT NULL DEFAULT 'default',
  deal_pipelines jsonb NOT NULL DEFAULT '[
    {
      "key": "default",
      "label": "Default Pipeline",
      "stages": [
        { "key": "new", "label": "New" },
        { "key": "qualified", "label": "Qualified" },
        { "key": "proposal", "label": "Proposal" },
        { "key": "negotiation", "label": "Negotiation" },
        { "key": "won", "label": "Won" }
      ]
    }
  ]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_settings_company_unique ON company_settings(company_id);
