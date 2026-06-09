-- =============================================================================
-- 047_workouts_foundation.sql
--
-- Foundation migration for the workouts/exercises feature.
--
-- Builds two new domains:
--   1. EXERCISE CATALOG    — exercise, muscle, equipment, exercise_media (+ M2M)
--   2. WORKOUT             — program, prescriptions, assignments (copy-on-assign),
--                            workout logs, one-rep-max history
--
-- Three-layer separation (catalog -> prescription -> log) — see
-- docs/research/workouts/04-locked-decisions.md §9-15 for rationale.
--
-- Design-validated additions (see §16-20):
--   - exercise.fork_count       — denormalized counter, sortable
--   - exercise.is_unilateral    — split squats / single-arm work
--   - user.exercise_catalog_opt_in — client browse gate
--   - soft-unpublish semantics enforced via paranoid + ON DELETE RESTRICT
--
-- Free Exercise DB seeding happens OUTSIDE this migration via
-- scripts/seed-exercises.ts (idempotent on source_provider+source_external_id).
-- Muscle + equipment taxonomy IS seeded inline below (small + stable).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- EXTENSIONS (defensive — already enabled by earlier migrations)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

CREATE TYPE exercise_source AS ENUM (
  'SYSTEM',      -- seeded from a public dataset (free-exercise-db, etc.)
  'INSTRUCTOR',  -- user-created
  'ADMIN'        -- created by MotionHive staff
);

CREATE TYPE exercise_visibility AS ENUM (
  'PRIVATE',     -- only owner can see/use
  'PUBLIC'       -- visible to all instructors in catalog
);

CREATE TYPE exercise_kind AS ENUM (
  'STRENGTH',    -- weight x reps
  'CARDIO',      -- duration + distance + HR
  'DURATION',    -- time-based (plank, isometric)
  'DISTANCE',    -- distance-based (run, swim)
  'BODYWEIGHT',  -- reps only
  'MOBILITY'     -- stretches, foam rolling
);

CREATE TYPE exercise_force AS ENUM ('PUSH', 'PULL', 'STATIC');

CREATE TYPE exercise_mechanic AS ENUM ('COMPOUND', 'ISOLATION');

CREATE TYPE exercise_level AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

CREATE TYPE movement_pattern AS ENUM (
  'SQUAT', 'HINGE', 'LUNGE',
  'PUSH_HORIZONTAL', 'PUSH_VERTICAL',
  'PULL_HORIZONTAL', 'PULL_VERTICAL',
  'CARRY', 'ROTATION', 'ANTI_ROTATION',
  'LOCOMOTION', 'ISOLATION'
);

CREATE TYPE muscle_role AS ENUM ('PRIMARY', 'SECONDARY', 'STABILIZER');

CREATE TYPE exercise_media_kind AS ENUM ('YOUTUBE', 'VIDEO', 'IMAGE', 'GIF', 'NONE');

CREATE TYPE exercise_set_type AS ENUM (
  'NORMAL',      -- standard working set
  'WARMUP',      -- warmup set (not counted in volume)
  'WORKING',     -- explicit working set
  'DROPSET',     -- drop set
  'FAILURE',     -- to failure
  'AMRAP',       -- as many reps as possible
  'REST_PAUSE',  -- rest-pause cluster
  'CLUSTER'      -- cluster set
);

CREATE TYPE exercise_block_kind AS ENUM (
  'NONE',        -- standalone
  'SUPERSET',    -- paired exercises
  'CIRCUIT',     -- ordered circuit
  'EMOM',        -- every minute on the minute
  'AMRAP',       -- as many rounds as possible (time-capped)
  'TABATA'       -- 20s on / 10s off x 8
);

CREATE TYPE program_kind AS ENUM (
  'WORKOUT',     -- V1
  'MEAL',        -- reserved for future meal plans
  'HABIT',       -- reserved for habit tracking
  'HYBRID'       -- reserved for mixed programs
);

