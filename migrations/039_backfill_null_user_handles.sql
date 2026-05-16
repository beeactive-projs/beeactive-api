-- 039_backfill_null_user_handles.sql
--
-- Assigns handles to users whose handle is still NULL (users created after
-- migration 038 ran before the app-side auto-generation was in place).
--
-- Format: firstname-lastname (lowercase, only a-z 0-9 and hyphens).
-- Collisions within the batch and against already-assigned handles are
-- resolved by appending a numeric suffix (2, 3, …).
-- Empty slugs (e.g. users with no name) fall back to user-<id prefix>.

BEGIN;

WITH slugs AS (
  SELECT
    id,
    TRIM(BOTH '-' FROM
      regexp_replace(
        lower(trim(coalesce(first_name, ''))) || '-' || lower(trim(coalesce(last_name, ''))),
        '[^a-z0-9]+', '-', 'g'
      )
    ) AS base_slug
  FROM "user"
  WHERE handle IS NULL
    AND deleted_at IS NULL
),
with_fallback AS (
  SELECT
    id,
    CASE
      WHEN base_slug = '' OR base_slug = '-'
        THEN 'user-' || substring(id::text, 1, 8)
      ELSE base_slug
    END AS slug
  FROM slugs
),
ranked AS (
  SELECT
    w.id,
    w.slug,
    -- Position of this user within the batch that share the same slug
    ROW_NUMBER() OVER (PARTITION BY w.slug ORDER BY w.id) AS batch_rn,
    -- Number of active users that ALREADY have this slug (from migration 038)
    (
      SELECT COUNT(*)
      FROM "user" eu
      WHERE LOWER(eu.handle) = w.slug
        AND eu.deleted_at IS NULL
    ) AS existing_count
  FROM with_fallback w
)
UPDATE "user" u
SET handle = CASE
  WHEN r.batch_rn = 1 AND r.existing_count = 0
    THEN r.slug
  ELSE
    substring(r.slug, 1, 35) || '-' || (r.batch_rn + r.existing_count)::text
END
FROM ranked r
WHERE r.id = u.id;

COMMIT;
