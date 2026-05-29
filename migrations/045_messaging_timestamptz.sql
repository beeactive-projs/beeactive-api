-- ============================================================
-- 045_messaging_timestamptz.sql
--
-- Purpose: convert every TIMESTAMP column in the messaging tables
-- to TIMESTAMPTZ so reads/writes are tz-aware end-to-end.
--
-- Symptom this fixes: the FE renders "3h ago" for a message that
-- was just sent, because Sequelize reads a tz-naive TIMESTAMP back
-- as the API server's local time, then JSON.stringify emits it as
-- ISO without 'Z'. Either side then interprets it in the local
-- timezone, drifting by the host's UTC offset.
--
-- The fix is uniform: TIMESTAMP -> TIMESTAMPTZ. Postgres `ALTER
-- COLUMN ... TYPE TIMESTAMPTZ USING <col> AT TIME ZONE 'UTC'`
-- treats existing data as UTC (which is how `new Date()` already
-- writes it on a UTC-configured app server). If the API host was
-- not running in UTC, an operator MUST verify the conversion
-- assumption before applying this migration to production.
--
-- This is data-preserving for the common case (Railway/UTC).
-- ============================================================

BEGIN;

-- conversation
ALTER TABLE conversation
  ALTER COLUMN last_message_at TYPE TIMESTAMPTZ
    USING last_message_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ
    USING updated_at AT TIME ZONE 'UTC';

-- conversation_participant
ALTER TABLE conversation_participant
  ALTER COLUMN last_read_at TYPE TIMESTAMPTZ
    USING last_read_at AT TIME ZONE 'UTC',
  ALTER COLUMN muted_until TYPE TIMESTAMPTZ
    USING muted_until AT TIME ZONE 'UTC',
  ALTER COLUMN joined_at TYPE TIMESTAMPTZ
    USING joined_at AT TIME ZONE 'UTC',
  ALTER COLUMN left_at TYPE TIMESTAMPTZ
    USING left_at AT TIME ZONE 'UTC';

-- conversation_membership_event
ALTER TABLE conversation_membership_event
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'UTC';

-- message
ALTER TABLE message
  ALTER COLUMN deleted_at TYPE TIMESTAMPTZ
    USING deleted_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'UTC';

-- user_block
ALTER TABLE user_block
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'UTC';

-- message_report
ALTER TABLE message_report
  ALTER COLUMN resolved_at TYPE TIMESTAMPTZ
    USING resolved_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'UTC';

-- messaging_suspension
ALTER TABLE messaging_suspension
  ALTER COLUMN starts_at TYPE TIMESTAMPTZ
    USING starts_at AT TIME ZONE 'UTC',
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ
    USING expires_at AT TIME ZONE 'UTC',
  ALTER COLUMN lifted_at TYPE TIMESTAMPTZ
    USING lifted_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'UTC';

-- admin_message_access_log
ALTER TABLE admin_message_access_log
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'UTC';

-- messaging_velocity_alarm
ALTER TABLE messaging_velocity_alarm
  ALTER COLUMN window_start TYPE TIMESTAMPTZ
    USING window_start AT TIME ZONE 'UTC',
  ALTER COLUMN window_end TYPE TIMESTAMPTZ
    USING window_end AT TIME ZONE 'UTC',
  ALTER COLUMN reviewed_at TYPE TIMESTAMPTZ
    USING reviewed_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'UTC';

COMMIT;
