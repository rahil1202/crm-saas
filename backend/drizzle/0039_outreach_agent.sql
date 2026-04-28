DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outreach_contact_status') THEN
    CREATE TYPE outreach_contact_status AS ENUM ('pending', 'sent', 'opened', 'replied', 'bounced');
  END IF;
END $$;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS outreach_agent jsonb NOT NULL DEFAULT '{
    "enabled": true,
    "dailyEmailEnabled": false,
    "addLeadToLinkedIn": false,
    "maxCompaniesPerRun": 10,
    "emailWindowStart": "09:00",
    "emailWindowEnd": "17:00",
    "sendDays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
    "maxEmailsPerDay": 100,
    "minMinutesBetweenEmails": 5,
    "searchSettings": {
      "industries": [],
      "titles": [],
      "locations": [],
      "includeDomains": [],
      "excludeDomains": []
    },
    "defaultTemplateId": null,
    "defaultEmailAccountId": null,
    "defaultFromName": null
  }'::jsonb;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS template_id uuid;

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS outreach_account_id uuid,
  ADD COLUMN IF NOT EXISTS outreach_contact_id uuid;

CREATE TABLE IF NOT EXISTS outreach_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name varchar(180) NOT NULL,
  domain varchar(255),
  website varchar(255),
  linkedin_url varchar(255),
  industry varchar(120),
  size_band varchar(60),
  location varchar(180),
  notes text,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS outreach_accounts_company_idx ON outreach_accounts(company_id, created_at);
CREATE INDEX IF NOT EXISTS outreach_accounts_domain_idx ON outreach_accounts(company_id, domain);

CREATE TABLE IF NOT EXISTS outreach_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES outreach_accounts(id) ON DELETE CASCADE,
  full_name varchar(180) NOT NULL,
  email varchar(320),
  phone varchar(40),
  title varchar(160),
  linkedin_url varchar(255),
  status outreach_contact_status NOT NULL DEFAULT 'pending',
  last_contacted_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  replied_at timestamptz,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS outreach_contacts_company_idx ON outreach_contacts(company_id, created_at);
CREATE INDEX IF NOT EXISTS outreach_contacts_account_idx ON outreach_contacts(account_id, created_at);
CREATE INDEX IF NOT EXISTS outreach_contacts_status_idx ON outreach_contacts(company_id, status, created_at);

CREATE TABLE IF NOT EXISTS outreach_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name varchar(180) NOT NULL,
  entity_type varchar(40) NOT NULL DEFAULT 'contact',
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS outreach_lists_company_idx ON outreach_lists(company_id, created_at);

CREATE TABLE IF NOT EXISTS outreach_list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  list_id uuid NOT NULL REFERENCES outreach_lists(id) ON DELETE CASCADE,
  account_id uuid REFERENCES outreach_accounts(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES outreach_contacts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_list_members_list_idx ON outreach_list_members(list_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS outreach_list_members_list_contact_unique ON outreach_list_members(list_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS outreach_list_members_list_account_unique ON outreach_list_members(list_id, account_id) WHERE account_id IS NOT NULL;
