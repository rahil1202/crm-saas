CREATE TABLE IF NOT EXISTS "company_custom_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "modules" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "company_custom_roles_company_idx" ON "company_custom_roles" ("company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "company_custom_roles_company_name_unique" ON "company_custom_roles" ("company_id", "name");

ALTER TABLE "company_memberships"
  ADD COLUMN IF NOT EXISTS "custom_role_id" uuid REFERENCES "company_custom_roles"("id") ON DELETE SET NULL;
