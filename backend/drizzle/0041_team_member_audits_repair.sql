CREATE TABLE IF NOT EXISTS team_member_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES company_memberships(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  invite_id uuid REFERENCES company_invites(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type varchar(120) NOT NULL,
  summary varchar(255) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_member_audits_company_created_idx ON team_member_audits(company_id, created_at);
CREATE INDEX IF NOT EXISTS team_member_audits_membership_created_idx ON team_member_audits(membership_id, created_at);
CREATE INDEX IF NOT EXISTS team_member_audits_target_user_created_idx ON team_member_audits(target_user_id, created_at);
CREATE INDEX IF NOT EXISTS team_member_audits_invite_created_idx ON team_member_audits(invite_id, created_at);
