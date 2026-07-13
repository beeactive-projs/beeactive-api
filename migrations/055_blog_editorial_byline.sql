-- =========================================================
-- Migration 055: Normalise the editorial blog byline
-- =========================================================
-- The seeded posts (009/013/016) carry a mix of guest bylines
-- ("BeeActive Editors", "Health & Wellness Team", "MotionHive
-- Editors", and the RO equivalents), backfilled into
-- guest_author_name by migration 033. "BeeActive" in particular is
-- off-brand on the public MotionHive site.
--
-- This normalises every GUEST-authored post (author_user_id IS NULL)
-- to a single editorial byline. Posts attributed to a registered
-- author (author_user_id set) are untouched — their name is joined
-- from the user row at read time.
--
-- Content-only change (a byline string), not a code/Stripe rename, so
-- it does not touch the intentional `beeactive` identifiers.
--
-- Idempotent: re-running sets the same value. Like 054, applying this
-- on prod must be followed by ONE website rebuild (the public blog is
-- prerendered; a direct DB write bypasses triggerWebsiteRebuild()).
-- =========================================================

BEGIN;

UPDATE blog_post
   SET guest_author_name = 'MotionHive Team',
       updated_at = now()
 WHERE author_user_id IS NULL
   AND guest_author_name IS NOT NULL
   AND guest_author_name <> 'MotionHive Team';

COMMIT;
