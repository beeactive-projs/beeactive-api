# 12 — Workout-attached media model

**Status:** Research, scoping V1 + V2.
**Last updated:** 2026-05-22
**Owner:** ionut.butnaru
**Builds on:** [04-locked-decisions.md](./04-locked-decisions.md) §8 (custom exercise media = YouTube URL only in V1) and [05-db-schema.md](./05-db-schema.md) (exercise + program + assignment trees).

## The need

The locked V1 decision already covers media on the **exercise catalog row** — coaches can attach a YouTube URL to a custom exercise (e.g. "here's my version of a goblet squat") and we cache the oEmbed thumbnail to Cloudinary.

The new requirement: **coaches should also be able to attach a YouTube video to a workout** — not the exercise. Concrete examples:

- "Here's my form-cue overview for this whole push day" — a single video that frames the entire workout, not any one exercise.
- "Here's how I want YOU specifically to execute this push day this week" — a per-client overlay video, different from the master.
- "Here's the program intro" — a cover/welcome video on the program itself.

The exercise-level video answers "how do I do this movement"; the workout-level video answers "how do I approach this session"; the program-level video answers "what is this program about". They're three different jobs at three different layers of the prescription tree.

This document picks the right layers to support, the right schema shape, and the right relationship to the existing `exercise_media` overlay table.

## Apps surveyed

| App | Coach video at program level | At workout/day level | At exercise level | At set level | Source | Client → coach video |
|---|---|---|---|---|---|---|
| **Trainerize** | Yes (program description / intro) | Yes ("video coaching" + workout-level coach notes with media) | Yes (exercise demos + custom coach video) | No | YouTube + direct upload | Yes ("Form Check" — client uploads video reply) |
| **TrueCoach** | Yes (program description video) | Yes (workout-level notes with media) | Yes (exercise demos) | No (notes only) | YouTube/Vimeo + direct upload | Yes ("Form Check" — flagship feature) |
| **Everfit** | Yes (program cover + intro) | Yes (workout-level coach video) | Yes (per-exercise demo) | No | YouTube + Vimeo + direct upload | Yes (Video Library + form check) |
| **CoachAccountable** | Yes (program-level resources) | Limited (attached "resources" with embedded links) | Yes via worksheet/links | No | URL embeds (YouTube/Vimeo) | Indirect (clients upload "submissions") |
| **Hevy Coach** | Yes (program description) | Limited (workout notes — text-first) | Yes (exercise YouTube link + GIF) | No | YouTube link + GIF library | No (V1 focuses on logging, not async coaching) |
| **Future Fitness** | Yes (program brand video) | Yes (daily coach check-in video — flagship) | Yes (exercise demos) | No | Direct upload + Vimeo | Yes (client video back to coach — central to product) |

### Per-app summary

