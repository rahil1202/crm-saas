CREATE TYPE "public"."automation_status" AS ENUM('active', 'paused');
CREATE TYPE "public"."automation_run_status" AS ENUM('success', 'failed');

CREATE TABLE "automations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" varchar(180) NOT NULL,
  "status" "automation_status" DEFAULT 'active' NOT NULL,
  "trigger_type" varchar(80) NOT NULL,
  "trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE "automation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "automation_id" uuid NOT NULL,
  "status" "automation_run_status" NOT NULL,
  "message" varchar(240) NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "executed_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "automations"
  ADD CONSTRAINT "automations_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "automations"
  ADD CONSTRAINT "automations_created_by_profiles_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk"
  FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "automations_company_idx" ON "automations" USING btree ("company_id");
CREATE INDEX "automations_status_idx" ON "automations" USING btree ("company_id","status");
CREATE INDEX "automation_runs_automation_idx" ON "automation_runs" USING btree ("automation_id","executed_at");
CREATE INDEX "automation_runs_company_idx" ON "automation_runs" USING btree ("company_id");
