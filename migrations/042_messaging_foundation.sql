-- 042_messaging_foundation.sql
--
-- Messaging foundation. Builds the data layer only; service + REST + SSE
-- ship in later stages. See docs/plans/messaging-backend-plan.md.
--
-- Tables created:
--   1. conversation                    — container for a DM (v1) or group (future).
--   2. conversation_participant        — membership + per-conversation state
--                                        (last_read_at, muted_until, role).
--   3. conversation_membership_event   — audit trail for join/leave/add/remove
--                                        (group v2 leans on this).
--   4. message                         — message rows; immutable except for
--                                        soft-delete. `kind` distinguishes
--                                        TEXT from future SYSTEM_* messages.
--   5. user_block                      — A blocks B; one row per direction.
--   6. message_report                  — user-initiated abuse report.
--   7. messaging_suspension            — admin-applied restriction on a
--                                        user's ability to send messages.
--   8. admin_message_access_log        — every staff read of user messages
--                                        (audit; required for the
--                                        "we only read on flagged cases"
--                                        claim).
--   9. messaging_velocity_alarm        — informational; >100 msgs/hour by
--                                        one user, surfaced to admin review.
--
-- Design notes (locked, see plan §3):
--   - Group-ready from day one: conversation.type ∈ {DIRECT, GROUP}; the
--     same participant + message tables serve both. v1 only writes DIRECT.
--   - last_message_at + last_message_preview denormalized on conversation
--     so the inbox list is one indexed query (no MAX(messages) per row).
--   - conversation_participant uses left_at soft-leave + a partial unique
--     index so a user can rejoin a group later without violating uniqueness.
--   - message.body capped at 4000 chars by CHECK (belt-and-braces with the
--     DTO @MaxLength).
--   - All FK to "user" cascade where it makes semantic sense; ON DELETE
--     SET NULL on report.message_id / conversation_id so moderation queues
--     survive content deletion.
--
-- All statements are idempotent and wrapped in a single transaction.

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- 1) conversation
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation (
  id                    CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  type                  VARCHAR(16)   NOT NULL,
  name                  VARCHAR(120)  DEFAULT NULL,
  avatar_url            TEXT          DEFAULT NULL,
  created_by_id         CHAR(36)      DEFAULT NULL,
  last_message_at       TIMESTAMP     DEFAULT NULL,
  last_message_preview  VARCHAR(200)  DEFAULT NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT chk_conversation_type
    CHECK (type IN ('DIRECT','GROUP')),
  CONSTRAINT fk_conversation_created_by FOREIGN KEY (created_by_id)
    REFERENCES "user" (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_last_message
  ON conversation (last_message_at DESC NULLS LAST);

-- ────────────────────────────────────────────────────────────────
-- 2) conversation_participant
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_participant (
  id               CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  conversation_id  CHAR(36)      NOT NULL,
  user_id          CHAR(36)      NOT NULL,
  role             VARCHAR(16)   NOT NULL DEFAULT 'MEMBER',
  last_read_at     TIMESTAMP     DEFAULT NULL,
  muted_until      TIMESTAMP     DEFAULT NULL,
  joined_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at          TIMESTAMP     DEFAULT NULL,

  PRIMARY KEY (id),
  CONSTRAINT chk_participant_role
    CHECK (role IN ('MEMBER','ADMIN','OWNER')),
  CONSTRAINT fk_cp_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversation (id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

-- One active participant row per (conversation, user). A user can rejoin
-- after leaving (a new row gets inserted; the old left_at-set row stays).
CREATE UNIQUE INDEX IF NOT EXISTS uk_cp_active_membership
  ON conversation_participant (conversation_id, user_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cp_user_active
  ON conversation_participant (user_id)
  WHERE left_at IS NULL;

-- ────────────────────────────────────────────────────────────────
-- 3) conversation_membership_event
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_membership_event (
  id               CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  conversation_id  CHAR(36)      NOT NULL,
  user_id          CHAR(36)      NOT NULL,
  actor_id         CHAR(36)      DEFAULT NULL,
  event_type       VARCHAR(24)   NOT NULL,
  metadata         JSONB         DEFAULT NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT chk_membership_event_type
    CHECK (event_type IN ('JOINED','LEFT','ADDED','REMOVED','ROLE_CHANGED')),
  CONSTRAINT fk_cme_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversation (id) ON DELETE CASCADE,
  CONSTRAINT fk_cme_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_cme_actor FOREIGN KEY (actor_id)
    REFERENCES "user" (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cme_conversation
  ON conversation_membership_event (conversation_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- 4) message
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message (
  id               CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  conversation_id  CHAR(36)      NOT NULL,
  sender_id        CHAR(36)      DEFAULT NULL,        -- nullable for SYSTEM_* messages
  kind             VARCHAR(24)   NOT NULL DEFAULT 'TEXT',
  body             TEXT          NOT NULL,
  metadata         JSONB         DEFAULT NULL,         -- threat flags / system payload
  deleted_at       TIMESTAMP     DEFAULT NULL,
  deleted_by_id    CHAR(36)      DEFAULT NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT chk_message_kind
    CHECK (kind IN ('TEXT','SYSTEM_JOIN','SYSTEM_LEAVE','SYSTEM_RENAME','SYSTEM_ROLE_CHANGE')),
  CONSTRAINT chk_message_body_length
    CHECK (char_length(body) <= 4000),
  CONSTRAINT fk_message_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversation (id) ON DELETE CASCADE,
  CONSTRAINT fk_message_sender FOREIGN KEY (sender_id)
    REFERENCES "user" (id) ON DELETE SET NULL,
  CONSTRAINT fk_message_deleted_by FOREIGN KEY (deleted_by_id)
    REFERENCES "user" (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_message_conv_created
  ON message (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_message_sender
  ON message (sender_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────
-- 5) user_block (A blocks B; stored one-directional)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_block (
  id          CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  blocker_id  CHAR(36)      NOT NULL,
  blocked_id  CHAR(36)      NOT NULL,
  reason      VARCHAR(64)   DEFAULT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT chk_user_block_reason
    CHECK (reason IS NULL OR reason IN ('SPAM','HARASSMENT','SCAM','IMPERSONATION','OTHER')),
  CONSTRAINT chk_user_block_self
    CHECK (blocker_id <> blocked_id),
  CONSTRAINT fk_ub_blocker FOREIGN KEY (blocker_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_ub_blocked FOREIGN KEY (blocked_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_user_block_pair
  ON user_block (blocker_id, blocked_id);

CREATE INDEX IF NOT EXISTS idx_user_block_blocker
  ON user_block (blocker_id);

CREATE INDEX IF NOT EXISTS idx_user_block_blocked
  ON user_block (blocked_id);

-- ────────────────────────────────────────────────────────────────
-- 6) message_report
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_report (
  id                CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  reporter_id       CHAR(36)      NOT NULL,
  reported_user_id  CHAR(36)      NOT NULL,
  message_id        CHAR(36)      DEFAULT NULL,
  conversation_id   CHAR(36)      DEFAULT NULL,
  category          VARCHAR(32)   NOT NULL,
  notes             TEXT          DEFAULT NULL,
  status            VARCHAR(16)   NOT NULL DEFAULT 'OPEN',
  resolved_by_id    CHAR(36)      DEFAULT NULL,
  resolved_at       TIMESTAMP     DEFAULT NULL,
  resolution_notes  TEXT          DEFAULT NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT chk_message_report_category
    CHECK (category IN ('SPAM','SCAM','HARASSMENT','IMPERSONATION','SEXUAL','OTHER')),
  CONSTRAINT chk_message_report_status
    CHECK (status IN ('OPEN','REVIEWING','RESOLVED','DISMISSED')),
  CONSTRAINT chk_message_report_target
    CHECK (message_id IS NOT NULL OR conversation_id IS NOT NULL),
  CONSTRAINT fk_mr_reporter FOREIGN KEY (reporter_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_reported FOREIGN KEY (reported_user_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_message FOREIGN KEY (message_id)
    REFERENCES message (id) ON DELETE SET NULL,
  CONSTRAINT fk_mr_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversation (id) ON DELETE SET NULL,
  CONSTRAINT fk_mr_resolved_by FOREIGN KEY (resolved_by_id)
    REFERENCES "user" (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_message_report_open
  ON message_report (created_at DESC)
  WHERE status IN ('OPEN','REVIEWING');

CREATE INDEX IF NOT EXISTS idx_message_report_reported_user
  ON message_report (reported_user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- 7) messaging_suspension
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messaging_suspension (
  id           CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  user_id      CHAR(36)      NOT NULL,
  applied_by_id CHAR(36)     NOT NULL,
  reason       VARCHAR(255)  NOT NULL,
  starts_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   TIMESTAMP     DEFAULT NULL,
  lifted_at    TIMESTAMP     DEFAULT NULL,
  lifted_by_id CHAR(36)      DEFAULT NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_ms_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_ms_applied_by FOREIGN KEY (applied_by_id)
    REFERENCES "user" (id) ON DELETE SET NULL,
  CONSTRAINT fk_ms_lifted_by FOREIGN KEY (lifted_by_id)
    REFERENCES "user" (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messaging_suspension_active
  ON messaging_suspension (user_id)
  WHERE lifted_at IS NULL;

-- ────────────────────────────────────────────────────────────────
-- 8) admin_message_access_log
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_message_access_log (
  id                 CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  admin_user_id      CHAR(36)      NOT NULL,
  conversation_id    CHAR(36)      NOT NULL,
  related_report_id  CHAR(36)      DEFAULT NULL,
  reason             VARCHAR(255)  NOT NULL,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_amal_admin FOREIGN KEY (admin_user_id)
    REFERENCES "user" (id) ON DELETE SET NULL,
  CONSTRAINT fk_amal_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversation (id) ON DELETE CASCADE,
  CONSTRAINT fk_amal_report FOREIGN KEY (related_report_id)
    REFERENCES message_report (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_amal_admin_recent
  ON admin_message_access_log (admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_amal_conversation
  ON admin_message_access_log (conversation_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- 9) messaging_velocity_alarm
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messaging_velocity_alarm (
  id             CHAR(36)      NOT NULL DEFAULT gen_random_uuid()::char(36),
  user_id        CHAR(36)      NOT NULL,
  window_start   TIMESTAMP     NOT NULL,
  window_end     TIMESTAMP     NOT NULL,
  message_count  INTEGER       NOT NULL,
  threshold      INTEGER       NOT NULL,
  reviewed_at    TIMESTAMP     DEFAULT NULL,
  reviewed_by_id CHAR(36)      DEFAULT NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_mva_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_mva_reviewed_by FOREIGN KEY (reviewed_by_id)
    REFERENCES "user" (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mva_unreviewed
  ON messaging_velocity_alarm (created_at DESC)
  WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mva_user
  ON messaging_velocity_alarm (user_id, created_at DESC);

COMMIT;
