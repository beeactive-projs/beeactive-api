-- =========================================================
-- Migration 000: Drop Existing Schema (Clean Slate)
-- =========================================================
-- WARNING: This will delete ALL data!
-- Only run this in development or when doing a fresh start
-- =========================================================

-- Drop tables in reverse order of dependencies (child tables first)
-- CASCADE handles foreign key dependencies

DROP TABLE IF EXISTS role_permission CASCADE;
DROP TABLE IF EXISTS user_role CASCADE;
DROP TABLE IF EXISTS session_participant CASCADE;
DROP TABLE IF EXISTS session CASCADE;
DROP TABLE IF EXISTS invitation CASCADE;
DROP TABLE IF EXISTS client_request CASCADE;
DROP TABLE IF EXISTS instructor_client CASCADE;
DROP TABLE IF EXISTS group_member CASCADE;
DROP TABLE IF EXISTS instructor_profile CASCADE;
DROP TABLE IF EXISTS user_profile CASCADE;
DROP TABLE IF EXISTS social_account CASCADE;
DROP TABLE IF EXISTS refresh_token CASCADE;
DROP TABLE IF EXISTS "group" CASCADE;
DROP TABLE IF EXISTS permission CASCADE;
DROP TABLE IF EXISTS role CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
DROP TABLE IF EXISTS _migrations CASCADE;

-- Drop custom enum types
DROP TYPE IF EXISTS enum_social_provider CASCADE;
DROP TYPE IF EXISTS enum_session_type CASCADE;
DROP TYPE IF EXISTS enum_session_visibility CASCADE;
DROP TYPE IF EXISTS enum_session_status CASCADE;
DROP TYPE IF EXISTS enum_participant_status CASCADE;
DROP TYPE IF EXISTS enum_gender CASCADE;
DROP TYPE IF EXISTS enum_fitness_level CASCADE;
DROP TYPE IF EXISTS enum_instructor_client_status CASCADE;
DROP TYPE IF EXISTS enum_initiated_by CASCADE;
DROP TYPE IF EXISTS enum_client_request_type CASCADE;
DROP TYPE IF EXISTS enum_client_request_status CASCADE;

-- =========================================================
-- Schema dropped successfully
-- =========================================================
