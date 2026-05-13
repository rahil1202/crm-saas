ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS website varchar(255),
  ADD COLUMN IF NOT EXISTS address varchar(500),
  ADD COLUMN IF NOT EXISTS country varchar(120),
  ADD COLUMN IF NOT EXISTS state varchar(120),
  ADD COLUMN IF NOT EXISTS city varchar(120);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_name varchar(90),
  ADD COLUMN IF NOT EXISTS last_name varchar(90),
  ADD COLUMN IF NOT EXISTS mobile_phone varchar(40),
  ADD COLUMN IF NOT EXISTS secondary_contact varchar(320);

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS address varchar(500),
  ADD COLUMN IF NOT EXISTS country varchar(120),
  ADD COLUMN IF NOT EXISTS state varchar(120),
  ADD COLUMN IF NOT EXISTS city varchar(120);
