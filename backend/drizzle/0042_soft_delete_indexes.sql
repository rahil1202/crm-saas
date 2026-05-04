create index if not exists leads_company_deleted_updated_idx
  on leads (company_id, deleted_at, updated_at);

create index if not exists customers_company_deleted_updated_idx
  on customers (company_id, deleted_at, updated_at);

create index if not exists templates_company_deleted_updated_idx
  on templates (company_id, deleted_at, updated_at);

create index if not exists campaigns_company_deleted_updated_idx
  on campaigns (company_id, deleted_at, updated_at);

create index if not exists forms_company_deleted_status_updated_idx
  on forms (company_id, deleted_at, status, updated_at);
