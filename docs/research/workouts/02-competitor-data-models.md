# Competitor Data Models — How the Industry Shapes This

**Apps surveyed:** Hevy, Strong, Trainerize, TrueCoach, Everfit, Fitbod, JEFIT
**Bottom line:** Six independent successful apps converged on nearly the same data shape. The differences are about *who edits what* (solo lifter vs coach-client), not the model. We adopt the consensus shape verbatim.

## The single most important insight

> **Three layers: catalog → prescription → log. Always three, never two.**

Conflating any two is the #1 retrofit pain in this domain. Every app that started with two layers eventually migrated to three.

### Layer 1: Catalog (the "Bench Press" concept)

- One table holds both system-provided exercises and user-created custom exercises.
- Distinguished by `owner_id` (NULL for system) and `source` ('free-exercise-db' / 'user' / 'admin').
- Hevy calls these `exercise_template`. Trainerize calls them "exercises." TrueCoach calls them "movements."
- The shape is identical across apps.

### Layer 2: Prescription (the *plan*)

- An exercise *inside a workout template*, with target sets/reps/weight/tempo/rest/notes.
- Ordered by `index`. Optionally grouped (`superset_id`).
- References the catalog by ID. **Customization at the prescription level = override fields, not a fork of the catalog row.**
- Hevy's API exposes this as `routine.exercises[]` with `exercise_template_id` plus `sets[]` of *target* values.

### Layer 3: Log (what actually happened)

- Mirrors the prescription shape field-for-field but with extra signals: `completed`, actual `weight_kg` / `reps` / `rpe`, `start_time`, `end_time`.
- References the prescription **nullable** — so freestyle / unplanned workouts work too.
- **Snapshots `exercise.name` and `media_url`** onto the log at completion time. This is the *only* legitimate denormalization — needed so 5-year-old data survives a renamed/deleted exercise.

## Workout structure

Three nesting levels show up everywhere: `program → workout/day → exercise → set`.

