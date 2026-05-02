-- 036_posts_per_group.sql
--
-- Posts move to a per-group ownership model. Each post belongs to exactly
-- one group; cross-posting to multiple groups creates N independent post
-- rows (matches Facebook/LinkedIn semantics — each group's copy has its
-- own comment thread, reactions, edit history, and lifecycle).
--
-- Changes:
--   1. TRUNCATE post / post_audience / post_comment / post_reaction.
--      Pre-production wipe — no users, no data worth preserving. Lets us
--      add post.group_id NOT NULL without a backfill dance.
--   2. Add post.group_id, post.approval_state, post.posted_at — the three
--      fields that previously lived on post_audience.
--   3. Partial indexes for the per-group feed and the moderator pending
--      queue (matches the WHERE clauses the service issues).
--   4. Drop post_audience table + post_audience_type enum (no callers).
--      post_audience_approval enum stays — post.approval_state still uses
--      it.
--
-- Wrapped in a single transaction. Idempotent against re-runs because the
-- truncate is the first step (re-running on already-migrated data is a
-- no-op truncate followed by ADD COLUMN IF NOT EXISTS / DROP IF EXISTS).

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- 1) Wipe all post-related rows. CASCADE on post means comments,
--    reactions, audiences all go with it.
-- ────────────────────────────────────────────────────────────────
TRUNCATE TABLE post_reaction, post_comment, post_audience, post CASCADE;

-- ────────────────────────────────────────────────────────────────
-- 2) Move audience fields onto post.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE post
  ADD COLUMN IF NOT EXISTS group_id CHAR(36)
    REFERENCES "group"(id) ON DELETE CASCADE;

-- After truncate this is safe; before it would have required a backfill.
ALTER TABLE post
  ALTER COLUMN group_id SET NOT NULL;

ALTER TABLE post
  ADD COLUMN IF NOT EXISTS approval_state post_audience_approval
    NOT NULL DEFAULT 'APPROVED';

ALTER TABLE post
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP
    NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ────────────────────────────────────────────────────────────────
-- 3) Indexes mirror the service's read paths.
-- ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_post_group_feed
  ON post (group_id, posted_at DESC)
  WHERE deleted_at IS NULL AND approval_state = 'APPROVED';

CREATE INDEX IF NOT EXISTS idx_post_group_pending
  ON post (group_id, posted_at DESC)
  WHERE deleted_at IS NULL AND approval_state = 'PENDING';

-- ────────────────────────────────────────────────────────────────
-- 4) Drop the junction + its enum (post_audience_approval stays).
-- ────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS post_audience;
DROP TYPE  IF EXISTS post_audience_type;

COMMIT;
