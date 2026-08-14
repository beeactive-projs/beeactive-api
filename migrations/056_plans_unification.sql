-- =============================================================================
-- 056_plans_unification.sql
--
-- Collapses `routine` / `routine_exercise` into the program tree, so there is
-- ONE plan model with two kinds of owner: a coach, or the person training.
--
-- WHY — this reverses the "why a new entity and not Program" note in
-- migration 050. That note was right for V1 and is wrong for V2. Answering it
-- point by point, because overriding a documented decision deserves the
-- argument in writing:
--
--   050 said: "Routine is started without an assignment indirection."
--     Still true, and still supported. `POST /programs/:id/start` seeds a
--     workout_log straight from prescribed_exercise/prescribed_set with no
--     assignment row, exactly as routine.startAsWorkoutLog did. The
--     indirection is optional, not imposed.
--
--   050 said: "Every Program query needs an ownerKind filter forever."
--     We pay that either way, and it got cheaper. The V2 client surface has
--     to answer "everything I can train right now", which today means merging
--     program_assignment with routine on both ends of the wire. A `source`
--     predicate on one table beats a merge across two shapes.
--
--   050 said: "The FE has to hide half the Program UI."
--     That is a UI concern and `is_single_workout` settles it: the solo editor
--     renders one workout with no week/day axis. Solo users still never see a
--     periodisation builder.
--
--   What actually changed: V2 needs SCHEDULING (a week strip, "today", N-week
--   blocks). `assigned_workout.scheduled_date` already is that. A routine with
--   no assignment cannot express "Push day A on Mondays". The indirection 050
--   treated as overhead is now the requested feature.
--
-- What this buys, at zero new machinery: per-set routine rows (prescribed_set),
-- save-workout-as-routine (the existing copy path, reversed), the multi-week
-- scheduler, a single-query "active plans" read, and a starter-routine library
-- (a program with no owner).
--
-- SCOPE — deliberately narrow. Only the plans/programs/routines area changes.
-- The exercise catalog and its taxonomy, users, sessions, payments, groups and
-- blog are untouched, and nothing is re-seeded.
--
-- LOGGED HISTORY SURVIVES. Every link from a log into the prescription tree is
-- already ON DELETE SET NULL, and display fields are snapshotted onto
-- logged_exercise. Nothing here drops a log row regardless.
-- =============================================================================

