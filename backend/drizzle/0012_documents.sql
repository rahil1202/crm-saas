DO $$ BEGIN
  CREATE TYPE document_entity_type AS ENUM ('general', 'lead', 'deal', 'customer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  entity_type document_entity_type NOT NULL DEFAULT 'general',
  entity_id uuid,
  folder varchar(120) NOT NULL DEFAULT 'general',
  original_name varchar(255) NOT NULL,
  storage_path varchar(512) NOT NULL,
  mime_type varchar(180),
  size_bytes integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS documents_company_idx ON documents (company_id, created_at);
CREATE INDEX IF NOT EXISTS documents_entity_idx ON documents (company_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS documents_folder_idx ON documents (company_id, folder);
