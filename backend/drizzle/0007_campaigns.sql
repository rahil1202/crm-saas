CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'active', 'completed', 'paused');

CREATE TABLE "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" varchar(180) NOT NULL,
  "channel" varchar(40) DEFAULT 'email' NOT NULL,
  "status" "campaign_status" DEFAULT 'draft' NOT NULL,
  "audience_description" varchar(240),
  "scheduled_at" timestamp with time zone,
  "launched_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "sent_count" integer DEFAULT 0 NOT NULL,
  "delivered_count" integer DEFAULT 0 NOT NULL,
  "opened_count" integer DEFAULT 0 NOT NULL,
  "clicked_count" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_created_by_profiles_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "campaigns_company_idx" ON "campaigns" USING btree ("company_id");
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("company_id","status");
CREATE INDEX "campaigns_scheduled_idx" ON "campaigns" USING btree ("scheduled_at");