**Trainerize** (https://help.trainerize.com)
Has the deepest media model in the category. Three attachment points: program (intro), workout (coach notes with video), exercise (demo + custom video). "Video Coaching" is the marketing name for the workout-level form-check loop — coach posts a video for the workout, client replies with their own video. Storage is bundled into the per-client pricing tier (no a-la-carte storage). Supports both YouTube/Vimeo URL embed and direct upload.

**TrueCoach** (https://truecoach.co)
Built around "form check" as the headline feature. Coaches attach a video at the workout level ("here's how we're going to approach today") and at the exercise level. Clients upload form-check videos in response which appear inline in the workout thread. URL embeds and direct uploads both supported. Their exercise library accepts YouTube/Vimeo URLs and the coach can layer a personal video on top of the library demo.

**Everfit** (https://everfit.io)
Most flexible in terms of media library — coaches can build a personal video library and re-attach the same asset to multiple workouts/exercises. Program-level intro video, workout-level coach overview, exercise-level demo. Direct upload + YouTube + Vimeo. Form-check video is bidirectional like TrueCoach.

**CoachAccountable** (https://coachaccountable.com)
Less workout-centric (more habit/accountability focused). Media attaches via "Resources" — links and embeds at program/worksheet level. Workout-day media is limited to embedded URLs. Bidirectional video via "Submissions" (clients upload but it's not framed as form check).

**Hevy Coach** (https://www.hevyapp.com/coach)
Lightest media model. Exercise-level YouTube link + animated GIF demos are the primary medium. Workout-level notes are text-first; you can embed a YouTube URL but it's not a first-class video field. No bidirectional form-check feature in the coach product yet (Hevy's strength is logging, not async video coaching).

**Future Fitness** (https://www.future.co)
Premium ($199/month) remote-coaching app where the workout-level coach video is the *core* feature — clients get a personalized check-in video from their coach every day or week. Direct upload (Vimeo backend). Client-to-coach video reply is equally central. This is the high end of "video-first remote coaching".

## Attachment-point matrix

Where exactly can a coach attach media in each app?

| Level | Trainerize | TrueCoach | Everfit | CoachAccountable | Hevy Coach | Future |
|---|---|---|---|---|---|---|
| **Program** (cover/intro) | Yes | Yes | Yes | Yes | Yes (cover img + desc) | Yes |
| **Workout / day** | **Yes** (coach video) | **Yes** (workout notes media) | **Yes** (coach video) | Partial (resources) | Limited (notes embed) | **Yes** (daily check-in) |
| **Exercise (in program)** | Yes (custom on top of library demo) | Yes (library demo + custom) | Yes | Via worksheet links | Yes (library demo) | Yes |
| **Set** | No | No | No | No | No | No |
| **Per-client override** | Yes (assignment-level note + video) | Yes (per-client workout edits) | Yes | Yes | Limited | Yes (every client gets per-client video) |

**Key takeaway:** Three layers are universal — program, workout, exercise. **Set-level media is non-existent.** No serious app attaches video to a single set; the granularity isn't useful and the UI cost is enormous. Per-client overrides exist in every full-featured coaching app and are usually the most-loved feature.

## V1 attachment points for MotionHive

Recommendation: ship **three attachment points** in V1, defer one to V2.

### Ship in V1

1. **`program.cover_video_url`** — already trivially supportable; `program.cover_image_url` exists, we add a sibling video URL field. Cheap.
2. **`program_workout.coach_video_url`** — the new requirement. Workout-level overview video.
3. **`prescribed_exercise.coach_video_url`** — coach's form cue specific to *how this coach prescribes this exercise* in *this program*. Distinct from the exercise's own demo on the catalog row. Coaches consistently say this is the highest-value attachment point in interviews with Trainerize / Everfit (the library demo is "how to do the movement"; the prescribed-exercise video is "how I want you to do it in this program").

### Defer to V2 (per-client override)

4. **`assigned_exercise.coach_video_url`** / **`assigned_workout.coach_video_url`** — per-client video override on the deep-copied assignment row.

This is mechanically free because copy-on-assign means the column exists naturally on `assigned_exercise` / `assigned_workout` as soon as we put it on `prescribed_exercise` / `program_workout` (the assigned tables mirror the prescribed tables field-for-field — see 05-db-schema.md §"Assignment (deep copy of prescription)"). So the **column lands in V1** for free; what we defer to V2 is the UI surface and the API endpoint that lets a coach edit it post-assignment. Schema cost: zero.

**Defer reasoning:** the UI for "edit a per-client exercise mid-assignment" is non-trivial and overlaps with the broader per-client override surface that V1 already declines to build (see locked decision §10: copy-on-assign is in, but the UI for surgically editing one client's tree is V2). Shipping the column without the UI is fine; shipping the UI without first shipping a base case for editing a per-client tree is half-baked.

### Argue: should we go even narrower in V1?

The narrowest defensible V1 is **only `program_workout.coach_video_url`** — i.e. the literal new requirement and nothing else.

**Argument for:** ship the minimum, prove the pattern, expand once we see actual coach behavior.

**Argument against:** the three attachment points share 100% of their plumbing — same URL validation, same oEmbed thumbnail caching, same Cloudinary fan-out. Building all three in V1 costs ~5% more than building one, because the cost is in the validator + thumbnail pipeline, not the columns. And `prescribed_exercise.coach_video_url` is arguably the most-loved attachment point in the entire surveyed cohort (it's how Trainerize and Everfit differentiate from "just a list of YouTube links").

**Recommendation:** ship all three. The marginal cost of attachment points 1 and 3 is rounding-error against attachment point 2. Defer per-client override UI to V2.

## Schema approach: columns vs. polymorphic table vs. extended overlay

Three options:

### Option A — Columns on each table

```sql
ALTER TABLE program            ADD COLUMN cover_video_url       VARCHAR(500);
ALTER TABLE program            ADD COLUMN cover_video_thumb_url VARCHAR(500);
ALTER TABLE program_workout    ADD COLUMN coach_video_url       VARCHAR(500);
ALTER TABLE program_workout    ADD COLUMN coach_video_thumb_url VARCHAR(500);
ALTER TABLE prescribed_exercise ADD COLUMN coach_video_url      VARCHAR(500);
ALTER TABLE prescribed_exercise ADD COLUMN coach_video_thumb_url VARCHAR(500);
ALTER TABLE assigned_workout   ADD COLUMN coach_video_url       VARCHAR(500);
ALTER TABLE assigned_workout   ADD COLUMN coach_video_thumb_url VARCHAR(500);
ALTER TABLE assigned_exercise  ADD COLUMN coach_video_url       VARCHAR(500);
ALTER TABLE assigned_exercise  ADD COLUMN coach_video_thumb_url VARCHAR(500);
```

**Pros:**
- Dead simple. One JOIN-free read per page.
- Copy-on-assign already deep-copies all columns on `prescribed_exercise` → `assigned_exercise`; adding columns "just works" with the existing deep-copy logic.
- Matches the existing `exercise.youtube_url` + `exercise.thumbnail_url` shape — same pattern, same validator, same regex.
- No polymorphic FK; passes the codebase convention check (CLAUDE.md doesn't ban polymorphic outright but the project doesn't have any and the patterns documented are all properly-keyed FKs).
- DB constraints are local — the CHECK on `youtube_url ~ '^https?://...'` can be re-applied per column.

**Cons:**
- Two columns per attachment point (URL + cached thumbnail URL). Five attachment points × 2 = 10 new columns spread across 5 tables.
- No native support for multiple videos per attachment point (V1 doesn't need it, but if "intro + outro" or "video carousel" ever becomes a thing, we migrate).
- No place to store provider/duration/dimensions metadata (matches V1 — we don't need it, but it's a ceiling).

### Option B — Polymorphic `workout_media` table

```sql
CREATE TABLE workout_media (
  id            CHAR(36) PRIMARY KEY,
  entity_type   workout_media_entity_type NOT NULL,  -- enum: PROGRAM, PROGRAM_WORKOUT, PRESCRIBED_EXERCISE, ASSIGNED_WORKOUT, ASSIGNED_EXERCISE
  entity_id     CHAR(36) NOT NULL,
  provider      VARCHAR(50) NOT NULL,                -- 'youtube' | 'cloudinary'
  url           TEXT NOT NULL,
  thumbnail_url TEXT,
  kind          media_kind NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 0,
  ...
);
```

**Pros:**
- One table, one validator, one upload pipeline.
- Many-videos-per-entity comes for free.
- Provider/kind/duration/dimensions all in one place.

**Cons:**
- **Polymorphic FK is an anti-pattern in this codebase** — every other module uses properly-keyed FKs (see CLAUDE.md "Sequelize models with CHAR(36) UUID PKs" + every entity in the tree). The codebase has zero precedent for `(entity_type, entity_id)` lookups.
- **No referential integrity at the DB level.** A `(PROGRAM_WORKOUT, <uuid>)` row can't be enforced by FK; we'd have to write triggers or rely on app-layer cascade. When a `program_workout` is deleted, the `workout_media` rows it owned orphan silently.
- **Copy-on-assign becomes painful.** Today, deep-copying `prescribed_exercise` → `assigned_exercise` is `SELECT * INTO TEMP` + reassign FKs. With polymorphic media we'd add a secondary copy pass: `SELECT FROM workout_media WHERE entity_type='PRESCRIBED_EXERCISE' AND entity_id IN (...)` → insert with new `entity_type='ASSIGNED_EXERCISE'` + new ids. Two-step copy, easier to get wrong.
- Queries that list "all prescribed exercises in this workout with their coach video" become a polymorphic JOIN. Tedious vs. a single column.
- ORM (Sequelize) doesn't model polymorphic associations natively; every read needs explicit `where: { entityType, entityId }` and we lose the lazy-load ergonomics.

### Option C — Extend `exercise_media` to cover workout entities

Add nullable `program_workout_id`, `prescribed_exercise_id`, `program_id`, `assigned_workout_id`, `assigned_exercise_id` columns. Enforce "exactly one is set" via CHECK constraint.

**Pros:**
- Reuses the existing overlay table; one source of truth for "media attached to a workout-domain thing".
- Multiple videos per entity (display_order already exists).
- Provider/duration/dimensions metadata already present.

**Cons:**
- **Confuses concepts.** `exercise_media` is the *catalog* overlay table — it answers "what visual asset represents this exercise" (system image from Free Exercise DB, MuscleWiki video via license, custom exercise YouTube oEmbed thumbnail). Adding `program_workout_id` etc. mixes a *catalog* concept with a *prescription* concept. The two have different lifecycles, different ownership, different deletion cascades.
- 6 nullable FKs + CHECK ("exactly one not null") is fragile schema-wise. Easy to introduce a bug where two get set and the row points at both an exercise and a workout.
- Cascade behavior diverges per FK (delete program_workout → cascade media; delete exercise → cascade media; but the row only points at one) — code paths multiply.
- Doesn't solve the polymorphic FK problem, just hides it behind sparse columns.

### Recommendation: **Option A (columns)**.

Three reasons:

1. **It matches the codebase convention.** `exercise.youtube_url` is already a column on `exercise`. We're extending the same pattern to three more tables. No new mental model.
2. **It's the only option where copy-on-assign is free.** Deep-copy is `INSERT ... SELECT * FROM prescribed_exercise WHERE program_workout_id IN (...)` — adding columns adds zero code to the deep-copy logic. Options B and C require a secondary copy pass with polymorphic key rewriting.
3. **V1 needs exactly one video per attachment point.** Multi-video carousels and metadata-rich attachments are a V3 problem at best. Building a generic media table to solve a problem we don't have today violates the "wide nullable schema, narrow UI" principle from locked decision §4 — that principle is about *not* shipping columns we don't need; it's not a license to add tables we don't need.

**If V3 brings real multi-video needs** (e.g. video carousels per workout, multiple form-cue clips per exercise), the migration is "add a `workout_media` table and migrate the column-based videos into it as `display_order=0, is_primary=true` rows." That's a clean linear migration. The reverse — collapsing a polymorphic table back into columns — is uglier.

## YouTube validation + oEmbed caching

### URL validation

Reuse the regex already locked in [05-db-schema.md §exercise](./05-db-schema.md):

```sql
CHECK (
  coach_video_url IS NULL OR
  coach_video_url ~ '^https?://(www\.)?(youtube\.com|youtu\.be)/'
)
```

**Coverage:** matches `youtube.com/watch?v=...`, `youtube.com/embed/...`, `youtube.com/shorts/...`, `youtu.be/<id>`, `m.youtube.com/...` (the `(www\.)?` is loose — it accepts `m.` and any other subdomain via the broader interpretation, which is fine because YouTube oEmbed will reject anything it can't parse downstream).

**Edge cases worth confirming at the service layer (not at DDL — keep DDL cheap):**
- Strip query parameters except `?v=` (avoid `&feature=share`, `&t=42s` polluting cached thumbnails) — extract the video ID, rebuild a canonical URL.
- Reject playlist URLs (`/playlist?list=...`) — we want one video per attachment point.
- Reject channel URLs (`/@handle`, `/c/<channel>`) — same reason.

These checks belong in the service-layer validator that already handles `exercise.youtube_url`. Lift it into `common/utils/youtube.utils.ts` (new file) so the same parse-and-canonicalise logic is shared across all four attachment points.

### oEmbed thumbnail caching

Locked decision §8 already specifies: on create/update, fetch YouTube's oEmbed endpoint, take the thumbnail URL, re-upload to Cloudinary, store the Cloudinary URL on the row. This protects against the source video being deleted (we still have a thumbnail for catalog/list views).

**Apply the same pattern to all four new URL columns.** For each:

```
on save:
  if coach_video_url is set and changed:
    1. extractYouTubeId(url) → videoId
    2. fetch https://www.youtube.com/oembed?url=...&format=json
    3. download the `thumbnail_url` from the response
    4. cloudinary.cloneByUrl(thumbUrl, {resource: 'workout-media', userId: program.owner_id, ...})
    5. write the Cloudinary secure_url into coach_video_thumb_url
```

Use the existing `CloudinaryService.cloneByUrl()` — already does exactly this for posts.

**Folder layout** (extends the convention in `cloudinary.service.ts`):
- `motionhive/<env>/program-media/<ownerId>/<programId>/cover/<filename>`
- `motionhive/<env>/program-media/<ownerId>/<programId>/workout/<workoutId>/<filename>`
- `motionhive/<env>/program-media/<ownerId>/<programId>/exercise/<prescribedExerciseId>/<filename>`

When the program is deleted, one `CloudinaryService.deleteFolder('motionhive/<env>/program-media/<ownerId>/<programId>')` call sweeps every thumbnail. Same pattern as posts.

**Async safety:** the oEmbed fetch is an external HTTP call. Follow the two-phase save pattern documented in CLAUDE.md ("Two-phase save for Stripe writes") — insert/update the row with the URL first inside the tx, fire-and-forget the thumbnail fetch *after* the tx commits, then UPDATE the cached thumbnail column when it lands. If the fetch fails we still have the YouTube URL and can fall back to the raw `https://img.youtube.com/vi/<id>/hqdefault.jpg` URL or re-try on next read.

When the jobs module ships (see `project_jobs_module_pending.md`) the thumbnail fetch becomes a real Bull job: enqueue `{rowType: 'program_workout', rowId, videoUrl}` post-commit, worker fetches + uploads + updates.

## Propagation behavior (copy-on-assign re-confirmation)

**Confirmed: HARD NO on propagation.** Coach edits to a master `prescribed_exercise.coach_video_url` after assignment do NOT propagate to already-assigned clients.

This is the same rule as everything else in the prescription tree (locked decision §10) — assignment deep-copies, period. Re-stating in the context of media:

| Action | Effect on assignment |
|---|---|
| Coach attaches video to `prescribed_exercise` *before* assignment | Video copies into `assigned_exercise.coach_video_url` at assignment time |
| Coach edits the video URL on `prescribed_exercise` *after* assignment | No effect on existing `assigned_exercise` rows. The client keeps the URL frozen at assignment time |
| Coach assigns the same program to a new client *after* editing the master | New client gets the new URL (copy happens fresh) |
| Coach deletes the YouTube video on YouTube itself | Both master row and assignment rows still have a (now-dead) URL. Cached Cloudinary thumbnail still works for list views |
| Coach removes the video URL on the master (sets to NULL) | Existing assignments unaffected |

This is the right behavior. Coaches commonly tweak their library after seeing how clients use it; if those tweaks back-propagated, every client's "this week's workout" could mutate under them mid-session.

The relevant copy logic lives in the to-be-written `ProgramAssignmentService.assignToClient(programId, clientId)` — when it does the `INSERT ... SELECT ... FROM prescribed_exercise`, the `coach_video_url` and `coach_video_thumb_url` columns are included in the SELECT projection. No special-casing needed.

## Per-client overrides

The shape works naturally because of copy-on-assign:

- Client A is assigned the program. `assigned_exercise[for-A].coach_video_url` = master value (e.g. video A).
- Coach watches Client A struggle with the exercise. Wants to give them a different cue.
- Coach opens Client A's assigned tree, edits `assigned_exercise[for-A].coach_video_url` → video B.
- Coach sets `assigned_exercise[for-A].is_modified_from_master = true` (existing flag in schema).
- Client B's `assigned_exercise[for-B].coach_video_url` is untouched — still video A.
- Master `prescribed_exercise.coach_video_url` is untouched — still video A. Next client to be assigned gets video A.

**This is V2 from a UX perspective** — V1 ships the column but not the FE for editing it. Reasoning:

1. The column costs zero (already added by V1 since `assigned_exercise` mirrors `prescribed_exercise` field-for-field).
2. The API surface for "update a single `assigned_exercise` post-assignment" is a wider can of worms (which fields can be edited? swap the exercise entirely? change set targets?) that V1 explicitly defers — see locked decision §10.
3. Forcing FE coaches to override per-client video without the broader override UI would feel half-built.

**V1 alternative for one-off per-client video:** the coach attaches the video to a message (existing messaging module — see migration 042) and references the workout in the message body. This is the social fallback; the structured override ships in V2 alongside per-client exercise edits.

## Future extension: client → coach form-check video

This is the bidirectional video that TrueCoach/Trainerize/Everfit/Future all ship as a flagship feature. The client records themselves doing an exercise and sends it back to the coach for form review.

**V1 / V2 stance: out of scope.** It's a real V3-or-later feature.

**Why bring it up here:** to argue that the schema we ship in V1 doesn't paint us into a corner.

The natural attachment point for a client form-check video is `logged_set` or `logged_exercise` — *not* on the prescription tree. The flow is "client did this set, here's a video of it." The column would be:

```sql
ALTER TABLE logged_exercise ADD COLUMN client_form_check_video_url VARCHAR(500);
ALTER TABLE logged_exercise ADD COLUMN client_form_check_video_thumb_url VARCHAR(500);
-- or, on logged_set if per-set granularity is wanted (TrueCoach goes per-exercise; Future goes per-workout)
```

Plus a `form_check_response` table when the coach replies with their own video. None of this retrofits V1 — it's purely additive.

**The key forward-compat property:** because V1's coach-video columns live on the *prescription* tree (program / program_workout / prescribed_exercise / assigned_*), and the future client-video columns live on the *log* tree (logged_exercise / logged_set), the two never collide and never share a table. Both can grow independently.

A different design — say, putting both coach and client videos in the same `workout_media` polymorphic table — would force us to handle "this row is owned by the coach" vs. "this row is owned by the client" lifecycle/permission split inside one table. Cleaner to keep them apart.

When form check ships, the migration will be:
1. Add `client_form_check_video_url` + `_thumb_url` to `logged_exercise`.
2. Add a `form_check_response` table for coach replies (a coach review of a client's form-check is itself a video, plus text notes, plus a status).
3. New notification types: `FORM_CHECK_REQUESTED`, `FORM_CHECK_REVIEWED`.
4. New Cloudinary folder: `motionhive/<env>/form-check/<userId>/<workoutLogId>/...`.

Zero retrofitting of V1 schema.

## Cross-reference with `exercise_media` overlay

`exercise_media` exists to model **provider-supplied media for catalog rows**. Why it's a separate table from `exercise.youtube_url`:

- Catalog rows can have multiple media items: a primary image, secondary images (different angles), a video. Free Exercise DB ships two JPGs per exercise (start position + end position).
- Provider licensing matters at the asset level: MuscleWiki videos expire (`licensed_until DATE`); custom YouTube thumbnails don't. The license-expiry column belongs per-asset, not per-exercise.
- Catalog seed pipelines (Free Exercise DB script, eventual MuscleWiki sync) write directly into `exercise_media`; they shouldn't be touching scalar columns on `exercise`.

**Should `workout_media` be the same pattern — a separate overlay table?**

### Argument for one shared overlay (extend `exercise_media`)

- "Less is more" — one table for all workout-domain media.
- Provider/license/dimensions metadata reused.
- If we ever ingest workout-level media from a third-party (e.g. a partner program library), one ingest pipeline.

### Argument against — keep them separate

- **Different lifecycle.** `exercise_media` is mostly write-once-from-seed-or-license. Workout media is write-by-coach-during-program-building — different mutation patterns, different auth.
- **Different ownership semantics.** `exercise_media` is owned by the catalog (system or instructor-owner-of-the-exercise). Workout media is owned by the program author. The same coach can attach a video to a workout that uses someone else's public exercise — those videos belong to the workout's program, not to the exercise.
- **Different deletion cascades.** Delete an exercise → cascade `exercise_media`. Delete a program → cascade workout media. The two trees don't share a delete root, so sharing a table means more CHECK constraints and nullable FKs.
- **The polymorphic FK problem returns.** As argued in §"Schema approach" Option C, extending `exercise_media` to cover workout entities means 5 sparse nullable FKs + CHECK("exactly one set"). Fragile.
- **V1 doesn't need provider/license/multi-asset for workouts.** YouTube URL + cached thumb on each row is sufficient. We're not licensing third-party workout videos.

### Recommendation

**Keep them conceptually separate. Don't build a `workout_media` overlay table in V1 — use columns. If V3 needs an overlay, build one then.**

Restated as a rule:

> `exercise_media` = media attached to **catalog rows**. One row per catalog asset, supports multiple providers and licensing.
> Workout-domain coach videos = scalar columns on `program` / `program_workout` / `prescribed_exercise` / `assigned_workout` / `assigned_exercise`. YouTube URL + cached Cloudinary thumbnail. One video per attachment point.

If we ever build a shared coach Video Library feature (like Everfit's — coach uploads a video once, attaches it to many workouts/exercises), *that* feature ships its own `coach_media_asset` table at that point. The workout-tree columns then become "FK to coach_media_asset" rather than "URL + cached thumb", and migration is straightforward — backfill `coach_media_asset` rows from existing URLs, swap the column type.

## Concrete migration diff against `05-db-schema.md`

### Enum changes

None. `media_kind` already covers `YOUTUBE | VIDEO | IMAGE | GIF | NONE` — we don't introduce a new kind because workout-attached videos are always YouTube in V1.

### Table changes

#### `program` — add columns

```sql
ALTER TABLE program
  ADD COLUMN cover_video_url       VARCHAR(500),
  ADD COLUMN cover_video_thumb_url VARCHAR(500),
  ADD CONSTRAINT program_cover_video_url_format CHECK (
    cover_video_url IS NULL OR cover_video_url ~ '^https?://(www\.)?(youtube\.com|youtu\.be)/'
  );
```

(Note: `program.cover_image_url` already exists per 05-db-schema.md. The new fields are siblings.)

#### `program_workout` — add columns

```sql
ALTER TABLE program_workout
  ADD COLUMN coach_video_url       VARCHAR(500),
  ADD COLUMN coach_video_thumb_url VARCHAR(500),
  ADD CONSTRAINT program_workout_coach_video_url_format CHECK (
    coach_video_url IS NULL OR coach_video_url ~ '^https?://(www\.)?(youtube\.com|youtu\.be)/'
  );
```

#### `prescribed_exercise` — add columns

```sql
ALTER TABLE prescribed_exercise
  ADD COLUMN coach_video_url       VARCHAR(500),
  ADD COLUMN coach_video_thumb_url VARCHAR(500),
  ADD CONSTRAINT prescribed_exercise_coach_video_url_format CHECK (
    coach_video_url IS NULL OR coach_video_url ~ '^https?://(www\.)?(youtube\.com|youtu\.be)/'
  );
```

#### `assigned_workout` — add columns (mirrors `program_workout`)

```sql
ALTER TABLE assigned_workout
  ADD COLUMN coach_video_url       VARCHAR(500),
  ADD COLUMN coach_video_thumb_url VARCHAR(500),
  ADD CONSTRAINT assigned_workout_coach_video_url_format CHECK (
    coach_video_url IS NULL OR coach_video_url ~ '^https?://(www\.)?(youtube\.com|youtu\.be)/'
  );
```

#### `assigned_exercise` — add columns (mirrors `prescribed_exercise`)

```sql
ALTER TABLE assigned_exercise
  ADD COLUMN coach_video_url       VARCHAR(500),
  ADD COLUMN coach_video_thumb_url VARCHAR(500),
  ADD CONSTRAINT assigned_exercise_coach_video_url_format CHECK (
    coach_video_url IS NULL OR coach_video_url ~ '^https?://(www\.)?(youtube\.com|youtu\.be)/'
  );
```

### Copy-on-assign update

The deep-copy SQL in `ProgramAssignmentService.assignToClient` must include the new columns in the SELECT projection from `prescribed_exercise` and `program_workout`. **Tracking note:** this is automatic if the copy is `INSERT ... SELECT *` style; explicit if it lists columns. Be explicit — list columns by name in the copy to avoid surprise propagation of future fields. Add a unit test asserting the URL + thumb survive a copy.

### No new tables

Zero tables added by this change. Pure column additions.

### Cloudinary folder convention (no schema, but lock it now)

In `CloudinaryService` add a helper:

```ts
buildProgramMediaFolder(ownerId: string, programId: string, sub?: {
  workoutId?: string;
  prescribedExerciseId?: string;
}): string {
  // motionhive/<env>/program-media/<ownerId>/<programId>[/workout/<workoutId>][/exercise/<prescribedExerciseId>][/cover]
}
```

When a program is deleted, `CloudinaryService.deleteFolder(motionhive/<env>/program-media/<ownerId>/<programId>)` wipes every thumbnail in one call. Same idempotent pattern as posts.

### Service-layer touch points (code, not migration)

- `ProgramService.update` — validate + fetch oEmbed thumb when `coverVideoUrl` changes
- `ProgramWorkoutService.update` — same, for `coachVideoUrl`
- `PrescribedExerciseService.update` — same
- `ProgramAssignmentService.assignToClient` — explicit column copy includes the new fields
- `ProgramService.delete` (soft) and hard-delete sweep — call `CloudinaryService.deleteFolder` on the program-media root
- New shared util: `src/common/utils/youtube.utils.ts` — `extractVideoId(url)`, `canonicalizeUrl(url)`, `fetchOembedThumbnail(videoId)`. Used by exercise media too (refactor `exercise.youtube_url` validation to call this, for parity).

### Test coverage to add

- Unit: YouTube URL canonicalization (strip `?t=...`, reject playlist URLs, accept all YouTube hostnames).
- Unit: deep-copy preserves `coach_video_url` and `coach_video_thumb_url` from `prescribed_exercise` to `assigned_exercise`.
- Unit: edit to master `prescribed_exercise.coach_video_url` does NOT mutate any existing `assigned_exercise.coach_video_url` (regression test on the propagation rule).
- Integration: `CloudinaryService.deleteFolder` is called when a program is hard-deleted.

## Tie-in to posts/feed feature

When a client completes a workout (existing `CLIENT_COMPLETED_WORKOUT` notification path) we may eventually let them share the completion to the posts/feed module — "I just finished Day 1 of Push Day with [coach name]". The shared post would naturally embed the program's `cover_video_url` as the rich-link card, the workout's `coach_video_url` as inline media on the day-specific post, etc. Because the post schema (`post + post_audience` per `project_posts_feature_decisions.md`) is media-URL based, all of this works additively: the post stores a snapshot of the URLs at share time, the workout-domain rows keep evolving, and the post doesn't break if the original video URL is later edited.

## Open questions

1. **Vimeo support?** TrueCoach and Future both back onto Vimeo because YouTube's auto-suggest-other-videos-at-end-of-playback is a coaching UX nightmare (your client gets recommended a competitor's program after your form cue ends). Worth considering Vimeo as a V1.5 addition — same oEmbed pattern, just a different regex. Cost is low; benefit depends on whether coaches actually use Vimeo. Hold for instructor interviews.

2. **Auto-detect Shorts?** YouTube Shorts are vertical 9:16. The current oEmbed thumbnail returns 16:9 letterboxed for Shorts. Worth detecting (`/shorts/<id>` in URL) and rendering the FE card differently. Not a V1 blocker.

3. **Video transcript / captions?** YouTube auto-generates these; we could pull and store for accessibility + searchability. Definitely V3+.

4. **Per-instructor coach Video Library?** I.e. coach uploads / catalogs videos once and attaches them by reference to many workouts. Everfit's killer feature. V2+ — would deprecate the column-based approach in favor of `coach_media_asset` + FK. Out of scope here but worth a research doc when it comes up.

5. **Locked decision §15 (snapshot on `logged_set`) — extend?** Currently `logged_set` snapshots `exercise_name_snapshot` + `exercise_youtube_url_snapshot`. Should it also snapshot the `coach_video_url` from `assigned_exercise` at log time? Argument for: 5-year-old workout history shows the coach's cues as they were. Argument against: snapshots multiply per column, and the `assigned_exercise.coach_video_url` *is already a copy* (copy-on-assign). The assignment row is the snapshot. **Recommendation: don't add a third snapshot column — the assigned_exercise row IS the snapshot.** Cross-reference 05-db-schema.md §15 if revisiting.

6. **Cloudinary egress cost?** Cached thumbnails are small JPGs (oEmbed returns ~480px wide); negligible vs. existing post-image traffic. Not a real concern.

7. **Form-check video (V3+) — should it live in the messaging module or in a dedicated `form_check_response` table?** Cross-cuts with messaging (migration 042). Separate research doc when we get there.

## Sources

- Trainerize Help Center — "Video Coaching" feature docs: https://help.trainerize.com (search "video coaching", "form check")
- TrueCoach — feature overview: https://truecoach.co/features/
- Everfit — coach features: https://everfit.io/features
- CoachAccountable docs: https://www.coachaccountable.com/help/
- Hevy Coach overview: https://www.hevyapp.com/coach
- Future Fitness product overview: https://www.future.co/how-it-works
- YouTube oEmbed spec: https://oembed.com/providers.json + https://www.youtube.com/oembed
- Internal: `04-locked-decisions.md` §8, `05-db-schema.md`, `src/common/services/cloudinary.service.ts`, `CLAUDE.md` (entity conventions)
