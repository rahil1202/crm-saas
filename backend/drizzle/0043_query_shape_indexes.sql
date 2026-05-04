CREATE INDEX IF NOT EXISTS leads_company_deleted_created_idx
  ON leads (company_id, deleted_at, created_at);

CREATE INDEX IF NOT EXISTS leads_company_assigned_deleted_created_idx
  ON leads (company_id, assigned_to_user_id, deleted_at, created_at);

CREATE INDEX IF NOT EXISTS deals_company_deleted_created_idx
  ON deals (company_id, deleted_at, created_at);

CREATE INDEX IF NOT EXISTS deals_company_pipeline_deleted_updated_created_idx
  ON deals (company_id, pipeline, deleted_at, updated_at, created_at);

CREATE INDEX IF NOT EXISTS deals_company_status_deleted_expected_close_idx
  ON deals (company_id, status, deleted_at, expected_close_date, updated_at, created_at);

CREATE INDEX IF NOT EXISTS tasks_company_deleted_created_idx
  ON tasks (company_id, deleted_at, created_at);

CREATE INDEX IF NOT EXISTS tasks_company_assigned_deleted_created_idx
  ON tasks (company_id, assigned_to_user_id, deleted_at, created_at);

CREATE INDEX IF NOT EXISTS documents_company_deleted_created_idx
  ON documents (company_id, deleted_at, created_at);

CREATE INDEX IF NOT EXISTS company_memberships_company_status_deleted_created_idx
  ON company_memberships (company_id, status, deleted_at, created_at);

CREATE INDEX IF NOT EXISTS company_memberships_company_custom_role_deleted_idx
  ON company_memberships (company_id, custom_role_id, deleted_at);

CREATE INDEX IF NOT EXISTS partner_users_company_partner_deleted_created_idx
  ON partner_users (company_id, partner_company_id, deleted_at, created_at);

CREATE INDEX IF NOT EXISTS partner_users_auth_user_active_idx
  ON partner_users (auth_user_id, status, deleted_at, company_id);

CREATE INDEX IF NOT EXISTS automation_runs_queue_idx
  ON automation_runs (status, next_run_at, executed_at);

CREATE INDEX IF NOT EXISTS sequence_enrollments_queue_idx
  ON sequence_enrollments (status, next_run_at);

CREATE INDEX IF NOT EXISTS conversation_states_active_expires_idx
  ON conversation_states (status, expires_at);

CREATE INDEX IF NOT EXISTS conversation_states_automation_run_idx
  ON conversation_states (automation_run_id);

CREATE INDEX IF NOT EXISTS email_messages_provider_message_id_idx
  ON email_messages (provider_message_id);
