ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS notification_rules jsonb NOT NULL DEFAULT '{
    "emailAlerts": true,
    "taskReminders": true,
    "overdueDigest": true,
    "dealStageAlerts": true,
    "campaignAlerts": true
  }'::jsonb;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS integrations jsonb NOT NULL DEFAULT '{
    "slackWebhookUrl": null,
    "whatsappProvider": null,
    "emailProvider": null,
    "webhookUrl": null
  }'::jsonb;
