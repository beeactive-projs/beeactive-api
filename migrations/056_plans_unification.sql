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
  ADD COLUMN assignment_kind program_assignment_kind,
  ADD COLUMN repeat_mode     program_repeat_mode NOT NULL DEFAULT 'NONE',
  ADD COLUMN repeat_weeks    SMALLINT,
  -- Client-owned visibility toggle: does the coach see training done outside
  -- the assigned plan. Schema only; the consent surface ships later.
  ADD COLUMN share_off_plan  BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE program_assignment SET assignment_kind = 'COACH' WHERE assignment_kind IS NULL;
ALTER TABLE program_assignment ALTER COLUMN assignment_kind SET NOT NULL;

-- A coach assignment must name the coach. A self assignment must not.
ALTER TABLE program_assignment ADD CONSTRAINT program_assignment_kind_instructor CHECK (
  (assignment_kind = 'COACH' AND instructor_id IS NOT NULL)
  OR
  (assignment_kind = 'SELF'  AND instructor_id IS NULL)
);

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
-- DROP ROUTINE — replaced by single-workout programs
--
-- Ordered child-first. If dev routines are worth keeping, convert them BEFORE
-- this block: each routine becomes a program (source USER, is_single_workout)
-- plus one program_workout, each routine_exercise a prescribed_exercise, and
-- default_sets expands into that many prescribed_set rows carrying the flat
-- rep/weight target.
-- =============================================================================

-- Refuses rather than deletes. On an environment where nobody used the old
-- routine builder these tables are empty and this is a no-op; anywhere they
-- are not, the deploy stops with the row count instead of quietly discarding
-- someone's saved workouts, and the conversion above happens first.
DO $$
DECLARE
  remaining bigint;
BEGIN
  IF to_regclass('public.routine') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM routine' INTO remaining;
  IF remaining > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop % routine row(s). Convert them to single-workout programs first, then re-run.', remaining;
  END IF;

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
