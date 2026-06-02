# Locked V1 Decisions

**Locked by:** ionut.butnaru, 2026-05-13 (research session)
**Status:** Authoritative. Any deviation requires explicit re-confirmation.

This document captures every load-bearing product/architecture decision for the workouts feature. It is the single source of truth for "what V1 includes and what it doesn't." If something isn't on this list, it's not in V1.

## Product decisions

### 1. Exercise ownership model

**Decision:** System catalog + instructor-private custom + **instructor-public-shared custom.**

| Source | `owner_id` | `visibility` | Who can use? | Who can edit? |
|---|---|---|---|---|
| `SYSTEM` | NULL | PUBLIC | Everyone | SUPER_ADMIN only |
| `INSTRUCTOR_PRIVATE` | instructor user_id | PRIVATE | Owner only | Owner |
| `INSTRUCTOR_PUBLIC` | instructor user_id | PUBLIC | All instructors | Owner |

**Public custom exercises:**
- Visible to all instructors in the catalog (filterable by "Created by instructor X")
- Display attribution: "Created by [Instructor Name]" with link to instructor profile
- Acts as a self-promotion surface — instructors create high-quality custom exercises to be discovered
- Cannot be edited by anyone except the owner (no PR-style suggestions in V1)

**Rationale:** Combines Hevy Coach's private-library model (clean, no moderation) with a self-promotion surface that benefits instructor acquisition. Public exercises are read-only for everyone except the owner — avoids edit-war moderation.

### 2. Public exercise edits

**Decision:** **Fork-to-customize.** No PR-style edit suggestions.

- Other instructors can USE a public exercise as-is in their workouts (reference by `exercise.id`)
- Or click "Fork" → creates a new private exercise with `forked_from_id = original.id`, `owner_id = me`, `visibility = PRIVATE`
- Original owner's row is untouched. Fork lineage is tracked for analytics ("this exercise has been forked 42 times")
- Notification fires to original owner on fork: `EXERCISE_FORKED`

**Rationale:** Keeps attribution clean, prevents edit-war moderation, matches Hevy Coach's pattern. Forking is the universal escape hatch for "I love this exercise but I want to tweak the instructions."

### 3. Program scope

**Decision:** **Per-instructor private library only** in V1. No public program library.

- Programs are owned by exactly one instructor (`program.owner_id`)
- No `visibility` enum on programs in V1 (always private)
- No marketplace, no admin-curated featured programs, no group-shared programs
- V2+ can add `program.visibility` as additive enum values

**Rationale:** Programs are an instructor's IP and competitive advantage. Sharing programs is a separate product decision (revenue model, moderation, search ranking) — defer until we know what instructors want.

### 4. Set fidelity

**Decision:** **Full Hevy parity** — wide nullable schema from day one.

Every set field defined in [03-industry-standards.md](./03-industry-standards.md) §3 is in the V1 schema. UI ships a subset in V1 (straight sets + supersets + warmup); advanced fields (tempo, RPE, %1RM, AMRAP, drop sets, rest-pause, cluster) ship as features land, **without schema migration.**

**Why not lean V1:** Adding columns to `prescribed_set` and `logged_set` later means backfilling already-prescribed workouts. Wide nullable schema with narrow UI is cheap; narrow schema with wide UI is expensive.

### 5. Logging

**Decision:** **Mark-complete + optional actual values per set.**

- Client opens an assigned workout
- Per set: checkbox to mark complete + optional fields for actual weight/reps/duration/distance/RPE/RIR
- All actual fields are nullable — minimum bar is just the checkbox
- Schema fully separates planned (`prescribed_set` / `assigned_set`) from logged (`logged_set`)

**Rationale:** Three-layer architecture pays off immediately. Clients who care about tracking get real progress data; clients who don't get a clean UI. Schema doesn't have to migrate when we add more sophisticated logging UX later.

### 6. Program ↔ session relationship

**Decision:** **Independent.** Programs assign to clients directly via `instructor_client`; workouts are not tied to scheduled `session` appointments.

- `workout_log` has no FK to `session`
- A workout can be logged any time the client wants
- A future "homework session" feature could optionally link a workout to a session — additive, not in V1

