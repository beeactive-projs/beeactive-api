# DB Schema — Workouts & Exercises V1

**Status:** Proposed, not yet shipped. Migration number target: **046_workouts_foundation.sql** (re-check before writing — migrations 046+ may exist by the time this lands).
**Conventions:** MotionHive standard — CHAR(36) UUID PKs, `underscored: true` (snake_case columns), CHAR(36) FK references, paranoid mode on user-facing entities (`deleted_at TIMESTAMPTZ`).

This document is the **authoritative DDL spec**. The implementing migration MUST match this shape. Deviations require updating this doc first.

## Schema overview (ASCII)

```
                       ┌─────────────────────────┐
                       │ exercise (catalog)      │
                       │                         │
                       │ id, name, kind, source, │
                       │ owner_id, visibility,   │
                       │ youtube_url, ...        │
                       └─────────────────────────┘
                              ▲          ▲
                              │          │ many-to-many
                              │          │
                  ┌───────────┴──┐    ┌──┴───────────┐
                  │ exercise_muscle│    │ exercise_eqpt│
                  └──────────────┘    └──────────────┘
                              ▲
                              │ FK exercise_id
       ┌──────────────────────┴──────────────────────┐
       │                                             │
┌──────┴──────────┐                          ┌───────┴─────────┐
│ prescribed_     │                          │ assigned_       │
│  exercise       │  copy-on-assign deep     │  exercise       │
│                 ├─────────────────────────►│                 │
│ → prescribed_set│                          │ → assigned_set  │
└─────────────────┘                          └─────────────────┘
       ▲                                             ▲
       │ FK program_workout_id                       │ FK assigned_workout_id
┌──────┴──────────┐                          ┌───────┴─────────┐
│ program_workout │                          │ assigned_workout│
└─────────────────┘                          └─────────────────┘
       ▲                                             ▲
       │ FK program_id                               │ FK program_assignment_id
┌──────┴──────────┐                          ┌───────┴─────────┐
│ program         │  master_program_id ────►  │ program_        │
│ (owner=instr.)  │  (informational)          │  assignment     │
│                 │                          │ (per-client copy)│
└─────────────────┘                          └─────────────────┘
                                                     │
                                                     │ FK
                                                     ▼
                                            ┌─────────────────┐
                                            │ workout_log     │
                                            │ → logged_       │
                                            │     exercise    │
                                            │   → logged_set  │
                                            └─────────────────┘
```

## Enum types

Defined once at the top of the migration, before any tables that reference them.

```sql
-- Exercise classification
CREATE TYPE exercise_source AS ENUM (
  'SYSTEM',                -- seeded from a public dataset (free-exercise-db, etc.)
  'INSTRUCTOR',            -- user-created
  'ADMIN'                  -- created by MotionHive staff
);

CREATE TYPE exercise_visibility AS ENUM (
  'PRIVATE',               -- only owner can see/use
  'PUBLIC'                 -- visible to all instructors in catalog
);

CREATE TYPE exercise_kind AS ENUM (
  'STRENGTH',              -- weight × reps
  'CARDIO',                -- duration + distance + HR
  'DURATION',              -- time-based (plank, isometric)
  'DISTANCE',              -- distance-based (run, swim)
  'BODYWEIGHT',            -- reps only
  'MOBILITY'               -- stretches, foam rolling
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

-- Muscle role on an exercise
CREATE TYPE muscle_role AS ENUM ('PRIMARY', 'SECONDARY', 'STABILIZER');

-- Media
CREATE TYPE media_kind AS ENUM ('YOUTUBE', 'VIDEO', 'IMAGE', 'GIF', 'NONE');

-- Sets
CREATE TYPE set_type AS ENUM (
  'NORMAL',      -- standard working set
  'WARMUP',      -- warmup set (not counted in volume)
  'WORKING',     -- explicit working set (synonym of NORMAL for coaches who care)
  'DROPSET',     -- drop set
  'FAILURE',     -- to failure
  'AMRAP',       -- as many reps as possible
  'REST_PAUSE',  -- rest-pause cluster
  'CLUSTER'      -- cluster set
);

-- Exercise blocks (groupings of exercises within a workout)
CREATE TYPE exercise_block_kind AS ENUM (
  'NONE',        -- standalone
  'SUPERSET',    -- paired exercises
  'CIRCUIT',     -- ordered circuit
  'EMOM',        -- every minute on the minute
  'AMRAP',       -- as many rounds as possible (time-capped)
  'TABATA'       -- 20s on / 10s off × 8
);

-- Programs
CREATE TYPE program_kind AS ENUM (
  'WORKOUT',     -- V1
  'MEAL',        -- reserved for future meal plans
  'HABIT',       -- reserved for habit tracking
  'HYBRID'       -- reserved for mixed programs
);

CREATE TYPE program_status AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED'
);

CREATE TYPE program_assignment_status AS ENUM (
  'PENDING',     -- assigned but not yet started
  'ACTIVE',      -- in progress
  'COMPLETED',   -- all workouts done
  'PAUSED',      -- paused by coach or client
  'CANCELLED'    -- explicitly cancelled
);

CREATE TYPE workout_log_status AS ENUM (
  'IN_PROGRESS',
  'COMPLETED',
  'SKIPPED',
  'ABANDONED'
);
```

