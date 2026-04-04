CREATE TYPE referral_attribution_status AS ENUM (
  'captured',
  'registered',
  'verified',
  'joined_company',
  'completed_onboarding'
);

ALTER TABLE company_invites
  ADD COLUMN IF NOT EXISTS referral_code varchar(80),
  ADD COLUMN IF NOT EXISTS invite_message text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  referrer_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code varchar(80) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_code_unique ON referral_codes(code);
CREATE INDEX IF NOT EXISTS referral_codes_company_referrer_idx
  ON referral_codes(company_id, referrer_user_id, created_at);

CREATE TABLE IF NOT EXISTS referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  referrer_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  referred_email varchar(320),
  invite_id uuid REFERENCES company_invites(id) ON DELETE SET NULL,
  status referral_attribution_status NOT NULL DEFAULT 'captured',
  captured_at timestamptz NOT NULL DEFAULT now(),
  registered_at timestamptz,
  verified_at timestamptz,
  joined_company_at timestamptz,
  completed_onboarding_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_attributions_code_user_unique
  ON referral_attributions(referral_code_id, referred_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS referral_attributions_code_email_unique
  ON referral_attributions(referral_code_id, referred_email);
CREATE INDEX IF NOT EXISTS referral_attributions_company_status_idx
  ON referral_attributions(company_id, status, created_at);
CREATE INDEX IF NOT EXISTS referral_attributions_referrer_idx
  ON referral_attributions(referrer_user_id, created_at);
