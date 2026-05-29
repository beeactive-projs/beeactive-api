-- =============================================================================
-- 046_sessions_rewrite.sql
-- Hard rewrite of the sessions feature.
-- Drops the old single-table design; creates the new two-table
-- (session_template + session_instance) model with participants and reminders.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- DEMOLITION: drop old tables and their enum types
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS session_participant CASCADE;
DROP TABLE IF EXISTS session CASCADE;

DROP TYPE IF EXISTS enum_session_type;
DROP TYPE IF EXISTS enum_session_visibility;
DROP TYPE IF EXISTS enum_session_status;
DROP TYPE IF EXISTS enum_participant_status;

-- -----------------------------------------------------------------------------
-- NEW ENUM TYPES
-- -----------------------------------------------------------------------------
CREATE TYPE session_type AS ENUM ('GROUP', 'PRIVATE', 'OPEN');
CREATE TYPE session_access AS ENUM ('OPEN', 'CLIENTS_ONLY', 'GROUP_ONLY', 'FREE');
CREATE TYPE session_location_kind AS ENUM ('IN_PERSON', 'ONLINE');
CREATE TYPE session_meeting_provider AS ENUM ('ZOOM', 'GOOGLE_MEET', 'TEAMS');
CREATE TYPE session_template_status AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE session_instance_status AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE session_participant_status AS ENUM ('PENDING_APPROVAL', 'CONFIRMED', 'WAITLISTED', 'CANCELLED', 'DECLINED');
CREATE TYPE session_reminder_kind AS ENUM ('REMINDER_24H', 'REMINDER_1H');

-- -----------------------------------------------------------------------------
-- session_template: the "series definition" or "one-off class recipe"
-- One row per class concept. Recurring = 1 template + N instances.
-- One-off = 1 template + 1 instance.
-- -----------------------------------------------------------------------------
CREATE TABLE session_template (
  id                          CHAR(36) PRIMARY KEY,
  instructor_id               CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  group_id                    CHAR(36) NULL REFERENCES "group"(id) ON DELETE SET NULL,
  venue_id                    CHAR(36) NULL REFERENCES venue(id) ON DELETE SET NULL,

  slug                        VARCHAR(80) NOT NULL,

  title                       VARCHAR(255) NOT NULL,
  description                 TEXT NULL,

  type                        session_type NOT NULL,
  access                      session_access NOT NULL,
  approval_required           BOOLEAN NOT NULL DEFAULT FALSE,

  location_kind               session_location_kind NOT NULL,
  meeting_url                 VARCHAR(500) NULL,
  meeting_provider            session_meeting_provider NULL,

  duration_minutes            INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  timezone                    VARCHAR(64) NOT NULL DEFAULT 'Europe/Bucharest',

  capacity                    INTEGER NULL CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 1000),
  waitlist_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  cancellation_cutoff_hours   INTEGER NOT NULL DEFAULT 24 CHECK (cancellation_cutoff_hours BETWEEN 0 AND 168),

  price_amount_cents          INTEGER NOT NULL DEFAULT 0 CHECK (price_amount_cents >= 0),
  price_currency              VARCHAR(3) NOT NULL DEFAULT 'RON',

  is_recurring                BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule             JSONB NULL,
  first_start_at              TIMESTAMP NOT NULL,

  status                      session_template_status NOT NULL DEFAULT 'ACTIVE',
  ended_at                    TIMESTAMP NULL,

  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at                  TIMESTAMP NULL,

  CONSTRAINT uk_session_template_slug UNIQUE (instructor_id, slug),
  CONSTRAINT chk_online_has_url CHECK (
    (location_kind = 'ONLINE' AND meeting_url IS NOT NULL)
    OR (location_kind = 'IN_PERSON')
  ),
  CONSTRAINT chk_group_only_has_group CHECK (
    (access = 'GROUP_ONLY' AND group_id IS NOT NULL)
    OR (access <> 'GROUP_ONLY')
  )
);

