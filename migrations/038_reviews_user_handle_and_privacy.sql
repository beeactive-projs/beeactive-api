-- 038_reviews_user_handle_and_privacy.sql
--
-- Local-only baseline that bundles three previously-separate migrations
-- (instructor_profile handle, reviews, user-level handle + privacy)
-- now that handle lives on `user` directly — there's no longer any
-- value in writing a column to `instructor_profile` we'd immediately
-- replace.
--
-- Three changes:
--   1. Adds `user.handle` (VARCHAR(40), case-insensitive partial unique
--      index). Backfilled from first/last name with a row-number suffix
--      so collisions are resolved deterministically; empty slugs fall
--      back to a UUID prefix. Stays nullable until the app-side script
--      assigns handles to any rows the SQL backfill couldn't cover
--      (e.g. brand-new signups racing the migration).
--   2. Adds `user.privacy_settings` (JSONB DEFAULT '{}') for per-field
--      visibility. Missing keys fall back to per-field defaults at the
--      service layer.
--   3. Creates the `review` table — public reviews of instructor
--      profiles, surfaced on `/@<handle>`. Read-only in v1; the rating
--      check + cascade behaviour live in the schema so the API never
--      has to trust the caller.

BEGIN;

-- ---------------------------------------------------------------
-- 1. user.handle — case-insensitive unique slug for `/@<handle>`
-- ---------------------------------------------------------------
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS handle VARCHAR(40);

CREATE UNIQUE INDEX IF NOT EXISTS uk_user_handle_ci
  ON "user" (LOWER(handle))
  WHERE handle IS NOT NULL AND deleted_at IS NULL;

-- Backfill handles from the user's name. Strips non-alphanumerics,
-- lowercases, and disambiguates collisions with a row number. Empty
-- slugs fall back to a UUID prefix so we never insert an all-empty
-- handle. New users that race the migration just keep NULL until the
-- app-side script (`scripts/backfill-user-handles.js`) assigns one.
WITH base AS (
  SELECT
    id,
    regexp_replace(
      lower(coalesce(first_name, '') || coalesce(last_name, '')),
      '[^a-z0-9]', '', 'g'
    ) AS slug
  FROM "user"
  WHERE handle IS NULL
    AND deleted_at IS NULL
),
numbered AS (
  SELECT
    id,
    slug,
    ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS rn
  FROM base
)
UPDATE "user" u
SET handle = CASE
  WHEN n.slug = '' THEN 'user-' || substring(u.id::text, 1, 8)
  WHEN n.rn = 1   THEN n.slug
  ELSE              n.slug || n.rn::text
END
FROM numbered n
WHERE n.id = u.id;

-- ---------------------------------------------------------------
-- 2. user.privacy_settings — per-field visibility map
-- ---------------------------------------------------------------
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS privacy_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN "user".privacy_settings IS
  'Per-field visibility map. Keys: email, phone, city, language, timezone, '
  'avatarUrl, firstName, lastName. Values: PUBLIC | COACHES_ONLY | ONLY_ME. '
  'Missing keys fall back to app-layer defaults.';

-- ---------------------------------------------------------------
-- 3. review — public reviews for instructor profiles
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review (
  id CHAR(36) NOT NULL DEFAULT gen_random_uuid()::char(36),
  instructor_profile_id CHAR(36) NOT NULL,
  author_user_id CHAR(36) NULL,
  rating SMALLINT NOT NULL,
  body TEXT NOT NULL,
  months_in SMALLINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,

  PRIMARY KEY (id),

  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),

  CONSTRAINT fk_review_instructor_profile FOREIGN KEY (instructor_profile_id)
    REFERENCES instructor_profile (id) ON DELETE CASCADE,
  CONSTRAINT fk_review_author_user FOREIGN KEY (author_user_id)
    REFERENCES "user" (id) ON DELETE SET NULL
);

-- Listing by instructor newest-first is the dominant query.
CREATE INDEX IF NOT EXISTS idx_review_profile_created
  ON review (instructor_profile_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;
