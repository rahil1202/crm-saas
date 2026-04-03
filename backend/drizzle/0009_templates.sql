CREATE TYPE "public"."template_type" AS ENUM('email', 'whatsapp', 'sms', 'task', 'pipeline');

CREATE TABLE "templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" varchar(180) NOT NULL,
  "type" "template_type" NOT NULL,
  "subject" varchar(240),
  "content" text NOT NULL,
  "notes" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

ALTER TABLE "templates"
  ADD CONSTRAINT "templates_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "templates"
  ADD CONSTRAINT "templates_created_by_profiles_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "templates_company_idx" ON "templates" USING btree ("company_id");
CREATE INDEX "templates_type_idx" ON "templates" USING btree ("company_id","type");
