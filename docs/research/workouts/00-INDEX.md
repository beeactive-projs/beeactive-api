# Workouts & Exercises — Research & Design

**Status:** Round 1 (files 01–07) complete 2026-05-13. **Round 2 (files 08–13) added 2026-05-22** to expand V1 scope: user self-authored workouts + saved templates, personal records, privacy controls, workout-attached YouTube media, achievement-architecture-aware schema, integration audit against the live backend.
**Owner:** ionut.butnaru

This directory is the load-bearing reference for the workouts/exercises/programs feature. It exists so future Claude sessions (and you) don't have to re-run the research — every load-bearing decision is captured here with its rationale and the URLs that back it up.

If you only read one file, read [04-locked-decisions.md](./04-locked-decisions.md). If you're about to write code, also read [05-db-schema.md](./05-db-schema.md). **As of 2026-05-22, both 04 and 05 are stale** — the round-2 research in files 08–13 supersedes them on the topics they cover (user-authored templates, PRs, privacy, media, integration). A re-lock of 04 + a schema diff against 05 are pending user sign-off.

## Reading order

| # | File | Round | When to read |
|---|---|---|---|
| 00 | [INDEX](./00-INDEX.md) | — | You are here |
| 01 | [Exercise data providers](./01-exercise-data-providers.md) | 1 | Picking/swapping a catalog source |
| 02 | [Competitor data models](./02-competitor-data-models.md) | 1 | Designing or auditing the schema |
| 03 | [Industry standards](./03-industry-standards.md) | 1 | Adding wearable export / nutrition / FIT |
| 04 | **[Locked V1 decisions](./04-locked-decisions.md)** | 1 | Before writing any code in this domain (**stale — round-2 re-lock pending**) |
| 05 | **[DB schema proposal](./05-db-schema.md)** | 1 | Before writing the migration (**stale — round-2 additions pending**) |
| 06 | [Module layout](./06-module-layout.md) | 1 | Before scaffolding NestJS files |
| 07 | [Open questions & follow-ups](./07-open-questions.md) | 1 | Anything ambiguous, plus the MuscleWiki email |
| 08 | **[User-authored workouts (UX research)](./08-user-authored-workouts.md)** | 2 | Before designing user self-authoring flows. Path A (reuse `program` for user templates) is the recommendation |
| 09 | **[Personal records — detection & storage](./09-personal-records.md)** | 2 | Before adding PRs. 7 PR kinds, Epley default, `personal_record` table with replace-in-place semantics |
| 10 | [Achievements architecture (deferred build)](./10-achievements-architecture.md) | 2 | What V1 schema must include so the future achievements engine plugs in. Spoiler: almost nothing — one column + one notification enum value |
| 11 | **[Workout privacy & visibility model](./11-workout-privacy-model.md)** | 2 | Before designing share-with-coach. 3-state visibility enum + multi-coach isolation rules |
| 12 | [Workout-attached media model](./12-workout-media-model.md) | 2 | Before adding coach videos. Scalar columns on program/program_workout/prescribed_exercise (no polymorphic table) |
| 13 | **[Integration points audit](./13-integration-points.md)** | 2 | Before writing migration 047. Catches the drift since 2026-05-13 (sessions took migration 046, jobs module shipped, notification system at Phase 6) |

## Executive summary

### The product

Two new modules — `exercise` (catalog) and `workout` (programs, prescriptions, assignments, logs) — built on the MotionHive backend. Instructors build programs from a shared exercise catalog (or their own custom exercises), assign them to clients, and clients log their workouts. Meal plans plug in later as a parallel `program.kind`, no schema migration of the workout side.

### The architectural decision that matters most

**Three-layer separation: catalog → prescription → log.** This is the unanimous shape across Hevy, Strong, Trainerize, TrueCoach, Everfit, Fitbod, JEFIT. Mixing prescription and log is the #1 retrofit pain in this space. We separate from day one.

### The data source decision

**V1 seed: Free Exercise DB** (Unlicense / public domain, ~870 exercises, JPG image pairs). Owned by us once seeded, zero obligations, zero vendor lock-in. See [01-exercise-data-providers.md](./01-exercise-data-providers.md) for the full provider comparison and why every commercial option was either skipped (MuscleWiki — gated behind a paid license we should pursue separately) or rejected (API-Ninjas forbids caching, RapidAPI ExerciseDB has unclear redistribution rights).

**V2 polish path: MuscleWiki via licensed partnership.** Highest-quality videos (7,500+) in the market, real business ($5M ARR, 6-person team), legitimate licensing path. Email them, layer their videos as an `exercise_media` overlay table keyed by our UUIDs — never as a foreign key.

