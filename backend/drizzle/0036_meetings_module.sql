DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_source') THEN
    CREATE TYPE "meeting_source" AS ENUM ('manual', 'public_link', 'internal');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_status') THEN
    CREATE TYPE "meeting_status" AS ENUM ('scheduled', 'cancelled', 'completed', 'no_show');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "meeting_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "username_slug" varchar(120) NOT NULL,
  "public_suffix" varchar(16) NOT NULL,
  "display_name" varchar(180) NOT NULL,
  "headline" varchar(240),
  "timezone" varchar(80) NOT NULL DEFAULT 'UTC',
  "booking_notice_minutes" integer NOT NULL DEFAULT 30,
  "buffer_before_minutes" integer NOT NULL DEFAULT 0,
  "buffer_after_minutes" integer NOT NULL DEFAULT 0,
  "is_public_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "meeting_profiles_company_idx" ON "meeting_profiles" ("company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_profiles_company_user_unique" ON "meeting_profiles" ("company_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_profiles_company_public_unique" ON "meeting_profiles" ("company_id", "username_slug", "public_suffix");

CREATE TABLE IF NOT EXISTS "meeting_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "host_user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "meeting_profile_id" uuid NOT NULL REFERENCES "meeting_profiles"("id") ON DELETE CASCADE,
  "title" varchar(180) NOT NULL,
  "slug" varchar(160) NOT NULL,
  "description" text,
  "duration_minutes" integer NOT NULL DEFAULT 30,
  "location_type" varchar(40) NOT NULL DEFAULT 'custom',
  "location_details" varchar(400),
  "is_active" boolean NOT NULL DEFAULT true,
  "is_public" boolean NOT NULL DEFAULT true,
  "color" varchar(24) NOT NULL DEFAULT '#1d4ed8',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "meeting_types_company_idx" ON "meeting_types" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "meeting_types_host_idx" ON "meeting_types" ("company_id", "host_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_types_company_host_slug_unique" ON "meeting_types" ("company_id", "host_user_id", "slug");

CREATE TABLE IF NOT EXISTS "meeting_type_availability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "meeting_type_id" uuid NOT NULL REFERENCES "meeting_types"("id") ON DELETE CASCADE,
  "day_of_week" integer NOT NULL,
  "is_enabled" boolean NOT NULL DEFAULT false,
  "start_time" varchar(5) NOT NULL DEFAULT '09:00',
  "end_time" varchar(5) NOT NULL DEFAULT '17:00',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "meeting_type_availability_type_idx" ON "meeting_type_availability" ("meeting_type_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_type_availability_day_unique" ON "meeting_type_availability" ("meeting_type_id", "day_of_week");

CREATE TABLE IF NOT EXISTS "meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "host_user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "meeting_type_id" uuid REFERENCES "meeting_types"("id") ON DELETE SET NULL,
  "source" "meeting_source" NOT NULL DEFAULT 'manual',
  "title" varchar(180) NOT NULL,
  "description" text,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "timezone" varchar(80) NOT NULL DEFAULT 'UTC',
  "status" "meeting_status" NOT NULL DEFAULT 'scheduled',
  "organizer_name" varchar(180) NOT NULL,
  "organizer_email" varchar(320) NOT NULL,
  "guest_count" integer NOT NULL DEFAULT 0,
  "location_details" varchar(400),
  "booking_public_token" varchar(80),
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "meetings_company_date_idx" ON "meetings" ("company_id", "starts_at");
CREATE INDEX IF NOT EXISTS "meetings_host_date_idx" ON "meetings" ("company_id", "host_user_id", "starts_at");
CREATE INDEX IF NOT EXISTS "meetings_source_idx" ON "meetings" ("company_id", "source");
CREATE UNIQUE INDEX IF NOT EXISTS "meetings_booking_public_token_unique" ON "meetings" ("booking_public_token");

CREATE TABLE IF NOT EXISTS "meeting_attendees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "email" varchar(320) NOT NULL,
  "full_name" varchar(180),
  "response_status" varchar(40) NOT NULL DEFAULT 'pending',
  "is_organizer" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "meeting_attendees_meeting_idx" ON "meeting_attendees" ("meeting_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_attendees_meeting_email_unique" ON "meeting_attendees" ("meeting_id", "email");

UPDATE "company_custom_roles"
SET
  "modules" = "modules" || '["meetings"]'::jsonb,
  "updated_at" = NOW()
WHERE "deleted_at" IS NULL
  AND "name" IN ('Owner', 'Admin', 'Sub-Admin', 'Sales Team', 'Employee', 'Partner')
  AND NOT ("modules" ? 'meetings');
