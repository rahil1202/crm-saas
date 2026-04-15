ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "assigned_to_user_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "customers_assigned_idx" ON "customers" ("company_id", "assigned_to_user_id");

ALTER TABLE "deals"
  ADD COLUMN IF NOT EXISTS "deal_type" varchar(120),
  ADD COLUMN IF NOT EXISTS "priority" varchar(80),
  ADD COLUMN IF NOT EXISTS "referral_source" varchar(120),
  ADD COLUMN IF NOT EXISTS "owner_label" varchar(180),
  ADD COLUMN IF NOT EXISTS "product_tags" jsonb NOT NULL DEFAULT '[]'::jsonb;