## Taxonomy tables (small, seeded)

### `muscle`

```sql
CREATE TABLE muscle (
  id           CHAR(36) PRIMARY KEY,
  slug         VARCHAR(50)  NOT NULL UNIQUE,  -- 'chest', 'lats'
  common_name  VARCHAR(100) NOT NULL,         -- 'Chest', 'Latissimus dorsi'
  latin_name   VARCHAR(100),                  -- 'Pectoralis major'
  body_region  VARCHAR(30)  NOT NULL,         -- 'upper', 'lower', 'core', 'full_body'
  display_order SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_muscle_body_region ON muscle (body_region);
```

Seeded with ~17 rows from Free Exercise DB's muscle list (chest, shoulders, triceps, quadriceps, hamstrings, glutes, lats, middle_back, lower_back, traps, neck, abdominals, forearms, calves, biceps, adductors, abductors).

### `equipment`

```sql
CREATE TABLE equipment (
  id           CHAR(36) PRIMARY KEY,
  slug         VARCHAR(50)  NOT NULL UNIQUE,  -- 'barbell', 'dumbbell', 'bodyweight'
  name         VARCHAR(100) NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Seeded with ~15 rows: barbell, dumbbell, kettlebell, cable, machine, smith_machine, bodyweight, bands, medicine_ball, exercise_ball, foam_roller, ez_bar, bench, pull_up_bar, other.

## Exercise catalog

### `exercise`

```sql
CREATE TABLE exercise (
  id                CHAR(36) PRIMARY KEY,
  name              VARCHAR(200) NOT NULL,
  slug              VARCHAR(255) NOT NULL,        -- unique within (source, owner_id)
  description       TEXT,
  instructions      TEXT,                          -- form cues, one paragraph
  kind              exercise_kind NOT NULL,        -- drives UI tracking fields

  -- Classification
  movement_pattern  movement_pattern,              -- nullable; not every exercise fits
  mechanic          exercise_mechanic,             -- nullable
  force             exercise_force,                -- nullable
  level             exercise_level NOT NULL DEFAULT 'BEGINNER',
  met_value         DECIMAL(3,1),                  -- MET intensity (cardio)

  -- Ownership & visibility
  source            exercise_source NOT NULL,
  owner_id          CHAR(36) REFERENCES "user"(id) ON DELETE SET NULL,
  visibility        exercise_visibility NOT NULL DEFAULT 'PRIVATE',
  forked_from_id    CHAR(36) REFERENCES exercise(id) ON DELETE SET NULL,

  -- Provenance (traceability ONLY; NEVER an FK to an external system)
  source_provider   VARCHAR(50),                   -- 'free-exercise-db' | 'wger' | 'user' | 'admin'
  source_external_id VARCHAR(255),                 -- e.g. 'Barbell_Squat' from FED

  -- Media (V1 — primary media)
  media_kind        media_kind NOT NULL DEFAULT 'NONE',
  thumbnail_url     VARCHAR(500),                  -- catalog list thumb; for SYSTEM = start-position image; multi-image overlay lives in exercise_media
  youtube_url       VARCHAR(500),                  -- V1: custom exercises only

  -- UI hints
  tracking_fields   JSONB,                         -- e.g. ["reps", "weight", "rpe"] subset of fields the UI surfaces

  -- Programming hints
  is_unilateral     BOOLEAN NOT NULL DEFAULT FALSE, -- split squats, single-arm rows, etc. — surfaced in logging UX

  -- Denormalized counters (kept in sync inside the same tx as the action)
  fork_count        INTEGER NOT NULL DEFAULT 0,    -- count of rows where forked_from_id = this.id (PUBLIC only); sortable

  -- Future export hooks (nullable, populated over time)
  fit_category      VARCHAR(50),                   -- Garmin FIT exercise category
  fit_subcategory   VARCHAR(50),                   -- Garmin FIT exercise sub-category
  hk_activity_type  VARCHAR(50),                   -- Apple HealthKit HKWorkoutActivityType

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,

  CONSTRAINT exercise_youtube_url_format CHECK (
    youtube_url IS NULL OR youtube_url ~ '^https?://(www\.)?(youtube\.com|youtu\.be)/'
  ),
  CONSTRAINT exercise_fork_count_nonneg CHECK (fork_count >= 0)
);

