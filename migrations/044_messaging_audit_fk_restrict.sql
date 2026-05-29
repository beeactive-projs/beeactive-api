-- ============================================================
-- 044_messaging_audit_fk_restrict.sql
--
-- Purpose: fix a contradiction introduced in the messaging foundation
-- migration (042).
--
-- The audit-trail tables `messaging_suspension` and
-- `admin_message_access_log` declare `applied_by_id` / `lifted_by_id`
-- / `admin_user_id` as NOT NULL in the column definitions but with
-- `ON DELETE SET NULL` in the foreign keys. Deleting an admin row
-- crashes with a NOT NULL violation, blocking GDPR erasure of staff
-- accounts and corrupting the audit semantics (you don't want the
-- admin attribution to silently vanish anyway).
--
-- This migration converts those FKs to ON DELETE RESTRICT so:
--   1. The DB no longer holds a contradictory promise.
--   2. Deleting an admin who has ever applied a suspension or read a
--      conversation as moderator now requires explicit clean-up of
--      the audit trail first, which is the right policy.
--
-- The `lifted_by_id` column on `messaging_suspension` IS nullable
-- (a suspension that hasn't been lifted yet has lifted_by_id = NULL),
-- so SET NULL is genuinely correct there. We leave it alone.
-- ============================================================

BEGIN;

-- messaging_suspension.applied_by_id : NOT NULL + RESTRICT
ALTER TABLE messaging_suspension
  DROP CONSTRAINT IF EXISTS fk_ms_applied_by;

ALTER TABLE messaging_suspension
  ADD CONSTRAINT fk_ms_applied_by FOREIGN KEY (applied_by_id)
    REFERENCES "user" (id) ON DELETE RESTRICT;

-- admin_message_access_log.admin_user_id : NOT NULL + RESTRICT
ALTER TABLE admin_message_access_log
  DROP CONSTRAINT IF EXISTS fk_amal_admin;

ALTER TABLE admin_message_access_log
  ADD CONSTRAINT fk_amal_admin FOREIGN KEY (admin_user_id)
    REFERENCES "user" (id) ON DELETE RESTRICT;

COMMIT;
