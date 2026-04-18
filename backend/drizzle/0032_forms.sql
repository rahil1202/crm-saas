DO $$ BEGIN
  CREATE TYPE "form_status" AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "name" varchar(180) NOT NULL,
  "slug" varchar(220) NOT NULL,
  "website_domain" varchar(255),
  "description" text,
  "status" "form_status" NOT NULL DEFAULT 'draft',
  "schema" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "theme_settings" jsonb NOT NULL DEFAULT '{"heading":"","subheading":"","submitButtonText":"Submit","primaryColor":"#0ea5e9","backgroundColor":"#ffffff"}'::jsonb,
  "response_settings" jsonb NOT NULL DEFAULT '{"mode":"message","messageTitle":"Thank you","messageBody":"Your response has been submitted successfully.","captchaEnabled":true}'::jsonb,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "form_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "form_id" uuid NOT NULL REFERENCES "forms"("id") ON DELETE cascade,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "linked_lead_id" uuid REFERENCES "leads"("id") ON DELETE set null,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "full_name" varchar(180),
  "email" varchar(320),
  "phone" varchar(40),
  "website_domain" varchar(255),
  "source_url" text,
  "referer" text,
  "user_agent" text,
  "ip_hash" varchar(128),
  "submitted_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "forms_slug_unique" ON "forms" ("slug");
CREATE INDEX IF NOT EXISTS "forms_company_status_updated_idx" ON "forms" ("company_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "forms_company_updated_idx" ON "forms" ("company_id", "updated_at");
CREATE INDEX IF NOT EXISTS "form_responses_form_submitted_idx" ON "form_responses" ("form_id", "submitted_at");
CREATE INDEX IF NOT EXISTS "form_responses_linked_lead_idx" ON "form_responses" ("linked_lead_id");
CREATE INDEX IF NOT EXISTS "form_responses_company_submitted_idx" ON "form_responses" ("company_id", "submitted_at");

UPDATE "forms"
SET "response_settings" = COALESCE("response_settings", '{}'::jsonb) || '{"captchaEnabled":true}'::jsonb
WHERE COALESCE(("response_settings"->>'captchaEnabled')::boolean, false) = false;
