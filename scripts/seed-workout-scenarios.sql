-- seed-workout-scenarios.sql
--
-- DEV ONLY. Destructive: deletes every workout log and non-SYSTEM program
-- before reseeding. No npm script runs it; the demo-account guard below
-- aborts on any database that does not have the four fixture accounts.
--
-- Rebuilds the workout ACTIVITY domain with one example of every state
-- the app can be in: past, today, and future; coached and solo; and all
-- three kinds of log provenance.
--
-- Deliberately NOT touched:
--   exercise        the catalog is real content, not fixtures
--   "user"          accounts, roles, coach relationships
--   program SYSTEM  the ten MotionHive starters from migration 057
--   everything outside the workout module (sessions, payments, blog…)
--
-- Re-runnable: it clears its own domain first, so running it twice
-- leaves the same state rather than doubling it.
--
-- Dates are relative to CURRENT_DATE, so the "today" and "future"
-- scenarios stay meaningful however long after seeding you look.

BEGIN;

-- ---------------------------------------------------------------------
-- Clear. Children first; SYSTEM programs survive.
-- ---------------------------------------------------------------------
DELETE FROM one_rep_max;
DELETE FROM logged_set;
DELETE FROM logged_exercise;
DELETE FROM workout_log;

DELETE FROM assigned_set;
DELETE FROM assigned_exercise;
DELETE FROM assigned_workout;
DELETE FROM program_assignment;

DELETE FROM prescribed_set  ps USING prescribed_exercise pe, program_workout pw, program p
  WHERE ps.prescribed_exercise_id = pe.id AND pe.program_workout_id = pw.id
    AND pw.program_id = p.id AND p.source <> 'SYSTEM';
DELETE FROM prescribed_exercise pe USING program_workout pw, program p
  WHERE pe.program_workout_id = pw.id AND pw.program_id = p.id AND p.source <> 'SYSTEM';
DELETE FROM program_workout pw USING program p
  WHERE pw.program_id = p.id AND p.source <> 'SYSTEM';
DELETE FROM program WHERE source <> 'SYSTEM';

-- ---------------------------------------------------------------------
-- Cast, resolved by email so the script survives a re-seeded user table.
-- ---------------------------------------------------------------------

-- Deterministic 36-char ids. Concatenating a suffix onto a parent id
-- overflows CHAR(36); hashing keeps the width exact and the value
-- stable across re-runs.
CREATE FUNCTION pg_temp.id36(seed text) RETURNS char(36) AS $f$
  SELECT substring(md5(seed),1,8)  || '-' ||
         substring(md5(seed),9,4)  || '-' ||
         substring(md5(seed),13,4) || '-' ||
         substring(md5(seed),17,4) || '-' ||
         substring(md5(seed),21,12);
$f$ LANGUAGE sql IMMUTABLE;

CREATE TEMP TABLE cast_ids AS
SELECT
  (SELECT id FROM "user" WHERE email = 'instructor@motionhive.fit')  AS coach,
  (SELECT id FROM "user" WHERE email = 'anna.client@motionhive.fit') AS anna,
  (SELECT id FROM "user" WHERE email = 'user@motionhive.fit')        AS sarah,
  (SELECT id FROM "user" WHERE email = 'mihai.client@motionhive.fit') AS mihai,
  -- `deleted_at IS NULL` matters: the unique index on slug is partial,
  -- so a soft-deleted row can share a slug with the live one and an
  -- unfiltered lookup returns two.
  (SELECT id FROM exercise WHERE slug = 'goblet-squat'    AND source = 'SYSTEM' AND deleted_at IS NULL) AS ex_squat,
  (SELECT id FROM exercise WHERE slug = 'incline-push-up' AND source = 'SYSTEM' AND deleted_at IS NULL) AS ex_push,
  (SELECT id FROM exercise WHERE slug = 'plank'           AND source = 'SYSTEM' AND deleted_at IS NULL) AS ex_plank;

DO $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM cast_ids;
  IF c.coach IS NULL OR c.anna IS NULL OR c.sarah IS NULL OR c.mihai IS NULL THEN
    RAISE EXCEPTION 'Seed cast missing — expected the four demo accounts to exist';
  END IF;
  IF c.ex_squat IS NULL OR c.ex_push IS NULL OR c.ex_plank IS NULL THEN
    RAISE EXCEPTION 'Seed exercises missing — is the catalog seeded?';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. A coach's program, and a routine each for Anna and Mihai.