**Rationale:** Sessions are appointments (calendar events); workouts are what you do. Coupling them blocks self-guided clients doing programs between sessions.

### 7. Assignment target

**Decision:** **Individual clients only** in V1. No group program assignment.

- `program_assignment.client_id` is required, `group_id` does not exist as a column
- Copy-on-assign deep-copies the program tree into per-client `assigned_*` rows
- V2 can add `program_assignment.target_type` enum (`CLIENT` | `GROUP`) without migrating existing rows

**Rationale:** Trainerize / TrueCoach pattern. Group assignment introduces propagation rules (what happens when a member joins after assignment? what notifications fire?) that aren't worth solving in V1.

### 8. Custom exercise media

**Decision:** **YouTube URL only** in V1. Uploads ship in V2.

- `exercise.youtube_url VARCHAR(500)` — validated by regex against YouTube URL patterns
- On create/update, we fetch oEmbed thumbnail and cache it to Cloudinary so the row survives if the video is deleted
- Schema still includes `media_kind` enum (`YOUTUBE | VIDEO | IMAGE | GIF | NONE`) so V2 can add upload without migration
- Image-only exercises from Free Exercise DB use `media_kind = IMAGE` with Cloudinary URLs

**Rationale:** Free, no storage cost, no moderation surface, no transcoding pipeline. Trade-off accepted: instructors who want to demo proprietary movements without putting them on YouTube wait for V2 uploads.

## Architecture decisions

### 9. Three-layer separation (catalog / prescription / log)

**Decision:** Three distinct tables sets. Never two.

- **Catalog:** `exercise` (one table, all sources)
- **Prescription:** `program` → `program_workout` → `prescribed_exercise` → `prescribed_set`
- **Assignment (deep copy of prescription):** `program_assignment` → `assigned_workout` → `assigned_exercise` → `assigned_set`
- **Log:** `workout_log` → `logged_exercise` → `logged_set`

**Rationale:** Unanimous convergence across the industry. Mixing prescription and log is the #1 retrofit pain.

### 10. Copy-on-assign

**Decision:** Assigning a program to a client deep-copies the entire program tree.

- `assigned_workout`, `assigned_exercise`, `assigned_set` are full copies, not references
- `program_assignment.master_program_id` is informational only ("this came from program X")
- Editing the master program does **not** propagate to existing assignments
- Per-client overrides (swap an exercise, change a weight target) are trivial because the client's tree is already a private copy

**Rationale:** Industry consensus. Live references are a footgun — coaches don't want yesterday's completed workout to retroactively change.

### 11. Provider-agnostic catalog

**Decision:** `source` + `source_id` as traceability strings on `exercise`. Never foreign keys.

```sql
exercise.source VARCHAR(50)    -- 'free-exercise-db' | 'wger' | 'user' | 'admin'
exercise.source_id VARCHAR(255) -- e.g. 'Barbell_Squat'
```

These fields are for traceability and dedup at seed time. The catalog is fully ours once seeded — a provider disappearing has zero impact.

### 12. Media overlay table

**Decision:** Provider-supplied media (MuscleWiki videos, etc.) lives in a separate `exercise_media` table keyed by our UUID.

```sql
exercise_media.exercise_id     UUID FK exercise(id)
exercise_media.provider        VARCHAR(50)    -- 'cloudinary' | 'youtube' | 'musclewiki' | 'wger'
exercise_media.provider_asset_id VARCHAR(255)
exercise_media.url             TEXT
exercise_media.kind            ENUM('VIDEO','GIF','IMAGE','THUMBNAIL')
exercise_media.licensed_until  DATE NULLABLE  -- enforce license expiry
```

V1 only writes to this table for `cloudinary` (seed images) and `youtube` (custom exercise thumbnails). V2+ adds `musclewiki` etc. via licensed partnership.

### 13. Forward-compat namespace

**Decision:** Reserve enums and table names that support future modules without migration.

