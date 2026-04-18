ALTER TABLE "tasks"
ADD COLUMN IF NOT EXISTS "task_type" varchar(40) NOT NULL DEFAULT 'to_do';

CREATE INDEX IF NOT EXISTS "tasks_company_type_idx" ON "tasks" ("company_id", "task_type");
