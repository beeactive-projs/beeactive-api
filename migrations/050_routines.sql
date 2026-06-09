-- =============================================================================
-- 050 — routine + routine_exercise (self-serve "saved workout shapes")
-- =============================================================================
--
-- A Routine is a user-authored workout template — name, ordered list of
-- exercises, default set count + targets — that can be started as a freestyle
-- workout in one tap. Matches the Hevy / Strong "Routines" pattern; the
-- single most-cited churn driver in the V1 solo-logging research.
--
-- Why a new entity and not Program:
--   - Program is coach-authored, multi-workout, assignment-bearing, with a
--     deep-copy snapshot on assign. Routine is user-owned, single-workout,
--     mutable defaults, started without an assignment indirection.
--   - Forcing solo users through Program means every Program query needs an
--     `ownerKind` filter forever and the FE has to hide half the Program UI.
--
-- The active log seeds itself from `routine_exercise` rows (one
-- logged_exercise + N logged_set per row) the same way `start()` seeds from
-- an assigned workout — same tree shape, no special cases downstream.
-- =============================================================================

BEGIN;

CREATE TABLE routine (
  id                   CHAR(36) PRIMARY KEY,
  user_id              CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name                 VARCHAR(200) NOT NULL,
  notes                TEXT,
  -- Hevy's pattern: a single nullable string column is plenty until users
  -- actually demand drag-to-reorder folders. Then it becomes its own table.
  folder               VARCHAR(100),
  -- Updated by the BE on every successful start; powers "last performed"
  -- sorting on the FE Routines list.
  last_performed_at    TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at           TIMESTAMPTZ,

  CONSTRAINT routine_name_length CHECK (char_length(name) >= 1)
);

CREATE INDEX idx_routine_user
  ON routine (user_id, last_performed_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

CREATE TABLE routine_exercise (
  id                   CHAR(36) PRIMARY KEY,
  routine_id           CHAR(36) NOT NULL REFERENCES routine(id) ON DELETE CASCADE,
  exercise_id          CHAR(36) NOT NULL REFERENCES exercise(id) ON DELETE RESTRICT,
  order_index          SMALLINT NOT NULL,
  -- Same value across rows in a single routine = paired superset. Mirrors
  -- prescribed_exercise.superset_group_id so the same FE renderer fits.
  superset_group_id    SMALLINT,
  notes                TEXT,

  -- Per-exercise defaults (copied to logged_set rows on start). Just one
  -- shape — V1 doesn't ship per-set variation inside a routine; if you want
  -- 5x5 vs 3x10 inside the same routine, that's two exercises in the picker.
  default_sets         SMALLINT NOT NULL DEFAULT 3,
  target_reps_min      SMALLINT,
  target_reps_max      SMALLINT,
  target_weight_kg     DECIMAL(6,2),
  rest_after_seconds   INTEGER,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT routine_exercise_sets_range
    CHECK (default_sets >= 1 AND default_sets <= 30),
  CONSTRAINT routine_exercise_reps_range
    CHECK (
      target_reps_min IS NULL
      OR target_reps_max IS NULL
      OR target_reps_min <= target_reps_max
    )
);

CREATE INDEX idx_routine_exercise_routine
  ON routine_exercise (routine_id, order_index);

COMMIT;
