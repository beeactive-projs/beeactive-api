-- 057_system_starter_routines.sql
--
-- Ten MotionHive starter routines, so a new account has something to
-- run on day one instead of an empty library and a "Create routine"
-- button. `program.owner_id` has always been documented as "null only
-- for SYSTEM starter routines" — this is the content that comment was
-- waiting for.
--
-- Shapes are the ordinary ones, not anybody's branded programme: two
-- full body days for a beginner alternating across the week, a
-- push/pull/legs split, an upper/lower split, a no-equipment session,
-- a dumbbell-only session, and a twenty minute one for the days
-- training nearly gets skipped. Rep ranges are conservative on purpose:
-- these are defaults a beginner runs unsupervised, and the point is to
-- give a shape to copy and adjust, not to prescribe.
--
-- This migration also does two things the routines depend on:
--
--   1. Adds `program.level`, reusing the `exercise_level` enum so a
--      routine and an exercise speak the same three words and one
--      filter component can serve both libraries. Nullable: only
--      curated content carries an editorial difficulty, a user's own
--      copied routine has no reason to.
--   2. Tags Goblet Squat as a dumbbell movement as well as a kettlebell
--      one. It was kettlebell-only, which is wrong (the lift is
--      routinely done with a single dumbbell held vertically) and would
--      have made "Full body starter" look like it needs a kettlebell
--      nobody owns.
--
-- REQUIRES the exercise catalogue. It is loaded by scripts/seed-exercises.ts,
-- which is a script and not a migration, so it must have been run against
-- this database first. The guard below names any slug that is missing
-- instead of seeding a routine with holes in it.
--
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING, so a re-run is a
-- no-op and a partially applied run repairs itself.

BEGIN;

-- ---------------------------------------------------------------------
-- Schema: editorial difficulty on a program.
-- ---------------------------------------------------------------------
ALTER TABLE program ADD COLUMN IF NOT EXISTS level exercise_level;

COMMENT ON COLUMN program.level IS
  'Editorial difficulty for curated content (SYSTEM starters, published instructor programs). NULL for a user''s own routines.';

-- Partial: the column is null for most rows, and every query that uses
-- it is filtering for a specific level.
CREATE INDEX IF NOT EXISTS idx_program_level
  ON program (level) WHERE level IS NOT NULL;

-- ---------------------------------------------------------------------
-- Catalogue fix: a goblet squat takes a dumbbell just as happily.
-- ---------------------------------------------------------------------
INSERT INTO exercise_equipment (exercise_id, equipment_id)
SELECT e.id, q.id
FROM exercise e, equipment q
WHERE e.slug = 'goblet-squat' AND e.source = 'SYSTEM' AND e.deleted_at IS NULL
  AND q.slug = 'dumbbell'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Exercises the starters need that the catalogue import does not supply.
--
-- Most of the 24 movements below come from the free-exercise-db import.
-- These three do not: they existed on the author's machine only because
-- scripts/seed-test-data.sql created them, which is a dev fixture and
-- never runs on a real environment. Seeding them here is what makes this
-- migration portable instead of dependent on someone's local database.
-- ---------------------------------------------------------------------
INSERT INTO exercise (id, name, slug, kind, level, source, visibility)
SELECT v.id, v.name, v.slug, v.kind::exercise_kind, v.level::exercise_level,
       'SYSTEM', 'PUBLIC'
FROM (VALUES
  ('5713e7a1-0003-4000-8000-000000000001', 'Plank', 'plank', 'DURATION', 'BEGINNER'),
  ('5713e7a1-0003-4000-8000-000000000002', 'Romanian Deadlift', 'romanian-deadlift', 'STRENGTH', 'INTERMEDIATE'),
  ('5713e7a1-0003-4000-8000-000000000003', 'Walking Lunge', 'walking-lunge', 'BODYWEIGHT', 'BEGINNER')
) AS v(id, name, slug, kind, level)
-- Scoped to the ownerless row on purpose. The unique index is
-- (COALESCE(owner_id, zero-uuid), slug), so slugs are unique per owner:
-- an instructor may already own a private "plank", and that must neither
-- block this insert nor be adopted into a MotionHive starter.
WHERE NOT EXISTS (
  SELECT 1 FROM exercise e
  WHERE e.slug = v.slug AND e.owner_id IS NULL AND e.deleted_at IS NULL
);

