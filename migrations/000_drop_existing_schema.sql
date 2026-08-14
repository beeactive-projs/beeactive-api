-- =========================================================
-- Migration 000: Drop Existing Schema (Clean Slate)
-- =========================================================
-- WARNING: This will delete ALL data!
-- Only run this in development or when doing a fresh start
-- =========================================================

-- Nuke the entire public schema instead of maintaining a hand-written
-- drop list. The old per-table list silently went stale as migrations
-- were added: a fresh run against an already-migrated DB left newer
-- tables/types in place, later migrations failed with "already exists",
-- and everything after cascaded into "current transaction is aborted".
--
-- CASCADE also drops extensions whose objects live in public (pg_trgm,
-- pgcrypto); the migrations that need them recreate them defensively
-- (029, 043, 047) before first use.

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;

-- =========================================================
-- Schema dropped successfully
-- =========================================================
