CREATE TYPE "public"."partner_status" AS ENUM('active', 'inactive');

CREATE TABLE "partner_companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" varchar(180) NOT NULL,
  "contact_name" varchar(180),
  "email" varchar(320),
  "phone" varchar(40),
  "notes" text,
  "status" "partner_status" DEFAULT 'active' NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

ALTER TABLE "partner_companies"
  ADD CONSTRAINT "partner_companies_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "partner_companies"
  ADD CONSTRAINT "partner_companies_created_by_profiles_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "partner_companies_company_idx" ON "partner_companies" USING btree ("company_id");
CREATE INDEX "partner_companies_status_idx" ON "partner_companies" USING btree ("company_id","status");

ALTER TABLE "company_settings"
  ADD COLUMN "business_hours" jsonb DEFAULT '[{"day":"monday","enabled":true,"open":"09:00","close":"18:00"},{"day":"tuesday","enabled":true,"open":"09:00","close":"18:00"},{"day":"wednesday","enabled":true,"open":"09:00","close":"18:00"},{"day":"thursday","enabled":true,"open":"09:00","close":"18:00"},{"day":"friday","enabled":true,"open":"09:00","close":"18:00"},{"day":"saturday","enabled":false,"open":"10:00","close":"14:00"},{"day":"sunday","enabled":false,"open":"00:00","close":"00:00"}]'::jsonb NOT NULL;

ALTER TABLE "company_settings"
  ADD COLUMN "branding" jsonb DEFAULT '{"companyLabel":"","primaryColor":"#102031","accentColor":"#d97706","logoUrl":null}'::jsonb NOT NULL;

ALTER TABLE "leads"
  ADD COLUMN "partner_company_id" uuid;

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_partner_company_id_partner_companies_id_fk"
  FOREIGN KEY ("partner_company_id") REFERENCES "public"."partner_companies"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "leads_partner_idx" ON "leads" USING btree ("partner_company_id");

ALTER TABLE "deals"
  ADD COLUMN "partner_company_id" uuid;

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_partner_company_id_partner_companies_id_fk"
  FOREIGN KEY ("partner_company_id") REFERENCES "public"."partner_companies"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "deals_partner_idx" ON "deals" USING btree ("partner_company_id");
