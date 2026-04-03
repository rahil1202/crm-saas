ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reminder_minutes_before integer NOT NULL DEFAULT 1440;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
