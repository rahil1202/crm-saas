ALTER TABLE "customers"
ADD COLUMN IF NOT EXISTS "assigned_to_user_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "customers_assigned_idx" ON "customers" ("company_id", "assigned_to_user_id");