-- ---------------------------------------------------------------------
INSERT INTO program (id, owner_id, name, description, kind, status, source, is_single_workout, folder, duration_days)
SELECT 'aa000000-0000-4000-8000-000000000001', c.coach, 'Beginner Strength',
       'Three sessions a week, full body, linear progression.',
       'WORKOUT'::program_kind, 'PUBLISHED'::program_status, 'INSTRUCTOR'::program_source, FALSE, NULL, 28 FROM cast_ids c
UNION ALL
SELECT 'aa000000-0000-4000-8000-000000000002', c.anna, 'Push day A',
       'My own push session.', 'WORKOUT'::program_kind, 'PUBLISHED'::program_status, 'USER'::program_source, TRUE, 'Push / Pull / Legs', NULL FROM cast_ids c
UNION ALL
SELECT 'aa000000-0000-4000-8000-000000000003', c.mihai, 'Garage session',
       'What I can do at home.', 'WORKOUT'::program_kind, 'PUBLISHED'::program_status, 'USER'::program_source, TRUE, NULL, NULL FROM cast_ids c;

INSERT INTO program_workout (id, program_id, name, week_index, day_index, sequence_number, estimated_duration_minutes)
VALUES
  ('aa000000-0001-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Full Body A', 0, 0, 0, 45),
  ('aa000000-0001-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001', 'Full Body B', 0, 2, 1, 45),
  ('aa000000-0001-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000001', 'Full Body C', 0, 4, 2, 45),
  ('aa000000-0001-4000-8000-000000000004', 'aa000000-0000-4000-8000-000000000002', 'Push day A', 0, 0, 0, 40),
  ('aa000000-0001-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000003', 'Garage session', 0, 0, 0, 30);

INSERT INTO prescribed_exercise (id, program_workout_id, exercise_id, order_index)
SELECT v.id, v.pw, CASE v.slot WHEN 1 THEN c.ex_squat WHEN 2 THEN c.ex_push ELSE c.ex_plank END, v.oi
FROM cast_ids c, (VALUES
  ('aa000000-0002-4000-8000-000000000011','aa000000-0001-4000-8000-000000000001',1,0),
  ('aa000000-0002-4000-8000-000000000012','aa000000-0001-4000-8000-000000000001',2,1),
  ('aa000000-0002-4000-8000-000000000021','aa000000-0001-4000-8000-000000000002',1,0),
  ('aa000000-0002-4000-8000-000000000022','aa000000-0001-4000-8000-000000000002',3,1),
  ('aa000000-0002-4000-8000-000000000031','aa000000-0001-4000-8000-000000000003',2,0),
  ('aa000000-0002-4000-8000-000000000041','aa000000-0001-4000-8000-000000000004',2,0),
  ('aa000000-0002-4000-8000-000000000042','aa000000-0001-4000-8000-000000000004',3,1),
  ('aa000000-0002-4000-8000-000000000051','aa000000-0001-4000-8000-000000000005',1,0)
) AS v(id, pw, slot, oi);

INSERT INTO prescribed_set (id, prescribed_exercise_id, order_index, set_type, target_reps_min, target_reps_max, rest_after_seconds)
SELECT pg_temp.id36(pe.id || '-s' || g.i), pe.id, g.i, 'NORMAL'::exercise_set_type, 8, 12, 90
FROM prescribed_exercise pe
JOIN program_workout pw ON pw.id = pe.program_workout_id
JOIN program p ON p.id = pw.program_id AND p.source <> 'SYSTEM'
CROSS JOIN generate_series(0, 2) AS g(i);

-- ---------------------------------------------------------------------
-- 2. Assignments: one running, one already finished, one not started.
-- ---------------------------------------------------------------------
INSERT INTO program_assignment
  (id, master_program_id, instructor_id, client_id, program_name_snapshot, status, assignment_kind, start_date, end_date, completion_percent, share_off_plan)
SELECT 'bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001',
       c.coach, c.anna, 'Beginner Strength', 'ACTIVE'::program_assignment_status, 'COACH'::program_assignment_kind,
       CURRENT_DATE - 14, CURRENT_DATE + 14, 33, FALSE FROM cast_ids c
UNION ALL
SELECT 'bb000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001',
       c.coach, c.sarah, 'Beginner Strength', 'COMPLETED'::program_assignment_status, 'COACH'::program_assignment_kind,
       CURRENT_DATE - 60, CURRENT_DATE - 32, 100, TRUE FROM cast_ids c
UNION ALL
SELECT 'bb000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000001',
       c.coach, c.sarah, 'Beginner Strength', 'PENDING'::program_assignment_status, 'COACH'::program_assignment_kind,
       CURRENT_DATE + 7, CURRENT_DATE + 35, 0, FALSE FROM cast_ids c;

