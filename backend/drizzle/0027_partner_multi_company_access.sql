ALTER TABLE "partner_users"
  ADD COLUMN IF NOT EXISTS "auth_user_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL;

UPDATE "partner_users"
SET "auth_user_id" = substring("notes"."auth_user_id" from '([0-9a-fA-F-]{36})')::uuid
FROM (
  SELECT
    pc.id AS partner_company_id,
    substring(pc.notes from 'Auth User Id:\s*([0-9a-fA-F-]{36})') AS auth_user_id
  FROM "partner_companies" pc
  WHERE pc.notes IS NOT NULL
) AS "notes"
WHERE "partner_users"."partner_company_id" = "notes"."partner_company_id"
  AND "partner_users"."auth_user_id" IS NULL
  AND "notes"."auth_user_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "partner_users_company_auth_user_unique"
  ON "partner_users" ("company_id", "auth_user_id");
