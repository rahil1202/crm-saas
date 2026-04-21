UPDATE "forms"
SET "status" = 'archived', "deleted_at" = NULL
WHERE "deleted_at" IS NOT NULL;
