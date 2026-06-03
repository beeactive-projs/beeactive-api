-- =============================================================================
-- 049 — program.duration_weeks → program.duration_days
-- =============================================================================
--
-- Why: locked V1 decision (2026-06-03) is that the program author UI keeps
-- "Weeks" as the default unit but exposes a Weeks/Days toggle so a coach can
-- ship "21-day starter" or "10-workout finisher" without us needing a future
-- migration. Mirrors Trainerize's internal model — store as days, display
-- in whichever unit the author chose.
--
-- The author UI will still call the field "Duration weeks" by default; the
-- value is multiplied by 7 client-side before POST. This migration just
-- converts the storage so days are first-class.
--
-- Touches: program.duration_weeks (SMALLINT 1..104) → program.duration_days
-- (INTEGER 1..728). Nullable in both schemes — an unset duration means
-- "open-ended" (no end date computed).
-- =============================================================================

BEGIN;

ALTER TABLE program ADD COLUMN IF NOT EXISTS duration_days INTEGER;

-- Backfill from the old weeks column, then drop it.
UPDATE program
   SET duration_days = duration_weeks * 7
 WHERE duration_weeks IS NOT NULL
   AND duration_days IS NULL;

ALTER TABLE program DROP CONSTRAINT IF EXISTS program_duration_weeks_range;
ALTER TABLE program DROP COLUMN IF EXISTS duration_weeks;

ALTER TABLE program
  ADD CONSTRAINT program_duration_days_range CHECK (
    duration_days IS NULL OR (duration_days >= 1 AND duration_days <= 728)
  );

COMMIT;