CREATE INDEX idx_st_instructor_status ON session_template(instructor_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_st_group ON session_template(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_st_access_recurring ON session_template(access, is_recurring) WHERE deleted_at IS NULL;
CREATE INDEX idx_st_deleted_at ON session_template(deleted_at);

-- -----------------------------------------------------------------------------
-- session_instance: one row per actual occurrence
-- Inherits defaults from the template; can override per-occurrence.
-- Participants book instances, not templates.
-- -----------------------------------------------------------------------------
CREATE TABLE session_instance (
  id                          CHAR(36) PRIMARY KEY,
  template_id                 CHAR(36) NOT NULL REFERENCES session_template(id) ON DELETE CASCADE,
  instructor_id               CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  occurrence_index            INTEGER NOT NULL,
  start_at                    TIMESTAMP NOT NULL,
  end_at                      TIMESTAMP NOT NULL,

  -- Per-occurrence overrides (null = use template value)
  title_override              VARCHAR(255) NULL,
  description_override        TEXT NULL,
  venue_id_override           CHAR(36) NULL REFERENCES venue(id) ON DELETE SET NULL,
  meeting_url_override        VARCHAR(500) NULL,
  capacity_override           INTEGER NULL CHECK (capacity_override IS NULL OR capacity_override BETWEEN 1 AND 1000),
  is_override                 BOOLEAN NOT NULL DEFAULT FALSE,

  status                      session_instance_status NOT NULL DEFAULT 'SCHEDULED',
  cancel_reason               TEXT NULL,
  cancelled_at                TIMESTAMP NULL,

  -- Denormalised participant counters (maintained by service in same tx as participant changes)
  confirmed_count             INTEGER NOT NULL DEFAULT 0,
  pending_approval_count      INTEGER NOT NULL DEFAULT 0,
  waitlisted_count            INTEGER NOT NULL DEFAULT 0,
  attended_count              INTEGER NULL,

  -- Conflict detection: instance IDs of overlapping sessions for same instructor
  conflicting_instance_ids    JSONB NULL,

  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at                  TIMESTAMP NULL,

  CONSTRAINT uk_si_template_occurrence UNIQUE (template_id, occurrence_index),
  CONSTRAINT chk_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX idx_si_instructor_start ON session_instance(instructor_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_si_template_start ON session_instance(template_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_si_start_scheduled ON session_instance(start_at) WHERE status = 'SCHEDULED' AND deleted_at IS NULL;
CREATE INDEX idx_si_status_start ON session_instance(status, start_at);
CREATE INDEX idx_si_deleted_at ON session_instance(deleted_at);

-- -----------------------------------------------------------------------------
-- session_participant: one row per (instance, user) booking
-- Snapshot fields are written once at booking and never updated thereafter.
-- -----------------------------------------------------------------------------
CREATE TABLE session_participant (
  id                          CHAR(36) PRIMARY KEY,
  instance_id                 CHAR(36) NOT NULL REFERENCES session_instance(id) ON DELETE CASCADE,
  user_id                     CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  status                      session_participant_status NOT NULL,
  attended                    BOOLEAN NULL,
  checked_in_at               TIMESTAMP NULL,

  booking_note                TEXT NULL,
  private_note                TEXT NULL,

  -- Snapshot at booking time; immutable after creation.
  -- These reflect the terms the client agreed to when they booked,
  -- not the current template values (which may change later).
  snapshot_price_cents        INTEGER NOT NULL,
  snapshot_currency           VARCHAR(3) NOT NULL,
  snapshot_cancel_cutoff_h    INTEGER NOT NULL,
  snapshot_location_text      VARCHAR(255) NULL,
  snapshot_meeting_url        VARCHAR(500) NULL,

  booked_at                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at                 TIMESTAMP NULL,
  declined_at                 TIMESTAMP NULL,
  cancelled_at                TIMESTAMP NULL,
  cancel_reason               TEXT NULL,

  waitlist_position           INTEGER NULL,

  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uk_sp_instance_user UNIQUE (instance_id, user_id)
);

CREATE INDEX idx_sp_instance_status ON session_participant(instance_id, status);
CREATE INDEX idx_sp_user_status ON session_participant(user_id, status);
CREATE INDEX idx_sp_pending_or_waitlist ON session_participant(status) WHERE status IN ('PENDING_APPROVAL', 'WAITLISTED');

-- -----------------------------------------------------------------------------
-- session_reminder_schedule: rows representing pending reminder jobs
-- Written when a participant becomes CONFIRMED; deleted on cancellation.
-- Worker claims rows atomically via UPDATE ... WHERE sent_at IS NULL.
-- -----------------------------------------------------------------------------
CREATE TABLE session_reminder_schedule (
  id                CHAR(36) PRIMARY KEY,
  instance_id       CHAR(36) NOT NULL REFERENCES session_instance(id) ON DELETE CASCADE,
  participant_id    CHAR(36) NOT NULL REFERENCES session_participant(id) ON DELETE CASCADE,
  kind              session_reminder_kind NOT NULL,
  fire_at           TIMESTAMP NOT NULL,
  sent_at           TIMESTAMP NULL,
  job_id            VARCHAR(255) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uk_srs_participant_kind UNIQUE (participant_id, kind)
);

CREATE INDEX idx_srs_fire_at_unsent ON session_reminder_schedule(fire_at) WHERE sent_at IS NULL;
