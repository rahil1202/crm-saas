DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_pricing_category') THEN
    CREATE TYPE whatsapp_pricing_category AS ENUM ('marketing', 'utility', 'authentication', 'authentication_international', 'service');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_message_cost_status') THEN
    CREATE TYPE whatsapp_message_cost_status AS ENUM ('estimated', 'final', 'waived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS whatsapp_pricing_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  market varchar(120) NOT NULL,
  country_code varchar(8),
  currency varchar(3) NOT NULL,
  category whatsapp_pricing_category NOT NULL,
  rate numeric(18, 8) NOT NULL,
  tier_from integer NOT NULL DEFAULT 1,
  tier_to integer,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  source_version varchar(180) NOT NULL,
  source_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_pricing_rate_cards_lookup_idx
  ON whatsapp_pricing_rate_cards (company_id, market, currency, category, effective_from);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_pricing_rate_cards_version_unique
  ON whatsapp_pricing_rate_cards (company_id, market, currency, category, tier_from, source_version);

CREATE TABLE IF NOT EXISTS whatsapp_message_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES whatsapp_workspaces(id) ON DELETE SET NULL,
  outbox_id uuid REFERENCES whatsapp_outbox(id) ON DELETE SET NULL,
  social_message_id uuid REFERENCES social_messages(id) ON DELETE SET NULL,
  provider_message_id varchar(180),
  pricing_rate_card_id uuid REFERENCES whatsapp_pricing_rate_cards(id) ON DELETE SET NULL,
  category whatsapp_pricing_category NOT NULL,
  market varchar(120) NOT NULL,
  country_code varchar(8),
  currency varchar(3) NOT NULL,
  billable_units integer NOT NULL DEFAULT 1,
  unit_rate numeric(18, 8) NOT NULL DEFAULT 0,
  estimated_cost numeric(18, 8) NOT NULL DEFAULT 0,
  final_cost numeric(18, 8),
  status whatsapp_message_cost_status NOT NULL DEFAULT 'estimated',
  source_event_id uuid REFERENCES whatsapp_message_events(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_message_costs_provider_idx
  ON whatsapp_message_costs (provider_message_id);
CREATE INDEX IF NOT EXISTS whatsapp_message_costs_outbox_idx
  ON whatsapp_message_costs (company_id, outbox_id);
CREATE INDEX IF NOT EXISTS whatsapp_message_costs_social_message_idx
  ON whatsapp_message_costs (company_id, social_message_id);
