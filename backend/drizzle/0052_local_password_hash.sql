-- Migration: 0052_local_password_hash
-- Adds a local bcrypt password hash to profiles so login can fall back
-- to our own DB when Supabase is unreachable.
-- The column is nullable — existing users get it populated on next login.

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "password_hash" varchar(255);
