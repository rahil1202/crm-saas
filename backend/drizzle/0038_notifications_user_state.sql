CREATE TABLE IF NOT EXISTS "notification_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "notification_id" uuid NOT NULL REFERENCES "notifications"("id") ON DELETE CASCADE,
  "profile_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "read_at" timestamptz,
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_states_notification_profile_unique"
  ON "notification_states" ("notification_id", "profile_id");

CREATE INDEX IF NOT EXISTS "notification_states_recipient_newest_idx"
  ON "notification_states" ("company_id", "profile_id", "deleted_at", "updated_at");

CREATE INDEX IF NOT EXISTS "notification_states_recipient_unread_idx"
  ON "notification_states" ("company_id", "profile_id", "deleted_at", "read_at");

INSERT INTO "notification_states" (
  "company_id",
  "notification_id",
  "profile_id",
  "read_at",
  "created_at",
  "updated_at"
)
SELECT
  "company_id",
  "id",
  "read_by",
  "read_at",
  now(),
  now()
FROM "notifications"
WHERE "read_by" IS NOT NULL
ON CONFLICT ("notification_id", "profile_id") DO UPDATE
SET
  "read_at" = EXCLUDED."read_at",
  "updated_at" = now();

DROP INDEX IF EXISTS "notifications_read_idx";
DROP INDEX IF EXISTS "notifications_company_idx";
DROP INDEX IF EXISTS "notifications_type_idx";

CREATE INDEX IF NOT EXISTS "notifications_company_created_idx"
  ON "notifications" ("company_id", "created_at", "id");

CREATE INDEX IF NOT EXISTS "notifications_company_type_created_idx"
  ON "notifications" ("company_id", "type", "created_at", "id");

ALTER TABLE "notifications" DROP COLUMN IF EXISTS "read_at";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "read_by";
