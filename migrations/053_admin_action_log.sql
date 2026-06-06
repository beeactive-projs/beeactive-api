-- ============================================================
-- 053_admin_action_log.sql
--
-- Purpose: generic append-only audit trail for admin MUTATIONS.
--
-- V1 only audited impersonation (admin_impersonation_log). As the admin
-- surface grew (status changes, role grants, restores, content/group
-- deletes, webhook reprocess, job triggers) we need one place that
-- records "who did what to which entity, when, from where". This backs
-- the security posture: every state-changing admin action is logged.
--
-- Append-only. `action` is a free-form verb (e.g. 'user.status.update'),
-- `target_type`/`target_id` identify the affected entity (nullable for
-- non-entity actions like job triggers), `meta` is a small JSONB blob of
-- action-specific context (never secrets). FK to "user" is ON DELETE
-- RESTRICT — audit attribution must not vanish (same policy as 044/052).
--
-- Purely additive: CREATE TABLE IF NOT EXISTS, idempotent.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS admin_action_log (
  id            CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  admin_user_id CHAR(36)      NOT NULL,
  action        VARCHAR(80)   NOT NULL,
  target_type   VARCHAR(40)   DEFAULT NULL,
  target_id     VARCHAR(64)   DEFAULT NULL,
  meta          JSONB         NOT NULL DEFAULT '{}'::jsonb,
  ip            VARCHAR(45)   DEFAULT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_aal_admin FOREIGN KEY (admin_user_id)
    REFERENCES "user" (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_aal_admin_recent
  ON admin_action_log (admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aal_action_recent
  ON admin_action_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aal_target
  ON admin_action_log (target_type, target_id);

COMMIT;
