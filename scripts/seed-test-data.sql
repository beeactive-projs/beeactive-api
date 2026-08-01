-- =====================================================================
--  LOCAL TEST DATA SEED  —  motionhive-api
-- =====================================================================
--  Purpose: populate every related table with coherent demo data for the
--  two main test accounts so the app can be tested end-to-end:
--      instructor@motionhive.fit   (coach)   — password: Test1234!
--      user@motionhive.fit         (client)  — password: Test1234!
--  plus a few extra demo users so groups / chats / client lists look real.
--
--  THIS FILE IS LOCAL-ONLY. It is NOT part of the migrations/ numbered
--  chain and is never run by `npm run migrate` / Railway. Run it manually:
--
--    $env:PGPASSWORD='1q2w3e4R'
--    & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost `
--        -p 5432 -d beeact -v ON_ERROR_STOP=1 -f scripts/seed-test-data.sql
--
--  ---------------------------------------------------------------------
--  HOW TO ADD MORE DATA LATER
--  ---------------------------------------------------------------------
--  * Every seeded row gets a STABLE id from pg_temp.seed_uuid('<key>').
--    Use a unique readable key (e.g. 'ex:front-squat'). Same key => same
--    id => re-running never duplicates.
--  * Every INSERT ends with `ON CONFLICT DO NOTHING`, so the whole script
--    is safe to re-run any number of times (additive, never wipes).
--  * Reference the two existing users by EMAIL via a subquery, never by a
--    hardcoded id (ids differ between machines / prod).
--  * To add rows: copy an existing guarded block in the matching section
--    below and change the keys/values. Keep the insert ORDER (parents
--    before children) — sections are already in dependency order.
--  ---------------------------------------------------------------------
--  Stripe caveat: invoice/payment rows use FAKE stripe_* ids. They render
--  fine in lists, but any *live* Stripe action against them in the UI will
--  fail — that is expected for local read/test purposes.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Helper: deterministic, RFC-4122-VALID v4 id from a readable key.
--    md5 -> 8-4-4-4-12 layout, with the version nibble forced to '4'
--    and the variant nibble forced to '8' (10xx). The DB columns are
--    CHAR(36) so any 36-char string would store fine, but the API
--    validates ids with class-validator `@IsUUID('4')` — a raw md5 in
--    UUID shape has a random version/variant nibble and gets rejected
--    ("programId must be a UUID"). Pinning those two nibbles makes every
--    seeded id a genuine v4 UUID while staying fully deterministic.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.seed_uuid(k text)
RETURNS char(36) LANGUAGE sql IMMUTABLE AS $fn$
  SELECT (substr(m,1,8)||'-'||substr(m,9,4)||'-4'||substr(m,14,3)||'-8'
          ||substr(m,18,3)||'-'||substr(m,21,12))::char(36)
  FROM (SELECT md5(k) AS m) s;
$fn$;

-- =====================================================================
-- 1. EXTRA DEMO USERS  (resolve role by name; reuse the Test1234! hash)
-- =====================================================================
INSERT INTO "user" (id, email, password_hash, first_name, last_name,
                    language, timezone, is_active, is_email_verified,
                    handle, privacy_settings)
VALUES
  (pg_temp.seed_uuid('user:anna'),  'anna.client@motionhive.fit',
   '$2b$12$41I8q54Ve0JxdHOeN66K/OimQyOE5.nex.oCGoAU1xcTGIGt8MKCu',
   'Anna', 'Popescu', 'en', 'Europe/Bucharest', true, true, 'annapopescu', '{}'::jsonb),
  (pg_temp.seed_uuid('user:mihai'), 'mihai.client@motionhive.fit',
   '$2b$12$41I8q54Ve0JxdHOeN66K/OimQyOE5.nex.oCGoAU1xcTGIGt8MKCu',
   'Mihai', 'Ionescu', 'en', 'Europe/Bucharest', true, true, 'mihaiionescu', '{}'::jsonb),
  (pg_temp.seed_uuid('user:elena'), 'elena.member@motionhive.fit',
   '$2b$12$41I8q54Ve0JxdHOeN66K/OimQyOE5.nex.oCGoAU1xcTGIGt8MKCu',
   'Elena', 'Dumitru', 'en', 'Europe/Bucharest', true, true, 'elenadumitru', '{}'::jsonb)
ON CONFLICT DO NOTHING;

-- USER role for each extra demo user
INSERT INTO user_role (id, user_id, role_id, assigned_at)
SELECT pg_temp.seed_uuid('user_role:'||u.k||':USER'),
       pg_temp.seed_uuid('user:'||u.k),
       (SELECT id FROM role WHERE name = 'USER'),
       CURRENT_TIMESTAMP
FROM (VALUES ('anna'), ('mihai'), ('elena')) AS u(k)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 2. INSTRUCTOR ↔ CLIENT RELATIONSHIPS
--    (user@ is ALREADY an active client of instructor@ from the dump —
--     do not re-create it; add the new demo users instead.)
-- =====================================================================
INSERT INTO instructor_client (id, instructor_id, client_id, status,
                               initiated_by, notes, started_at)
VALUES
  (pg_temp.seed_uuid('ic:instr:anna'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   pg_temp.seed_uuid('user:anna'),
   'ACTIVE'::enum_instructor_client_status, 'INSTRUCTOR'::enum_initiated_by,
   'Training for a 10k.', CURRENT_TIMESTAMP - INTERVAL '40 days'),
  (pg_temp.seed_uuid('ic:instr:mihai'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   pg_temp.seed_uuid('user:mihai'),
   'PENDING'::enum_instructor_client_status, 'CLIENT'::enum_initiated_by,
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- A pending invite request from the coach to Elena
INSERT INTO client_request (id, from_user_id, to_user_id, type, message,
                            status, token, expires_at)
VALUES
  (pg_temp.seed_uuid('cr:instr:elena'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   pg_temp.seed_uuid('user:elena'),
   'INSTRUCTOR_TO_CLIENT'::enum_client_request_type,
   'Would love to coach you — join me on MotionHive!',
   'PENDING'::enum_client_request_status,
   md5('cr:instr:elena'),
   CURRENT_TIMESTAMP + INTERVAL '30 days')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 3. EXERCISE CATALOG  (must exist before any workout)
--    SYSTEM exercises, public, owner_id NULL.
--    Slugs carry a 'seed-' prefix: SYSTEM exercises share ONE global slug
--    namespace (idx_exercise_slug_per_owner) with the ~870 rows loaded by
--    scripts/seed-exercises.ts, and an unprefixed slug that collides gets
--    silently dropped by ON CONFLICT — breaking every FK reference to its
--    seed_uuid('ex:…') id further down.
-- =====================================================================
-- Reclaim the base slugs. `scripts/seed-exercises.ts` seeds an 800+ SYSTEM
-- library, and some of its slugs (e.g. plank, romanian-deadlift) collide with
-- the movements below under the partial unique index
-- idx_exercise_slug_per_owner (COALESCE(owner_id, zero), slug) WHERE deleted_at
-- IS NULL. Without this, ON CONFLICT silently SKIPS the colliding rows, so the
-- seed_uuid('ex:...') ids never get inserted and every workout/program/log
-- reference below orphans into an FK violation. Soft-delete (not hard delete)
-- is FK-safe and, because the unique index ignores deleted rows, frees the slug
-- for our fixed-id version. Idempotent: our own rows carry the seed_uuid ids and
-- are excluded by the NOT IN, so re-running is a no-op.
UPDATE exercise SET deleted_at = NOW()
 WHERE owner_id IS NULL AND deleted_at IS NULL
   AND slug IN ('back-squat','bench-press','deadlift','overhead-press','barbell-row',
                'pull-up','walking-lunge','plank','dumbbell-curl','romanian-deadlift')
   AND id NOT IN (
     pg_temp.seed_uuid('ex:back-squat'), pg_temp.seed_uuid('ex:bench-press'),
     pg_temp.seed_uuid('ex:deadlift'), pg_temp.seed_uuid('ex:overhead-press'),
     pg_temp.seed_uuid('ex:barbell-row'), pg_temp.seed_uuid('ex:pull-up'),
     pg_temp.seed_uuid('ex:walking-lunge'), pg_temp.seed_uuid('ex:plank'),
     pg_temp.seed_uuid('ex:dumbbell-curl'), pg_temp.seed_uuid('ex:romanian-deadlift'));

INSERT INTO exercise (id, name, slug, kind, level, movement_pattern,
                      mechanic, force, source, owner_id, visibility, media_kind)
VALUES
  (pg_temp.seed_uuid('ex:back-squat'),'Back Squat','seed-back-squat',
     'STRENGTH'::exercise_kind,'INTERMEDIATE'::exercise_level,'SQUAT'::movement_pattern,
     'COMPOUND'::exercise_mechanic,'PUSH'::exercise_force,'SYSTEM'::exercise_source,NULL,'PUBLIC'::exercise_visibility,'NONE'::exercise_media_kind),
  (pg_temp.seed_uuid('ex:bench-press'),'Bench Press','seed-bench-press',
     'STRENGTH'::exercise_kind,'INTERMEDIATE'::exercise_level,'PUSH_HORIZONTAL'::movement_pattern,
     'COMPOUND'::exercise_mechanic,'PUSH'::exercise_force,'SYSTEM'::exercise_source,NULL,'PUBLIC'::exercise_visibility,'NONE'::exercise_media_kind),
  (pg_temp.seed_uuid('ex:deadlift'),'Deadlift','seed-deadlift',
     'STRENGTH'::exercise_kind,'ADVANCED'::exercise_level,'HINGE'::movement_pattern,
     'COMPOUND'::exercise_mechanic,'PULL'::exercise_force,'SYSTEM'::exercise_source,NULL,'PUBLIC'::exercise_visibility,'NONE'::exercise_media_kind),
  (pg_temp.seed_uuid('ex:overhead-press'),'Overhead Press','seed-overhead-press',
     'STRENGTH'::exercise_kind,'INTERMEDIATE'::exercise_level,'PUSH_VERTICAL'::movement_pattern,
     'COMPOUND'::exercise_mechanic,'PUSH'::exercise_force,'SYSTEM'::exercise_source,NULL,'PUBLIC'::exercise_visibility,'NONE'::exercise_media_kind),
  (pg_temp.seed_uuid('ex:barbell-row'),'Barbell Row','seed-barbell-row',
     'STRENGTH'::exercise_kind,'INTERMEDIATE'::exercise_level,'PULL_HORIZONTAL'::movement_pattern,
     'COMPOUND'::exercise_mechanic,'PULL'::exercise_force,'SYSTEM'::exercise_source,NULL,'PUBLIC'::exercise_visibility,'NONE'::exercise_media_kind),
  (pg_temp.seed_uuid('ex:pull-up'),'Pull-up','seed-pull-up',
     'BODYWEIGHT'::exercise_kind,'INTERMEDIATE'::exercise_level,'PULL_VERTICAL'::movement_pattern,
     'COMPOUND'::exercise_mechanic,'PULL'::exercise_force,'SYSTEM'::exercise_source,NULL,'PUBLIC'::exercise_visibility,'NONE'::exercise_media_kind),
  (pg_temp.seed_uuid('ex:walking-lunge'),'Walking Lunge','seed-walking-lunge',
     'BODYWEIGHT'::exercise_kind,'BEGINNER'::exercise_level,'LUNGE'::movement_pattern,
     'COMPOUND'::exercise_mechanic,'PUSH'::exercise_force,'SYSTEM'::exercise_source,NULL,'PUBLIC'::exercise_visibility,'NONE'::exercise_media_kind),
  (pg_temp.seed_uuid('ex:plank'),'Plank','seed-plank',
     'DURATION'::exercise_kind,'BEGINNER'::exercise_level,'ANTI_ROTATION'::movement_pattern,
     'ISOLATION'::exercise_mechanic,'STATIC'::exercise_force,'SYSTEM'::exercise_source,NULL,'PUBLIC'::exercise_visibility,'NONE'::exercise_media_kind),
  (pg_temp.seed_uuid('ex:dumbbell-curl'),'Dumbbell Curl','seed-dumbbell-curl',
     'STRENGTH'::exercise_kind,'BEGINNER'::exercise_level,'ISOLATION'::movement_pattern,
     'ISOLATION'::exercise_mechanic,'PULL'::exercise_force,'SYSTEM'::exercise_source,NULL,'PUBLIC'::exercise_visibility,'NONE'::exercise_media_kind),
  (pg_temp.seed_uuid('ex:romanian-deadlift'),'Romanian Deadlift','seed-romanian-deadlift',
     'STRENGTH'::exercise_kind,'INTERMEDIATE'::exercise_level,'HINGE'::movement_pattern,
     'COMPOUND'::exercise_mechanic,'PULL'::exercise_force,'SYSTEM'::exercise_source,NULL,'PUBLIC'::exercise_visibility,'NONE'::exercise_media_kind)
ON CONFLICT DO NOTHING;

-- Exercise -> primary/secondary muscles (>=1 PRIMARY required by service)
INSERT INTO exercise_muscle (exercise_id, muscle_id, role)
SELECT pg_temp.seed_uuid('ex:'||x.ex), m.id, x.role::muscle_role
FROM (VALUES
  ('back-squat','quadriceps','PRIMARY'),('back-squat','glutes','SECONDARY'),('back-squat','hamstrings','SECONDARY'),
  ('bench-press','chest','PRIMARY'),('bench-press','triceps','SECONDARY'),('bench-press','shoulders','SECONDARY'),
  ('deadlift','hamstrings','PRIMARY'),('deadlift','glutes','PRIMARY'),('deadlift','lower_back','SECONDARY'),
  ('overhead-press','shoulders','PRIMARY'),('overhead-press','triceps','SECONDARY'),
  ('barbell-row','lats','PRIMARY'),('barbell-row','middle_back','PRIMARY'),('barbell-row','biceps','SECONDARY'),
  ('pull-up','lats','PRIMARY'),('pull-up','biceps','SECONDARY'),
  ('walking-lunge','quadriceps','PRIMARY'),('walking-lunge','glutes','SECONDARY'),
  ('plank','abdominals','PRIMARY'),
  ('dumbbell-curl','biceps','PRIMARY'),
  ('romanian-deadlift','hamstrings','PRIMARY'),('romanian-deadlift','glutes','SECONDARY'),('romanian-deadlift','lower_back','SECONDARY')
) AS x(ex, muscle, role)
JOIN muscle m ON m.slug = x.muscle
ON CONFLICT DO NOTHING;

-- Exercise -> equipment
INSERT INTO exercise_equipment (exercise_id, equipment_id)
SELECT pg_temp.seed_uuid('ex:'||x.ex), e.id
FROM (VALUES
  ('back-squat','barbell'),('bench-press','barbell'),('bench-press','bench'),
  ('deadlift','barbell'),('overhead-press','barbell'),('barbell-row','barbell'),
  ('pull-up','pull_up_bar'),('pull-up','bodyweight'),('walking-lunge','bodyweight'),
  ('plank','bodyweight'),('dumbbell-curl','dumbbell'),('romanian-deadlift','barbell')
) AS x(ex, equip)
JOIN equipment e ON e.slug = x.equip
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 4. GROUP + MEMBERS  (coach-owned, public, open join)
-- =====================================================================
INSERT INTO "group" (id, instructor_id, name, slug, description,
                     is_active, is_public, join_policy, member_post_policy, tags)
VALUES
  (pg_temp.seed_uuid('grp:test-strength-club'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   'Test Strength Club', 'test-strength-club',
   'A demo training group for testing the MotionHive app.',
   true, true, 'OPEN', 'OPEN'::group_member_post_policy,
   '["strength","community"]'::json)
ON CONFLICT DO NOTHING;

-- note: group_member.is_owner is a GENERATED column (from role) — do not insert it.
INSERT INTO group_member (id, group_id, user_id, role, joined_at)
VALUES
  (pg_temp.seed_uuid('gm:club:instr'), pg_temp.seed_uuid('grp:test-strength-club'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   'OWNER'::group_member_role, CURRENT_TIMESTAMP - INTERVAL '60 days'),
  (pg_temp.seed_uuid('gm:club:user'), pg_temp.seed_uuid('grp:test-strength-club'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   'MEMBER'::group_member_role, CURRENT_TIMESTAMP - INTERVAL '30 days'),
  (pg_temp.seed_uuid('gm:club:anna'), pg_temp.seed_uuid('grp:test-strength-club'),
   pg_temp.seed_uuid('user:anna'),
   'MEMBER'::group_member_role, CURRENT_TIMESTAMP - INTERVAL '20 days'),
  (pg_temp.seed_uuid('gm:club:elena'), pg_temp.seed_uuid('grp:test-strength-club'),
   pg_temp.seed_uuid('user:elena'),
   'MEMBER'::group_member_role, CURRENT_TIMESTAMP - INTERVAL '10 days')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 5. PROGRAM TEMPLATE  (program -> workouts -> exercises -> sets)
-- =====================================================================
INSERT INTO program (id, owner_id, name, description, kind, status,
                     duration_days, goal_tags)
VALUES
  (pg_temp.seed_uuid('prog:beginner-strength'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   'Beginner Strength — 4 Week',
   'A simple 3-day full-body strength block for new lifters.',
   'WORKOUT'::program_kind, 'PUBLISHED'::program_status,
   28, '["strength","hypertrophy"]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO program_workout (id, program_id, name, week_index, day_index,
                             sequence_number, estimated_duration_minutes)
VALUES
  (pg_temp.seed_uuid('pw:upper-a'),  pg_temp.seed_uuid('prog:beginner-strength'),
   'Upper Body A', 0, 0, 0, 50),
  (pg_temp.seed_uuid('pw:lower-a'),  pg_temp.seed_uuid('prog:beginner-strength'),
   'Lower Body A', 0, 1, 1, 55),
  (pg_temp.seed_uuid('pw:full-core'),pg_temp.seed_uuid('prog:beginner-strength'),
   'Full Body & Core', 0, 2, 2, 45)
ON CONFLICT DO NOTHING;

INSERT INTO prescribed_exercise (id, program_workout_id, exercise_id, order_index)
SELECT pg_temp.seed_uuid('pe:'||p.wkey||':'||p.ex),
       pg_temp.seed_uuid('pw:'||p.wkey),
       pg_temp.seed_uuid('ex:'||p.ex),
       p.ord
FROM (VALUES
  ('upper-a','bench-press',0),('upper-a','barbell-row',1),('upper-a','overhead-press',2),('upper-a','dumbbell-curl',3),
  ('lower-a','back-squat',0),('lower-a','romanian-deadlift',1),('lower-a','walking-lunge',2),
  ('full-core','deadlift',0),('full-core','pull-up',1),('full-core','plank',2)
) AS p(wkey, ex, ord)
ON CONFLICT DO NOTHING;

-- 3 working sets per strength/bodyweight exercise (reps-based)
INSERT INTO prescribed_set (id, prescribed_exercise_id, order_index, set_type,
                            target_reps_min, target_reps_max, target_rpe, rest_after_seconds)
SELECT pg_temp.seed_uuid('ps:'||pe.id||':'||g), pe.id, g,
       'WORKING'::exercise_set_type, 8, 12, 7.5, 90
FROM prescribed_exercise pe
JOIN program_workout pw ON pw.id = pe.program_workout_id
CROSS JOIN generate_series(0,2) AS g
WHERE pw.program_id = pg_temp.seed_uuid('prog:beginner-strength')
  AND pe.exercise_id <> pg_temp.seed_uuid('ex:plank')
ON CONFLICT DO NOTHING;

-- Plank: 3 timed sets (duration-based)
INSERT INTO prescribed_set (id, prescribed_exercise_id, order_index, set_type,
                            target_duration_seconds, rest_after_seconds)
SELECT pg_temp.seed_uuid('ps:'||pe.id||':'||g), pe.id, g,
       'WORKING'::exercise_set_type, 45, 60
FROM prescribed_exercise pe
CROSS JOIN generate_series(0,2) AS g
WHERE pe.exercise_id = pg_temp.seed_uuid('ex:plank')
  AND pe.program_workout_id = pg_temp.seed_uuid('pw:full-core')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 6. PROGRAM ASSIGNMENT  -> deep-copied assigned_* tree for user@
--    (this mirror tree is what the client app actually reads)
-- =====================================================================
INSERT INTO program_assignment (id, instructor_id, client_id, instructor_client_id,
                                master_program_id, program_name_snapshot, status,
                                start_date, completion_percent, notes)
VALUES
  (pg_temp.seed_uuid('pa:user'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   (SELECT id FROM instructor_client
      WHERE instructor_id=(SELECT id FROM "user" WHERE email='instructor@motionhive.fit')
        AND client_id=(SELECT id FROM "user" WHERE email='user@motionhive.fit')
        AND status='ACTIVE' LIMIT 1),
   pg_temp.seed_uuid('prog:beginner-strength'),
   'Beginner Strength — 4 Week', 'ACTIVE'::program_assignment_status,
   CURRENT_DATE - 7, 33, 'Start light, focus on form.')
ON CONFLICT DO NOTHING;

-- assigned_workout = copy of program_workout (statuses staged for realism)
INSERT INTO assigned_workout (id, program_assignment_id, master_workout_id, name, notes,
                              week_index, day_index, sequence_number, phase,
                              estimated_duration_minutes, scheduled_date, status)
SELECT pg_temp.seed_uuid('aw:'||pw.id), pg_temp.seed_uuid('pa:user'), pw.id, pw.name, pw.notes,
       pw.week_index, pw.day_index, pw.sequence_number, pw.phase,
       pw.estimated_duration_minutes,
       (CURRENT_DATE - 7) + (pw.week_index*7 + pw.day_index),
       CASE pw.sequence_number
         WHEN 0 THEN 'COMPLETED'::workout_log_status
         WHEN 1 THEN 'IN_PROGRESS'::workout_log_status
         ELSE NULL END
FROM program_workout pw
WHERE pw.program_id = pg_temp.seed_uuid('prog:beginner-strength')
ON CONFLICT DO NOTHING;

-- assigned_exercise = copy of prescribed_exercise
INSERT INTO assigned_exercise (id, assigned_workout_id, exercise_id, master_exercise_id,
                               superset_group_id, order_index, notes, alternate_exercise_id,
                               is_modified_from_master)
SELECT pg_temp.seed_uuid('ae:'||pe.id), pg_temp.seed_uuid('aw:'||pe.program_workout_id),
       pe.exercise_id, pe.id, pe.superset_group_id, pe.order_index, pe.notes,
       pe.alternate_exercise_id, false
FROM prescribed_exercise pe
JOIN program_workout pw ON pw.id = pe.program_workout_id
WHERE pw.program_id = pg_temp.seed_uuid('prog:beginner-strength')
ON CONFLICT DO NOTHING;

-- assigned_set = copy of prescribed_set
INSERT INTO assigned_set (id, assigned_exercise_id, master_set_id, order_index, set_type,
                          target_reps_min, target_reps_max, target_weight_kg,
                          target_weight_percent_1rm, target_duration_seconds,
                          target_distance_meters, target_rpe, target_rir,
                          rest_after_seconds, tempo, notes)
SELECT pg_temp.seed_uuid('as:'||ps.id), pg_temp.seed_uuid('ae:'||ps.prescribed_exercise_id),
       ps.id, ps.order_index, ps.set_type, ps.target_reps_min, ps.target_reps_max,
       ps.target_weight_kg, ps.target_weight_percent_1rm, ps.target_duration_seconds,
       ps.target_distance_meters, ps.target_rpe, ps.target_rir, ps.rest_after_seconds,
       ps.tempo, ps.notes
FROM prescribed_set ps
JOIN prescribed_exercise pe ON pe.id = ps.prescribed_exercise_id
JOIN program_workout pw ON pw.id = pe.program_workout_id
WHERE pw.program_id = pg_temp.seed_uuid('prog:beginner-strength')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 7. WORKOUT LOG HISTORY for user@  (1 completed + 1 in-progress)
-- =====================================================================
-- Completed log against "Upper Body A"
INSERT INTO workout_log (id, user_id, program_assignment_id, assigned_workout_id, name,
                         status, started_at, completed_at, duration_seconds, feeling_rating, notes)
VALUES
  (pg_temp.seed_uuid('wl:upper-a'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   pg_temp.seed_uuid('pa:user'), pg_temp.seed_uuid('aw:'||(SELECT pg_temp.seed_uuid('pw:upper-a'))),
   'Upper Body A', 'COMPLETED'::workout_log_status,
   CURRENT_TIMESTAMP - INTERVAL '7 days', CURRENT_TIMESTAMP - INTERVAL '7 days' + INTERVAL '52 minutes',
   3120, 4, 'Felt strong today.'),
  (pg_temp.seed_uuid('wl:lower-a'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   pg_temp.seed_uuid('pa:user'), pg_temp.seed_uuid('aw:'||(SELECT pg_temp.seed_uuid('pw:lower-a'))),
   'Lower Body A', 'IN_PROGRESS'::workout_log_status,
   CURRENT_TIMESTAMP - INTERVAL '20 minutes', NULL, NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- logged_exercise = copy of the assigned_exercise rows for those two workouts
INSERT INTO logged_exercise (id, workout_log_id, exercise_id, assigned_exercise_id,
                             exercise_name_snapshot, exercise_thumbnail_url_snapshot,
                             order_index, superset_group_id, notes)
SELECT pg_temp.seed_uuid('le:'||ae.id),
       CASE WHEN ae.assigned_workout_id = pg_temp.seed_uuid('aw:'||(SELECT pg_temp.seed_uuid('pw:upper-a')))
            THEN pg_temp.seed_uuid('wl:upper-a') ELSE pg_temp.seed_uuid('wl:lower-a') END,
       ae.exercise_id, ae.id, ex.name, ex.thumbnail_url, ae.order_index, ae.superset_group_id, NULL
FROM assigned_exercise ae
JOIN exercise ex ON ex.id = ae.exercise_id
WHERE ae.assigned_workout_id IN (
        pg_temp.seed_uuid('aw:'||(SELECT pg_temp.seed_uuid('pw:upper-a'))),
        pg_temp.seed_uuid('aw:'||(SELECT pg_temp.seed_uuid('pw:lower-a'))))
ON CONFLICT DO NOTHING;

-- logged_set = copy of assigned_set with "actual" values.
-- Upper Body A sets -> completed; Lower Body A sets -> not completed (in progress).
INSERT INTO logged_set (id, logged_exercise_id, assigned_set_id, order_index, set_type,
                        reps, weight_kg, duration_seconds, rpe, rest_after_seconds,
                        is_completed, completed_at)
SELECT pg_temp.seed_uuid('ls:'||asx.id), pg_temp.seed_uuid('le:'||asx.assigned_exercise_id),
       asx.id, asx.order_index, asx.set_type,
       COALESCE(asx.target_reps_max, asx.target_reps_min),
       asx.target_weight_kg, asx.target_duration_seconds, asx.target_rpe, asx.rest_after_seconds,
       (ae.assigned_workout_id = pg_temp.seed_uuid('aw:'||(SELECT pg_temp.seed_uuid('pw:upper-a')))),
       CASE WHEN ae.assigned_workout_id = pg_temp.seed_uuid('aw:'||(SELECT pg_temp.seed_uuid('pw:upper-a')))
            THEN CURRENT_TIMESTAMP - INTERVAL '7 days' ELSE NULL END
FROM assigned_set asx
JOIN assigned_exercise ae ON ae.id = asx.assigned_exercise_id
WHERE ae.assigned_workout_id IN (
        pg_temp.seed_uuid('aw:'||(SELECT pg_temp.seed_uuid('pw:upper-a'))),
        pg_temp.seed_uuid('aw:'||(SELECT pg_temp.seed_uuid('pw:lower-a'))))
ON CONFLICT DO NOTHING;

-- A few 1RM records for user@
INSERT INTO one_rep_max (id, user_id, exercise_id, weight_kg, source, recorded_at)
VALUES
  (pg_temp.seed_uuid('1rm:back-squat'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   pg_temp.seed_uuid('ex:back-squat'), 100.0, 'MANUAL'::one_rep_max_source, CURRENT_TIMESTAMP - INTERVAL '14 days'),
  (pg_temp.seed_uuid('1rm:bench-press'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   pg_temp.seed_uuid('ex:bench-press'), 70.0, 'MANUAL'::one_rep_max_source, CURRENT_TIMESTAMP - INTERVAL '14 days'),
  (pg_temp.seed_uuid('1rm:deadlift'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   pg_temp.seed_uuid('ex:deadlift'), 130.0, 'MANUAL'::one_rep_max_source, CURRENT_TIMESTAMP - INTERVAL '14 days')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 8. MESSAGING  (DIRECT conversation coach <-> client, with messages)
-- =====================================================================
INSERT INTO conversation (id, type, created_by_id, last_message_at, last_message_preview, direct_key)
VALUES
  (pg_temp.seed_uuid('conv:instr-user'), 'DIRECT',
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   CURRENT_TIMESTAMP - INTERVAL '2 hours',
   'Great work on Upper Body A 💪',
   encode(public.digest(
     LEAST((SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
           (SELECT id FROM "user" WHERE email='user@motionhive.fit'))
     || ':' ||
     GREATEST((SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
              (SELECT id FROM "user" WHERE email='user@motionhive.fit')),
     'sha256'), 'hex'))
ON CONFLICT DO NOTHING;

INSERT INTO conversation_participant (id, conversation_id, user_id, role, last_read_at, joined_at)
VALUES
  (pg_temp.seed_uuid('cp:instr-user:instr'), pg_temp.seed_uuid('conv:instr-user'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 'MEMBER',
   CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP - INTERVAL '30 days'),
  (pg_temp.seed_uuid('cp:instr-user:user'), pg_temp.seed_uuid('conv:instr-user'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'), 'MEMBER',
   CURRENT_TIMESTAMP - INTERVAL '3 hours', CURRENT_TIMESTAMP - INTERVAL '30 days')
ON CONFLICT DO NOTHING;

INSERT INTO message (id, conversation_id, sender_id, kind, body, created_at)
SELECT pg_temp.seed_uuid('msg:instr-user:'||t.n), pg_temp.seed_uuid('conv:instr-user'),
       (SELECT id FROM "user" WHERE email = t.sender_email), 'TEXT', t.body,
       CURRENT_TIMESTAMP - (t.mins_ago || ' minutes')::interval
FROM (VALUES
  (1, 'instructor@motionhive.fit', 'Hey! Welcome aboard. I''ve assigned your first program.', 2880),
  (2, 'user@motionhive.fit',       'Thanks coach! Just finished Upper Body A.',               180),
  (3, 'instructor@motionhive.fit', 'Great work on Upper Body A 💪 How did it feel?',          120),
  (4, 'user@motionhive.fit',       'Felt good — bench was a bit heavy on the last set.',       90),
  (5, 'instructor@motionhive.fit', 'Perfect, that''s the target. Keep it up!',                 60)
) AS t(n, sender_email, body, mins_ago)
ON CONFLICT DO NOTHING;

-- Second DM (coach <-> Anna) for client-list variety
INSERT INTO conversation (id, type, created_by_id, last_message_at, last_message_preview, direct_key)
VALUES
  (pg_temp.seed_uuid('conv:instr-anna'), 'DIRECT',
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   CURRENT_TIMESTAMP - INTERVAL '1 day', 'See you at the session!',
   encode(public.digest(
     LEAST((SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), pg_temp.seed_uuid('user:anna'))
     || ':' ||
     GREATEST((SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), pg_temp.seed_uuid('user:anna')),
     'sha256'), 'hex'))
ON CONFLICT DO NOTHING;

INSERT INTO conversation_participant (id, conversation_id, user_id, role, joined_at)
VALUES
  (pg_temp.seed_uuid('cp:instr-anna:instr'), pg_temp.seed_uuid('conv:instr-anna'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 'MEMBER', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  (pg_temp.seed_uuid('cp:instr-anna:anna'), pg_temp.seed_uuid('conv:instr-anna'),
   pg_temp.seed_uuid('user:anna'), 'MEMBER', CURRENT_TIMESTAMP - INTERVAL '20 days')
ON CONFLICT DO NOTHING;

INSERT INTO message (id, conversation_id, sender_id, kind, body, created_at)
VALUES
  (pg_temp.seed_uuid('msg:instr-anna:1'), pg_temp.seed_uuid('conv:instr-anna'),
   pg_temp.seed_uuid('user:anna'), 'TEXT', 'Hi! Looking forward to training.', CURRENT_TIMESTAMP - INTERVAL '1 day' - INTERVAL '5 minutes'),
  (pg_temp.seed_uuid('msg:instr-anna:2'), pg_temp.seed_uuid('conv:instr-anna'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 'TEXT', 'See you at the session!', CURRENT_TIMESTAMP - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 9. NOTIFICATIONS  (audience=USER + per-user receipt) + preferences
-- =====================================================================
INSERT INTO notification (id, type, title, body, severity, audience_type, audience_id)
VALUES
  (pg_temp.seed_uuid('ntf:user:program'), 'PROGRAM_ASSIGNED',
   'New program assigned', 'Your coach assigned you "Beginner Strength — 4 Week".',
   'info'::notification_severity, 'USER'::notification_audience_type,
   (SELECT id FROM "user" WHERE email='user@motionhive.fit')),
  (pg_temp.seed_uuid('ntf:user:message'), 'MESSAGE_RECEIVED',
   'New message', 'You have a new message from your coach.',
   'info'::notification_severity, 'USER'::notification_audience_type,
   (SELECT id FROM "user" WHERE email='user@motionhive.fit')),
  (pg_temp.seed_uuid('ntf:user:payment'), 'PAYMENT_RECEIVED',
   'Payment received', 'Your payment of 150.00 RON was received. Thank you!',
   'success'::notification_severity, 'USER'::notification_audience_type,
   (SELECT id FROM "user" WHERE email='user@motionhive.fit')),
  (pg_temp.seed_uuid('ntf:instr:request'), 'CLIENT_REQUEST',
   'New client request', 'Mihai Ionescu requested to train with you.',
   'info'::notification_severity, 'USER'::notification_audience_type,
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'))
ON CONFLICT DO NOTHING;

INSERT INTO notification_receipt (id, notification_id, user_id, delivered_at, read_at, delivered_channels)
VALUES
  (pg_temp.seed_uuid('ntr:user:program'), pg_temp.seed_uuid('ntf:user:program'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   CURRENT_TIMESTAMP - INTERVAL '7 days', CURRENT_TIMESTAMP - INTERVAL '6 days', '{"in_app":true}'::jsonb),
  (pg_temp.seed_uuid('ntr:user:message'), pg_temp.seed_uuid('ntf:user:message'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   CURRENT_TIMESTAMP - INTERVAL '2 hours', NULL, '{"in_app":true}'::jsonb),
  (pg_temp.seed_uuid('ntr:user:payment'), pg_temp.seed_uuid('ntf:user:payment'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   CURRENT_TIMESTAMP - INTERVAL '5 days', NULL, '{"in_app":true}'::jsonb),
  (pg_temp.seed_uuid('ntr:instr:request'), pg_temp.seed_uuid('ntf:instr:request'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   CURRENT_TIMESTAMP - INTERVAL '1 day', NULL, '{"in_app":true}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO notification_preference (id, user_id, type, channels)
SELECT pg_temp.seed_uuid('np:'||u.email||':'||t.type),
       (SELECT id FROM "user" WHERE email = u.email),
       t.type, '{"in_app":true,"email":true,"push":false}'::jsonb
FROM (VALUES ('user@motionhive.fit'), ('instructor@motionhive.fit')) AS u(email)
CROSS JOIN (VALUES ('MESSAGE_RECEIVED'), ('PROGRAM_ASSIGNED'), ('PAYMENT_RECEIVED')) AS t(type)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 10. COMMERCE  (invoices + a payment — FAKE stripe ids, see header)
-- =====================================================================
INSERT INTO invoice (id, instructor_id, client_id, stripe_customer_id, number, status,
                     amount_due_cents, amount_paid_cents, amount_remaining_cents, currency,
                     description, finalized_at, paid_at, due_date)
VALUES
  (pg_temp.seed_uuid('inv:user:1'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   'cus_demo_user', 'INV-DEMO-0001', 'paid',
   15000, 15000, 0, 'RON', 'Monthly coaching — May',
   CURRENT_TIMESTAMP - INTERVAL '35 days', CURRENT_TIMESTAMP - INTERVAL '34 days', NULL),
  (pg_temp.seed_uuid('inv:user:2'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   'cus_demo_user', 'INV-DEMO-0002', 'open',
   15000, 0, 15000, 'RON', 'Monthly coaching — June',
   CURRENT_TIMESTAMP - INTERVAL '5 days', NULL, CURRENT_TIMESTAMP + INTERVAL '10 days')
ON CONFLICT DO NOTHING;

INSERT INTO payment (id, invoice_id, instructor_id, client_id, stripe_payment_intent_id,
                     amount_cents, currency, status, payment_method_type, paid_at)
VALUES
  (pg_temp.seed_uuid('pay:user:1'), pg_temp.seed_uuid('inv:user:1'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   'pi_demo_0001', 15000, 'RON', 'succeeded', 'card',
   CURRENT_TIMESTAMP - INTERVAL '34 days')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 11. GROUP FEED  (post + comment + reaction)
-- =====================================================================
INSERT INTO post (id, author_id, group_id, content, approval_state, posted_at)
VALUES
  (pg_temp.seed_uuid('post:welcome'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   pg_temp.seed_uuid('grp:test-strength-club'),
   'Welcome to the Test Strength Club! Drop a comment and introduce yourself. 👋',
   'APPROVED'::post_audience_approval, CURRENT_TIMESTAMP - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

INSERT INTO post_comment (id, post_id, author_id, content)
VALUES
  (pg_temp.seed_uuid('cmt:welcome:user'), pg_temp.seed_uuid('post:welcome'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   'Excited to be here! 🔥')
ON CONFLICT DO NOTHING;

INSERT INTO post_reaction (id, post_id, author_id, reaction_type)
VALUES
  (pg_temp.seed_uuid('rx:welcome:user'), pg_temp.seed_uuid('post:welcome'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'), 'LIKE')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 12. COACH-OWNED EXERCISES  ( /coaching/exercises -> owner_id = me )
--     source=INSTRUCTOR, owner_id=instructor. One PUBLIC, rest PRIVATE.
-- =====================================================================
INSERT INTO exercise (id, name, slug, kind, level, movement_pattern, mechanic, force,
                      source, owner_id, visibility, media_kind)
SELECT pg_temp.seed_uuid('ex:'||x.slug), x.name, x.slug,
       x.kind::exercise_kind, x.lvl::exercise_level, x.mp::movement_pattern,
       x.mech::exercise_mechanic, x.frc::exercise_force, 'INSTRUCTOR'::exercise_source,
       (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
       x.vis::exercise_visibility, 'NONE'::exercise_media_kind
FROM (VALUES
  ('coach-bulgarian-split-squat','Bulgarian Split Squat','STRENGTH','INTERMEDIATE','LUNGE','COMPOUND','PUSH','PRIVATE'),
  ('coach-farmers-carry','Farmer''s Carry','STRENGTH','BEGINNER','CARRY','COMPOUND','STATIC','PRIVATE'),
  ('coach-band-pull-apart','Band Pull-Apart','STRENGTH','BEGINNER','PULL_HORIZONTAL','ISOLATION','PULL','PRIVATE'),
  ('coach-burpee','Coach''s Burpee','BODYWEIGHT','BEGINNER','LOCOMOTION','COMPOUND','PUSH','PUBLIC')
) AS x(slug, name, kind, lvl, mp, mech, frc, vis)
ON CONFLICT DO NOTHING;

INSERT INTO exercise_muscle (exercise_id, muscle_id, role)
SELECT pg_temp.seed_uuid('ex:'||x.ex), m.id, x.role::muscle_role
FROM (VALUES
  ('coach-bulgarian-split-squat','quadriceps','PRIMARY'),('coach-bulgarian-split-squat','glutes','SECONDARY'),
  ('coach-farmers-carry','forearms','PRIMARY'),('coach-farmers-carry','traps','SECONDARY'),
  ('coach-band-pull-apart','shoulders','PRIMARY'),('coach-band-pull-apart','middle_back','SECONDARY'),
  ('coach-burpee','quadriceps','PRIMARY'),('coach-burpee','chest','SECONDARY')
) AS x(ex, muscle, role)
JOIN muscle m ON m.slug = x.muscle
ON CONFLICT DO NOTHING;

INSERT INTO exercise_equipment (exercise_id, equipment_id)
SELECT pg_temp.seed_uuid('ex:'||x.ex), e.id
FROM (VALUES
  ('coach-bulgarian-split-squat','dumbbell'),('coach-farmers-carry','dumbbell'),
  ('coach-band-pull-apart','bands'),('coach-burpee','bodyweight')
) AS x(ex, equip)
JOIN equipment e ON e.slug = x.equip
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 13. MORE PROGRAMS  ( /coaching/programs — varied statuses )
-- =====================================================================
INSERT INTO program (id, owner_id, name, description, kind, status, duration_days, goal_tags)
VALUES
  (pg_temp.seed_uuid('prog:hypertrophy'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   'Hypertrophy Block — 6 Week', 'A push/pull/legs split for muscle growth.',
   'WORKOUT'::program_kind, 'PUBLISHED'::program_status, 42, '["hypertrophy"]'::jsonb),
  (pg_temp.seed_uuid('prog:fat-loss'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   'Fat Loss Circuit', 'Full-body conditioning circuits (work in progress).',
   'WORKOUT'::program_kind, 'DRAFT'::program_status, NULL, '["fat_loss","conditioning"]'::jsonb),
  (pg_temp.seed_uuid('prog:old-archived'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   'Legacy Beginner Plan', 'Retired program kept for reference.',
   'WORKOUT'::program_kind, 'ARCHIVED'::program_status, 28, NULL)
ON CONFLICT DO NOTHING;

-- Hypertrophy workouts (Push / Pull / Legs)
INSERT INTO program_workout (id, program_id, name, week_index, day_index, sequence_number, estimated_duration_minutes)
VALUES
  (pg_temp.seed_uuid('pw:hyp-push'), pg_temp.seed_uuid('prog:hypertrophy'), 'Push Day', 0, 0, 0, 55),
  (pg_temp.seed_uuid('pw:hyp-pull'), pg_temp.seed_uuid('prog:hypertrophy'), 'Pull Day', 0, 1, 1, 55),
  (pg_temp.seed_uuid('pw:hyp-legs'), pg_temp.seed_uuid('prog:hypertrophy'), 'Leg Day',  0, 2, 2, 60)
ON CONFLICT DO NOTHING;

INSERT INTO prescribed_exercise (id, program_workout_id, exercise_id, order_index)
SELECT pg_temp.seed_uuid('pe:'||p.wkey||':'||p.ex), pg_temp.seed_uuid('pw:'||p.wkey),
       pg_temp.seed_uuid('ex:'||p.ex), p.ord
FROM (VALUES
  ('hyp-push','bench-press',0),('hyp-push','overhead-press',1),('hyp-push','coach-burpee',2),
  ('hyp-pull','barbell-row',0),('hyp-pull','pull-up',1),('hyp-pull','dumbbell-curl',2),
  ('hyp-legs','back-squat',0),('hyp-legs','romanian-deadlift',1),
  ('hyp-legs','coach-bulgarian-split-squat',2),('hyp-legs','walking-lunge',3)
) AS p(wkey, ex, ord)
ON CONFLICT DO NOTHING;

-- 3 hypertrophy working sets per exercise (10-15 reps)
INSERT INTO prescribed_set (id, prescribed_exercise_id, order_index, set_type,
                            target_reps_min, target_reps_max, target_rpe, rest_after_seconds)
SELECT pg_temp.seed_uuid('ps:'||pe.id||':'||g), pe.id, g, 'WORKING'::exercise_set_type, 10, 15, 8.0, 75
FROM prescribed_exercise pe
JOIN program_workout pw ON pw.id = pe.program_workout_id
CROSS JOIN generate_series(0,2) AS g
WHERE pw.program_id = pg_temp.seed_uuid('prog:hypertrophy')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 14. MORE PLANS for user@  ( /user/plans — varied statuses )
-- =====================================================================
-- Hypertrophy assigned ACTIVE (with full deep-copied tree)
INSERT INTO program_assignment (id, instructor_id, client_id, instructor_client_id,
                                master_program_id, program_name_snapshot, status,
                                start_date, completion_percent, notes)
VALUES
  (pg_temp.seed_uuid('pa:user:hyp'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   (SELECT id FROM instructor_client
      WHERE instructor_id=(SELECT id FROM "user" WHERE email='instructor@motionhive.fit')
        AND client_id=(SELECT id FROM "user" WHERE email='user@motionhive.fit')
        AND status='ACTIVE' LIMIT 1),
   pg_temp.seed_uuid('prog:hypertrophy'), 'Hypertrophy Block — 6 Week',
   'ACTIVE'::program_assignment_status, CURRENT_DATE - 3, 15, 'Phase 1 — accumulation.'),
  -- Fat Loss assigned PENDING (no tree yet)
  (pg_temp.seed_uuid('pa:user:fatloss'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   (SELECT id FROM instructor_client
      WHERE instructor_id=(SELECT id FROM "user" WHERE email='instructor@motionhive.fit')
        AND client_id=(SELECT id FROM "user" WHERE email='user@motionhive.fit')
        AND status='ACTIVE' LIMIT 1),
   pg_temp.seed_uuid('prog:fat-loss'), 'Fat Loss Circuit',
   'PENDING'::program_assignment_status, CURRENT_DATE + 3, 0, 'Starts next week.'),
  -- A finished plan in the past (COMPLETED)
  (pg_temp.seed_uuid('pa:user:past'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   (SELECT id FROM instructor_client
      WHERE instructor_id=(SELECT id FROM "user" WHERE email='instructor@motionhive.fit')
        AND client_id=(SELECT id FROM "user" WHERE email='user@motionhive.fit')
        AND status='ACTIVE' LIMIT 1),
   pg_temp.seed_uuid('prog:beginner-strength'), 'Beginner Strength — 4 Week',
   'COMPLETED'::program_assignment_status, CURRENT_DATE - 60, 100, 'Completed — great work!')
ON CONFLICT DO NOTHING;

-- Deep-copy the hypertrophy program tree into the ACTIVE assignment
INSERT INTO assigned_workout (id, program_assignment_id, master_workout_id, name, notes,
                              week_index, day_index, sequence_number, phase,
                              estimated_duration_minutes, scheduled_date, status)
SELECT pg_temp.seed_uuid('aw:'||pw.id), pg_temp.seed_uuid('pa:user:hyp'), pw.id, pw.name, pw.notes,
       pw.week_index, pw.day_index, pw.sequence_number, pw.phase, pw.estimated_duration_minutes,
       (CURRENT_DATE - 3) + (pw.week_index*7 + pw.day_index),
       CASE pw.sequence_number WHEN 0 THEN 'COMPLETED'::workout_log_status
                               WHEN 1 THEN 'COMPLETED'::workout_log_status ELSE NULL END
FROM program_workout pw
WHERE pw.program_id = pg_temp.seed_uuid('prog:hypertrophy')
ON CONFLICT DO NOTHING;

INSERT INTO assigned_exercise (id, assigned_workout_id, exercise_id, master_exercise_id,
                               superset_group_id, order_index, notes, alternate_exercise_id, is_modified_from_master)
SELECT pg_temp.seed_uuid('ae:'||pe.id), pg_temp.seed_uuid('aw:'||pe.program_workout_id),
       pe.exercise_id, pe.id, pe.superset_group_id, pe.order_index, pe.notes, pe.alternate_exercise_id, false
FROM prescribed_exercise pe
JOIN program_workout pw ON pw.id = pe.program_workout_id
WHERE pw.program_id = pg_temp.seed_uuid('prog:hypertrophy')
ON CONFLICT DO NOTHING;

INSERT INTO assigned_set (id, assigned_exercise_id, master_set_id, order_index, set_type,
                          target_reps_min, target_reps_max, target_weight_kg, target_weight_percent_1rm,
                          target_duration_seconds, target_distance_meters, target_rpe, target_rir,
                          rest_after_seconds, tempo, notes)
SELECT pg_temp.seed_uuid('as:'||ps.id), pg_temp.seed_uuid('ae:'||ps.prescribed_exercise_id),
       ps.id, ps.order_index, ps.set_type, ps.target_reps_min, ps.target_reps_max, ps.target_weight_kg,
       ps.target_weight_percent_1rm, ps.target_duration_seconds, ps.target_distance_meters,
       ps.target_rpe, ps.target_rir, ps.rest_after_seconds, ps.tempo, ps.notes
FROM prescribed_set ps
JOIN prescribed_exercise pe ON pe.id = ps.prescribed_exercise_id
JOIN program_workout pw ON pw.id = pe.program_workout_id
WHERE pw.program_id = pg_temp.seed_uuid('prog:hypertrophy')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 15. MORE COMPLETED WORKOUTS for user@  ( /user/workouts shows COMPLETED )
-- =====================================================================
INSERT INTO workout_log (id, user_id, program_assignment_id, assigned_workout_id, name,
                         status, started_at, completed_at, duration_seconds, feeling_rating, notes)
VALUES
  (pg_temp.seed_uuid('wl:hyp-push'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   pg_temp.seed_uuid('pa:user:hyp'), pg_temp.seed_uuid('aw:'||pg_temp.seed_uuid('pw:hyp-push')),
   'Push Day', 'COMPLETED'::workout_log_status,
   CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '3 days' + INTERVAL '58 minutes',
   3480, 5, 'Great pump.'),
  (pg_temp.seed_uuid('wl:hyp-pull'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   pg_temp.seed_uuid('pa:user:hyp'), pg_temp.seed_uuid('aw:'||pg_temp.seed_uuid('pw:hyp-pull')),
   'Pull Day', 'COMPLETED'::workout_log_status,
   CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '54 minutes',
   3240, 4, 'Back is sore!'),
  (pg_temp.seed_uuid('wl:freestyle'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   NULL, NULL, 'Quick Mobility', 'COMPLETED'::workout_log_status,
   CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days' + INTERVAL '20 minutes',
   1200, 4, 'Freestyle session.')
ON CONFLICT DO NOTHING;

-- logged_exercise + logged_set copied from the two assigned hypertrophy workouts
WITH log_map(aw_id, wl_id) AS (
  VALUES
    (pg_temp.seed_uuid('aw:'||pg_temp.seed_uuid('pw:hyp-push')), pg_temp.seed_uuid('wl:hyp-push')),
    (pg_temp.seed_uuid('aw:'||pg_temp.seed_uuid('pw:hyp-pull')), pg_temp.seed_uuid('wl:hyp-pull'))
)
INSERT INTO logged_exercise (id, workout_log_id, exercise_id, assigned_exercise_id,
                             exercise_name_snapshot, exercise_thumbnail_url_snapshot,
                             order_index, superset_group_id, notes)
SELECT pg_temp.seed_uuid('le:'||ae.id), lm.wl_id, ae.exercise_id, ae.id,
       ex.name, ex.thumbnail_url, ae.order_index, ae.superset_group_id, NULL
FROM assigned_exercise ae
JOIN log_map lm ON lm.aw_id = ae.assigned_workout_id
JOIN exercise ex ON ex.id = ae.exercise_id
ON CONFLICT DO NOTHING;

WITH log_map(aw_id) AS (
  VALUES (pg_temp.seed_uuid('aw:'||pg_temp.seed_uuid('pw:hyp-push'))),
         (pg_temp.seed_uuid('aw:'||pg_temp.seed_uuid('pw:hyp-pull')))
)
INSERT INTO logged_set (id, logged_exercise_id, assigned_set_id, order_index, set_type,
                        reps, weight_kg, duration_seconds, rpe, rest_after_seconds, is_completed, completed_at)
SELECT pg_temp.seed_uuid('ls:'||asx.id), pg_temp.seed_uuid('le:'||asx.assigned_exercise_id),
       asx.id, asx.order_index, asx.set_type,
       COALESCE(asx.target_reps_max, asx.target_reps_min), asx.target_weight_kg,
       asx.target_duration_seconds, asx.target_rpe, asx.rest_after_seconds,
       true, CURRENT_TIMESTAMP - INTERVAL '2 days'
FROM assigned_set asx
JOIN assigned_exercise ae ON ae.id = asx.assigned_exercise_id
JOIN log_map lm ON lm.aw_id = ae.assigned_workout_id
ON CONFLICT DO NOTHING;

-- freestyle log: a couple of ad-hoc logged sets (no assignment link)
INSERT INTO logged_exercise (id, workout_log_id, exercise_id, assigned_exercise_id,
                             exercise_name_snapshot, order_index)
VALUES
  (pg_temp.seed_uuid('le:freestyle:plank'), pg_temp.seed_uuid('wl:freestyle'),
   pg_temp.seed_uuid('ex:plank'), NULL, 'Plank', 0)
ON CONFLICT DO NOTHING;

INSERT INTO logged_set (id, logged_exercise_id, order_index, set_type, duration_seconds,
                        is_completed, completed_at)
VALUES
  (pg_temp.seed_uuid('ls:freestyle:plank:1'), pg_temp.seed_uuid('le:freestyle:plank'), 0,
   'WORKING'::exercise_set_type, 60, true, CURRENT_TIMESTAMP - INTERVAL '2 days'),
  (pg_temp.seed_uuid('ls:freestyle:plank:2'), pg_temp.seed_uuid('le:freestyle:plank'), 1,
   'WORKING'::exercise_set_type, 45, true, CURRENT_TIMESTAMP - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 16. SESSIONS  (venues -> templates -> instances -> participants -> reminders)
--     Covers /coaching/sessions and every /user/sessions tab.
--     enum columns use bare string literals (Postgres coerces to the
--     column's enum type), so the exact enum type name isn't needed.
-- =====================================================================
-- Venues owned by the coach.
-- NB: venue.instructor_id references instructor_profile.id (NOT user.id).
INSERT INTO venue (id, instructor_id, kind, is_online, name, line1, city, region,
                   postal_code, country_code, meeting_url, meeting_provider, is_active, display_order)
VALUES
  (pg_temp.seed_uuid('ven:downtown-gym'),
   (SELECT id FROM instructor_profile
      WHERE user_id=(SELECT id FROM "user" WHERE email='instructor@motionhive.fit')),
   'GYM', false, 'Downtown Strength Gym', 'Str. Victoriei 10', 'Bucharest', 'Bucuresti',
   '010101', 'RO', NULL, NULL, true, 0),
  (pg_temp.seed_uuid('ven:online-zoom'),
   (SELECT id FROM instructor_profile
      WHERE user_id=(SELECT id FROM "user" WHERE email='instructor@motionhive.fit')),
   'ONLINE', true, 'Online (Zoom)', NULL, NULL, NULL, NULL, NULL,
   'https://zoom.us/j/123456789', 'ZOOM', true, 1)
ON CONFLICT DO NOTHING;

-- Templates: one recurring group class, one private online call, one free open class
INSERT INTO session_template (id, instructor_id, group_id, venue_id, slug, title, description,
                              type, access, approval_required, location_kind, meeting_url, meeting_provider,
                              duration_minutes, capacity, waitlist_enabled, cancellation_cutoff_hours,
                              price_amount_cents, price_currency, is_recurring, recurrence_rule,
                              first_start_at, status)
VALUES
  (pg_temp.seed_uuid('st:morning-hiit'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), NULL,
   pg_temp.seed_uuid('ven:downtown-gym'), 'morning-hiit', 'Morning HIIT',
   'High-intensity group conditioning to start the day.',
   'GROUP', 'OPEN', false, 'IN_PERSON', NULL, NULL,
   45, 12, true, 24, 5000, 'RON', true,
   '{"frequency":"WEEKLY","interval":1,"daysOfWeek":["MON","WED"]}'::jsonb,
   CURRENT_TIMESTAMP - INTERVAL '7 days', 'ACTIVE'),
  (pg_temp.seed_uuid('st:coaching-call'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), NULL,
   pg_temp.seed_uuid('ven:online-zoom'), 'coaching-call-1-1', '1:1 Coaching Call',
   'Private online coaching and check-in.',
   'PRIVATE', 'CLIENTS_ONLY', true, 'ONLINE', 'https://zoom.us/j/123456789', 'ZOOM',
   60, 1, false, 24, 15000, 'RON', false, NULL,
   CURRENT_TIMESTAMP + INTERVAL '3 days', 'ACTIVE'),
  (pg_temp.seed_uuid('st:open-mobility'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), NULL,
   pg_temp.seed_uuid('ven:downtown-gym'), 'open-mobility', 'Open Mobility Class',
   'Free drop-in mobility and stretching.',
   'OPEN', 'FREE', false, 'IN_PERSON', NULL, NULL,
   30, 20, true, 12, 0, 'RON', true,
   '{"frequency":"WEEKLY","interval":1,"daysOfWeek":["FRI"]}'::jsonb,
   CURRENT_TIMESTAMP - INTERVAL '3 days', 'ACTIVE')
ON CONFLICT DO NOTHING;

-- Instances (counters baked to match the participants seeded below)
INSERT INTO session_instance (id, template_id, instructor_id, occurrence_index, start_at, end_at,
                              status, confirmed_count, pending_approval_count, waitlisted_count,
                              attended_count, cancel_reason, cancelled_at)
VALUES
  -- Morning HIIT: past completed, then two upcoming
  (pg_temp.seed_uuid('si:hiit:past'), pg_temp.seed_uuid('st:morning-hiit'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 0,
   CURRENT_TIMESTAMP - INTERVAL '7 days', CURRENT_TIMESTAMP - INTERVAL '7 days' + INTERVAL '45 minutes',
   'COMPLETED', 1, 0, 0, 1, NULL, NULL),
  (pg_temp.seed_uuid('si:hiit:next'), pg_temp.seed_uuid('st:morning-hiit'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 1,
   CURRENT_TIMESTAMP + INTERVAL '2 days', CURRENT_TIMESTAMP + INTERVAL '2 days' + INTERVAL '45 minutes',
   'SCHEDULED', 2, 0, 0, NULL, NULL, NULL),
  (pg_temp.seed_uuid('si:hiit:later'), pg_temp.seed_uuid('st:morning-hiit'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 2,
   CURRENT_TIMESTAMP + INTERVAL '9 days', CURRENT_TIMESTAMP + INTERVAL '9 days' + INTERVAL '45 minutes',
   'SCHEDULED', 0, 0, 0, NULL, NULL, NULL),
  -- 1:1 Coaching Call: upcoming, pending approval
  (pg_temp.seed_uuid('si:call:next'), pg_temp.seed_uuid('st:coaching-call'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 0,
   CURRENT_TIMESTAMP + INTERVAL '3 days', CURRENT_TIMESTAMP + INTERVAL '3 days' + INTERVAL '60 minutes',
   'SCHEDULED', 0, 1, 0, NULL, NULL, NULL),
  -- Open Mobility: upcoming (waitlisted client) + a cancelled one
  (pg_temp.seed_uuid('si:mob:next'), pg_temp.seed_uuid('st:open-mobility'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 0,
   CURRENT_TIMESTAMP + INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '5 days' + INTERVAL '30 minutes',
   'SCHEDULED', 0, 0, 1, NULL, NULL, NULL),
  (pg_temp.seed_uuid('si:mob:cancelled'), pg_temp.seed_uuid('st:open-mobility'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 1,
   CURRENT_TIMESTAMP + INTERVAL '6 days', CURRENT_TIMESTAMP + INTERVAL '6 days' + INTERVAL '30 minutes',
   'CANCELLED', 0, 0, 0, NULL, 'Instructor unavailable.', CURRENT_TIMESTAMP - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- Participants — one per /user/sessions tab for user@, plus Anna for a confirmed count
INSERT INTO session_participant (id, instance_id, user_id, status, attended, checked_in_at,
                                 snapshot_price_cents, snapshot_currency, snapshot_cancel_cutoff_h,
                                 snapshot_location_text, snapshot_meeting_url,
                                 booked_at, approved_at, cancelled_at, cancel_reason, waitlist_position)
VALUES
  -- upcoming (CONFIRMED) — user@ on next Morning HIIT
  (pg_temp.seed_uuid('sp:user:hiit-next'), pg_temp.seed_uuid('si:hiit:next'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'), 'CONFIRMED', NULL, NULL,
   5000, 'RON', 24, 'Downtown Strength Gym, Bucharest', NULL,
   CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 day', NULL, NULL, NULL),
  -- Anna also confirmed on the same instance
  (pg_temp.seed_uuid('sp:anna:hiit-next'), pg_temp.seed_uuid('si:hiit:next'),
   pg_temp.seed_uuid('user:anna'), 'CONFIRMED', NULL, NULL,
   5000, 'RON', 24, 'Downtown Strength Gym, Bucharest', NULL,
   CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days', NULL, NULL, NULL),
  -- past (CONFIRMED + attended) — user@ on completed Morning HIIT
  (pg_temp.seed_uuid('sp:user:hiit-past'), pg_temp.seed_uuid('si:hiit:past'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'), 'CONFIRMED', true,
   CURRENT_TIMESTAMP - INTERVAL '7 days',
   5000, 'RON', 24, 'Downtown Strength Gym, Bucharest', NULL,
   CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP - INTERVAL '10 days', NULL, NULL, NULL),
  -- pending approval — user@ on the 1:1 call
  (pg_temp.seed_uuid('sp:user:call'), pg_temp.seed_uuid('si:call:next'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'), 'PENDING_APPROVAL', NULL, NULL,
   15000, 'RON', 24, NULL, 'https://zoom.us/j/123456789',
   CURRENT_TIMESTAMP - INTERVAL '6 hours', NULL, NULL, NULL, NULL),
  -- waitlisted — user@ on Open Mobility
  (pg_temp.seed_uuid('sp:user:mob'), pg_temp.seed_uuid('si:mob:next'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'), 'WAITLISTED', NULL, NULL,
   0, 'RON', 12, 'Downtown Strength Gym, Bucharest', NULL,
   CURRENT_TIMESTAMP - INTERVAL '2 hours', NULL, NULL, NULL, 1),
  -- cancelled — user@ on the cancelled Open Mobility
  (pg_temp.seed_uuid('sp:user:mob-cancelled'), pg_temp.seed_uuid('si:mob:cancelled'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'), 'CANCELLED', NULL, NULL,
   0, 'RON', 12, 'Downtown Strength Gym, Bucharest', NULL,
   CURRENT_TIMESTAMP - INTERVAL '3 days', NULL, CURRENT_TIMESTAMP - INTERVAL '1 day',
   'Session was cancelled by the coach.', NULL)
ON CONFLICT DO NOTHING;

-- Reminders for user@'s upcoming confirmed booking
INSERT INTO session_reminder_schedule (id, instance_id, participant_id, kind, fire_at)
VALUES
  (pg_temp.seed_uuid('srs:user:hiit-24h'), pg_temp.seed_uuid('si:hiit:next'),
   pg_temp.seed_uuid('sp:user:hiit-next'), 'REMINDER_24H', CURRENT_TIMESTAMP + INTERVAL '2 days' - INTERVAL '24 hours'),
  (pg_temp.seed_uuid('srs:user:hiit-1h'), pg_temp.seed_uuid('si:hiit:next'),
   pg_temp.seed_uuid('sp:user:hiit-next'), 'REMINDER_1H', CURRENT_TIMESTAMP + INTERVAL '2 days' - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 17. MORE CLIENT DATA for user@  ( fills out every /user/* surface )
-- =====================================================================

-- 17a. ROUTINES  ( /user/workouts?tab=routines -> GET /routines, user_id=me )
INSERT INTO routine (id, user_id, name, notes, folder, last_performed_at)
VALUES
  (pg_temp.seed_uuid('rt:push'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   'Push Power', 'My go-to push session.', 'Strength', CURRENT_TIMESTAMP - INTERVAL '8 days'),
  (pg_temp.seed_uuid('rt:fullbody'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   'Full Body Express', '30-minute full body.', 'Quick', CURRENT_TIMESTAMP - INTERVAL '2 days'),
  (pg_temp.seed_uuid('rt:legs'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   'Leg Burner', NULL, 'Strength', CURRENT_TIMESTAMP - INTERVAL '5 days'),
  (pg_temp.seed_uuid('rt:core'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   'Core Finisher', 'Quick core work after cardio.', NULL, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO routine_exercise (id, routine_id, exercise_id, order_index, default_sets,
                              target_reps_min, target_reps_max, target_weight_kg, rest_after_seconds)
SELECT pg_temp.seed_uuid('re:'||r.rkey||':'||r.ex), pg_temp.seed_uuid('rt:'||r.rkey),
       pg_temp.seed_uuid('ex:'||r.ex), r.ord, r.sets, r.rmin, r.rmax, r.wt, r.rest
FROM (VALUES
  ('push','bench-press',0,3,8,10,60.0,120),('push','overhead-press',1,3,8,12,35.0,90),('push','dumbbell-curl',2,3,10,15,12.0,60),
  ('fullbody','back-squat',0,3,8,10,80.0,120),('fullbody','barbell-row',1,3,8,12,50.0,90),('fullbody','plank',2,3,NULL,NULL,NULL,60),
  ('legs','back-squat',0,4,6,8,90.0,150),('legs','romanian-deadlift',1,3,8,12,70.0,120),('legs','walking-lunge',2,3,10,12,NULL,90),('legs','coach-burpee',3,3,12,15,NULL,60),
  ('core','plank',0,3,NULL,NULL,NULL,60),('core','dumbbell-curl',1,3,12,15,10.0,45)
) AS r(rkey, ex, ord, sets, rmin, rmax, wt, rest)
ON CONFLICT DO NOTHING;

-- 17b. COMPLETED WORKOUTS materialized FROM routines (mirrors POST /routines/:id/start)
--      -> richer /user/workouts history. Map of (routine -> log, performed-at):
INSERT INTO workout_log (id, user_id, name, status, started_at, completed_at, duration_seconds, feeling_rating)
SELECT pg_temp.seed_uuid('wl:rt:'||m.rkey),
       (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
       r.name, 'COMPLETED'::workout_log_status, m.ts, m.ts + INTERVAL '50 minutes', 3000, 4
FROM (VALUES
  ('push',  CURRENT_TIMESTAMP - INTERVAL '8 days'),
  ('fullbody', CURRENT_TIMESTAMP - INTERVAL '2 days'),
  ('legs',  CURRENT_TIMESTAMP - INTERVAL '5 days')
) AS m(rkey, ts)
JOIN routine r ON r.id = pg_temp.seed_uuid('rt:'||m.rkey)
ON CONFLICT DO NOTHING;

INSERT INTO logged_exercise (id, workout_log_id, exercise_id, exercise_name_snapshot,
                             exercise_thumbnail_url_snapshot, order_index)
SELECT pg_temp.seed_uuid('le:rt:'||re.id), pg_temp.seed_uuid('wl:rt:'||m.rkey),
       re.exercise_id, ex.name, ex.thumbnail_url, re.order_index
FROM (VALUES ('push'),('fullbody'),('legs')) AS m(rkey)
JOIN routine_exercise re ON re.routine_id = pg_temp.seed_uuid('rt:'||m.rkey)
JOIN exercise ex ON ex.id = re.exercise_id
ON CONFLICT DO NOTHING;

INSERT INTO logged_set (id, logged_exercise_id, order_index, set_type, reps, weight_kg,
                        rest_after_seconds, is_completed, completed_at)
SELECT pg_temp.seed_uuid('ls:rt:'||re.id||':'||g), pg_temp.seed_uuid('le:rt:'||re.id), g,
       'WORKING'::exercise_set_type, COALESCE(re.target_reps_max, re.target_reps_min),
       re.target_weight_kg, re.rest_after_seconds, true, wl.started_at
FROM (VALUES ('push'),('fullbody'),('legs')) AS m(rkey)
JOIN routine_exercise re ON re.routine_id = pg_temp.seed_uuid('rt:'||m.rkey)
JOIN workout_log wl ON wl.id = pg_temp.seed_uuid('wl:rt:'||m.rkey)
CROSS JOIN LATERAL generate_series(0, re.default_sets - 1) AS g
ON CONFLICT DO NOTHING;

-- 17c. PAUSED plan  ( completes /user/plans status coverage: ACTIVE/PENDING/COMPLETED/PAUSED )
INSERT INTO program_assignment (id, instructor_id, client_id, instructor_client_id,
                                master_program_id, program_name_snapshot, status,
                                start_date, completion_percent, notes)
VALUES
  (pg_temp.seed_uuid('pa:user:paused'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
   (SELECT id FROM instructor_client
      WHERE instructor_id=(SELECT id FROM "user" WHERE email='instructor@motionhive.fit')
        AND client_id=(SELECT id FROM "user" WHERE email='user@motionhive.fit')
        AND status='ACTIVE' LIMIT 1),
   pg_temp.seed_uuid('prog:old-archived'), 'Legacy Beginner Plan',
   'PAUSED'::program_assignment_status, CURRENT_DATE - 20, 45, 'Paused while travelling.')
ON CONFLICT DO NOTHING;

-- 17d. MORE SESSION BOOKINGS  ( richer /user/sessions Upcoming + Past tabs )
INSERT INTO session_instance (id, template_id, instructor_id, occurrence_index, start_at, end_at,
                              status, confirmed_count, pending_approval_count, waitlisted_count, attended_count)
VALUES
  (pg_temp.seed_uuid('si:hiit:past2'), pg_temp.seed_uuid('st:morning-hiit'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 3,
   CURRENT_TIMESTAMP - INTERVAL '14 days', CURRENT_TIMESTAMP - INTERVAL '14 days' + INTERVAL '45 minutes',
   'COMPLETED', 1, 0, 0, 1),
  (pg_temp.seed_uuid('si:hiit:past3'), pg_temp.seed_uuid('st:morning-hiit'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 4,
   CURRENT_TIMESTAMP - INTERVAL '21 days', CURRENT_TIMESTAMP - INTERVAL '21 days' + INTERVAL '45 minutes',
   'COMPLETED', 1, 0, 0, 1),
  (pg_temp.seed_uuid('si:mob:next2'), pg_temp.seed_uuid('st:open-mobility'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 2,
   CURRENT_TIMESTAMP + INTERVAL '12 days', CURRENT_TIMESTAMP + INTERVAL '12 days' + INTERVAL '30 minutes',
   'SCHEDULED', 1, 0, 0, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO session_participant (id, instance_id, user_id, status, attended, checked_in_at,
                                 snapshot_price_cents, snapshot_currency, snapshot_cancel_cutoff_h,
                                 snapshot_location_text, booked_at, approved_at)
VALUES
  (pg_temp.seed_uuid('sp:user:hiit-past2'), pg_temp.seed_uuid('si:hiit:past2'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'), 'CONFIRMED', true,
   CURRENT_TIMESTAMP - INTERVAL '14 days', 5000, 'RON', 24, 'Downtown Strength Gym, Bucharest',
   CURRENT_TIMESTAMP - INTERVAL '16 days', CURRENT_TIMESTAMP - INTERVAL '16 days'),
  (pg_temp.seed_uuid('sp:user:hiit-past3'), pg_temp.seed_uuid('si:hiit:past3'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'), 'CONFIRMED', true,
   CURRENT_TIMESTAMP - INTERVAL '21 days', 5000, 'RON', 24, 'Downtown Strength Gym, Bucharest',
   CURRENT_TIMESTAMP - INTERVAL '23 days', CURRENT_TIMESTAMP - INTERVAL '23 days'),
  (pg_temp.seed_uuid('sp:user:mob-next2'), pg_temp.seed_uuid('si:mob:next2'),
   (SELECT id FROM "user" WHERE email='user@motionhive.fit'), 'CONFIRMED', NULL, NULL,
   0, 'RON', 12, 'Downtown Strength Gym, Bucharest',
   CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 18. BULK DATA — 20 more of each list entity (generated, idempotent)
--     Keys are 'bulk-<n>' so re-runs are no-ops. To change volume, edit
--     the generate_series(1,20) bounds. Exercises are picked from the 10
--     SYSTEM exercises by index so workouts/routines reference real rows.
-- =====================================================================

-- 18a. 20 coach-owned exercises ( /coaching/exercises )
INSERT INTO exercise (id, name, slug, kind, level, mechanic, source, owner_id, visibility, media_kind)
SELECT pg_temp.seed_uuid('ex:bulk-'||n), 'Custom Exercise '||n, 'coach-custom-'||n,
       'STRENGTH'::exercise_kind, 'INTERMEDIATE'::exercise_level, 'COMPOUND'::exercise_mechanic,
       'INSTRUCTOR'::exercise_source,
       (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
       'PRIVATE'::exercise_visibility, 'NONE'::exercise_media_kind
FROM generate_series(1,20) AS n
ON CONFLICT DO NOTHING;

-- one PRIMARY muscle each (cycled) — satisfies the >=1 PRIMARY convention
INSERT INTO exercise_muscle (exercise_id, muscle_id, role)
SELECT pg_temp.seed_uuid('ex:bulk-'||n), m.id, 'PRIMARY'::muscle_role
FROM generate_series(1,20) AS n
JOIN LATERAL (
  SELECT id FROM muscle ORDER BY display_order OFFSET (n % 17) LIMIT 1
) m ON true
ON CONFLICT DO NOTHING;

-- 18b. 20 programs ( /coaching/programs ), statuses cycled
INSERT INTO program (id, owner_id, name, description, kind, status, duration_days)
SELECT pg_temp.seed_uuid('prog:bulk-'||n),
       (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
       'Program '||n, 'Demo program #'||n, 'WORKOUT'::program_kind,
       (ARRAY['DRAFT','PUBLISHED','PUBLISHED','ARCHIVED']::program_status[])[(n % 4) + 1],
       28
FROM generate_series(1,20) AS n
ON CONFLICT DO NOTHING;

-- 18c. 20 routines for user@ ( /user/workouts?tab=routines ), 3 exercises each
INSERT INTO routine (id, user_id, name, folder)
SELECT pg_temp.seed_uuid('rt:bulk-'||n),
       (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
       'Routine '||n, CASE WHEN n % 2 = 0 THEN 'Strength' ELSE 'Conditioning' END
FROM generate_series(1,20) AS n
ON CONFLICT DO NOTHING;

WITH sys AS (
  SELECT id, (row_number() OVER (ORDER BY slug) - 1) AS idx FROM exercise WHERE source='SYSTEM'
)
INSERT INTO routine_exercise (id, routine_id, exercise_id, order_index, default_sets,
                              target_reps_min, target_reps_max, rest_after_seconds)
SELECT pg_temp.seed_uuid('re:bulk-'||n||':'||k), pg_temp.seed_uuid('rt:bulk-'||n),
       sys.id, k, 3, 8, 12, 90
FROM generate_series(1,20) AS n
CROSS JOIN generate_series(0,2) AS k
JOIN sys ON sys.idx = (n + k) % 10
ON CONFLICT DO NOTHING;

-- 18d. 20 completed workout logs for user@ ( /user/workouts ), 2 exercises x 3 sets
INSERT INTO workout_log (id, user_id, name, status, started_at, completed_at, duration_seconds, feeling_rating)
SELECT pg_temp.seed_uuid('wl:bulk-'||n),
       (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
       'Session '||n, 'COMPLETED'::workout_log_status,
       CURRENT_TIMESTAMP - (n || ' days')::interval,
       CURRENT_TIMESTAMP - (n || ' days')::interval + INTERVAL '45 minutes',
       2700, (n % 5) + 1
FROM generate_series(1,20) AS n
ON CONFLICT DO NOTHING;

WITH sys AS (
  SELECT id, name, (row_number() OVER (ORDER BY slug) - 1) AS idx FROM exercise WHERE source='SYSTEM'
)
INSERT INTO logged_exercise (id, workout_log_id, exercise_id, exercise_name_snapshot, order_index)
SELECT pg_temp.seed_uuid('le:bulk-'||n||':'||k), pg_temp.seed_uuid('wl:bulk-'||n),
       sys.id, sys.name, k
FROM generate_series(1,20) AS n
CROSS JOIN generate_series(0,1) AS k
JOIN sys ON sys.idx = (n + k) % 10
ON CONFLICT DO NOTHING;

INSERT INTO logged_set (id, logged_exercise_id, order_index, set_type, reps, weight_kg, is_completed, completed_at)
SELECT pg_temp.seed_uuid('ls:bulk-'||n||':'||k||':'||s), pg_temp.seed_uuid('le:bulk-'||n||':'||k),
       s, 'WORKING'::exercise_set_type, 10, 40.0, true, CURRENT_TIMESTAMP - (n || ' days')::interval
FROM generate_series(1,20) AS n
CROSS JOIN generate_series(0,1) AS k
CROSS JOIN generate_series(0,2) AS s
ON CONFLICT DO NOTHING;

-- 18e. 20 plans (program assignments) for user@ ( /user/plans ), statuses cycled
INSERT INTO program_assignment (id, instructor_id, client_id, instructor_client_id,
                                master_program_id, program_name_snapshot, status,
                                start_date, completion_percent)
SELECT pg_temp.seed_uuid('pa:bulk-'||n),
       (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
       (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
       (SELECT id FROM instructor_client
          WHERE instructor_id=(SELECT id FROM "user" WHERE email='instructor@motionhive.fit')
            AND client_id=(SELECT id FROM "user" WHERE email='user@motionhive.fit')
            AND status='ACTIVE' LIMIT 1),
       pg_temp.seed_uuid('prog:bulk-'||n), 'Program '||n,
       (ARRAY['ACTIVE','PENDING','COMPLETED','PAUSED','CANCELLED']::program_assignment_status[])[(n % 5) + 1],
       CURRENT_DATE - n, (n * 5) % 100
FROM generate_series(1,20) AS n
ON CONFLICT DO NOTHING;

-- 18f. 20 sessions ( /coaching/sessions + /user/sessions )
--      template -> one instance (past or future) -> user@ participant.
INSERT INTO session_template (id, instructor_id, venue_id, slug, title, description, type, access,
                              approval_required, location_kind, duration_minutes, capacity, waitlist_enabled,
                              cancellation_cutoff_hours, price_amount_cents, price_currency, is_recurring,
                              first_start_at, status)
SELECT pg_temp.seed_uuid('st:bulk-'||n),
       (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
       pg_temp.seed_uuid('ven:downtown-gym'), 'bulk-session-'||n, 'Group Session '||n, 'Demo session #'||n,
       'GROUP'::session_type, 'OPEN'::session_access, false, 'IN_PERSON'::session_location_kind,
       45, 15, true, 24, 5000, 'RON', false,
       CURRENT_TIMESTAMP + ((n - 10) || ' days')::interval, 'ACTIVE'::session_template_status
FROM generate_series(1,20) AS n
ON CONFLICT DO NOTHING;

INSERT INTO session_instance (id, template_id, instructor_id, occurrence_index, start_at, end_at,
                              status, confirmed_count, attended_count)
SELECT pg_temp.seed_uuid('si:bulk-'||n), pg_temp.seed_uuid('st:bulk-'||n),
       (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'), 0,
       CURRENT_TIMESTAMP + ((n - 10) || ' days')::interval,
       CURRENT_TIMESTAMP + ((n - 10) || ' days')::interval + INTERVAL '45 minutes',
       (CASE WHEN n < 10 THEN 'COMPLETED' ELSE 'SCHEDULED' END)::session_instance_status,
       1, (CASE WHEN n < 10 THEN 1 ELSE NULL END)
FROM generate_series(1,20) AS n
ON CONFLICT DO NOTHING;

-- participant per instance for user@: past->CONFIRMED+attended, future-> mix
INSERT INTO session_participant (id, instance_id, user_id, status, attended,
                                 snapshot_price_cents, snapshot_currency, snapshot_cancel_cutoff_h,
                                 snapshot_location_text, booked_at, approved_at)
SELECT pg_temp.seed_uuid('sp:bulk-'||n), pg_temp.seed_uuid('si:bulk-'||n),
       (SELECT id FROM "user" WHERE email='user@motionhive.fit'),
       (CASE WHEN n < 16 THEN 'CONFIRMED'
             WHEN n < 18 THEN 'PENDING_APPROVAL'
             ELSE 'WAITLISTED' END)::session_participant_status,
       (CASE WHEN n < 10 THEN true ELSE NULL END),
       5000, 'RON', 24, 'Downtown Strength Gym, Bucharest',
       CURRENT_TIMESTAMP - INTERVAL '2 days',
       (CASE WHEN n < 16 THEN CURRENT_TIMESTAMP - INTERVAL '2 days' ELSE NULL END)
FROM generate_series(1,20) AS n
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 19. STOREFRONT POLISH  (public profile reads like a real coach on camera)
--     Migration 026 seeds this profile as "Test Instructor" with a generic
--     bio and NO handle, so the public /@handle page is broken and the
--     storefront preview looks like placeholder data. These UPDATEs give the
--     coach a real name, headline-grade bio, and a working handle. Local
--     cosmetic only; safe to re-run.
-- =====================================================================
UPDATE "user"
   SET first_name = 'Alex',
       last_name  = 'Rivera',
       handle     = 'alexrivera',
       avatar_url = 'https://i.pravatar.cc/400?img=12'
 WHERE email = 'instructor@motionhive.fit';

-- NB: certifications MUST be an array of OBJECTS ({name, issuer, year}). The
-- API's normalizeCertifications() drops any item that isn't an object, so the
-- old string-array form ('["NSCA-CPT", ...]' from migration 026) rendered as
-- nothing. These object rows actually show on the profile.
UPDATE instructor_profile
   SET display_name        = 'Alex Rivera',
       bio                 = 'Eleven years on the gym floor, from first timers to competitive lifters. I coach a small roster online and in person, and I keep it simple: show up, get strong, stay consistent. Every plan is built around your week, your goals, and the kit you can actually get to. Expect clear sessions, honest feedback, and progress you can measure. Strength and conditioning, plus the confidence that comes with both.',
       specializations     = '["Strength & Conditioning","Powerlifting","Fat Loss","HIIT","Beginner Friendly"]',
       certifications      = '[{"name":"Certified Strength & Conditioning Specialist","issuer":"NSCA","year":2015},{"name":"Level 2 Trainer","issuer":"CrossFit","year":2017},{"name":"Nutrition Coaching Level 1","issuer":"Precision Nutrition","year":2019}]',
       years_of_experience = 11,
       is_accepting_clients = TRUE,
       social_links        = '{"instagram":"@alexrivera","youtube":"@alexrivera"}',
       show_social_links   = TRUE,
       is_public           = TRUE
 WHERE user_id = (SELECT id FROM "user" WHERE email = 'instructor@motionhive.fit');

-- =====================================================================
-- 20. REVIEWS — intentionally NONE.
--     The public profile no longer surfaces reviews (the section was removed
--     from the FE), so we don't seed any. This DELETE also clears reviews left
--     by earlier runs of this seed, keeping re-runs consistent.
-- =====================================================================
DELETE FROM review
 WHERE instructor_profile_id = (
   SELECT id FROM instructor_profile
    WHERE user_id = (SELECT id FROM "user" WHERE email = 'instructor@motionhive.fit'));

-- =====================================================================
-- 21. CAMERA POLISH  (kill "Test …" placeholder names, enrich the feed)
--     Migration 026 names the client account "Test User" and the group
--     "Test Strength Club", which read as placeholder data in a screen
--     recording. Give them real names, upgrade the single welcome post to
--     a real coaching update with a little engagement, add a third venue,
--     and drop em-dashes from program names (content rule: no dashes as
--     punctuation). All UPDATEs key off stable ids/emails; safe to re-run.
-- =====================================================================
-- Real client identity (also fixes the review author + DM sender + participant name)
UPDATE "user"
   SET first_name = 'Sarah', last_name = 'Mitchell'
 WHERE email = 'user@motionhive.fit';

-- Group -> a real community name
UPDATE "group"
   SET name = 'Morning Crew',
       slug = 'morning-crew',
       description = 'Small in-person and online strength crew. We train early, keep each other honest, and celebrate every PB.'
 WHERE id = pg_temp.seed_uuid('grp:test-strength-club');

-- Migration 026 also seeds a bare "MotionHive Demo Group" (no logo, test
-- description) owned by the instructor. Give it a real name + picture too so
-- the coach's Communities section reads real on camera. Matched by slug so
-- it's independent of 026's generated id; a no-op once already renamed.
UPDATE "group"
   SET name        = 'Strength Club',
       slug        = 'strength-club',
       description = 'For the strength crowd. Weekly check ins, PB celebrations, and honest form feedback from the whole group.',
       logo_url    = 'https://picsum.photos/seed/strengthclub/600/400'
 WHERE slug = 'motionhive-demo'
   AND instructor_id = (SELECT id FROM "user" WHERE email = 'instructor@motionhive.fit');

-- Upgrade the welcome post into a real coaching update
UPDATE post
   SET content = 'Great session this morning, everyone. New PBs from Sarah and Mihai 💪 Recovery walk tomorrow at 8, meet by the entrance.'
 WHERE id = pg_temp.seed_uuid('post:welcome');

UPDATE post_comment
   SET content = 'That last set felt unreal. See you all tomorrow!'
 WHERE id = pg_temp.seed_uuid('cmt:welcome:user');

-- A second comment + second reaction so the feed looks alive
INSERT INTO post_comment (id, post_id, author_id, content)
VALUES
  (pg_temp.seed_uuid('cmt:welcome:anna'), pg_temp.seed_uuid('post:welcome'),
   pg_temp.seed_uuid('user:anna'), 'Recovery walk sounds perfect. Bringing coffee ☕')
ON CONFLICT DO NOTHING;

INSERT INTO post_reaction (id, post_id, author_id, reaction_type)
VALUES
  (pg_temp.seed_uuid('rx:welcome:anna'), pg_temp.seed_uuid('post:welcome'),
   pg_temp.seed_uuid('user:anna'), 'LIKE'),
  (pg_temp.seed_uuid('rx:welcome:mihai'), pg_temp.seed_uuid('post:welcome'),
   pg_temp.seed_uuid('user:mihai'), 'LIKE')
ON CONFLICT DO NOTHING;

-- A third venue (outdoor) so the venue picker / sessions read as lived-in
INSERT INTO venue (id, instructor_id, kind, is_online, name, line1, city, region,
                   postal_code, country_code, meeting_url, meeting_provider, is_active, display_order)
VALUES
  (pg_temp.seed_uuid('ven:riverside-park'),
   (SELECT id FROM instructor_profile
      WHERE user_id=(SELECT id FROM "user" WHERE email='instructor@motionhive.fit')),
   'OUTDOOR', false, 'Riverside Park', NULL, 'Bucharest', 'Bucuresti',
   NULL, 'RO', NULL, NULL, true, 2)
ON CONFLICT DO NOTHING;

-- Tidy em-dashes in seeded program names (content rule: no dashes as punctuation)
UPDATE program SET name = replace(name, ' — ', ', ') WHERE name LIKE '% — %';

-- =====================================================================
-- 22. STOREFRONT MEDIA + OFFERINGS  (pictures + products on the profile)
--     Real avatars (so faces show instead of preset illustrations), a group
--     logo, and 3 products with show_on_profile=true so the public profile's
--     offerings section is populated. Products carry NO Stripe ids — they
--     render in the profile/offerings list fine; only a *live* Stripe action
--     (checkout) would need real Stripe objects (see the payments clip note).
--     External image hosts (pravatar/picsum) load in the app; no CSP here.
-- =====================================================================
-- Client + demo-user avatars
UPDATE "user" SET avatar_url = 'https://i.pravatar.cc/400?img=5'  WHERE email = 'user@motionhive.fit';        -- Sarah
UPDATE "user" SET avatar_url = 'https://i.pravatar.cc/400?img=32' WHERE email = 'anna.client@motionhive.fit';
UPDATE "user" SET avatar_url = 'https://i.pravatar.cc/400?img=68' WHERE email = 'mihai.client@motionhive.fit';
UPDATE "user" SET avatar_url = 'https://i.pravatar.cc/400?img=44' WHERE email = 'elena.member@motionhive.fit';

-- Group logo (Morning Crew)
UPDATE "group"
   SET logo_url = 'https://picsum.photos/seed/morningcrew/600/400'
 WHERE id = pg_temp.seed_uuid('grp:test-strength-club');

-- Products shown on the public profile (offerings). RON to match the coach's
-- sessions/settlement currency. Amounts in minor units (cents/bani).
INSERT INTO product (id, instructor_id, name, description, type, amount_cents,
                     currency, interval, interval_count, stripe_product_id,
                     stripe_price_id, is_active, show_on_profile)
VALUES
  (pg_temp.seed_uuid('prod:monthly-coaching'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   'Monthly Coaching',
   'Ongoing one to one coaching. A plan that updates every week, unlimited messaging, and a check in call when you need one.',
   'SUBSCRIPTION', 20000, 'RON', 'month', 1, NULL, NULL, true, true),
  (pg_temp.seed_uuid('prod:8-session-pack'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   '8 Session Pack',
   'Eight sessions to use in person or online. Great for building a base or prepping for an event, at your own pace.',
   'ONE_OFF', 60000, 'RON', NULL, NULL, NULL, NULL, true, true),
  (pg_temp.seed_uuid('prod:form-check'),
   (SELECT id FROM "user" WHERE email='instructor@motionhive.fit'),
   'Form Check',
   'Send a lifting video and get a detailed breakdown within 48 hours, with the two or three cues to fix first.',
   'ONE_OFF', 7500, 'RON', NULL, NULL, NULL, NULL, true, true)
ON CONFLICT DO NOTHING;

-- Memberships (subscriptions) so the coach's Memberships list isn't empty.
-- FAKE stripe_* ids: they render in lists but a live Stripe action would fail
-- (same caveat as the seeded invoices). Depends on the SUBSCRIPTION product above.
INSERT INTO subscription (
  id, instructor_id, client_id, stripe_customer_id, product_id,
  stripe_subscription_id, stripe_price_id, status,
  current_period_start, current_period_end, cancel_at_period_end,
  trial_start, trial_end, amount_cents, currency, created_at, updated_at)
SELECT
  pg_temp.seed_uuid('sub:'||s.k),
  (SELECT id FROM "user" WHERE email = 'instructor@motionhive.fit'),
  (SELECT id FROM "user" WHERE email = s.client_email),
  'cus_demo_'||s.k,
  pg_temp.seed_uuid('prod:monthly-coaching'),
  'sub_demo_'||s.k, 'price_demo_monthly', s.status,
  s.pstart, s.pend, false, s.tstart, s.tend, 20000, 'ron',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('sarah','user@motionhive.fit','active',       CURRENT_TIMESTAMP - INTERVAL '12 days', CURRENT_TIMESTAMP + INTERVAL '18 days', NULL::timestamp, NULL::timestamp),
  ('anna', 'anna.client@motionhive.fit','active', CURRENT_TIMESTAMP - INTERVAL '3 days',  CURRENT_TIMESTAMP + INTERVAL '27 days', NULL, NULL),
  ('mihai','mihai.client@motionhive.fit','trialing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '7 days')
) AS s(k, client_email, status, pstart, pend, tstart, tend)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 23. "MY EXERCISES" MEDIA  (the coach's OWN exercises need pictures)
--     Sections 12 + 18 create coach-owned exercises with media_kind=NONE and
--     generic "Custom Exercise N" names, so the My Exercises grid renders
--     nameless and imageless. Give them real names and a picture each, reusing
--     Free Exercise DB photos (seeded by scripts/seed-exercises.ts). Correct
--     photo where the name matches a library entry; a distinct library photo
--     as fallback. Idempotent: only fills exercises that have no media yet.
-- =====================================================================
UPDATE exercise e SET name = v.newname
FROM (VALUES
  ('Custom Exercise 1','Incline Dumbbell Press'), ('Custom Exercise 2','Lat Pulldown'),
  ('Custom Exercise 3','Leg Press'),             ('Custom Exercise 4','Leg Extension'),
  ('Custom Exercise 5','Seated Leg Curl'),       ('Custom Exercise 6','Face Pull'),
  ('Custom Exercise 7','Cable Fly'),             ('Custom Exercise 8','Hammer Curl'),
  ('Custom Exercise 9','Triceps Pushdown'),      ('Custom Exercise 10','Seated Cable Row'),
  ('Custom Exercise 11','Front Squat'),          ('Custom Exercise 12','Hip Thrust'),
  ('Custom Exercise 13','Chin Up'),              ('Custom Exercise 14','Arnold Press'),
  ('Custom Exercise 15','Lateral Raise'),        ('Custom Exercise 16','Standing Calf Raise'),
  ('Custom Exercise 17','Russian Twist'),        ('Custom Exercise 18','Mountain Climber'),
  ('Custom Exercise 19','Box Jump'),             ('Custom Exercise 20','Kettlebell Swing')
) AS v(old, newname)
WHERE e.name = v.old
  AND e.owner_id = (SELECT id FROM "user" WHERE email = 'instructor@motionhive.fit');

UPDATE exercise
   SET media_kind = 'IMAGE'
 WHERE owner_id = (SELECT id FROM "user" WHERE email = 'instructor@motionhive.fit')
   AND deleted_at IS NULL;

-- Correct photo where the owned name matches a Free Exercise DB entry.
INSERT INTO exercise_media (id, exercise_id, provider, kind, url, thumbnail_url, is_primary, display_order)
SELECT gen_random_uuid()::char(36), o.id, 'jsdelivr', 'IMAGE', m.url, m.url, true, 0
FROM exercise o
JOIN exercise sys ON lower(sys.name) = lower(o.name)
  AND sys.owner_id IS NULL AND sys.deleted_at IS NULL
JOIN exercise_media m ON m.exercise_id = sys.id AND m.is_primary AND m.kind = 'IMAGE'
WHERE o.owner_id = (SELECT id FROM "user" WHERE email = 'instructor@motionhive.fit')
  AND o.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM exercise_media em WHERE em.exercise_id = o.id);

-- Fallback: any remaining owned exercise gets a distinct library photo.
WITH owned AS (
  SELECT o.id, row_number() OVER (ORDER BY o.created_at) AS rn
  FROM exercise o
  WHERE o.owner_id = (SELECT id FROM "user" WHERE email = 'instructor@motionhive.fit')
    AND o.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM exercise_media m WHERE m.exercise_id = o.id)
),
pool AS (
  SELECT url, row_number() OVER (ORDER BY url) AS rn
  FROM (SELECT DISTINCT url FROM exercise_media WHERE kind = 'IMAGE' AND is_primary) d
  LIMIT (SELECT count(*) FROM owned)
)
INSERT INTO exercise_media (id, exercise_id, provider, kind, url, thumbnail_url, is_primary, display_order)
SELECT gen_random_uuid()::char(36), o.id, 'jsdelivr', 'IMAGE', p.url, p.url, true, 0
FROM owned o JOIN pool p ON p.rn = o.rn;

-- The catalog LIST renders exercise.thumbnail_url (a column on the row), not
-- the exercise_media overlay (that's the detail view). Copy each owned
-- exercise's primary image into thumbnail_url so it shows in the grid.
UPDATE exercise e
   SET thumbnail_url = m.url
  FROM exercise_media m
 WHERE m.exercise_id = e.id AND m.is_primary AND m.kind = 'IMAGE'
   AND e.owner_id = (SELECT id FROM "user" WHERE email = 'instructor@motionhive.fit')
   AND e.deleted_at IS NULL
   AND (e.thumbnail_url IS NULL OR e.thumbnail_url = '');

COMMIT;

-- ---------------------------------------------------------------------
-- Summary (read-only) — handy to eyeball after running.
-- ---------------------------------------------------------------------
\echo '--- seed summary ---'
SELECT 'exercise' AS table, count(*) FROM exercise
UNION ALL SELECT 'program', count(*) FROM program
UNION ALL SELECT 'program_workout', count(*) FROM program_workout
UNION ALL SELECT 'prescribed_set', count(*) FROM prescribed_set
UNION ALL SELECT 'program_assignment', count(*) FROM program_assignment
UNION ALL SELECT 'assigned_workout', count(*) FROM assigned_workout
UNION ALL SELECT 'assigned_set', count(*) FROM assigned_set
UNION ALL SELECT 'workout_log', count(*) FROM workout_log
UNION ALL SELECT 'logged_set', count(*) FROM logged_set
UNION ALL SELECT 'one_rep_max', count(*) FROM one_rep_max
UNION ALL SELECT 'conversation', count(*) FROM conversation
UNION ALL SELECT 'message', count(*) FROM message
UNION ALL SELECT 'notification', count(*) FROM notification
UNION ALL SELECT 'invoice', count(*) FROM invoice
UNION ALL SELECT 'payment', count(*) FROM payment
UNION ALL SELECT 'group_member', count(*) FROM group_member
UNION ALL SELECT 'post', count(*) FROM post
UNION ALL SELECT 'venue', count(*) FROM venue
UNION ALL SELECT 'session_template', count(*) FROM session_template
UNION ALL SELECT 'session_instance', count(*) FROM session_instance
UNION ALL SELECT 'session_participant', count(*) FROM session_participant
UNION ALL SELECT 'session_reminder_schedule', count(*) FROM session_reminder_schedule
UNION ALL SELECT 'routine', count(*) FROM routine
UNION ALL SELECT 'routine_exercise', count(*) FROM routine_exercise
UNION ALL SELECT 'review', count(*) FROM review
ORDER BY 1;