-- Anna: two done in the past, one due today, two ahead of her.
INSERT INTO assigned_workout (id, program_assignment_id, master_workout_id, name, week_index, day_index, sequence_number, scheduled_date, status)
VALUES
  ('cc000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','aa000000-0001-4000-8000-000000000001','Full Body A',0,0,0, CURRENT_DATE - 14, 'COMPLETED'),
  ('cc000000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000001','aa000000-0001-4000-8000-000000000002','Full Body B',0,2,1, CURRENT_DATE - 7,  'COMPLETED'),
  ('cc000000-0000-4000-8000-000000000003','bb000000-0000-4000-8000-000000000001','aa000000-0001-4000-8000-000000000003','Full Body C',0,4,2, CURRENT_DATE,      NULL),
  ('cc000000-0000-4000-8000-000000000004','bb000000-0000-4000-8000-000000000001','aa000000-0001-4000-8000-000000000001','Full Body A',1,0,3, CURRENT_DATE + 2,  NULL),
  ('cc000000-0000-4000-8000-000000000005','bb000000-0000-4000-8000-000000000001','aa000000-0001-4000-8000-000000000002','Full Body B',1,2,4, CURRENT_DATE + 4,  NULL),
  -- Sarah's finished plan, so plan-completion has a real example.
  ('cc000000-0000-4000-8000-000000000011','bb000000-0000-4000-8000-000000000002','aa000000-0001-4000-8000-000000000001','Full Body A',0,0,0, CURRENT_DATE - 60, 'COMPLETED'),
  ('cc000000-0000-4000-8000-000000000012','bb000000-0000-4000-8000-000000000002','aa000000-0001-4000-8000-000000000002','Full Body B',0,2,1, CURRENT_DATE - 55, 'COMPLETED'),
  -- Sarah's not-yet-started plan.
  ('cc000000-0000-4000-8000-000000000021','bb000000-0000-4000-8000-000000000003','aa000000-0001-4000-8000-000000000001','Full Body A',0,0,0, CURRENT_DATE + 7,  NULL);

INSERT INTO assigned_exercise (id, assigned_workout_id, exercise_id, master_exercise_id, order_index)
SELECT pg_temp.id36(aw.id || '-e' || pe.order_index), aw.id, pe.exercise_id, pe.id, pe.order_index
FROM assigned_workout aw
JOIN prescribed_exercise pe ON pe.program_workout_id = aw.master_workout_id;

INSERT INTO assigned_set (id, assigned_exercise_id, master_set_id, order_index, set_type, target_reps_min, target_reps_max, rest_after_seconds)
SELECT pg_temp.id36(ae.id || '-s' || ps.order_index), ae.id, ps.id, ps.order_index, 'NORMAL'::exercise_set_type, ps.target_reps_min, ps.target_reps_max, ps.rest_after_seconds
FROM assigned_exercise ae
JOIN prescribed_set ps ON ps.prescribed_exercise_id = ae.master_exercise_id;

-- ---------------------------------------------------------------------
-- 3. Logs — one of every provenance, spread across time.
--    from a plan  → program_assignment_id set
--    from routine → source_program_id set
--    freestyle    → neither
-- ---------------------------------------------------------------------
INSERT INTO workout_log
  (id, user_id, program_assignment_id, assigned_workout_id, source_program_id, name, status, started_at, completed_at, duration_seconds, feeling_rating, notes)
SELECT 'dd000000-0000-4000-8000-000000000001', c.anna, 'bb000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001', NULL,
       'Full Body A', 'COMPLETED'::workout_log_status, (CURRENT_DATE - 14)::timestamptz + INTERVAL '18 hours', (CURRENT_DATE - 14)::timestamptz + INTERVAL '19 hours', 3600, 4,
       'Felt strong. Went up 2.5kg on the squat.' FROM cast_ids c
UNION ALL
SELECT 'dd000000-0000-4000-8000-000000000002', c.anna, 'bb000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000002', NULL,
       'Full Body B', 'COMPLETED'::workout_log_status, (CURRENT_DATE - 7)::timestamptz + INTERVAL '18 hours', (CURRENT_DATE - 7)::timestamptz + INTERVAL '19 hours', 3300, 3,
       'Left knee a bit tight on the last set.' FROM cast_ids c
UNION ALL
-- Started from her own routine: the case that used to read "Freestyle".
SELECT 'dd000000-0000-4000-8000-000000000003', c.anna, NULL, NULL, 'aa000000-0000-4000-8000-000000000002',
       'Push day A', 'COMPLETED'::workout_log_status, (CURRENT_DATE - 3)::timestamptz + INTERVAL '17 hours', (CURRENT_DATE - 3)::timestamptz + INTERVAL '18 hours', 2700, 5, NULL FROM cast_ids c
