ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS lead_sources jsonb NOT NULL DEFAULT '[
  { "key": "website", "label": "Website" },
  { "key": "referral", "label": "Referral" },
  { "key": "walk_in", "label": "Walk In" },
  { "key": "campaign", "label": "Campaign" }
]'::jsonb;