-- ---------------------------------------------------------------------
-- Guard: every slug this migration references must exist.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(s, ', ') INTO missing
  FROM unnest(ARRAY[
    'goblet-squat','incline-push-up','bent-over-two-dumbbell-row','plank',
    'bodyweight-squat','walking-lunge','dead-bug',
    'dumbbell-bench-press','dumbbell-shoulder-press',
    'close-grip-front-lat-pulldown','romanian-deadlift',
    'single-leg-glute-bridge','dumbbell-lunges','standing-dumbbell-press',
    'one-arm-dumbbell-row','dumbbell-squat','stiff-legged-dumbbell-deadlift',
    'dumbbell-bicep-curl','triceps-pushdown','leg-press','barbell-hip-thrust',
    'seated-leg-curl','leg-extensions','standing-calf-raises'
  ]) AS s
  WHERE NOT EXISTS (
    SELECT 1 FROM exercise e
    WHERE e.slug = s AND e.source = 'SYSTEM' AND e.deleted_at IS NULL
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Starter routines reference missing exercise slugs: %', missing;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Programs. owner_id NULL + source SYSTEM is what marks them as ours.
--
-- `goal_tags[0]` repeats the difficulty word. That is deliberate
-- redundancy with `level`: the tags are how the FE already renders
-- chips, and rewriting that to read the enum is a separate change.
-- ---------------------------------------------------------------------
INSERT INTO program (id, owner_id, name, description, kind, status, source, is_single_workout, folder, level, goal_tags)
VALUES
  ('5713e7a1-0000-4000-8000-000000000001', NULL,
   'Full body starter',
   'A complete session in four movements. Squat, push, pull, brace. Run it two or three times a week with a rest day between, and add a little weight when the last rep still feels solid.',
   'WORKOUT', 'PUBLISHED', 'SYSTEM', TRUE, 'MotionHive starters', 'BEGINNER',
   '["beginner", "full_body", "strength"]'::jsonb),

  ('5713e7a1-0000-4000-8000-000000000002', NULL,
   'No equipment, no excuses',
   'Nothing but your bodyweight and a floor. Useful when travelling, or on the days getting to a gym is the thing standing in the way.',
   'WORKOUT', 'PUBLISHED', 'SYSTEM', TRUE, 'MotionHive starters', 'BEGINNER',
   '["beginner", "bodyweight", "no_equipment"]'::jsonb),

  ('5713e7a1-0000-4000-8000-000000000003', NULL,
   'Push day',
   'Chest, shoulders and triceps. The push half of a push, pull, legs week. Pair it with Pull day and Leg day for a simple three day split.',
   'WORKOUT', 'PUBLISHED', 'SYSTEM', TRUE, 'MotionHive starters', 'INTERMEDIATE',
   '["intermediate", "push", "split"]'::jsonb),

  ('5713e7a1-0000-4000-8000-000000000004', NULL,
   'Pull day',
   'Back and biceps. The pull half of a push, pull, legs week. Lead with the pulldown while you are fresh, then row.',
   'WORKOUT', 'PUBLISHED', 'SYSTEM', TRUE, 'MotionHive starters', 'INTERMEDIATE',
   '["intermediate", "pull", "split"]'::jsonb),

  ('5713e7a1-0000-4000-8000-000000000005', NULL,
   'Leg day',
   'Quads, hamstrings and glutes in four movements. Heaviest first, single leg work after, and finish with something that does not need a barbell.',
   'WORKOUT', 'PUBLISHED', 'SYSTEM', TRUE, 'MotionHive starters', 'INTERMEDIATE',
   '["intermediate", "legs", "split"]'::jsonb),

  ('5713e7a1-0000-4000-8000-000000000006', NULL,
   'Full body B',
   'The second full body session, for the weeks you are training three times and do not want to repeat the same four lifts every time. Hinge, press, row, brace, the same idea as your first full body day with a different set of movements underneath it. Alternate the two across the week.',
   'WORKOUT', 'PUBLISHED', 'SYSTEM', TRUE, 'MotionHive starters', 'BEGINNER',
   '["beginner", "full_body", "strength"]'::jsonb),

  ('5713e7a1-0000-4000-8000-000000000007', NULL,
   'Dumbbell only',
   'Everything here needs a pair of dumbbells and nothing else. No bench, no rack, no machine. Built for a home setup or a hotel gym that has weights and not much more.',
   'WORKOUT', 'PUBLISHED', 'SYSTEM', TRUE, 'MotionHive starters', 'BEGINNER',
   '["beginner", "dumbbell", "full_body"]'::jsonb),

  ('5713e7a1-0000-4000-8000-000000000008', NULL,
   'Quick 20',
   'Three lifts, short rest, done in about twenty minutes. For the days training almost gets skipped because there is not enough time to do a full session. Something is always better than nothing.',
   'WORKOUT', 'PUBLISHED', 'SYSTEM', TRUE, 'MotionHive starters', 'BEGINNER',
   '["beginner", "short", "full_body"]'::jsonb),

  ('5713e7a1-0000-4000-8000-000000000009', NULL,
   'Upper body',
   'Chest, back, shoulders and arms in one session. Half of an upper, lower split, the most common four day a week structure. Run this and Lower body twice each across the week.',
   'WORKOUT', 'PUBLISHED', 'SYSTEM', TRUE, 'MotionHive starters', 'INTERMEDIATE',
   '["intermediate", "upper", "split"]'::jsonb),

  ('5713e7a1-0000-4000-8000-000000000010', NULL,
   'Lower body',
   'Quads, hamstrings, glutes and calves, built around machines instead of free weights. The other half of an upper, lower split. Heaviest first, then isolation work for whatever is still fresh.',
   'WORKOUT', 'PUBLISHED', 'SYSTEM', TRUE, 'MotionHive starters', 'INTERMEDIATE',
   '["intermediate", "lower", "split"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- One workout per routine (is_single_workout = TRUE means exactly one).
-- ---------------------------------------------------------------------
INSERT INTO program_workout (id, program_id, name, week_index, day_index, sequence_number, estimated_duration_minutes)
VALUES
  ('5713e7a1-0001-4000-8000-000000000001', '5713e7a1-0000-4000-8000-000000000001', 'Full body starter', 0, 0, 0, 45),
  ('5713e7a1-0001-4000-8000-000000000002', '5713e7a1-0000-4000-8000-000000000002', 'No equipment, no excuses', 0, 0, 0, 30),
  ('5713e7a1-0001-4000-8000-000000000003', '5713e7a1-0000-4000-8000-000000000003', 'Push day', 0, 0, 0, 50),
  ('5713e7a1-0001-4000-8000-000000000004', '5713e7a1-0000-4000-8000-000000000004', 'Pull day', 0, 0, 0, 50),
  ('5713e7a1-0001-4000-8000-000000000005', '5713e7a1-0000-4000-8000-000000000005', 'Leg day', 0, 0, 0, 50),
  ('5713e7a1-0001-4000-8000-000000000006', '5713e7a1-0000-4000-8000-000000000006', 'Full body B', 0, 0, 0, 45),
  ('5713e7a1-0001-4000-8000-000000000007', '5713e7a1-0000-4000-8000-000000000007', 'Dumbbell only', 0, 0, 0, 40),
  ('5713e7a1-0001-4000-8000-000000000008', '5713e7a1-0000-4000-8000-000000000008', 'Quick 20', 0, 0, 0, 20),
  ('5713e7a1-0001-4000-8000-000000000009', '5713e7a1-0000-4000-8000-000000000009', 'Upper body', 0, 0, 0, 50),
  ('5713e7a1-0001-4000-8000-000000000010', '5713e7a1-0000-4000-8000-000000000010', 'Lower body', 0, 0, 0, 50)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- The prescription, one row per exercise.
--
-- Sets are generated from `sets` below rather than written out one row
-- at a time. Every starter prescribes N identical sets, so spelling
-- them out was a hundred lines whose only variation was an index, and
-- a hand-edited rep range that disagreed with its siblings would be
-- invisible in review.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE starter_prescription (
  id            char(36),
  workout_id    char(36),
  slug          text,
  order_index   int,
  notes         text,
  sets          int,
  reps_min      int,
  reps_max      int,
  seconds       int,
  rest          int
) ON COMMIT DROP;

INSERT INTO starter_prescription VALUES
  -- Full body starter
  ('5713e7a1-0002-4000-8000-000000000101', '5713e7a1-0001-4000-8000-000000000001', 'goblet-squat', 0, 'Hold the weight at your chest. Sit down between your hips, not back.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000102', '5713e7a1-0001-4000-8000-000000000001', 'incline-push-up', 1, 'The higher the surface, the easier it is. Lower it as you get stronger.', 3, 8, 12, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000000103', '5713e7a1-0001-4000-8000-000000000001', 'bent-over-two-dumbbell-row', 2, 'Flat back, ribs down. Pull to your hips rather than your chest.', 3, 8, 12, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000000104', '5713e7a1-0001-4000-8000-000000000001', 'plank', 3, 'Squeeze your glutes. Stop the set when your hips start to sag.', 3, NULL, NULL, 30, 45),

  -- No equipment, no excuses
  ('5713e7a1-0002-4000-8000-000000000201', '5713e7a1-0001-4000-8000-000000000002', 'bodyweight-squat', 0, 'Slow on the way down, quick on the way up.', 3, 12, 20, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000000202', '5713e7a1-0001-4000-8000-000000000002', 'incline-push-up', 1, 'A kitchen counter works. So does a wall on a bad day.', 3, 8, 15, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000000203', '5713e7a1-0001-4000-8000-000000000002', 'walking-lunge', 2, 'Count reps per leg. Short steps if your knees complain.', 3, 10, 12, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000000204', '5713e7a1-0001-4000-8000-000000000002', 'dead-bug', 3, 'Press your lower back into the floor the whole time.', 2, 8, 10, NULL, 45),
  ('5713e7a1-0002-4000-8000-000000000205', '5713e7a1-0001-4000-8000-000000000002', 'plank', 4, 'Finish here. Quality over duration.', 2, NULL, NULL, 30, 45),

  -- Push day
  ('5713e7a1-0002-4000-8000-000000000301', '5713e7a1-0001-4000-8000-000000000003', 'dumbbell-bench-press', 0, 'Heaviest movement first, while you are fresh.', 4, 6, 10, NULL, 120),
  ('5713e7a1-0002-4000-8000-000000000302', '5713e7a1-0001-4000-8000-000000000003', 'dumbbell-shoulder-press', 1, 'Press slightly in front of your ears, not behind.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000303', '5713e7a1-0001-4000-8000-000000000003', 'incline-push-up', 2, 'Finisher. Take these close to failure.', 2, 10, 20, NULL, 60),

  -- Pull day
  ('5713e7a1-0002-4000-8000-000000000401', '5713e7a1-0001-4000-8000-000000000004', 'close-grip-front-lat-pulldown', 0, 'Lead with your elbows, not your hands.', 4, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000402', '5713e7a1-0001-4000-8000-000000000004', 'bent-over-two-dumbbell-row', 1, 'Control the weight on the way down. No shrugging.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000403', '5713e7a1-0001-4000-8000-000000000004', 'romanian-deadlift', 2, 'Push your hips back. Stop when you feel your hamstrings, not your lower back.', 3, 8, 10, NULL, 90),

  -- Leg day
  ('5713e7a1-0002-4000-8000-000000000501', '5713e7a1-0001-4000-8000-000000000005', 'goblet-squat', 0, 'Work up to a weight you could still do two more with.', 4, 8, 12, NULL, 120),
  ('5713e7a1-0002-4000-8000-000000000502', '5713e7a1-0001-4000-8000-000000000005', 'romanian-deadlift', 1, 'Hinge, do not squat. The bar stays close to your legs.', 3, 8, 10, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000503', '5713e7a1-0001-4000-8000-000000000005', 'walking-lunge', 2, 'Reps are per leg.', 3, 10, 12, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000000504', '5713e7a1-0001-4000-8000-000000000005', 'single-leg-glute-bridge', 3, 'Drive through your heel and pause at the top.', 3, 10, 15, NULL, 45),

  -- Full body B. Nothing here overlaps Full body starter, so alternating
  -- the two genuinely varies the stimulus instead of renaming one session.
  ('5713e7a1-0002-4000-8000-000000000601', '5713e7a1-0001-4000-8000-000000000006', 'dumbbell-lunges', 0, 'Step through fully and keep your chest up. Reps are per leg.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000602', '5713e7a1-0001-4000-8000-000000000006', 'standing-dumbbell-press', 1, 'Brace your stomach before you press so your lower back does not arch.', 3, 8, 12, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000000603', '5713e7a1-0001-4000-8000-000000000006', 'one-arm-dumbbell-row', 2, 'Rest your free hand on a bench or chair. Pull to your hip.', 3, 8, 12, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000000604', '5713e7a1-0001-4000-8000-000000000006', 'dead-bug', 3, 'Move slowly. Your lower back should stay flat on the floor the whole time.', 3, 8, 10, NULL, 45),

  -- Dumbbell only
  ('5713e7a1-0002-4000-8000-000000000701', '5713e7a1-0001-4000-8000-000000000007', 'dumbbell-squat', 0, 'Hold a dumbbell in each hand at your sides. Chest up, sit down between your hips.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000702', '5713e7a1-0001-4000-8000-000000000007', 'stiff-legged-dumbbell-deadlift', 1, 'Soft knees, hinge at the hips. Keep the dumbbells close to your legs on the way down.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000703', '5713e7a1-0001-4000-8000-000000000007', 'dumbbell-bench-press', 2, 'Press the dumbbells up and slightly in, so they finish over your chest, not your face.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000704', '5713e7a1-0001-4000-8000-000000000007', 'one-arm-dumbbell-row', 3, 'Flat back, pull to your hip. Finish one side, then switch.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000705', '5713e7a1-0001-4000-8000-000000000007', 'plank', 4, 'Squeeze your glutes. Stop the set when your hips start to sag.', 3, NULL, NULL, 30, 45),

  -- Quick 20. The short rest is what buys the time back, not fewer sets.
  ('5713e7a1-0002-4000-8000-000000000801', '5713e7a1-0001-4000-8000-000000000008', 'dumbbell-squat', 0, 'Move at a steady pace. This is a short session, not a slow one.', 3, 12, 15, NULL, 45),
  ('5713e7a1-0002-4000-8000-000000000802', '5713e7a1-0001-4000-8000-000000000008', 'standing-dumbbell-press', 1, 'Press straight overhead. Brisk reps, still controlled.', 3, 10, 12, NULL, 45),
  ('5713e7a1-0002-4000-8000-000000000803', '5713e7a1-0001-4000-8000-000000000008', 'bent-over-two-dumbbell-row', 2, 'Flat back, ribs down. Straight into the next set once you have your breath back.', 3, 10, 12, NULL, 45),

  -- Upper body. Runs twice a week in an upper/lower split, so it earns
  -- the two arm isolation slots Push day does not carry.
  ('5713e7a1-0002-4000-8000-000000000901', '5713e7a1-0001-4000-8000-000000000009', 'dumbbell-bench-press', 0, 'Heaviest lift of the day. Get it done while you are fresh.', 4, 6, 10, NULL, 120),
  ('5713e7a1-0002-4000-8000-000000000902', '5713e7a1-0001-4000-8000-000000000009', 'close-grip-front-lat-pulldown', 1, 'Lead with your elbows, not your hands.', 4, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000903', '5713e7a1-0001-4000-8000-000000000009', 'dumbbell-shoulder-press', 2, 'Press slightly in front of your ears, not behind.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000904', '5713e7a1-0001-4000-8000-000000000009', 'bent-over-two-dumbbell-row', 3, 'Control the weight on the way down. No shrugging.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000000905', '5713e7a1-0001-4000-8000-000000000009', 'dumbbell-bicep-curl', 4, 'Keep your elbows pinned to your sides. No swinging the weight up.', 3, 10, 15, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000000906', '5713e7a1-0001-4000-8000-000000000009', 'triceps-pushdown', 5, 'Keep your elbows tucked and still. Only your forearms move.', 3, 10, 15, NULL, 60),

  -- Lower body. Machine-based on purpose, so choosing the four day
  -- split over the three day one is a different session, not Leg day
  -- under another name.
  ('5713e7a1-0002-4000-8000-000000001001', '5713e7a1-0001-4000-8000-000000000010', 'leg-press', 0, 'Feet mid platform, knees tracking over your toes. Do not slam the lockout.', 4, 8, 12, NULL, 120),
  ('5713e7a1-0002-4000-8000-000000001002', '5713e7a1-0001-4000-8000-000000000010', 'barbell-hip-thrust', 1, 'Shoulders on the bench, chin tucked. Squeeze your glutes hard at the top.', 3, 8, 12, NULL, 90),
  ('5713e7a1-0002-4000-8000-000000001003', '5713e7a1-0001-4000-8000-000000000010', 'seated-leg-curl', 2, 'Slow on the way back. Do not let the weight stack drop.', 3, 10, 15, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000001004', '5713e7a1-0001-4000-8000-000000000010', 'leg-extensions', 3, 'Light to start. This joint does not need to be tested.', 3, 10, 15, NULL, 60),
  ('5713e7a1-0002-4000-8000-000000001005', '5713e7a1-0001-4000-8000-000000000010', 'standing-calf-raises', 4, 'Full stretch at the bottom, full squeeze at the top.', 3, 12, 20, NULL, 45);

INSERT INTO prescribed_exercise (id, program_workout_id, exercise_id, order_index, notes)
SELECT p.id, p.workout_id, e.id, p.order_index, p.notes
FROM starter_prescription p
JOIN exercise e ON e.slug = p.slug AND e.source = 'SYSTEM' AND e.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;

-- Deterministic per (exercise, set index) so a re-run collides and
-- skips. Derived by hash rather than by slicing the parent id: the
-- exercises within a routine differ only in their final characters, so
-- truncating to make room for the set index collapsed all of them onto
-- one key and only the first exercise's sets survived.
INSERT INTO prescribed_set (id, prescribed_exercise_id, order_index, set_type, target_reps_min, target_reps_max, target_duration_seconds, rest_after_seconds)
SELECT
  substring(md5(p.id || ':' || s.i), 1, 8) || '-' ||
  substring(md5(p.id || ':' || s.i), 9, 4) || '-' ||
  substring(md5(p.id || ':' || s.i), 13, 4) || '-' ||
  substring(md5(p.id || ':' || s.i), 17, 4) || '-' ||
  substring(md5(p.id || ':' || s.i), 21, 12),
  p.id, s.i, 'NORMAL', p.reps_min, p.reps_max, p.seconds, p.rest
FROM starter_prescription p
CROSS JOIN LATERAL generate_series(0, p.sets - 1) AS s(i)
ON CONFLICT (id) DO NOTHING;

COMMIT;
