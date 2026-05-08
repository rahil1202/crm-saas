ALTER TABLE "whatsapp_templates"
  ADD COLUMN IF NOT EXISTS "components" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "rejection_reason" text,
  ADD COLUMN IF NOT EXISTS "quality_score" varchar(80),
  ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "campaign_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE cascade,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "outbox_id" uuid REFERENCES "whatsapp_outbox"("id") ON DELETE set null,
  "social_message_id" uuid REFERENCES "social_messages"("id") ON DELETE set null,
  "idempotency_key" varchar(220) NOT NULL,
  "provider_message_id" varchar(180),
  "status" varchar(40) NOT NULL DEFAULT 'queued',
  "error" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_deliveries_campaign_customer_unique" ON "campaign_deliveries" ("campaign_id", "customer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_deliveries_company_idempotency_unique" ON "campaign_deliveries" ("company_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "campaign_deliveries_campaign_idx" ON "campaign_deliveries" ("campaign_id", "status", "created_at");
