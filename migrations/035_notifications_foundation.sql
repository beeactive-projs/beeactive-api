-- 035_notifications_foundation.sql
--
-- Notification system foundation — Phase 1 of the jobs/notifications work.
-- Builds the data layer only; service rewrite + REST + FE follow in later
-- phases. No producers are migrated yet — existing email sends keep their
-- direct EmailService calls. See ~/.claude/plans/notifications-foundation.md
-- for the full plan and ~/Documents/mystuff/beeactive-api/docs/research/
-- jobs-system/notification-tables.html for the visual schema.
--
-- Tables created:
--   1. notification              — the message itself; one row per event
--                                  (broadcasts share one row across recipients).
--   2. notification_receipt      — per-recipient state: delivered, viewed,
--                                  read, clicked, dismissed. Hard-deleted on
--                                  user request (no audit value).
--   3. notification_preference   — sparse: only rows where the user has
--                                  changed from the system default.
--   4. device_token              — push registration storage (web + ios +
--                                  android in one table). Empty until the
--                                  push worker lands; the registration
--                                  endpoint will populate it.
--
-- Schema design notes (locked):
--   - notification + receipt split (clym/events-api alert+receipt pattern).
--   - All five receipt timestamps from day one (delivered/viewed/read/
--     clicked/dismissed) — cheaper to add now than to migrate later.
--   - Hard delete on receipt — re-shows are achieved by emitting a fresh
--     notification, not by un-deleting.
--   - notification_preference uses JSONB for channels (one row per
--     user+type instead of one row per user+type+channel).
--   - device_token unifies web Push subscriptions and mobile FCM/APNs
--     tokens; the worker branches on `platform` at send time.
--
-- All statements are idempotent and wrapped in a single transaction.

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- Enums
-- ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE notification_audience_type AS ENUM ('USER', 'GROUP', 'PLATFORM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_severity AS ENUM ('info', 'success', 'warn', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE device_platform AS ENUM ('WEB', 'IOS', 'ANDROID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────
-- 1) notification — the message
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification (
  id              CHAR(36)                  NOT NULL DEFAULT gen_random_uuid(),
  type            VARCHAR(64)               NOT NULL,
  title           VARCHAR(200)              NOT NULL,
  body            TEXT                      NOT NULL,
  data            JSONB                     DEFAULT NULL,
  severity        notification_severity     NOT NULL DEFAULT 'info',
  icon_url        VARCHAR(300)              DEFAULT NULL,
  priority        SMALLINT                  NOT NULL DEFAULT 1,
  audience_type   notification_audience_type NOT NULL DEFAULT 'USER',
  audience_id     CHAR(36)                  DEFAULT NULL,
  deliver_at      TIMESTAMP                 DEFAULT NULL,
  expire_at       TIMESTAMP                 DEFAULT NULL,
  fingerprint     VARCHAR(64)               DEFAULT NULL,
  created_at      TIMESTAMP                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- Hot path: scheduler / cleanup queries on time-bounded notifications.
CREATE INDEX IF NOT EXISTS idx_notification_deliver_at
  ON notification(deliver_at) WHERE deliver_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_expire_at
  ON notification(expire_at)  WHERE expire_at  IS NOT NULL;

-- Dedup lookup: producer checks if a fingerprint already exists.
CREATE INDEX IF NOT EXISTS idx_notification_fingerprint
  ON notification(fingerprint) WHERE fingerprint IS NOT NULL;

-- Audience reverse-lookup: "all notifications for group X" / "all platform-wide".
CREATE INDEX IF NOT EXISTS idx_notification_audience
  ON notification(audience_type, audience_id);

-- ────────────────────────────────────────────────────────────────
-- 2) notification_receipt — per-user state
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_receipt (
  id                  CHAR(36)   NOT NULL DEFAULT gen_random_uuid(),
  notification_id     CHAR(36)   NOT NULL REFERENCES notification(id) ON DELETE CASCADE,
  user_id             CHAR(36)   NOT NULL REFERENCES "user"(id)        ON DELETE CASCADE,
  delivered_at        TIMESTAMP  DEFAULT NULL,
  viewed_at           TIMESTAMP  DEFAULT NULL,
  read_at             TIMESTAMP  DEFAULT NULL,
  clicked_at          TIMESTAMP  DEFAULT NULL,
  dismissed_at        TIMESTAMP  DEFAULT NULL,
  delivered_channels  JSONB      NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uk_notification_receipt UNIQUE (notification_id, user_id)
);

-- Hot path: bell badge query — unread + non-dismissed for a user, newest first.
CREATE INDEX IF NOT EXISTS idx_notification_receipt_bell
  ON notification_receipt(user_id, read_at, created_at DESC);

-- Analytics: viewed-but-not-read funnel.
CREATE INDEX IF NOT EXISTS idx_notification_receipt_viewed
  ON notification_receipt(user_id, viewed_at);

-- Reverse lookup: all recipients of a given alert (broadcast operations).
CREATE INDEX IF NOT EXISTS idx_notification_receipt_notification
  ON notification_receipt(notification_id);

-- ────────────────────────────────────────────────────────────────
-- 3) notification_preference — per-user channel toggles (sparse)
-- ────────────────────────────────────────────────────────────────
-- One row per (user, type) where the user has overridden the system default.
-- Missing rows fall back to defaults defined in code (notification-defaults.ts).
-- channels JSONB shape: { in_app: bool, email: bool, push: bool, sms: bool }
CREATE TABLE IF NOT EXISTS notification_preference (
  id          CHAR(36)    NOT NULL DEFAULT gen_random_uuid(),
  user_id     CHAR(36)    NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type        VARCHAR(64) NOT NULL,
  channels    JSONB       NOT NULL,
  updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uk_notification_preference UNIQUE (user_id, type)
);

-- Hot path: settings page loads all overrides for a user in one query.
CREATE INDEX IF NOT EXISTS idx_notification_preference_user
  ON notification_preference(user_id);

-- ────────────────────────────────────────────────────────────────
-- 4) device_token — push registration (web + mobile)
-- ────────────────────────────────────────────────────────────────
-- One row per (user, device). A user logged in on Chrome + Safari + iOS app
-- + Android tablet has 4 rows. The push worker (later) queries by user_id
-- with revoked_at IS NULL and branches on `platform` to pick the adapter.
CREATE TABLE IF NOT EXISTS device_token (
  id             CHAR(36)        NOT NULL DEFAULT gen_random_uuid(),
  user_id        CHAR(36)        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  platform       device_platform NOT NULL,
  token          TEXT            NOT NULL,
  endpoint_hash  VARCHAR(64)     NOT NULL,
  device_label   VARCHAR(120)    DEFAULT NULL,
  last_seen_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at     TIMESTAMP       DEFAULT NULL,
  created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Same browser/device re-registers → upsert by endpoint_hash, not duplicate.
  CONSTRAINT uk_device_token_endpoint UNIQUE (user_id, endpoint_hash)
);

-- Hot path: push worker — "all active devices for this user".
CREATE INDEX IF NOT EXISTS idx_device_token_active
  ON device_token(user_id, revoked_at);

-- Stale-device pruning sweeper (later phase).
CREATE INDEX IF NOT EXISTS idx_device_token_last_seen
  ON device_token(last_seen_at);

COMMIT;