BEGIN;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Who authored a program. SYSTEM = MotionHive-seeded starter routines (the
-- first-run experience for a solo user with nothing); USER = self-authored;
-- INSTRUCTOR = coach-authored, the V1 default.
DO $$ BEGIN
  CREATE TYPE program_source AS ENUM ('SYSTEM', 'USER', 'INSTRUCTOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- COACH = assigned to someone by their instructor. SELF = the person training
-- scheduled it for themselves. SELF skips the ACTIVE-relationship check.
DO $$ BEGIN
  CREATE TYPE program_assignment_kind AS ENUM ('COACH', 'SELF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drives the scheduler. NONE = fixed dates from start_date. WEEKLY = rolling,
-- repeats indefinitely. BLOCK = repeats for `repeat_weeks` then completes.
DO $$ BEGIN
  CREATE TYPE program_repeat_mode AS ENUM ('NONE', 'WEEKLY', 'BLOCK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- PROGRAM — gains ownership flexibility + the routine-shaped fields
-- =============================================================================

-- SYSTEM starter programs have no owner. The FK stays ON DELETE RESTRICT for
-- real owners; dropping NOT NULL is what allows the ownerless row.
ALTER TABLE program ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE program
  ADD COLUMN IF NOT EXISTS source            program_source,
  ADD COLUMN IF NOT EXISTS is_single_workout BOOLEAN NOT NULL DEFAULT FALSE,
  -- Carried over from `routine` so the folder + "last done 4 days ago"
  -- affordances survive the collapse.
  ADD COLUMN IF NOT EXISTS folder            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_performed_at TIMESTAMPTZ;

-- Everything that exists today was authored by a coach.
UPDATE program SET source = 'INSTRUCTOR' WHERE source IS NULL;
ALTER TABLE program ALTER COLUMN source SET NOT NULL;

-- An owned program must have an owner; only SYSTEM may be ownerless.
ALTER TABLE program DROP CONSTRAINT IF EXISTS program_owner_required_unless_system;
ALTER TABLE program ADD CONSTRAINT program_owner_required_unless_system CHECK (
  source = 'SYSTEM' OR owner_id IS NOT NULL
);

-- The solo "my routines" list: user-owned, single-workout, by recency.
CREATE INDEX IF NOT EXISTS idx_program_owner_recent
  ON program (owner_id, last_performed_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- Starter library lookup.
CREATE INDEX IF NOT EXISTS idx_program_system
  ON program (source)
  WHERE deleted_at IS NULL AND source = 'SYSTEM';

COMMENT ON COLUMN program.source IS
  'Who authored this. SYSTEM programs are MotionHive starter routines with no owner_id — the first-run path for a solo user. See 056.';
COMMENT ON COLUMN program.is_single_workout IS
  'Routine-shaped: exactly one program_workout, no week/day axis. Drives the simplified solo editor. See 056.';

-- =============================================================================
-- PROGRAM_ASSIGNMENT — self-assignment + the scheduler
-- =============================================================================

-- A self-scheduled plan has no instructor.
ALTER TABLE program_assignment ALTER COLUMN instructor_id DROP NOT NULL;

ALTER TABLE program_assignment
  ADD COLUMN IF NOT EXISTS assignment_kind program_assignment_kind,
  ADD COLUMN IF NOT EXISTS repeat_mode     program_repeat_mode NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS repeat_weeks    SMALLINT,
  -- Client-owned visibility toggle: does the coach see training done outside
  -- the assigned plan. Schema only; the consent surface ships later.
  ADD COLUMN IF NOT EXISTS share_off_plan  BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE program_assignment SET assignment_kind = 'COACH' WHERE assignment_kind IS NULL;
ALTER TABLE program_assignment ALTER COLUMN assignment_kind SET NOT NULL;

-- A coach assignment must name the coach. A self assignment must not.
ALTER TABLE program_assignment DROP CONSTRAINT IF EXISTS program_assignment_kind_instructor;
ALTER TABLE program_assignment ADD CONSTRAINT program_assignment_kind_instructor CHECK (
  (assignment_kind = 'COACH' AND instructor_id IS NOT NULL)
  OR
  (assignment_kind = 'SELF'  AND instructor_id IS NULL)
);

ALTER TABLE program_assignment DROP CONSTRAINT IF EXISTS program_assignment_repeat_weeks_range;
ALTER TABLE program_assignment ADD CONSTRAINT program_assignment_repeat_weeks_range CHECK (
  (repeat_mode = 'BLOCK' AND repeat_weeks BETWEEN 1 AND 104)
  OR
  (repeat_mode <> 'BLOCK' AND repeat_weeks IS NULL)
);

COMMENT ON COLUMN program_assignment.assignment_kind IS
  'COACH = an instructor assigned this. SELF = the trainee scheduled it themselves; skips the ACTIVE instructor_client check. See 056.';

-- =============================================================================
-- LOGGED_EXERCISE — skip becomes a real state, swaps become traceable
-- =============================================================================

-- Skip previously DELETED the logged_exercise row, making a skipped exercise
-- indistinguishable from one that was never in the workout. Now it persists
-- and drops out of the progress denominator instead.
ALTER TABLE logged_exercise
  ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN NOT NULL DEFAULT FALSE,
  -- Set when the trainee substitutes mid-workout, so a coach can see
  -- "swapped Leg press for Hack squat" rather than an unexplained change.
  ADD COLUMN IF NOT EXISTS swapped_from_exercise_id CHAR(36) REFERENCES exercise(id) ON DELETE SET NULL;

COMMENT ON COLUMN logged_exercise.is_skipped IS
  'Explicit skip. Distinct from untouched (no completed sets) and from absent. Excluded from progress counts. See 056.';

-- =============================================================================
-- CONVERT ROUTINE -> single-workout PROGRAM, then drop the old tables
--
-- Each routine becomes a program (source USER, is_single_workout) plus one
-- program_workout; each routine_exercise becomes a prescribed_exercise, and
-- default_sets expands into that many identical prescribed_set rows carrying
-- the flat rep/weight target. Soft-deleted routines carry their deleted_at
-- across rather than being resurrected.
--
-- Ids are derived by hash from the source row id, so a re-run maps to the same
-- program and collides on the primary key instead of duplicating.
-- =============================================================================

DO $$
DECLARE
  converted bigint := 0;
BEGIN
  IF to_regclass('public.routine') IS NULL THEN
    RETURN;
  END IF;

  -- Deterministic id from any source id, so the mapping is stable across runs.
  CREATE OR REPLACE FUNCTION pg_temp.program_id_for(seed text)
  RETURNS char(36) AS $f$
    SELECT substring(md5($1),1,8) || '-' || substring(md5($1),9,4) || '-' ||
           substring(md5($1),13,4) || '-' || substring(md5($1),17,4) || '-' ||
           substring(md5($1),21,12);
  $f$ LANGUAGE sql IMMUTABLE;

  INSERT INTO program (id, owner_id, name, description, kind, status, source,
                       is_single_workout, folder, last_performed_at,
                       created_at, updated_at, deleted_at)
  SELECT pg_temp.program_id_for('program:' || r.id), r.user_id, r.name, r.notes,
         'WORKOUT', 'PUBLISHED', 'USER', TRUE, r.folder, r.last_performed_at,
         r.created_at, r.updated_at, r.deleted_at
  FROM routine r
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS converted = ROW_COUNT;

  INSERT INTO program_workout (id, program_id, name, week_index, day_index, sequence_number)
  SELECT pg_temp.program_id_for('workout:' || r.id),
         pg_temp.program_id_for('program:' || r.id), r.name, 0, 0, 0
  FROM routine r
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO prescribed_exercise (id, program_workout_id, exercise_id, order_index,
                                   superset_group_id, notes)
  SELECT pg_temp.program_id_for('pe:' || re.id),
         pg_temp.program_id_for('workout:' || re.routine_id),
         re.exercise_id, re.order_index, re.superset_group_id, re.notes
  FROM routine_exercise re
  JOIN routine r ON r.id = re.routine_id
  ON CONFLICT (id) DO NOTHING;

  -- One prescribed_set per default_sets, all carrying the same flat target,
  -- which is the only shape the old routine builder could express.
  INSERT INTO prescribed_set (id, prescribed_exercise_id, order_index, set_type,
                              target_reps_min, target_reps_max, target_weight_kg,
                              rest_after_seconds)
  SELECT pg_temp.program_id_for('ps:' || re.id || ':' || s.i),
         pg_temp.program_id_for('pe:' || re.id),
         s.i, 'NORMAL', re.target_reps_min, re.target_reps_max,
         re.target_weight_kg, re.rest_after_seconds
  FROM routine_exercise re
  JOIN routine r ON r.id = re.routine_id
  CROSS JOIN LATERAL generate_series(0, GREATEST(COALESCE(re.default_sets, 3), 1) - 1) AS s(i)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Converted % routine(s) into single-workout programs.', converted;

  DROP TABLE IF EXISTS routine_exercise;
  DROP TABLE IF EXISTS routine;
END $$;

-- =============================================================================
-- DROP DEAD COLUMN
--
-- The client catalog browse gate was lifted in the exercise service
-- (`canClientBrowseCatalog` returns true unconditionally) because a hard 403
-- dead-ended the freestyle flow. The column has had no reader since.
-- =============================================================================

ALTER TABLE "user" DROP COLUMN IF EXISTS exercise_catalog_opt_in;

COMMIT;
