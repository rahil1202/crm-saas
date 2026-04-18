CREATE TABLE IF NOT EXISTS "task_associations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "entity_type" varchar(30) NOT NULL,
  "entity_id" uuid NOT NULL,
  "entity_label" varchar(220) NOT NULL,
  "entity_subtitle" varchar(320),
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "task_associations_task_idx" ON "task_associations" ("task_id");
CREATE INDEX IF NOT EXISTS "task_associations_company_idx" ON "task_associations" ("company_id", "entity_type");
CREATE INDEX IF NOT EXISTS "task_associations_entity_idx" ON "task_associations" ("company_id", "entity_type", "entity_id");
CREATE UNIQUE INDEX IF NOT EXISTS "task_associations_task_entity_unique"
  ON "task_associations" ("company_id", "task_id", "entity_type", "entity_id");