- Hevy stops at level 2 (it's a logger, not a coach platform), but its "folder" is a soft grouping that approximates a program.
- Trainerize / TrueCoach / Everfit formalize the full hierarchy.

### Concrete shape decisions everyone agrees on

| Concept | Implementation | Apps using this |
|---|---|---|
| Ordering within a workout | Integer `order_index` (0, 1, 2…) | All |
| Supersets | Nullable `superset_group_id INTEGER` on the prescription row. Same id = paired. | All |
| Circuits / EMOM / AMRAP / Tabata | An `exercise_group` (or `block`) entity with a `kind` enum | TrueCoach, Everfit |
| Warmup vs working sets | `set_type` enum on the set row | Hevy: `normal/warmup/dropset/failure` |
| Programs (multi-day plans) | `week_index` + `day_index` on workout, parented by `program_id` | Trainerize, TrueCoach, Everfit |
| "Start whenever" programs | Add a `sequence_number` alongside week/day | Everfit Autoflow |

**Critical lesson:** Several apps tried self-referential linked lists for ordering. Every one migrated to integer indexes. Reordering is O(n) writes either way, but integer indexes are seekable and query-friendly. Use them.

## Assignment: copy-on-assign is unanimous

This is the most expensive decision to get wrong and the industry has converged:

- **Trainerize** explicitly distinguishes **Copy** (snapshot, edits don't propagate) from **Subscribe** (live link, edits propagate). The default everyone teaches is **Copy**.
- **TrueCoach** assigns programs as date-anchored copies onto the client's calendar.
- **Everfit Autoflow** is the closest to "live reference" — but only because Autoflow targets *future* dates; past assignments are frozen.

### Why copy wins

The moment a coach edits a master program, you do **not** want last Monday's already-completed workout to retroactively change its prescription. Logs reference the *assigned snapshot*, not the master. Per-client overrides (swap an exercise, change weight) are trivial because the client's program is already a private copy.

### Concrete shape

```
program_assignment
  id, master_program_id NULLABLE,   -- informational; do not rely on
  client_id, instructor_client_id,
  start_date, status,
  ...

assigned_workout         -- deep-copied from program_workout
  id, program_assignment_id, ...

assigned_exercise        -- deep-copied from prescribed_exercise
  id, assigned_workout_id, exercise_id (FK to catalog), ...

assigned_set             -- deep-copied from prescribed_set
  id, assigned_exercise_id, ...
```

The `master_program_id` is **informational only** (analytics: "this came from program X"). Treat any non-null value as nostalgic, not load-bearing.

## Set/rep/load schema

**One wide `set` table with lots of nullable columns** — not EAV, not JSON blobs.

Hevy's exposed API shape is the de facto standard:

```
set:
  index,
  set_type ('normal' | 'warmup' | 'dropset' | 'failure'),
  weight_kg,
  reps,
  distance_meters,
  duration_seconds,
  rpe (nullable),
  rest_seconds (nullable),
  superset_id (nullable),
  exercise_template_id,
  notes
```

The exercise's `kind` / `tracking_fields` (strength | cardio | duration | distance | bodyweight) tells the UI which columns to render. **Everfit** makes this explicit: per-exercise "tracking fields" picks up to 3 of `{reps, weight, time, distance, RPE, RIR, %1RM, HR, calories}`. The DB doesn't care which 3 — they're all just columns.

### Field-by-field conventions

- **Tempo**: `"3-1-1-0"` (eccentric–pause–concentric–pause). Don't model as 4 integers; coaches enter it as a string and want to display it as one. Store as `CHAR(7)`, validate format.
- **Reps**: integer + optional `reps_max` integer for ranges ("6–8"). Hevy does this.
- **Load**: can be absolute (`weight_kg`) **or** relative (`percent_1rm`). Store both as nullable. The resolver in the app reads the client's 1RM record at workout-start time and materializes the absolute weight. **Store the resolved value on the logged set** so historic numbers don't drift if the 1RM is re-measured.
- **Rest**: per-set, not per-exercise. Don't put it on the exercise row — coaches change rest mid-exercise.

### Pitfalls others migrated away from

1. **No prescription/log split** (early hobbyist apps): edits to "yesterday's workout" rewrite history. Don't.
2. **Exercises as a JSON blob on the workout row**: query-hostile, kills "show progress on bench press" reports.
3. **Snapshot exercise name onto every set**: looks denormalized-evil but is the right call for the *log* layer specifically — needed so 5-year-old data survives a renamed/deleted exercise.
4. **Single `reps` integer** with no range or AMRAP marker: forced retrofit to a flag column.
5. **Superset as its own entity with FKs both ways**: every app that did this collapsed to a `superset_id` integer on the prescription row.
6. **Live program references**: edit propagation is a footgun, not a feature. Even Trainerize defaults to copy.

## Media & instructions

Universally: **custom exercises take either a YouTube URL *or* an uploaded video file**, exposed as a single `media_url` + `media_kind` enum (`youtube | upload | image | gif`).

- **Hevy Coach** explicitly accepts "MP4 file or YouTube link."
- Render logic: detect YouTube URL → inline embed; otherwise serve the file.
- **Don't ship a YouTube-only field, you'll want uploads.** Don't ship an uploads-only field, you'll want to let people paste a link.

(MotionHive V1 ships YouTube-only — that's a deliberate scope cut, not a schema cut. The `media_kind` enum is in the schema from day one.)

### Notes/instructions at three levels

- **Catalog** (form cues, permanent): "Keep elbows tucked, drive through heels."
- **Prescription** (coach's note for *this* workout): "Go heavy this week."
- **Set** (client's log note): "Felt easy, add 5kg next time."

All three are needed. All three are simple `text` columns. Don't try to merge them.

## Meal plans (forward-compat namespace)

Don't try to share tables with workouts. The shape *rhymes* but doesn't match:

```
recipe (name, macros per serving, ingredients[], instructions)
meal (recipe_id, servings, slot enum: BREAKFAST|LUNCH|DINNER|SNACK|CUSTOM)
meal_plan_day (day_index, meals[])
meal_plan (name, weeks)
meal_plan_assignment (client_id, plan_id [copy], start_date, daily_macro_targets)
```

**Everfit and Trainerize both store macros at the recipe level per serving** (P/C/F required; Sat fat/Sugar/Fiber optional). **`meal_plan_assignment` carries the client's daily macro targets independently** of the plan — so a coach can reassign the same plan to two clients with different targets without forking.

**Build meals after workouts** but reserve the namespace now: a `program.kind` enum (`WORKOUT | MEAL | HABIT | HYBRID`) keeps a single discoverable surface without forcing one table to do both.

## Recommendations applied to MotionHive

(Cross-reference: these are formalized in [05-db-schema.md](./05-db-schema.md).)

1. **Three modules**: `exercise` (catalog + custom), `workout` (program / prescription / assignment / log).
2. **Copy-on-assign**, full stop. Track `master_program_id` for analytics only.
3. **One `set` table, wide & nullable**: `weight_kg`, `weight_percent_1rm`, `reps_min`, `reps_max`, `duration_seconds`, `distance_meters`, `rpe`, `rir`, `tempo`, `rest_after_seconds`, `set_type` enum (extended: `NORMAL|WARMUP|WORKING|DROPSET|FAILURE|AMRAP|REST_PAUSE|CLUSTER`), `superset_group_id`, `block_id`.
4. **`exercise_block` entity from day one**, with `kind` enum (`SUPERSET|CIRCUIT|EMOM|AMRAP|TABATA|NONE`). V1 UI may only render supersets — schema is ready for the rest.
5. **`exercise.kind`** drives UI tracking fields: `STRENGTH | CARDIO | DURATION | DISTANCE | BODYWEIGHT | MOBILITY`. Mirror Everfit's "pick up to 3 tracking fields" as an array on the exercise.
6. **Media**: `media_kind` enum (`YOUTUBE|VIDEO|IMAGE|GIF|NONE`) + `media_url`. V1 ships YouTube-only behavior; schema supports the others.
7. **Program structure**: `program → program_workout (week_index, day_index, sequence_number) → prescribed_exercise (order_index, superset_group_id, block_id) → prescribed_set (order_index)`. Both `(week,day)` and `sequence_number` redundantly — supports fixed-date AND "day N" assignment without two schemas.
8. **One-rep-max history**: separate `one_rep_max` table per `(user_id, exercise_id, recorded_at)`. Required for `weight_percent_1rm` resolution. Resolve at workout-start time; freeze the absolute on the logged set.
9. **Reserve namespace for nutrition**: `program.kind` enum even if only `WORKOUT` ships in V1.
10. **Snapshot only at the log layer**: copy `exercise.name` and `media_url` onto `logged_set` (or `logged_exercise`) at completion time. Historical reports survive catalog deletes.

## Sources

- [Hevy API Swagger UI](https://api.hevyapp.com/docs/)
- [hevy-mcp openapi spec (community)](https://github.com/chrisdoc/hevy-mcp/blob/main/openapi-spec.json)
- [Hevy: Workout Set Types](https://www.hevyapp.com/features/workout-set-types/)
- [Hevy: Set Types Explained](https://help.hevyapp.com/hc/en-us/articles/34896293707927-Set-Types-in-Hevy-Explained-Drop-Sets-Warm-Up-Sets-and-More)
- [Hevy: How to Write Sets and Reps](https://www.hevyapp.com/features/how-to-write-sets-and-reps/)
- [Hevy: Supersets](https://www.hevyapp.com/features/what-are-supersets/)
- [Hevy: Folders & Routines](https://www.hevyapp.com/features/gym-routines/)
- [Hevy Coach: Workout Builder](https://hevycoach.com/features/workout-builder/)
- [Hevy: Custom Exercises](https://www.hevyapp.com/features/custom-exercises/)
- [Strong: Supersets & Circuits](https://help.strongapp.io/article/98-supersets-and-circuits)
- [TrueCoach: Workout Builder Basics](https://help.truecoach.co/en/articles/3047972-the-workout-builder-basics)
- [TrueCoach: Creating a Superset](https://help.truecoach.co/en/articles/2403842-creating-a-superset)
- [TrueCoach: Programs](https://help.truecoach.co/en/articles/3047401-programs)
- [Trainerize: Master vs Client Program](https://help.trainerize.com/hc/en-us/articles/360000886023-When-to-use-a-Master-Program-Client-s-Program-and-Multiple-Programs)
- [Trainerize: Subscribe vs Copy](https://help.trainerize.com/hc/en-us/articles/11402922731540-What-is-the-Difference-Between-Subscribing-and-Copying-a-Program-to-a-Client)
- [Trainerize: Master Programs Library](https://help.trainerize.com/hc/en-us/articles/360000820206-About-Master-Programs-)
- [Trainerize: Smart Meal Planner](https://help.trainerize.com/hc/en-us/articles/360016477211-Create-a-meal-plan-using-the-Smart-Meal-Planner)
- [Everfit: Autoflow Training](https://help.everfit.io/en/articles/3661717-autoflow-training)
- [Everfit: 1RM Auto Progression](https://help.everfit.io/en/articles/3060080-program-workouts-using-1rm-tracking-auto-progression)
- [Everfit: Alternate Exercises](https://help.everfit.io/en/articles/3365668-add-an-alternate-exercise)
- [Everfit: Ancillary Rx (tempo, set types)](https://blog.everfit.io/ancillary-topics-in-exercises-rx)
- [Everfit: Meal Plan Templates](https://help.everfit.io/en/articles/8778043-introducing-meal-plan-templates)
- [Everfit: Recipes](https://help.everfit.io/en/articles/8811181-introducing-recipes)
- [Fitbod: Algorithm](https://fitbod.me/blog/fitbod-algorithm/)
- [JEFIT: Custom plans](https://www.jefit.com/wp/product-tips-faq/how-to-create-custom-workout-plans/)
- [Ben Nadel on PouchDB workout modeling (snapshot pattern)](https://www.bennadel.com/blog/3195-pouchdb-data-modeling-for-my-dig-deep-fitness-offline-first-mobile-application.htm)
- [Cybertec: EAV in PostgreSQL — don't do it](https://www.cybertec-postgresql.com/en/entity-attribute-value-eav-design-in-postgresql-dont-do-it/)
- [Vlad Mihalcea: schema-less EAV with JSON](https://vladmihalcea.com/how-to-store-schema-less-eav-entity-attribute-value-data-using-json-and-hibernate/)
- [N1 Training: Tempo notation](https://n1.training/understanding-tempo/)
