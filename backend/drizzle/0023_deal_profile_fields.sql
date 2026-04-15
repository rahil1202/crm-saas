ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS deal_type varchar(120),
  ADD COLUMN IF NOT EXISTS priority varchar(80),
  ADD COLUMN IF NOT EXISTS referral_source varchar(120),
  ADD COLUMN IF NOT EXISTS owner_label varchar(180),
  ADD COLUMN IF NOT EXISTS product_tags jsonb NOT NULL DEFAULT '[]'::jsonb;
