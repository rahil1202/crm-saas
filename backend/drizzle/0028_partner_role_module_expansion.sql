UPDATE "company_custom_roles"
SET
  "modules" = '["contacts","leads","deals","tasks","templates","campaigns","reports","documents","integrations"]'::jsonb,
  "updated_at" = NOW()
WHERE "name" = 'Partner'
  AND "deleted_at" IS NULL;
