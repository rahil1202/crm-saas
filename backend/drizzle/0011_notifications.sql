CREATE TYPE "public"."notification_type" AS ENUM('lead', 'deal', 'task', 'campaign');

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "type" "notification_type" NOT NULL,
  "title" varchar(180) NOT NULL,
  "message" varchar(320) NOT NULL,
  "entity_id" uuid,
  "entity_path" varchar(240),
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "read_at" timestamp with time zone,
  "read_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_read_by_profiles_id_fk"
  FOREIGN KEY ("read_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "notifications_company_idx" ON "notifications" USING btree ("company_id","created_at");
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("company_id","type");
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("company_id","read_at");
