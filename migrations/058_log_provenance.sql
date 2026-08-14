-- 058_log_provenance.sql
--
-- Close the one break in the training chain.
--
-- Every other layer already traces: logged_exercise → assigned_exercise,
-- logged_set → assigned_set, assigned_* → master_*, workout_log →
-- program_assignment. The exception is the routine path. Starting a
-- workout from one of your own routines writes `program_assignment_id`
-- and `assigned_workout_id` as NULL — byte-for-byte identical to a
-- freestyle session — so the log kept no idea which routine produced it.
--
-- The visible symptom: history rendered "Freestyle workout" for two
-- genuinely different things, and neither could be opened.
--
-- Three nullable FKs, all ON DELETE SET NULL: a log is a historical
-- record and must survive its source being deleted. Losing the link is
-- acceptable; losing the workout is not.

BEGIN;

-- ---------------------------------------------------------------------
-- Which routine (or program) this session was started from.
-- Stays NULL for assigned work (program_assignment_id covers that) and
-- for genuinely freestyle sessions (which came from nothing).
-- ---------------------------------------------------------------------
ALTER TABLE workout_log
  ADD COLUMN IF NOT EXISTS source_program_id CHAR(36) NULL
    REFERENCES program(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workout_log_source_program
  ON workout_log (source_program_id)
  WHERE source_program_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Exercise- and set-level parity with the assigned path, so "prescribed
-- 3x8, actually did 3x10" is answerable for routine work too, not only
-- for a coach's plan.
-- ---------------------------------------------------------------------
ALTER TABLE logged_exercise
  ADD COLUMN IF NOT EXISTS prescribed_exercise_id CHAR(36) NULL
    REFERENCES prescribed_exercise(id) ON DELETE SET NULL;

ALTER TABLE logged_set
  ADD COLUMN IF NOT EXISTS prescribed_set_id CHAR(36) NULL
    REFERENCES prescribed_set(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Backfill, best effort and deliberately conservative.
--
-- Existing rows never stored the link, so the only evidence left is the
-- name, which `_startFromProgram` copies from the routine verbatim. Match
-- on (same owner, exact name, single-workout, log had no assignment).
--
-- This is a HEURISTIC, not a reconstruction: a freestyle session someone
-- happened to name exactly after one of their routines will be claimed
-- by it. Acceptable for existing demo and test data; new rows get the
-- real FK written at start, so the guesswork stops here.
--
-- Ambiguity is skipped rather than guessed: if two of your routines share
-- a name, the log stays NULL.
-- ---------------------------------------------------------------------
UPDATE workout_log wl
SET source_program_id = m.program_id
FROM (
  SELECT l.id AS log_id, MIN(p.id) AS program_id
  FROM workout_log l
  JOIN program p
    ON p.owner_id = l.user_id
   AND p.name = l.name
   AND p.is_single_workout = TRUE
   AND p.deleted_at IS NULL
  WHERE l.program_assignment_id IS NULL
    AND l.assigned_workout_id IS NULL
    AND l.source_program_id IS NULL
  GROUP BY l.id
  HAVING COUNT(DISTINCT p.id) = 1
) AS m
WHERE wl.id = m.log_id;

COMMIT;