UNION ALL
-- Genuinely freestyle, and private from her coach.
SELECT 'dd000000-0000-4000-8000-000000000004', c.anna, NULL, NULL, NULL,
       'Saturday swim', 'COMPLETED'::workout_log_status, (CURRENT_DATE - 2)::timestamptz + INTERVAL '10 hours', (CURRENT_DATE - 2)::timestamptz + INTERVAL '11 hours', 2400, 4,
       'Off plan. Just felt like moving.' FROM cast_ids c
UNION ALL
-- Today, already done.
SELECT 'dd000000-0000-4000-8000-000000000005', c.anna, NULL, NULL, 'aa000000-0000-4000-8000-000000000002',
       'Push day A', 'COMPLETED'::workout_log_status, CURRENT_DATE::timestamptz + INTERVAL '7 hours', CURRENT_DATE::timestamptz + INTERVAL '8 hours', 2900, 4, NULL FROM cast_ids c
UNION ALL
-- Today, still open — drives "Resume workout".
SELECT 'dd000000-0000-4000-8000-000000000006', c.mihai, NULL, NULL, 'aa000000-0000-4000-8000-000000000003',
       'Garage session', 'IN_PROGRESS'::workout_log_status, CURRENT_DATE::timestamptz + INTERVAL '9 hours', NULL, NULL, NULL, NULL FROM cast_ids c
UNION ALL
-- Sarah finished her plan a while back.
SELECT 'dd000000-0000-4000-8000-000000000007', c.sarah, 'bb000000-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000011', NULL,
       'Full Body A', 'COMPLETED'::workout_log_status, (CURRENT_DATE - 60)::timestamptz + INTERVAL '18 hours', (CURRENT_DATE - 60)::timestamptz + INTERVAL '19 hours', 3400, 5, NULL FROM cast_ids c
UNION ALL
SELECT 'dd000000-0000-4000-8000-000000000008', c.sarah, 'bb000000-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000012', NULL,
       'Full Body B', 'COMPLETED'::workout_log_status, (CURRENT_DATE - 55)::timestamptz + INTERVAL '18 hours', (CURRENT_DATE - 55)::timestamptz + INTERVAL '19 hours', 3500, 4, NULL FROM cast_ids c;

INSERT INTO logged_exercise
  (id, workout_log_id, exercise_id, assigned_exercise_id, prescribed_exercise_id, exercise_name_snapshot, order_index)
SELECT pg_temp.id36(wl.id || '-e0'), wl.id, c.ex_squat,
       CASE WHEN wl.assigned_workout_id IS NOT NULL THEN pg_temp.id36(wl.assigned_workout_id || '-e0') END,
       CASE WHEN wl.source_program_id IS NOT NULL THEN
         (SELECT pe.id FROM prescribed_exercise pe
          JOIN program_workout pw ON pw.id = pe.program_workout_id
          WHERE pw.program_id = wl.source_program_id ORDER BY pe.order_index LIMIT 1) END,
       'Goblet Squat', 0
FROM workout_log wl, cast_ids c;

INSERT INTO logged_set
  (id, logged_exercise_id, assigned_set_id, prescribed_set_id, order_index, set_type, reps, weight_kg, is_completed)
SELECT pg_temp.id36(le.id || '-s' || g.i), le.id,
       CASE WHEN le.assigned_exercise_id IS NOT NULL THEN pg_temp.id36(le.assigned_exercise_id || '-s' || g.i) END,
       CASE WHEN le.prescribed_exercise_id IS NOT NULL THEN pg_temp.id36(le.prescribed_exercise_id || '-s' || g.i) END,
       g.i, 'NORMAL'::exercise_set_type, 10, 40 + (g.i * 2.5),
       (SELECT status FROM workout_log w WHERE w.id = le.workout_log_id) = 'COMPLETED'
FROM logged_exercise le CROSS JOIN generate_series(0, 2) AS g(i);

-- A record, so Progress has something to show.
INSERT INTO one_rep_max (id, user_id, exercise_id, weight_kg, source, recorded_at, notes)
SELECT 'ee000000-0000-4000-8000-000000000001', c.anna, c.ex_squat, 60.0, 'ESTIMATED_EPLEY'::one_rep_max_source,
       (CURRENT_DATE - 14)::timestamptz + INTERVAL '19 hours', 'Epley estimate from 45kg x 10.'
FROM cast_ids c;

COMMIT;