CREATE TYPE program_status AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE program_assignment_status AS ENUM (
  'PENDING',     -- assigned but not yet started
  'ACTIVE',      -- in progress
  'COMPLETED',   -- all workouts done
  'PAUSED',      -- paused by coach or client
  'CANCELLED'    -- explicitly cancelled
);

CREATE TYPE workout_log_status AS ENUM (
  'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'ABANDONED'
);

CREATE TYPE one_rep_max_source AS ENUM (
  'TESTED', 'ESTIMATED_EPLEY', 'ESTIMATED_BRZYCKI', 'MANUAL'
);

-- =============================================================================
-- USER COLUMN — client catalog browse gate (Locked Decision §19)
--
-- Stores ONLY the explicit opt-in. Read-time eligibility:
--   canBrowseCatalog = exercise_catalog_opt_in
--                   OR EXISTS (program_assignment WHERE client_id=u AND status<>'CANCELLED')
-- Service layer enforces this; DDL only stores the toggle.
-- =============================================================================

ALTER TABLE "user"
  ADD COLUMN exercise_catalog_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

-- =============================================================================
-- TAXONOMY: muscle + equipment (small, seeded inline)
-- =============================================================================

CREATE TABLE muscle (
  id              CHAR(36) PRIMARY KEY,
  slug            VARCHAR(50)  NOT NULL UNIQUE,
  common_name     VARCHAR(100) NOT NULL,
  latin_name      VARCHAR(100),
  body_region     VARCHAR(30)  NOT NULL,  -- 'upper' | 'lower' | 'core' | 'full_body'
  display_order   SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_muscle_body_region ON muscle (body_region);

INSERT INTO muscle (id, slug, common_name, latin_name, body_region, display_order) VALUES
  (gen_random_uuid()::text, 'chest',       'Chest',          'Pectoralis major',    'upper',      1),
  (gen_random_uuid()::text, 'shoulders',   'Shoulders',      'Deltoideus',          'upper',      2),
  (gen_random_uuid()::text, 'triceps',     'Triceps',        'Triceps brachii',     'upper',      3),
  (gen_random_uuid()::text, 'biceps',      'Biceps',         'Biceps brachii',      'upper',      4),
  (gen_random_uuid()::text, 'forearms',    'Forearms',       NULL,                  'upper',      5),
  (gen_random_uuid()::text, 'lats',        'Lats',           'Latissimus dorsi',    'upper',      6),
  (gen_random_uuid()::text, 'middle_back', 'Middle back',    'Rhomboideus',         'upper',      7),
  (gen_random_uuid()::text, 'lower_back',  'Lower back',     'Erector spinae',      'core',       8),
  (gen_random_uuid()::text, 'traps',       'Traps',          'Trapezius',           'upper',      9),
  (gen_random_uuid()::text, 'neck',        'Neck',           NULL,                  'upper',     10),
  (gen_random_uuid()::text, 'abdominals',  'Abdominals',     'Rectus abdominis',    'core',      11),
  (gen_random_uuid()::text, 'quadriceps',  'Quadriceps',     'Quadriceps femoris',  'lower',     12),
  (gen_random_uuid()::text, 'hamstrings',  'Hamstrings',     NULL,                  'lower',     13),
  (gen_random_uuid()::text, 'glutes',      'Glutes',         'Gluteus maximus',     'lower',     14),
  (gen_random_uuid()::text, 'calves',      'Calves',         'Gastrocnemius',       'lower',     15),
  (gen_random_uuid()::text, 'adductors',   'Adductors',      NULL,                  'lower',     16),
  (gen_random_uuid()::text, 'abductors',   'Abductors',      NULL,                  'lower',     17);

CREATE TABLE equipment (
  id              CHAR(36) PRIMARY KEY,
  slug            VARCHAR(50)  NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  display_order   SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO equipment (id, slug, name, display_order) VALUES
  (gen_random_uuid()::text, 'barbell',        'Barbell',         1),
  (gen_random_uuid()::text, 'dumbbell',       'Dumbbell',        2),
  (gen_random_uuid()::text, 'kettlebell',     'Kettlebell',      3),
  (gen_random_uuid()::text, 'cable',          'Cable',           4),
  (gen_random_uuid()::text, 'machine',        'Machine',         5),
  (gen_random_uuid()::text, 'smith_machine',  'Smith machine',   6),
  (gen_random_uuid()::text, 'bodyweight',     'Bodyweight',      7),
  (gen_random_uuid()::text, 'bands',          'Bands',           8),
  (gen_random_uuid()::text, 'medicine_ball',  'Medicine ball',   9),
  (gen_random_uuid()::text, 'exercise_ball',  'Exercise ball',  10),
  (gen_random_uuid()::text, 'foam_roller',    'Foam roller',    11),
  (gen_random_uuid()::text, 'ez_bar',         'EZ bar',         12),
  (gen_random_uuid()::text, 'bench',          'Bench',          13),
  (gen_random_uuid()::text, 'pull_up_bar',    'Pull-up bar',    14),
  (gen_random_uuid()::text, 'other',          'Other',          15);

-- =============================================================================
-- EXERCISE CATALOG
-- =============================================================================

CREATE TABLE exercise (
  id                  CHAR(36) PRIMARY KEY,
  name                VARCHAR(200) NOT NULL,
  slug                VARCHAR(255) NOT NULL,
  description         TEXT,
  instructions        TEXT,
  kind                exercise_kind NOT NULL,

  -- Classification
  movement_pattern    movement_pattern,
  mechanic            exercise_mechanic,
  force               exercise_force,
  level               exercise_level NOT NULL DEFAULT 'BEGINNER',
  met_value           DECIMAL(3,1),                       -- cardio intensity, future calorie math

  -- Ownership & visibility
  source              exercise_source NOT NULL,
  owner_id            CHAR(36) REFERENCES "user"(id) ON DELETE SET NULL,
  visibility          exercise_visibility NOT NULL DEFAULT 'PRIVATE',
  forked_from_id      CHAR(36) REFERENCES exercise(id) ON DELETE SET NULL,

  -- Provenance (traceability ONLY; NEVER an FK to an external system)
  source_provider     VARCHAR(50),                        -- 'free-exercise-db' | 'wger' | 'user' | 'admin'
  source_external_id  VARCHAR(255),

  -- Media (V1 primary media; multi-image overlay lives in exercise_media)
  media_kind          exercise_media_kind NOT NULL DEFAULT 'NONE',
  thumbnail_url       VARCHAR(500),                       -- catalog list thumb (start-position image for SYSTEM)
  youtube_url         VARCHAR(500),

  -- UI hints
  tracking_fields     JSONB,                              -- override which fields the logging UI surfaces

  -- Programming hints (design-validated §18)
  is_unilateral       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Denormalized counters (design-validated §17)
  fork_count          INTEGER NOT NULL DEFAULT 0,

  -- Future export hooks (nullable, populated over time)
  fit_category        VARCHAR(50),
  fit_subcategory     VARCHAR(50),
  hk_activity_type    VARCHAR(50),

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT exercise_youtube_url_format CHECK (
    youtube_url IS NULL OR youtube_url ~ '^https?://(www\.)?(youtube\.com|youtu\.be)/'
  ),
  CONSTRAINT exercise_fork_count_nonneg CHECK (fork_count >= 0),
  CONSTRAINT exercise_met_value_range CHECK (met_value IS NULL OR (met_value >= 0.5 AND met_value <= 30.0))
);

-- Owner-scoped unique slug; SYSTEM exercises share the global namespace (NULL owner)
CREATE UNIQUE INDEX idx_exercise_slug_per_owner
  ON exercise (COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'), slug)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_exercise_owner             ON exercise (owner_id)            WHERE deleted_at IS NULL;
CREATE INDEX idx_exercise_visibility        ON exercise (visibility)          WHERE deleted_at IS NULL;
CREATE INDEX idx_exercise_kind              ON exercise (kind);
CREATE INDEX idx_exercise_movement_pattern  ON exercise (movement_pattern);
CREATE INDEX idx_exercise_source_provider   ON exercise (source_provider, source_external_id);
CREATE INDEX idx_exercise_fork_count
  ON exercise (fork_count DESC)
  WHERE deleted_at IS NULL AND visibility = 'PUBLIC';
CREATE INDEX idx_exercise_name_trgm         ON exercise USING gin (name gin_trgm_ops);

-- exercise <-> muscle (M2M with role)
CREATE TABLE exercise_muscle (
  exercise_id   CHAR(36) NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  muscle_id     CHAR(36) NOT NULL REFERENCES muscle(id)   ON DELETE RESTRICT,
  role          muscle_role NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exercise_id, muscle_id, role)
);

CREATE INDEX idx_exercise_muscle_muscle ON exercise_muscle (muscle_id, role);

-- exercise <-> equipment (M2M)
CREATE TABLE exercise_equipment (
  exercise_id    CHAR(36) NOT NULL REFERENCES exercise(id)  ON DELETE CASCADE,
  equipment_id   CHAR(36) NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exercise_id, equipment_id)
);

CREATE INDEX idx_exercise_equipment_equipment ON exercise_equipment (equipment_id);

-- exercise_media: provider overlay (start+end image pair for SYSTEM,
-- YouTube thumbnails for custom, MuscleWiki videos in V2, etc.)
CREATE TABLE exercise_media (
  id                 CHAR(36) PRIMARY KEY,
  exercise_id        CHAR(36) NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  provider           VARCHAR(50) NOT NULL,                  -- 'jsdelivr' | 'cloudinary' | 'youtube' | 'musclewiki' | 'wger'
  provider_asset_id  VARCHAR(255),
  kind               exercise_media_kind NOT NULL,
  url                TEXT NOT NULL,
  thumbnail_url      TEXT,
  duration_seconds   INTEGER,
  width_px           INTEGER,
  height_px          INTEGER,
  display_order      SMALLINT NOT NULL DEFAULT 0,
  is_primary         BOOLEAN NOT NULL DEFAULT FALSE,
  licensed_until     DATE,                                  -- enforce license expiry at read time
  created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_exercise_media_exercise ON exercise_media (exercise_id, display_order);
CREATE INDEX idx_exercise_media_provider ON exercise_media (provider);
CREATE UNIQUE INDEX idx_exercise_media_primary
  ON exercise_media (exercise_id) WHERE is_primary = TRUE;

-- =============================================================================
-- PROGRAM (the plan — instructor authors)
-- =============================================================================

CREATE TABLE program (
  id                    CHAR(36) PRIMARY KEY,
  owner_id              CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  name                  VARCHAR(200) NOT NULL,
  description           TEXT,
  kind                  program_kind   NOT NULL DEFAULT 'WORKOUT',
  status                program_status NOT NULL DEFAULT 'DRAFT',
  duration_weeks        SMALLINT,
  periodization_model   VARCHAR(50),                          -- free-text UX hint only
  cover_image_url       VARCHAR(500),
  goal_tags             JSONB,                                -- ['hypertrophy', 'fat_loss']
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at            TIMESTAMPTZ,

  CONSTRAINT program_duration_weeks_range CHECK (
    duration_weeks IS NULL OR (duration_weeks >= 1 AND duration_weeks <= 104)
  )
);

CREATE INDEX idx_program_owner       ON program (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_program_kind_status ON program (kind, status) WHERE deleted_at IS NULL;

CREATE TABLE program_workout (
  id                          CHAR(36) PRIMARY KEY,
  program_id                  CHAR(36) NOT NULL REFERENCES program(id) ON DELETE CASCADE,
  name                        VARCHAR(200) NOT NULL,                  -- 'Day 1 — Upper'
  notes                       TEXT,
  week_index                  SMALLINT NOT NULL,                      -- 0-based
  day_index                   SMALLINT NOT NULL,                      -- 0-based within week
  sequence_number             INTEGER  NOT NULL,                      -- 0-based across program
  phase                       VARCHAR(50),                            -- 'deload', 'accumulation', etc.
  estimated_duration_minutes  SMALLINT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT program_workout_week_nonneg CHECK (week_index >= 0),
  CONSTRAINT program_workout_day_range   CHECK (day_index BETWEEN 0 AND 6),
  CONSTRAINT program_workout_est_dur     CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes BETWEEN 5 AND 480)
);

CREATE UNIQUE INDEX idx_program_workout_position
  ON program_workout (program_id, week_index, day_index);
CREATE INDEX idx_program_workout_program
  ON program_workout (program_id, sequence_number);

CREATE TABLE exercise_block (
  id                          CHAR(36) PRIMARY KEY,
  program_workout_id          CHAR(36) NOT NULL REFERENCES program_workout(id) ON DELETE CASCADE,
  kind                        exercise_block_kind NOT NULL,
  order_index                 SMALLINT NOT NULL,
  rounds                      SMALLINT,                              -- for CIRCUIT, EMOM, AMRAP
  duration_seconds            INTEGER,                               -- for EMOM, AMRAP, TABATA
  rest_between_rounds_seconds INTEGER,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_exercise_block_workout ON exercise_block (program_workout_id, order_index);

CREATE TABLE prescribed_exercise (
  id                      CHAR(36) PRIMARY KEY,
  program_workout_id      CHAR(36) NOT NULL REFERENCES program_workout(id) ON DELETE CASCADE,
  exercise_id             CHAR(36) NOT NULL REFERENCES exercise(id)        ON DELETE RESTRICT,
  block_id                CHAR(36) REFERENCES exercise_block(id)           ON DELETE SET NULL,
  superset_group_id       SMALLINT,                                        -- same value within workout = paired
  order_index             SMALLINT NOT NULL,
  notes                   TEXT,
  alternate_exercise_id   CHAR(36) REFERENCES exercise(id)                 ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prescribed_exercise_workout
  ON prescribed_exercise (program_workout_id, order_index);
CREATE INDEX idx_prescribed_exercise_exercise
  ON prescribed_exercise (exercise_id);

CREATE TABLE prescribed_set (
  id                          CHAR(36) PRIMARY KEY,
  prescribed_exercise_id      CHAR(36) NOT NULL REFERENCES prescribed_exercise(id) ON DELETE CASCADE,
  order_index                 SMALLINT NOT NULL,
  set_type                    exercise_set_type NOT NULL DEFAULT 'NORMAL',

  -- Targets (all nullable; exercise.kind decides which the UI surfaces)
  target_reps_min             SMALLINT,
  target_reps_max             SMALLINT,
  target_weight_kg            DECIMAL(6,2),
  target_weight_percent_1rm   DECIMAL(5,2),         -- 0-100
  target_duration_seconds     INTEGER,
  target_distance_meters      INTEGER,
  target_rpe                  DECIMAL(3,1),         -- 1.0-10.0
  target_rir                  SMALLINT,             -- reps in reserve

  -- Pacing
  rest_after_seconds          INTEGER,
  tempo                       CHAR(7),              -- e.g. '3-1-1-0'

  notes                       TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT prescribed_set_reps_range CHECK (
    target_reps_min IS NULL OR target_reps_max IS NULL OR target_reps_min <= target_reps_max
  ),
  CONSTRAINT prescribed_set_rpe_range CHECK (
    target_rpe IS NULL OR (target_rpe >= 1.0 AND target_rpe <= 10.0)
  ),
  CONSTRAINT prescribed_set_rir_nonneg CHECK (
    target_rir IS NULL OR target_rir >= 0
  ),
  CONSTRAINT prescribed_set_percent_1rm_range CHECK (
    target_weight_percent_1rm IS NULL
    OR (target_weight_percent_1rm >= 0 AND target_weight_percent_1rm <= 100)
  )
);

CREATE INDEX idx_prescribed_set_exercise
  ON prescribed_set (prescribed_exercise_id, order_index);

-- =============================================================================
-- ASSIGNMENT (deep copy of prescription, per client)
-- =============================================================================

CREATE TABLE program_assignment (
  id                       CHAR(36) PRIMARY KEY,
  instructor_id            CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  client_id                CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  instructor_client_id     CHAR(36) REFERENCES instructor_client(id) ON DELETE SET NULL,
  master_program_id        CHAR(36) REFERENCES program(id)           ON DELETE SET NULL,

  -- Snapshot at assignment time (for display when master is later deleted)
  program_name_snapshot    VARCHAR(200) NOT NULL,

  status                   program_assignment_status NOT NULL DEFAULT 'PENDING',
  start_date               DATE NOT NULL,
  end_date                 DATE,
  completion_percent       SMALLINT NOT NULL DEFAULT 0,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at               TIMESTAMPTZ,

  CONSTRAINT program_assignment_completion_range
    CHECK (completion_percent BETWEEN 0 AND 100),
  CONSTRAINT program_assignment_date_order
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_program_assignment_client_status
  ON program_assignment (client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_program_assignment_instructor
  ON program_assignment (instructor_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_program_assignment_start_date
  ON program_assignment (start_date)       WHERE deleted_at IS NULL;

CREATE TABLE assigned_workout (
  id                          CHAR(36) PRIMARY KEY,
  program_assignment_id       CHAR(36) NOT NULL REFERENCES program_assignment(id) ON DELETE CASCADE,
  master_workout_id           CHAR(36) REFERENCES program_workout(id)             ON DELETE SET NULL,

  -- Mirrors program_workout
  name                        VARCHAR(200) NOT NULL,
  notes                       TEXT,
  week_index                  SMALLINT NOT NULL,
  day_index                   SMALLINT NOT NULL,
  sequence_number             INTEGER  NOT NULL,
  phase                       VARCHAR(50),
  estimated_duration_minutes  SMALLINT,

  -- Assignment-specific
  scheduled_date              DATE,
  status                      workout_log_status,      -- nullable until client touches it

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT assigned_workout_week_nonneg CHECK (week_index >= 0),
  CONSTRAINT assigned_workout_day_range   CHECK (day_index BETWEEN 0 AND 6)
);

CREATE INDEX idx_assigned_workout_assignment
  ON assigned_workout (program_assignment_id, sequence_number);
CREATE INDEX idx_assigned_workout_scheduled
  ON assigned_workout (scheduled_date, status);

CREATE TABLE assigned_exercise (
  id                       CHAR(36) PRIMARY KEY,
  assigned_workout_id      CHAR(36) NOT NULL REFERENCES assigned_workout(id)     ON DELETE CASCADE,
  exercise_id              CHAR(36) NOT NULL REFERENCES exercise(id)             ON DELETE RESTRICT,
  master_exercise_id       CHAR(36) REFERENCES prescribed_exercise(id)           ON DELETE SET NULL,

  superset_group_id        SMALLINT,
  order_index              SMALLINT NOT NULL,
  notes                    TEXT,
  alternate_exercise_id    CHAR(36) REFERENCES exercise(id)                      ON DELETE SET NULL,

  is_modified_from_master  BOOLEAN NOT NULL DEFAULT FALSE,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assigned_exercise_workout
  ON assigned_exercise (assigned_workout_id, order_index);

CREATE TABLE assigned_set (
  id                          CHAR(36) PRIMARY KEY,
  assigned_exercise_id        CHAR(36) NOT NULL REFERENCES assigned_exercise(id) ON DELETE CASCADE,
  master_set_id               CHAR(36) REFERENCES prescribed_set(id)             ON DELETE SET NULL,

  -- Mirrors prescribed_set
  order_index                 SMALLINT NOT NULL,
  set_type                    exercise_set_type NOT NULL DEFAULT 'NORMAL',
  target_reps_min             SMALLINT,
  target_reps_max             SMALLINT,
  target_weight_kg            DECIMAL(6,2),
  target_weight_percent_1rm   DECIMAL(5,2),
  target_duration_seconds     INTEGER,
  target_distance_meters      INTEGER,
  target_rpe                  DECIMAL(3,1),
  target_rir                  SMALLINT,
  rest_after_seconds          INTEGER,
  tempo                       CHAR(7),
  notes                       TEXT,

  -- %1RM resolution snapshot (filled when client starts the workout)
  resolved_weight_kg          DECIMAL(6,2),
  resolved_at                 TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT assigned_set_reps_range CHECK (
    target_reps_min IS NULL OR target_reps_max IS NULL OR target_reps_min <= target_reps_max
  ),
  CONSTRAINT assigned_set_rpe_range CHECK (
    target_rpe IS NULL OR (target_rpe >= 1.0 AND target_rpe <= 10.0)
  ),
  CONSTRAINT assigned_set_rir_nonneg CHECK (
    target_rir IS NULL OR target_rir >= 0
  ),
  CONSTRAINT assigned_set_percent_1rm_range CHECK (
    target_weight_percent_1rm IS NULL
    OR (target_weight_percent_1rm >= 0 AND target_weight_percent_1rm <= 100)
  )
);

CREATE INDEX idx_assigned_set_exercise
  ON assigned_set (assigned_exercise_id, order_index);

-- =============================================================================
-- ONE-REP-MAX HISTORY (per user, per exercise; used for %1RM resolution)
-- =============================================================================

CREATE TABLE one_rep_max (
  id            CHAR(36) PRIMARY KEY,
  user_id       CHAR(36) NOT NULL REFERENCES "user"(id)    ON DELETE CASCADE,
  exercise_id   CHAR(36) NOT NULL REFERENCES exercise(id)  ON DELETE CASCADE,
  weight_kg     DECIMAL(6,2) NOT NULL,
  source        one_rep_max_source NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT one_rep_max_weight_positive CHECK (weight_kg > 0)
);

CREATE INDEX idx_one_rep_max_lookup
  ON one_rep_max (user_id, exercise_id, recorded_at DESC);

-- =============================================================================
-- WORKOUT LOG (what actually happened)
-- =============================================================================

CREATE TABLE workout_log (
  id                              CHAR(36) PRIMARY KEY,
  user_id                         CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- Assignment linkage (nullable for freestyle/unplanned workouts)
  program_assignment_id           CHAR(36) REFERENCES program_assignment(id) ON DELETE SET NULL,
  assigned_workout_id             CHAR(36) REFERENCES assigned_workout(id)   ON DELETE SET NULL,

  name                            VARCHAR(200) NOT NULL,
  status                          workout_log_status NOT NULL DEFAULT 'IN_PROGRESS',
  started_at                      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at                    TIMESTAMPTZ,
  duration_seconds                INTEGER,

  notes                           TEXT,
  feeling_rating                  SMALLINT,                          -- 1-5 emoji-style score

  -- Future export hooks
  hk_activity_type                VARCHAR(50),
  health_connect_exercise_type    VARCHAR(50),

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT workout_log_feeling_range CHECK (
    feeling_rating IS NULL OR (feeling_rating >= 1 AND feeling_rating <= 5)
  ),
  CONSTRAINT workout_log_duration_nonneg CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  )
);

CREATE INDEX idx_workout_log_user_date    ON workout_log (user_id, started_at DESC);
CREATE INDEX idx_workout_log_assignment   ON workout_log (program_assignment_id);
CREATE INDEX idx_workout_log_status       ON workout_log (status);

CREATE TABLE logged_exercise (
  id                              CHAR(36) PRIMARY KEY,
  workout_log_id                  CHAR(36) NOT NULL REFERENCES workout_log(id) ON DELETE CASCADE,
  exercise_id                     CHAR(36) REFERENCES exercise(id)             ON DELETE SET NULL,
  assigned_exercise_id            CHAR(36) REFERENCES assigned_exercise(id)    ON DELETE SET NULL,

  -- Historical snapshots so renamed/deleted exercises don't blank history
  exercise_name_snapshot          VARCHAR(200) NOT NULL,
  exercise_thumbnail_url_snapshot VARCHAR(500),

  order_index                     SMALLINT NOT NULL,
  superset_group_id               SMALLINT,
  notes                           TEXT,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_logged_exercise_log
  ON logged_exercise (workout_log_id, order_index);
CREATE INDEX idx_logged_exercise_exercise
  ON logged_exercise (exercise_id) WHERE exercise_id IS NOT NULL;

CREATE TABLE logged_set (
  id                       CHAR(36) PRIMARY KEY,
  logged_exercise_id       CHAR(36) NOT NULL REFERENCES logged_exercise(id) ON DELETE CASCADE,
  assigned_set_id          CHAR(36) REFERENCES assigned_set(id)             ON DELETE SET NULL,

  order_index              SMALLINT NOT NULL,
  set_type                 exercise_set_type NOT NULL DEFAULT 'NORMAL',

  -- Actuals (all nullable — mark-complete only is allowed)
  reps                     SMALLINT,
  weight_kg                DECIMAL(6,2),
  duration_seconds         INTEGER,
  distance_meters          INTEGER,
  rpe                      DECIMAL(3,1),
  rir                      SMALLINT,
  rest_after_seconds       INTEGER,

  is_completed             BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at             TIMESTAMPTZ,
  notes                    TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT logged_set_rpe_range CHECK (
    rpe IS NULL OR (rpe >= 1.0 AND rpe <= 10.0)
  ),
  CONSTRAINT logged_set_reps_nonneg CHECK (
    reps IS NULL OR reps >= 0
  ),
  CONSTRAINT logged_set_rir_nonneg CHECK (
    rir IS NULL OR rir >= 0
  )
);

CREATE INDEX idx_logged_set_exercise   ON logged_set (logged_exercise_id, order_index);
CREATE INDEX idx_logged_set_completion ON logged_set (is_completed, completed_at);

-- =============================================================================
-- SEARCH INTEGRATION
--
-- Extend search_doc.entity_type CHECK to allow 'exercise'.
-- Per design D5: only `exercise` indexes into search_doc in V1; programs are
-- accessed via list endpoints (instructor-owned, low cardinality).
-- =============================================================================

ALTER TABLE search_doc DROP CONSTRAINT IF EXISTS chk_search_doc_entity_type;
ALTER TABLE search_doc ADD CONSTRAINT chk_search_doc_entity_type
  CHECK (entity_type IN ('user', 'instructor', 'group', 'session', 'tag', 'post', 'exercise'));

-- =============================================================================
-- COMMENTS (load-bearing rules in DB metadata; visible via psql \d+)
-- =============================================================================

COMMENT ON TABLE exercise IS
  'Catalog of exercises — system + instructor-created. Soft-unpublish (visibility flip PUBLIC->PRIVATE) never breaks existing prescribed/assigned/logged references. See docs/research/workouts/04-locked-decisions.md §16.';
COMMENT ON COLUMN exercise.fork_count IS
  'Denormalized counter of forks (rows where forked_from_id = this.id AND deleted_at IS NULL). Maintained inside the fork transaction: +1 on create, -1 on soft-delete. See §17.';
COMMENT ON COLUMN exercise.is_unilateral IS
  'Split squats, single-arm rows, single-leg work. Future logging UX uses this to track L vs R or alternate sides. See §18.';
COMMENT ON COLUMN exercise.source_provider IS
  'Traceability ONLY. NEVER a foreign key to an external system. If the provider disappears, the catalog row survives.';
COMMENT ON COLUMN "user".exercise_catalog_opt_in IS
  'Client catalog browse gate. Effective access = this OR EXISTS(program_assignment WHERE client_id=u AND status<>CANCELLED). See §19.';

COMMIT;
