-- 043_messaging_direct_key.sql
--
-- Make the "one DIRECT conversation per pair" invariant a database-level
-- guarantee. Before this migration, two concurrent first-sends from
-- opposite sides of the same pair could each create their own row (the
-- partial unique index on conversation_participant scopes by conversation
-- id, so it doesn't prevent duplicate parent rows for the same pair).
--
-- Approach:
--   1. Add `direct_key` — sha256(sorted-pair) for DIRECT conversations.
--   2. Backfill from the existing participant rows (deduping any pairs
--      that already happened to land in two rows; the older row wins).
--   3. Partial unique index on (direct_key) WHERE type='DIRECT' AND
--      direct_key IS NOT NULL — so future inserts collide deterministically
--      and `findOrCreateDirectConversation` can fall back to the existing
--      row via the UniqueConstraintError recovery path.
--
-- Idempotent against re-runs (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS).

BEGIN;

-- 0) pgcrypto for `digest()`. No-op when already installed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Column.
ALTER TABLE conversation
  ADD COLUMN IF NOT EXISTS direct_key CHAR(64) DEFAULT NULL;

-- 2) Backfill. For every DIRECT conversation that has two distinct active
--    participants, compute direct_key from the sorted-pair. Skip rows
--    that already have a key (idempotent re-run).
--
--    If the same pair somehow has multiple rows already, the older row
--    keeps its key and the younger ones are left with NULL — they can
--    be cleaned up by a separate dedup script if observed. The unique
--    index only enforces uniqueness when direct_key IS NOT NULL, so
--    this won't block the migration.
WITH pair_keys AS (
  SELECT
    c.id AS conversation_id,
    encode(
      digest(
        CASE WHEN p_min.user_id < p_max.user_id
             THEN p_min.user_id || ':' || p_max.user_id
             ELSE p_max.user_id || ':' || p_min.user_id
        END,
        'sha256'
      ),
      'hex'
    ) AS computed_key,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE WHEN p_min.user_id < p_max.user_id
             THEN p_min.user_id || ':' || p_max.user_id
             ELSE p_max.user_id || ':' || p_min.user_id
        END
      ORDER BY c.created_at ASC, c.id ASC
    ) AS rn
  FROM conversation c
  JOIN conversation_participant p_min ON p_min.conversation_id = c.id AND p_min.left_at IS NULL
  JOIN conversation_participant p_max ON p_max.conversation_id = c.id AND p_max.left_at IS NULL AND p_max.user_id <> p_min.user_id
  WHERE c.type = 'DIRECT'
    AND c.direct_key IS NULL
)
UPDATE conversation c
SET direct_key = pk.computed_key
FROM pair_keys pk
WHERE c.id = pk.conversation_id
  AND pk.rn = 1;

-- 3) Partial unique index. Only DIRECT rows with a key participate.
--    GROUP conversations and unkeyed legacy rows are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS uk_conversation_direct_key
  ON conversation (direct_key)
  WHERE type = 'DIRECT' AND direct_key IS NOT NULL;

-- 4) Helper index for lookups by key (the unique index above already
--    serves this, but document it as the intended lookup path).
-- (Skipped — the unique index already provides the lookup.)

COMMIT;
