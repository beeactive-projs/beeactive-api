-- =============================================================================
-- 048_exercise_fork_unique_per_owner.sql
--
-- Anti-spam: a single instructor can only have ONE live fork of a given
-- source exercise. Without this, an attacker could fork a popular public
-- exercise N times to inflate the source's `fork_count` counter and the
-- author's fork-notification volume (locked decision §17 anti-spam).
--
-- Partial unique to allow:
--   - re-forking after soft-delete (`deleted_at IS NOT NULL`)
--   - rows where `forked_from_id IS NULL` (originals / non-forks)
-- =============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uk_exercise_fork_per_owner
  ON exercise (owner_id, forked_from_id)
  WHERE deleted_at IS NULL AND forked_from_id IS NOT NULL;

COMMENT ON INDEX uk_exercise_fork_per_owner IS
  'Locked decision §17 anti-spam: one live fork per (owner, source). Service-layer pre-check returns 409; this index is the defense-in-depth backstop against races.';

COMMIT;
