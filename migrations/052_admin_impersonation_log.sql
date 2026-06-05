-- ============================================================
-- 052_admin_impersonation_log.sql
--
-- Purpose: append-only audit trail for admin impersonation.
--
-- The admin app lets a SUPER_ADMIN mint a short-lived token that acts
-- as another (non-admin) user — the headline "log in as this user"
-- support tool. Every impersonation MUST be auditable: who did it, who
-- they impersonated, why, from which IP, and when. One row is written
-- (inside the same transaction that mints the token) before the token
-- is ever returned, so no un-audited impersonation token can exist.
--
-- Design mirrors `admin_message_access_log` (042) and follows the audit
-- FK policy locked in 044: attribution must not silently vanish, so
-- both FKs use ON DELETE RESTRICT — deleting a staff or target account
-- that has impersonation history requires explicit audit clean-up first.
--
-- Purely additive: CREATE TABLE IF NOT EXISTS, no ALTER on existing
-- tables. Idempotent, wrapped in a single transaction.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS admin_impersonation_log (
  id              CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  admin_user_id   CHAR(36)      NOT NULL,
  target_user_id  CHAR(36)      NOT NULL,
  reason          VARCHAR(255)  NOT NULL,
  ip              VARCHAR(45)   DEFAULT NULL,   -- IPv6-safe
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_ail_admin FOREIGN KEY (admin_user_id)
    REFERENCES "user" (id) ON DELETE RESTRICT,
  CONSTRAINT fk_ail_target FOREIGN KEY (target_user_id)
    REFERENCES "user" (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ail_admin_recent
  ON admin_impersonation_log (admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ail_target_recent
  ON admin_impersonation_log (target_user_id, created_at DESC);

COMMIT;