- `program.kind ENUM('WORKOUT', 'MEAL', 'HABIT', 'HYBRID')` — V1 only ships `WORKOUT`
- `program_assignment.target_type ENUM('CLIENT')` — V2 can add `'GROUP'`
- `exercise.kind ENUM('STRENGTH', 'CARDIO', 'DURATION', 'DISTANCE', 'BODYWEIGHT', 'MOBILITY')` — drives UI tracking-field rendering
- `media_kind ENUM('YOUTUBE', 'VIDEO', 'IMAGE', 'GIF', 'NONE')` — V1 ships YouTube + Image, V2 adds Video upload

### 14. Set storage units

**Decision:**
- Weight always in **kilograms** (DB).
- Distance always in **meters**.
- Duration always in **seconds**.
- Unit conversion happens at the **edge** (request DTO ↔ response DTO).

**Rationale:** Mixed units in storage is the worst migration in this space. Pick canonical units once, convert in/out.

### 15. Snapshot at log time only

**Decision:** `logged_set` snapshots `exercise_name_snapshot VARCHAR(255)` and `exercise_youtube_url_snapshot VARCHAR(500)` at completion time.

- 5-year-old workout history survives renaming or deleting custom exercises
- No snapshots at prescription or assignment time (those can `JOIN exercise` live — exercises are mutable until logged)
- Snapshots are NOT used for active reads — they exist for historical integrity only

## V1 scope — explicit out-of-scope list

These are intentionally NOT in V1. They are valid future features, not bugs:

- ❌ Meal plans (schema reserves namespace via `program.kind = 'MEAL'`)
- ❌ Habit tracking (schema reserves namespace via `program.kind = 'HABIT'`)
- ❌ Group program assignment
- ❌ Public program library / marketplace
- ❌ Coach-to-coach program sharing
- ❌ Live program references ("Subscribe" mode — always Copy in V1)
- ❌ Drafts / scheduled program publishing
- ❌ FIT file export
- ❌ Apple HealthKit / Health Connect sync
- ❌ Wearable real-time sync
- ❌ Periodization engine (free-text `phase` label only)
- ❌ Cluster sets / rest-pause / EMOM / Tabata UI (schema supports, UI ships straight sets + supersets)
- ❌ Custom exercise video upload (YouTube URL only)
- ❌ PR-style edits on public exercises
- ❌ Real workout reminders (blocked on jobs module; notification builders exist as stubs)
- ❌ Workouts tied to scheduled sessions
- ❌ Paid programs / Stripe Connect on workouts

## V1 scope — explicit in-scope list

What V1 *does* ship:

- ✅ Exercise catalog with system + instructor-private + instructor-public exercises
- ✅ Fork-to-customize on public exercises
- ✅ Movement pattern, mechanic, force, level taxonomy
- ✅ Muscle (M2M with role enum) and equipment (M2M) taxonomies
- ✅ YouTube URL on custom exercises with oEmbed thumbnail caching
- ✅ Program builder: program → week → day → exercise → set
- ✅ Supersets (via `superset_group_id`); other blocks ship UI later
- ✅ Wide nullable set schema (full Hevy parity)
- ✅ Copy-on-assign to individual clients
- ✅ Per-client overrides on assigned workouts
- ✅ Workout logging with mark-complete + optional actual numbers
- ✅ `one_rep_max` table for %1RM resolution
- ✅ Snapshots on `logged_set` for historical integrity
- ✅ Notifications: `PROGRAM_ASSIGNED`, `EXERCISE_FORKED`, `CLIENT_COMPLETED_WORKOUT`
- ✅ `search_doc` indexing for exercises and programs
- ✅ Swagger docs for all endpoints
- ✅ Test coverage for service layer

## How to re-open a locked decision

If reality forces a change to anything in this document:

1. Update this file with the new decision and date
2. Note what changed in the "Revision history" section below
3. Audit `05-db-schema.md`, `06-module-layout.md` for cascading changes
4. If the migration has already shipped, document the migration plan (new migration, not edit)

## Decisions added after design validation (2026-06-02)

The mid-fi design pass (`design/exercises-v1.html`) surfaced four decisions that weren't in the original lock. All four are now load-bearing and reflected in [05-db-schema.md](./05-db-schema.md).

### 16. Soft-unpublish keeps existing program references working

