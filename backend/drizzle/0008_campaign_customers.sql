CREATE TABLE "campaign_customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "campaign_customers"
  ADD CONSTRAINT "campaign_customers_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "campaign_customers"
  ADD CONSTRAINT "campaign_customers_campaign_id_campaigns_id_fk"
  FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "campaign_customers"
  ADD CONSTRAINT "campaign_customers_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "campaign_customers_campaign_customer_unique" ON "campaign_customers" USING btree ("campaign_id","customer_id");
CREATE INDEX "campaign_customers_company_idx" ON "campaign_customers" USING btree ("company_id");
CREATE INDEX "campaign_customers_customer_idx" ON "campaign_customers" USING btree ("customer_id");
