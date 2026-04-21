CREATE TABLE IF NOT EXISTS "meeting_type_breaks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "meeting_type_id" uuid NOT NULL REFERENCES "meeting_types"("id") ON DELETE CASCADE,
  "day_of_week" integer NOT NULL,
  "start_time" varchar(5) NOT NULL,
  "end_time" varchar(5) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "meeting_type_breaks_type_idx" ON "meeting_type_breaks" ("meeting_type_id");
CREATE INDEX IF NOT EXISTS "meeting_type_breaks_day_idx" ON "meeting_type_breaks" ("meeting_type_id", "day_of_week");