-- Owner-scoped unique slug; system exercises have NULL owner_id and share a global namespace
CREATE UNIQUE INDEX idx_exercise_slug_per_owner
  ON exercise (COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::char), slug)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_exercise_owner ON exercise (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_exercise_visibility ON exercise (visibility) WHERE deleted_at IS NULL;
CREATE INDEX idx_exercise_kind ON exercise (kind);
CREATE INDEX idx_exercise_movement_pattern ON exercise (movement_pattern);
CREATE INDEX idx_exercise_source_provider ON exercise (source_provider, source_external_id);
CREATE INDEX idx_exercise_fork_count ON exercise (fork_count DESC) WHERE deleted_at IS NULL AND visibility = 'PUBLIC';

-- For text search via search_doc (already indexed via the global search_doc table)
CREATE INDEX idx_exercise_name_trgm ON exercise USING gin (name gin_trgm_ops);
```

### `user` — workouts feature gate (additive column)

The workouts feature gates the client-side catalog browse (S1) behind a per-user toggle that auto-enables when the client has any program assignment. The toggle stores **only** the explicit opt-in; assignment-based eligibility is computed at read time.

```sql
ALTER TABLE "user"
  ADD COLUMN exercise_catalog_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
```

Read-time eligibility (service layer, not DDL):
```
canBrowseExerciseCatalog(userId) :=
  user.exercise_catalog_opt_in
  OR EXISTS (program_assignment WHERE client_id = userId AND status NOT IN ('CANCELLED'))
```

The profile toggle reads the *computed* value (shows ON + disabled when an assignment exists) and writes only `exercise_catalog_opt_in`.

### `exercise_muscle` (M2M)

```sql
CREATE TABLE exercise_muscle (
  exercise_id  CHAR(36) NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  muscle_id    CHAR(36) NOT NULL REFERENCES muscle(id) ON DELETE RESTRICT,
  role         muscle_role NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exercise_id, muscle_id, role)
);

CREATE INDEX idx_exercise_muscle_muscle ON exercise_muscle (muscle_id, role);
```

### `exercise_equipment` (M2M)

```sql
CREATE TABLE exercise_equipment (
  exercise_id   CHAR(36) NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  equipment_id  CHAR(36) NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exercise_id, equipment_id)
);

