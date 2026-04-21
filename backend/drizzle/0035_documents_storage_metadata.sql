ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS remark varchar(500),
  ADD COLUMN IF NOT EXISTS storage_provider varchar(32) NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS storage_bucket varchar(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS storage_object_path varchar(768) NOT NULL DEFAULT '';

UPDATE documents
SET storage_object_path = storage_path
WHERE storage_object_path = '' AND storage_path IS NOT NULL;