### The forward-compat decision

Everything is named for the general shape, scoped narrow in V1:
- `program.kind` enum reserves `MEAL` / `HABIT` / `HYBRID` — V1 only ships `WORKOUT`
- `exercise` covers system + instructor-private + instructor-public-shared via `visibility` + `owner_id` + `forked_from_id`
- `prescribed_set` is one wide nullable table that covers strength + cardio + duration + distance + bodyweight without per-kind tables
- All wearable/health-platform cross-walks (FIT, HealthKit, Health Connect) live as nullable strings on `exercise` and `workout_log`

### V1 scope (locked by user 2026-05-13)

| Decision | Choice |
|---|---|
| Exercise ownership | System catalog + instructor-private + **instructor-public-shared** |
| Public exercise edits | Fork-to-customize (no PR-style edits) |
| Program scope | Per-instructor private library only |
| Set fidelity | Full Hevy parity (wide nullable schema) |
| Logging | Mark-complete + optional actual values |
| Program ↔ session | Independent (no required session linkage) |
| Assignment target | Individual clients only (no group assignment in V1) |
| Custom exercise media | **YouTube URL only** in V1 |

### What's out of V1 scope

- Meal plans (schema reserves namespace; no tables built)
- Group assignment of programs
- Drafts/scheduled program publishing
- Coach marketplace / public program library
- Live program references (everything is copy-on-assign)
- Real-time wearable sync (FIT/HealthKit columns are write-only placeholders)
- Periodization engine (free-text `phase` label only)
- Cluster sets, rest-pause, EMOM, Tabata UI (schema supports, V1 UI ships only supersets + straight sets)

## How this connects to the rest of the backend

- **Auth**: standard `AuthGuard('jwt')` + `RolesGuard`. Most endpoints `@Roles('INSTRUCTOR')`; client-facing endpoints `@Roles('USER')`.
- **Notifications**: uses the existing `NotificationService.notify(builder(...))` pattern, builders in `workout/notifications.ts` and `exercise/notifications.ts`. V1 notifications: `PROGRAM_ASSIGNED`, `EXERCISE_FORKED`, `CLIENT_COMPLETED_WORKOUT`.
- **Search**: posts/blogs already index into `search_doc` — we wire `entity_type='exercise'` and `entity_type='program'` indexing on create/update/delete (V1).
- **Stripe/payments**: untouched — programs are not paid content in V1 (could become a future paid-content surface).
- **Jobs module**: blocked on the pending jobs module (see `project_jobs_module_pending.md`). `WORKOUT_DUE_TODAY` reminders are stubbed as a notification builder and a TODO; the cron that fires them ships when the jobs module ships.
- **Existing modules touched**: `user` (no schema change — instructors already exist), `client` (assignments reference `instructor_client.id`), `session` (untouched in V1 — workouts and sessions are independent).

## Migration number

The next free migration number is **047**. Migration 046 was claimed by `046_sessions_rewrite.sql` between 2026-05-15 and 2026-05-20. Re-check the directory before committing. See [13-integration-points.md](./13-integration-points.md) for the full drift audit.

## Round-2 expanded scope (locked verbally by user 2026-05-22, written re-lock pending)

The expanded scope adds to the locked V1:

- **User self-authored workouts and saved templates** — every user can author their own "Push Day", with or without a coach. Reuses the existing `program` entity (Path A from [08-user-authored-workouts.md](./08-user-authored-workouts.md)).
- **Personal records** — 7 universal PR kinds, Epley as default e1RM formula, new `personal_record` table with replace-in-place semantics, sync computation at workout-completion. See [09-personal-records.md](./09-personal-records.md).
- **Achievements/badges architecture (build deferred)** — only one new column (`workout_log.entry_method`) + one notification enum reservation needed in V1; all other facts the future engine reads are already in the schema. See [10-achievements-architecture.md](./10-achievements-architecture.md).
- **Privacy model** — 3-state visibility (`PRIVATE | SHARED_COMPLETION_ONLY | SHARED_FULL`) tied to a specific `instructor_client.id` (multi-coach isolation), with a CHECK constraint at the DB level. See [11-workout-privacy-model.md](./11-workout-privacy-model.md).
- **YouTube videos on workouts** — scalar `coach_video_url` + cached thumb columns on `program` / `program_workout` / `prescribed_exercise` (and free via copy-on-assign on `assigned_*`). No polymorphic table, no new enums. See [12-workout-media-model.md](./12-workout-media-model.md).
- **Integration** — workouts touches notification/search/jobs cleanly. Optional `workout_log.session_instance_id` FK lets a logged workout attach to a session. See [13-integration-points.md](./13-integration-points.md).