CREATE INDEX idx_exercise_equipment_equipment ON exercise_equipment (equipment_id);
```

### `exercise_media` (provider overlay — V1 ready, populated later)

```sql
CREATE TABLE exercise_media (
  id                  CHAR(36) PRIMARY KEY,
  exercise_id         CHAR(36) NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  provider            VARCHAR(50) NOT NULL,        -- 'cloudinary' | 'youtube' | 'musclewiki' | 'wger'
  provider_asset_id   VARCHAR(255),
  kind                media_kind NOT NULL,
  url                 TEXT NOT NULL,
  thumbnail_url       TEXT,
  duration_seconds    INTEGER,                     -- video duration
  width_px            INTEGER,
  height_px           INTEGER,
  display_order       SMALLINT NOT NULL DEFAULT 0,
  is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
  licensed_until      DATE,                         -- enforced at read time
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exercise_media_exercise ON exercise_media (exercise_id, display_order);
CREATE INDEX idx_exercise_media_provider ON exercise_media (provider);
CREATE UNIQUE INDEX idx_exercise_media_primary
  ON exercise_media (exercise_id) WHERE is_primary = TRUE;
```

V1 writes: `provider='cloudinary'` for Free Exercise DB images, `provider='youtube'` for custom-exercise oEmbed thumbnails.

## Program (the plan)

### `program`

```sql
CREATE TABLE program (
  id                  CHAR(36) PRIMARY KEY,
  owner_id            CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  name                VARCHAR(200) NOT NULL,
  description         TEXT,
  kind                program_kind NOT NULL DEFAULT 'WORKOUT',
  status              program_status NOT NULL DEFAULT 'DRAFT',
  duration_weeks      SMALLINT,                    -- optional total length
  periodization_model VARCHAR(50),                 -- free-text UX hint only
  cover_image_url     VARCHAR(500),
  goal_tags           JSONB,                       -- ['hypertrophy', 'fat_loss']
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_program_owner ON program (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_program_kind_status ON program (kind, status) WHERE deleted_at IS NULL;
```

### `program_workout`

```sql
CREATE TABLE program_workout (
  id                 CHAR(36) PRIMARY KEY,
  program_id         CHAR(36) NOT NULL REFERENCES program(id) ON DELETE CASCADE,
  name               VARCHAR(200) NOT NULL,         -- 'Day 1 — Upper'
  notes              TEXT,
  week_index         SMALLINT NOT NULL,             -- 0-based
  day_index          SMALLINT NOT NULL,             -- 0-based within week
  sequence_number    INTEGER NOT NULL,              -- 0-based across the program (for "day N" assignment)
  phase              VARCHAR(50),                   -- free-text 'deload', 'accumulation', etc.
  estimated_duration_minutes SMALLINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_program_workout_position
  ON program_workout (program_id, week_index, day_index);
CREATE INDEX idx_program_workout_program ON program_workout (program_id, sequence_number);
```

### `exercise_block` (groupings within a workout)

```sql
CREATE TABLE exercise_block (
  id                  CHAR(36) PRIMARY KEY,
  program_workout_id  CHAR(36) NOT NULL REFERENCES program_workout(id) ON DELETE CASCADE,
  kind                exercise_block_kind NOT NULL,
  order_index         SMALLINT NOT NULL,
  rounds              SMALLINT,                     -- for CIRCUIT, EMOM, AMRAP
  duration_seconds    INTEGER,                      -- for EMOM, AMRAP, TABATA
  rest_between_rounds_seconds INTEGER,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exercise_block_workout ON exercise_block (program_workout_id, order_index);
```

### `prescribed_exercise`

```sql
CREATE TABLE prescribed_exercise (
  id                  CHAR(36) PRIMARY KEY,
  program_workout_id  CHAR(36) NOT NULL REFERENCES program_workout(id) ON DELETE CASCADE,
  exercise_id         CHAR(36) NOT NULL REFERENCES exercise(id) ON DELETE RESTRICT,
  block_id            CHAR(36) REFERENCES exercise_block(id) ON DELETE SET NULL,
  superset_group_id   SMALLINT,                     -- same id within workout = paired
  order_index         SMALLINT NOT NULL,
  notes               TEXT,
  alternate_exercise_id CHAR(36) REFERENCES exercise(id) ON DELETE SET NULL,  -- optional swap suggestion
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prescribed_exercise_workout
  ON prescribed_exercise (program_workout_id, order_index);
CREATE INDEX idx_prescribed_exercise_exercise ON prescribed_exercise (exercise_id);
```

### `prescribed_set` — the wide nullable star of the show

```sql
CREATE TABLE prescribed_set (
  id                          CHAR(36) PRIMARY KEY,
  prescribed_exercise_id      CHAR(36) NOT NULL REFERENCES prescribed_exercise(id) ON DELETE CASCADE,
  order_index                 SMALLINT NOT NULL,
  set_type                    set_type NOT NULL DEFAULT 'NORMAL',

  -- Targets (all nullable; exercise.kind decides which the UI surfaces)
  target_reps_min             SMALLINT,
  target_reps_max             SMALLINT,
  target_weight_kg            DECIMAL(6,2),
  target_weight_percent_1rm   DECIMAL(5,2),         -- 0–100
  target_duration_seconds     INTEGER,
  target_distance_meters      INTEGER,
  target_rpe                  DECIMAL(3,1),         -- 1.0–10.0
  target_rir                  SMALLINT,             -- reps in reserve

  -- Pacing
  rest_after_seconds          INTEGER,
  tempo                       CHAR(7),              -- e.g. '3-1-1-0' (or NULL)

  -- Coach notes for this specific set (rare but valuable)
  notes                       TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT prescribed_set_reps_range CHECK (
    target_reps_min IS NULL OR target_reps_max IS NULL OR target_reps_min <= target_reps_max
  ),
  CONSTRAINT prescribed_set_rpe_range CHECK (
    target_rpe IS NULL OR (target_rpe >= 1.0 AND target_rpe <= 10.0)
  ),
  CONSTRAINT prescribed_set_percent_1rm_range CHECK (
    target_weight_percent_1rm IS NULL OR
    (target_weight_percent_1rm >= 0 AND target_weight_percent_1rm <= 100)
  )
);

CREATE INDEX idx_prescribed_set_exercise
  ON prescribed_set (prescribed_exercise_id, order_index);
```

## Assignment (deep copy of prescription)

### `program_assignment`

```sql
CREATE TABLE program_assignment (
  id                       CHAR(36) PRIMARY KEY,
  instructor_id            CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  client_id                CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  instructor_client_id     CHAR(36) REFERENCES instructor_client(id) ON DELETE SET NULL,
  master_program_id        CHAR(36) REFERENCES program(id) ON DELETE SET NULL,  -- informational only

  -- Snapshot at assignment time (for display when master is later deleted)
  program_name_snapshot    VARCHAR(200) NOT NULL,

  status                   program_assignment_status NOT NULL DEFAULT 'PENDING',
  start_date               DATE NOT NULL,
  end_date                 DATE,
  completion_percent       SMALLINT NOT NULL DEFAULT 0,
  notes                    TEXT,                                                  -- coach-visible notes
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ
);

CREATE INDEX idx_program_assignment_client_status
  ON program_assignment (client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_program_assignment_instructor
  ON program_assignment (instructor_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_program_assignment_start_date
  ON program_assignment (start_date) WHERE deleted_at IS NULL;
```

### `assigned_workout`, `assigned_exercise`, `assigned_set`

Deep-copied from `program_workout` / `prescribed_exercise` / `prescribed_set`. **Schema mirrors them field-for-field**, with the FK parent replaced.

```sql
CREATE TABLE assigned_workout (
  id                       CHAR(36) PRIMARY KEY,
  program_assignment_id    CHAR(36) NOT NULL REFERENCES program_assignment(id) ON DELETE CASCADE,
  master_workout_id        CHAR(36) REFERENCES program_workout(id) ON DELETE SET NULL,  -- informational

  -- Mirrors program_workout
  name                     VARCHAR(200) NOT NULL,
  notes                    TEXT,
  week_index               SMALLINT NOT NULL,
  day_index                SMALLINT NOT NULL,
  sequence_number          INTEGER NOT NULL,
  phase                    VARCHAR(50),
  estimated_duration_minutes SMALLINT,

  -- Assignment-specific
  scheduled_date           DATE,                    -- computed from program_assignment.start_date + day_index
  status                   workout_log_status,      -- nullable until client touches it

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assigned_workout_assignment
  ON assigned_workout (program_assignment_id, sequence_number);
CREATE INDEX idx_assigned_workout_scheduled
  ON assigned_workout (scheduled_date, status);


CREATE TABLE assigned_exercise (
  id                       CHAR(36) PRIMARY KEY,
  assigned_workout_id      CHAR(36) NOT NULL REFERENCES assigned_workout(id) ON DELETE CASCADE,
  exercise_id              CHAR(36) NOT NULL REFERENCES exercise(id) ON DELETE RESTRICT,
  master_exercise_id       CHAR(36) REFERENCES prescribed_exercise(id) ON DELETE SET NULL,

  -- Mirrors prescribed_exercise
  superset_group_id        SMALLINT,
  order_index              SMALLINT NOT NULL,
  notes                    TEXT,
  alternate_exercise_id    CHAR(36) REFERENCES exercise(id) ON DELETE SET NULL,

  -- Per-client override flag (so the UI can show "modified" badge)
  is_modified_from_master  BOOLEAN NOT NULL DEFAULT FALSE,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assigned_exercise_workout
  ON assigned_exercise (assigned_workout_id, order_index);


CREATE TABLE assigned_set (
  id                          CHAR(36) PRIMARY KEY,
  assigned_exercise_id        CHAR(36) NOT NULL REFERENCES assigned_exercise(id) ON DELETE CASCADE,
  master_set_id               CHAR(36) REFERENCES prescribed_set(id) ON DELETE SET NULL,

  -- Mirrors prescribed_set (target_* fields)
  order_index                 SMALLINT NOT NULL,
  set_type                    set_type NOT NULL DEFAULT 'NORMAL',
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
  resolved_weight_kg          DECIMAL(6,2),         -- absolute weight derived from %1RM × current 1RM
  resolved_at                 TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assigned_set_exercise ON assigned_set (assigned_exercise_id, order_index);
```

## One-rep-max history

```sql
CREATE TABLE one_rep_max (
  id            CHAR(36) PRIMARY KEY,
  user_id       CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  exercise_id   CHAR(36) NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  weight_kg     DECIMAL(6,2) NOT NULL,
  source        VARCHAR(20) NOT NULL,           -- 'TESTED' | 'ESTIMATED_EPLEY' | 'ESTIMATED_BRZYCKI' | 'MANUAL'
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_one_rep_max_lookup ON one_rep_max (user_id, exercise_id, recorded_at DESC);
```

## Workout log (what actually happened)

### `workout_log`

```sql
CREATE TABLE workout_log (
  id                       CHAR(36) PRIMARY KEY,
  user_id                  CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- Assignment linkage (nullable for freestyle/unplanned workouts)
  program_assignment_id    CHAR(36) REFERENCES program_assignment(id) ON DELETE SET NULL,
  assigned_workout_id      CHAR(36) REFERENCES assigned_workout(id) ON DELETE SET NULL,

  -- Display
  name                     VARCHAR(200) NOT NULL,         -- snapshot of assigned_workout.name or freestyle title

  -- Lifecycle
  status                   workout_log_status NOT NULL DEFAULT 'IN_PROGRESS',
  started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at             TIMESTAMPTZ,
  duration_seconds         INTEGER,                       -- computed at completion; nullable while in progress

  -- Client notes
  notes                    TEXT,
  feeling_rating           SMALLINT,                      -- 1–5 emoji-style score

  -- Future export hooks (nullable)
  hk_activity_type         VARCHAR(50),
  health_connect_exercise_type VARCHAR(50),

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT workout_log_feeling_range CHECK (
    feeling_rating IS NULL OR (feeling_rating >= 1 AND feeling_rating <= 5)
  )
);

CREATE INDEX idx_workout_log_user_date ON workout_log (user_id, started_at DESC);
CREATE INDEX idx_workout_log_assignment ON workout_log (program_assignment_id);
CREATE INDEX idx_workout_log_status ON workout_log (status);
```

### `logged_exercise`

```sql
CREATE TABLE logged_exercise (
  id                              CHAR(36) PRIMARY KEY,
  workout_log_id                  CHAR(36) NOT NULL REFERENCES workout_log(id) ON DELETE CASCADE,
  exercise_id                     CHAR(36) REFERENCES exercise(id) ON DELETE SET NULL,
  assigned_exercise_id            CHAR(36) REFERENCES assigned_exercise(id) ON DELETE SET NULL,

  -- Historical snapshots (so deleted/renamed exercises don't blank history)
  exercise_name_snapshot          VARCHAR(200) NOT NULL,
  exercise_thumbnail_url_snapshot VARCHAR(500),

  order_index                     SMALLINT NOT NULL,
  superset_group_id               SMALLINT,
  notes                           TEXT,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logged_exercise_log
  ON logged_exercise (workout_log_id, order_index);
CREATE INDEX idx_logged_exercise_exercise
  ON logged_exercise (exercise_id) WHERE exercise_id IS NOT NULL;
```

### `logged_set`

```sql
CREATE TABLE logged_set (
  id                       CHAR(36) PRIMARY KEY,
  logged_exercise_id       CHAR(36) NOT NULL REFERENCES logged_exercise(id) ON DELETE CASCADE,
  assigned_set_id          CHAR(36) REFERENCES assigned_set(id) ON DELETE SET NULL,

  order_index              SMALLINT NOT NULL,
  set_type                 set_type NOT NULL DEFAULT 'NORMAL',

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

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT logged_set_rpe_range CHECK (
    rpe IS NULL OR (rpe >= 1.0 AND rpe <= 10.0)
  )
);

CREATE INDEX idx_logged_set_exercise ON logged_set (logged_exercise_id, order_index);
CREATE INDEX idx_logged_set_completion ON logged_set (is_completed, completed_at);
```

## Search indexing

When `exercise` or `program` is created/updated/deleted, upsert into the global `search_doc` table (migration 029).

```sql
-- Conceptually, in the service layer:
-- INSERT INTO search_doc (entity_type, entity_id, title, body, owner_id, visibility)
-- VALUES ('exercise', :id, :name, :description || ' ' || :instructions, :owner_id, :visibility)
-- ON CONFLICT (entity_type, entity_id) DO UPDATE SET ...
```

No new tables. Just call sites in `ExerciseService` and `ProgramService`.

## Notifications hooks (V1)

These notification builders are added to `notification.service.ts` enum and called from the workout service layer:

- `PROGRAM_ASSIGNED` — client notified when coach assigns a program
- `EXERCISE_FORKED` — original owner notified when another instructor forks their public exercise
- `CLIENT_COMPLETED_WORKOUT` — instructor notified when an assigned-program client completes a workout

Stubs for the jobs module (NOT firing in V1):
- `WORKOUT_DUE_TODAY` — to be triggered by cron when jobs module ships
- `WORKOUT_OVERDUE` — to be triggered by cron when jobs module ships

## Seed strategy

### Free Exercise DB ingest

Done via a one-shot script (`scripts/seed-exercises.ts`), not a migration:

1. Clone `yuhonas/free-exercise-db` repo
2. For each exercise JSON:
   - Generate UUID (or deterministic UUIDv5 from `'free-exercise-db' + slug` for idempotency)
   - Map `force` → `exercise.force`, `mechanic` → `exercise.mechanic`, `level` → `exercise.level`
   - Map `category` → `exercise.kind` and `exercise.movement_pattern`
   - Lookup `muscle.slug` for each `primaryMuscles[]` (role=PRIMARY) and `secondaryMuscles[]` (role=SECONDARY)
   - Lookup `equipment.slug` for each `equipment[]` value
   - Upload images to Cloudinary (folder: `exercises/system/<slug>/`)
   - Create `exercise_media` row with `provider='cloudinary'`, `kind='IMAGE'`, `is_primary=true`
   - `source='SYSTEM'`, `source_provider='free-exercise-db'`, `source_external_id=<slug>`, `visibility='PUBLIC'`, `owner_id=NULL`
3. Idempotent: re-running upserts on `(source_provider, source_external_id)`

### Muscle + equipment seed

Inline in the migration as `INSERT INTO muscle (...) VALUES (...) ON CONFLICT DO NOTHING;` rows, ~17 muscles and ~15 equipment items.

## Validations & invariants

These are NOT enforced by DDL (would complicate inserts); they live in service-layer code:

- `exercise`: if `visibility = 'PUBLIC'` and `source = 'INSTRUCTOR'`, `owner_id` must not be NULL
- `exercise`: only owner can mutate when `source = 'INSTRUCTOR'`; SUPER_ADMIN can mutate `source = 'SYSTEM'`
- `forked_from_id`: must reference an exercise with `visibility = 'PUBLIC'` **at fork time**. Re-flipping the source to PRIVATE later does NOT cascade.
- `exercise.fork_count`: maintained inside the fork tx — `+1` on fork create, `-1` on fork soft-delete or owner change. Recompute via `SELECT COUNT(*) FROM exercise WHERE forked_from_id = $1 AND deleted_at IS NULL` if a drift audit ever runs.
- `exercise` muscle roles: at least one `exercise_muscle` row with `role='PRIMARY'` is required; max 3 PRIMARY rows; SECONDARY/STABILIZER unbounded.
- `program_assignment`: deep-copy of the entire program tree happens in a single transaction
- `logged_set.is_completed = true` requires at least one actual field populated OR explicit mark-complete (no validation values)
- `assigned_set.resolved_weight_kg`: computed at workout-start from `target_weight_percent_1rm` × latest `one_rep_max.weight_kg` for `(client_id, exercise_id)`
- **Client catalog access** (S1 browse for `role = USER`): `canBrowseExerciseCatalog(userId)` (see "user" section above) — 403 from catalog list/search endpoints if false.

### Soft-unpublish & delete semantics for `exercise`

The visibility flip from PUBLIC → PRIVATE and the delete flows are designed so other instructors who already added a public exercise to their programs are never broken (Locked Decision §16):

| Action | Rule | What happens to existing references |
|---|---|---|
| Visibility flip **PUBLIC → PRIVATE** | Allowed anytime by owner | `prescribed_exercise`, `assigned_exercise`, `logged_exercise` rows continue to resolve normally. Picker/list queries for non-owners hide it. |
| Visibility flip **PRIVATE → PUBLIC** | Allowed anytime by owner | Becomes catalog-visible again. `fork_count` resumes accumulating. |
| Soft-delete (`deleted_at = NOW()`) | Allowed anytime by owner; paranoid mode | All existing references continue to resolve via Sequelize paranoid relations. Exercise disappears from every picker/list query. |
| Hard-delete (`DELETE` row) | Blocked by `ON DELETE RESTRICT` on `prescribed_exercise.exercise_id` / `assigned_exercise.exercise_id` / `logged_exercise.exercise_id` | Cannot happen until all referencing rows are removed. In practice we never hard-delete — we soft-delete. |

When a public exercise is soft-deleted and someone forked it, the fork is a fully independent copy and is unaffected. The `forked_from_id` link on the fork remains, but reads of the source via that FK return `NULL` (paranoid relation).

## What this schema does NOT include (intentionally)

Items deferred to future migrations:

- `recipe`, `food`, `meal`, `meal_plan_*` — meals plug in when `program.kind = 'MEAL'` ships
- `program_visibility` enum — V2 when public program library ships
- `program_assignment.target_type` (group support) — V2
- `exercise_alternate_exercise` table for explicit alternate suggestions — V2 (single `alternate_exercise_id` column is enough for V1)
- `program_share` / `program_collaborator` tables — only when coach-to-coach collaboration ships
- Paid program support (Stripe integration) — separate workstream

## Total tables added

**13 new tables + 1 media overlay = 14 tables** for V1:

1. `muscle`
2. `equipment`
3. `exercise`
4. `exercise_muscle`
5. `exercise_equipment`
6. `exercise_media`
7. `program`
8. `program_workout`
9. `exercise_block`
10. `prescribed_exercise`
11. `prescribed_set`
12. `program_assignment`
13. `assigned_workout`
14. `assigned_exercise`
15. `assigned_set`
16. `one_rep_max`
17. `workout_log`
18. `logged_exercise`
19. `logged_set`

(Counted out: 19, not 14 — I undercounted in the line above. Full count = 19.)

Plus enums (~13 new types) and indexes.

This is a sizeable migration but it's a one-time foundation — every future workout/program feature plugs in additively.
