ALTER TABLE "forms"
ALTER COLUMN "response_settings"
SET DEFAULT '{"mode":"message","messageTitle":"Thank you","messageBody":"Your response has been submitted successfully.","captchaEnabled":true}'::jsonb;

UPDATE "forms"
SET "response_settings" = COALESCE("response_settings", '{}'::jsonb) || '{"captchaEnabled":true}'::jsonb
WHERE NOT (COALESCE("response_settings", '{}'::jsonb) ? 'captchaEnabled');