**Decision:** Visibility flip PUBLIC → PRIVATE **never breaks references**. Other instructors who already added a public exercise to their programs keep working. Picker/list queries hide the exercise for non-owners. Hard delete is blocked by `ON DELETE RESTRICT` on `prescribed_exercise.exercise_id` (and the assigned/logged equivalents) — in practice the system only soft-deletes.

**Rationale:** A public exercise becomes infrastructure once other instructors use it. Pulling it from under them would silently break live client programs. Soft-unpublish + paranoid delete is the social-media "I unpublished, but quoted references remain" pattern.

**Affected screens:** S1 picker visibility, S6 delete-confirm copy ("forks survive, your original goes"), every read query.

### 17. `fork_count` is a denormalized counter on `exercise`

**Decision:** `exercise.fork_count INTEGER NOT NULL DEFAULT 0`, maintained inside the fork transaction (+1 on create, −1 on soft-delete). Sortable index `idx_exercise_fork_count` for the "Most-forked" sort.

**Rationale:** Appears on every list card, detail page, and the "most-forked" sort. Computing via `COUNT(*)` per row on every list query would be a real cost; counter is one INT and stays correct as long as the transaction owns both inserts.

### 18. `is_unilateral` boolean on `exercise`

**Decision:** Add `is_unilateral BOOLEAN NOT NULL DEFAULT FALSE` to `exercise`. Used for split squats, single-arm rows, single-leg work — future logging UX can track L vs R reps or alternate sides.

**Rationale:** One column, zero ship cost, expensive to backfill once `logged_set` rows reference exercises. Designer flagged as nice-to-have-while-we're-in-the-schema; we agreed.

### 19. Clients can browse the catalog, gated by opt-in + assignment

**Decision:** Add `user.exercise_catalog_opt_in BOOLEAN NOT NULL DEFAULT FALSE`. Client-side catalog access (S1 browse) is computed at read time:

```
canBrowseExerciseCatalog(userId) :=
  user.exercise_catalog_opt_in
  OR EXISTS (program_assignment WHERE client_id = userId AND status NOT IN ('CANCELLED'))
```

The profile toggle reads the *computed* value and writes only `exercise_catalog_opt_in`. When an assignment exists, the toggle displays ON + disabled (caption: "automatically enabled because you're following a program").

**Edge:** When all assignments end (status COMPLETED or CANCELLED), the catalog goes back to gated unless the user explicitly opted in. Accepted — clients who are no longer being coached lose the surface back to default-off.

**Rationale:** The user wants clients to access the catalog when they have a coaching relationship, but not by default (avoids the platform looking like a generic exercise app for non-clients). Auto-enable on assignment is the natural trigger; opt-in covers the rare case of clients who want to explore before being assigned a program.

### 20. Custom exercise — primary muscle hard-capped at 3

**Decision:** `exercise_muscle` rows with `role='PRIMARY'`: at least 1, max 3. SECONDARY and STABILIZER unbounded.

**Rationale:** Design assumption — at >3 primaries the muscle hierarchy stops conveying anything. Enforced in service layer, not DDL.

### Skipped (designer-flagged, deferred)

- **`aliases JSONB`** — search synonyms. Not added in V1. Name-only partial match is the V1 scope; if it proves insufficient, we add it later (additive, zero retrofit pain — the search_doc indexer just starts including the new field).
- **YouTube oEmbed thumbnail caching** — server-proxied on URL submit, not client. Not a schema decision; lives in the YouTubeUrlField component spec + service.

## How to re-open a locked decision

If reality forces a change to anything in this document:

1. Update this file with the new decision and date
2. Note what changed in the "Revision history" section below
3. Audit [05-db-schema.md](./05-db-schema.md), [06-module-layout.md](./06-module-layout.md) for cascading changes
4. If the migration has already shipped, document the migration plan (new migration, not edit)

## Revision history

| Date | Change | By |
|---|---|---|
| 2026-05-13 | Initial lock | ionut.butnaru |
| 2026-06-02 | Added §16–20 after design validation (soft-unpublish, fork_count, is_unilateral, client browse gate, primary muscle cap) | ionut.butnaru |
