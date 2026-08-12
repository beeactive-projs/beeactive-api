# Workout tracking V2 — rewrite & build plan

Companion to `tracking-v2-design-prompt.md` and the Claude Design output
(`MotionHive - Workout tracking V2.html` in the `MotionHive (5)` export).

**Premise:** the **programs / plans / routines** area has no data worth preserving, so it
is free to reshape. Everything else stays: the seeded exercise catalog, users, sessions,
payments, groups, blog, and any logged workout history. No database reset, no reseed.

This plan proposes a structural rewrite of the plan model rather than eleven additive
patches — but it turns out to be a *forward-only, non-destructive* migration. See
"Migration strategy" below.

---

## The core observation

The V2 design lists eleven un-built backend gaps. Four of them are the same gap wearing
different hats:

- "needs a unified active-plans read that spans both"
- "needs a client-side schedule model (routine → weekday/block)"
- "needs per-set rows on `RoutineExercise` (flat single-target today)"
- "needs a save-as-routine endpoint"

They all exist because **`routine` is a fourth, degraded copy of a prescription tree** we
already model three times:

```
prescribed_exercise → prescribed_set     (coach authors)
assigned_exercise   → assigned_set       (copy per client)
logged_exercise     → logged_set         (what happened)
routine_exercise    → (nothing)          (user authors — flat, no set rows)
```

`routine_exercise` carries one `defaultSets` + one `targetRepsMin/Max` + one
`targetWeightKg`. That's why a solo user can't express a pyramid, why save-as-routine has
nowhere to write real sets, and why the plan switcher has to merge two incompatible
shapes.

Meanwhile `program.owner_id` is already a plain user FK. The **only** thing making a
coach's program different from a user's routine is a `@Roles('INSTRUCTOR')` check and a
separate table.

## The rewrite: one plan model, two owners

Delete `routine` and `routine_exercise`. A routine becomes **a `program` with one
`program_workout`**, owned by a user instead of an instructor.

Then add **self-assignment**: `program_assignment` where the assigner is the trainee.

That single move collapses the four gaps above into zero net-new machinery:

| Design need | How it's satisfied |
|---|---|
| Per-set routine rows | `prescribed_set` — already exists, full fidelity |
| Save workout as routine | Same copy path as assign-program, reversed |
| Multi-week scheduler | `assigned_workout.scheduled_date` — already exists |
| Unified active-plans read | One query on `program_assignment`. The switcher is native |
| Week strip / "today" | Identical query for coached and solo |
| Starter routine library | `program` with `owner_id NULL`, source SYSTEM |

The trainee still never sees a periodisation builder — that stays a **UI** decision, which
is what the designer actually recommended (ship B). The schema stops being the thing
enforcing it.

One logging entry point too: "start today's workout" is the same call whether the
`assigned_workout` came from a coach or from your own scheduled split.

### The alternative, if this feels too big

Keep `routine`, add a `routine_set` table mirroring `prescribed_set`, add
`routine_schedule`. Cheaper to reach, but you keep two parallel trees forever, the plan
switcher needs a merge layer on both ends, and every future set-level feature gets built
twice. With no production data this is the moment the unification is cheapest it will
ever be.

---

## Migration strategy

**No database reset. No reseed. One forward-only migration, `056`.**

The rewrite sounds destructive but isn't: almost every change is an `ALTER`. The only
tables that go away are `routine` and `routine_exercise`, which are exactly the
"programs and plans stuff" being replaced.

Untouched: `exercise` and its taxonomy (`muscle`, `equipment`, `exercise_media`, and both
M2M tables), `user`, `session`, `payment`, `group`, `blog_post`, everything else.

**Logged history survives too**, and by design rather than luck. Every link from a log
into the prescription tree is already `ON DELETE SET NULL`
(`workout_log.program_assignment_id`, `workout_log.assigned_workout_id`,
`logged_exercise.assigned_exercise_id`, `logged_set.assigned_set_id`), and the display
fields are snapshotted onto `logged_exercise` (`exercise_name_snapshot`,
`exercise_thumbnail_url_snapshot`). So even if assignment rows were dropped, old logs
degrade gracefully into freestyle-shaped history with their names and numbers intact.
Nothing here requires dropping them anyway.

### Migration 056 contents

**Drop** — the two tables being replaced by the unified model:
- `routine`, `routine_exercise`

If there are dev routines worth keeping, they convert with a single INSERT…SELECT:
each routine becomes a `program` + one `program_workout`, each `routine_exercise` becomes
a `prescribed_exercise`, and its `defaultSets` expands into that many `prescribed_set`
rows carrying the flat rep/weight target. Cheap to write if you want it; skip it if the
dev routines are throwaway.

**Drop** — dead column:
- `user.exercise_catalog_opt_in`, unused since the browse gate was lifted
  (`canClientBrowseCatalog` returns `true` unconditionally)

**Alter** — `program`:
- `owner_id` → nullable, to allow `SYSTEM`-owned starter programs
- add `source` (`SYSTEM` | `USER` | `INSTRUCTOR`)
- add `is_single_workout` — routine-shaped, drives the simplified solo editor

**Alter** — `program_assignment`:
- `instructor_id` → nullable
- add `assignment_kind` (`COACH` | `SELF`); self-assignment skips the
  ACTIVE-relationship check in the service
- add the repeat rule for the weekly / N-week scheduler
- add `share_off_plan` (schema only — the consent surface is deferred)

**Alter** — `logged_exercise`:
- add `is_skipped BOOLEAN NOT NULL DEFAULT FALSE` — fixes the bug where skip deletes the
  row
- add `swapped_from_exercise_id CHAR(36)` — substitution provenance

**Backfill** — two statements, since existing rows predate the new columns:
- existing `program` rows → `source = 'INSTRUCTOR'`
- existing `program_assignment` rows → `assignment_kind = 'COACH'`

Run with `npm run migrate`. Works identically on local and Neon; `migrate:fresh` is never
invoked and the exercise catalog is never re-seeded.

---

## Naming — settled against the brand standard

Checked against `motionhive-review` and `content-seo`. Two facts constrain this:

- **The product app has no i18n.** No `$localize`, no `i18n=`, no catalogue in
  `projects/web`. App copy is English only, so Romanian phonetics is N/A for now. Naming
  still has to be RO-*ready*, because the marketing site is bilingual and terminology must
  not drift between them.
- **The marketing site already owns this vocabulary.** Eight live features: Profile,
  Sessions, Programs, Exercises, Payments, Messaging, Community, **Progress**. The
  canonical RO set is Profil, Sesiuni, Programe, Exerciții, Plăți, Mesaje, Comunitate,
  **Progres**, Instrumente.

### Decision: "Workouts", not "Training"

The V2 design proposes a nav item called **Training**. I'm overriding that to **Workouts**.

The Progress feature's own marketing one-liner is *"Log every workout, see your
progress."* That sentence is already the information architecture: you **log workouts**,
you **see progress**. Naming the two nav items `Workouts` and `Progress` makes the app
match the promise word for word. `Training` introduces a seventh noun that appears nowhere
in the marketing vocabulary and has no canonical RO term, where `Workouts → Antrenamente`
and `Progress → Progres` are both natural, short, and already decided.

It also costs less: `/user/workouts` is the existing route, so the shell stays and only its
content changes.

Everything else in the designer's vocabulary table stands: **Session** stays quarantined to
booked calendar appointments (Sesiuni), **Program** stays the word for the authored
artifact, **Routine** survives as a user-facing label for a single-workout program, and
**Plan** is retired as a nav noun.

| Concept | EN (app) | RO (when i18n lands) |
|---|---|---|
| The do-surface, today plus quick start | Workouts | Antrenamente |
| The see-surface, records and trends | Progress | Progres |
| A booked appointment with a coach | Sessions | Sesiuni |
| A multi-week authored plan | Program | Program |
| A single repeatable workout | Routine | Rutină |

### Copy rules for every string written in this build

From `content-playbook.md`, non-negotiable:

- **No em or en dashes, ever.** Split into two sentences, or use a comma or colon. The V2
  design's own UI copy is full of them (*"Nothing scheduled — pick a routine or go
  freestyle"*) and every one must be rewritten on the way in. Existing app copy already
  violates this in `my-workouts.html:103` and `:129`; fix those in passing.
- **No kill-list words**: unlock, elevate, supercharge, seamless, journey, crush your
  goals, take it to the next level, effortless.
- **Icons are PrimeIcons (`pi pi-*`), not emoji.** The V2 design uses 🔥 for streak and 🎉
  for records; Part 2 already ruled emoji acceptable only as a rating affordance, never as
  copy.
- Sentence case headings, concrete over clever, second person.

## Claim accuracy — Progress is a live marketing promise

`features.ts:270-305` ships a full **Progress** feature page at
`motionhive.fit/features/progress`. It promises:

- *"See your history for every exercise"*
- *"Track personal bests and one rep maxes"*
- *"Proof you are improving. Watch your weights climb week over week."*

None of those exist. The route renders the literal string `Progress works`. Logging,
resume, and following a coach's plan are all genuinely live, so the page is roughly half
true, but by dimension 6 of the review standard a marketing page claiming unshipped
capability is an **S1 blocker**.

The fix is to build it rather than cut the copy, which moves **Stage 4 up the order**. It
is no longer just the biggest retention lever; it is closing a false claim that is live
right now.

## Status (2026-08-05)

**Stage 1 shipped.** Migration 056 run against the dev database, all data intact
(24 programs and 27 assignments backfilled, 907 exercises and every workout log
untouched). Routine module deleted, its start path ported into `WorkoutLogService`.
Programs open to `USER` with ownership unchanged. Nested create and tree-replace on
update so the routine editor still saves in one call. Frontend ported behind an adapter
in `RoutineService`, so components keep the routine vocabulary.

**Stage 2 shipped, both halves.** Backend: skip is a real state, swap records
provenance, and the missing `CLIENT_COMPLETED_WORKOUT` notification is wired. Frontend:
set rows are polymorphic by exercise kind (strength, bodyweight with an add-weight
reveal, duration, distance/cardio with derived pace), skip greys out with an undo and
drops out of the progress denominator, and swap goes through the real endpoint instead
of the old remove-then-add that silently discarded logged sets.

The four-card stat strip is gone from the logger — it restated the header and the rail
and pushed the actual work below the fold. First compactness debt paid.

972 tests green, lint clean, verified end to end against the running API and in the
browser across all four set-row variants.

**Stage 4 shipped — the live false claim is closed.** `/user/progress` was the string
`Progress works`; it is now a real surface with a nav item of its own. New `progress`
module, read-only and derived: no migration, no new tables. Overview aggregates
(workouts, volume, streak, weekly trend, consistency, records) plus a per-exercise
drill-in reading the `one_rep_max` history that completion has been writing since V1 and
nothing had ever displayed.

Progressive disclosure rather than degradation: one workout shows records and a baseline
framing, three adds consistency, two-plus weeks adds the trend. No empty charts, ever.

Volume counts only loaded sets. Bodyweight and cardio contribute nothing rather than
zero-inflating the figure, and set counts are reported separately so a bodyweight week
still shows work.

978 tests green (84 suites), lint clean, verified in the browser against rich, one-workout
and never-trained accounts. Aggregates cross-checked against raw SQL.

**Marketing claims now true:** "See your history for every exercise", "Track personal
bests and one rep maxes", "Watch your weights climb week over week".

**Stage 3 shipped.** The Workouts page now opens on today. No new route: per the naming
decision the surface was already called Workouts, so it gained a `mh-today-hero` above the
existing tabs rather than a parallel destination.

One new read, `GET /my/workouts/today`, returning today plus this week plus every active
plan. It exists because composing it client-side meant listing assignments and then
fetching each tree to find today — an N+1 on the most-visited surface. Routines and any
in-progress log still come from their own endpoints.

Five states, all verified in the browser: in-progress takes over the hero, today's
assigned work, already-done, rest day, and no-plan. The plan is context on the card, never
the headline.

**Reuse over rebuild.** `mh-week-strip` already existed (the mobile calendar agenda uses
it) and the design specced it as new — reused as-is. Same for `mh-kpi-card`, `p-tag`,
`mh-list-empty-state`.

Also removed two coach-first strings that contradicted the solo-first thesis: the history
empty state said "open a plan your coach assigned you" with a "Go to my plans" CTA, and
the header subtitle said "open one from your plans". Both now point at training.

982 tests green, lint clean.

**Stage 5 partly shipped.** Save-as-routine now runs server-side via
`POST /workout-logs/:id/save-as-routine`, with a TARGETS / STRUCTURE choice: bake today's
numbers into next time's targets, or keep the shape and drop the loads.

A save-as-routine dialog already existed on the completion screen, deriving exercises
client-side into one flat set count plus one target. Rather than add a second one it was
rewired to the new endpoint and gained the mode selector, so a workout logged 10/8/6 now
becomes three real prescribed sets instead of a flattened average. **Per-set routine rows
therefore exist on the write path.**

The routine *editor* still shows one collapsed row per exercise, which made renaming a
routine silently flatten its programming. The editor now tracks whether the exercise list
was actually touched and omits it from the update when it wasn't, so a rename leaves the
tree alone. Growing the editor to real per-set rows is still outstanding.

985 tests green, lint clean, verified end to end and in the browser.

**Stage 5 complete.** The light scheduler shipped: `POST /my/scheduled-routines` puts one
of your own routines on chosen weekdays, either rolling weekly or for a fixed block. It is
self-assignment — the same copy-on-assign machinery a coach uses, with `instructorId` null
— so a self-scheduled routine reaches the Workouts front door, the week strip and progress
through exactly the same reads as a coach's plan. That is migration 056 paying off.

Two details worth keeping: scheduling on a Thursday does not back-fill Monday, and a
rolling schedule materialises an eight-week horizon rather than generating forever
(extending it is a cron, mirroring `sessions.generate_recurring`).

990 tests green, lint clean, verified end to end in the browser.

## Repeatable end-to-end sweep

A 29-assertion API sweep covers all five stages plus cross-user isolation, and it is
written to be re-runnable: each run uses a unique routine name and asserts the *delta* it
adds to volume rather than an absolute total. An earlier version asserted absolutes and
"failed" on the second run purely because state accumulated, which reads exactly like a
regression and is not one.

What it pins, beyond the unit tests: a routine authored by a USER, nested create writing
real per-set rows, the old `/routines` endpoints being gone, starting from a routine with
no assignment, skip persisting rather than deleting, swap keeping its set rows, targets
baked from what was lifted, a rename leaving the set tree alone, self-assignment carrying
no instructor, an empty routine being refused, the scheduled plan reaching the front door,
progress volume moving by exactly the set that was logged, and another user getting 404s
on all of it.

## Per-set rows in the routine editor — done

`CreateProgramSetDto` lets a routine carry explicit rows, and they take precedence over
`defaultSets`, which stays as the shorthand for N identical sets.

The editor switches on the data rather than on a preference. A routine whose sets are all
identical shows the flat summary with a "Set each set separately" escape hatch; one with
real variation opens straight into rows, so nobody flattens a top set and backoffs by
saving without noticing the detail was there. Verified round-trip: a warm-up at 60kg, a
top set of 5 at 100kg and two backoffs of 8 at 85kg survive a save with all three distinct
shapes intact.

## Exercise picker rendering bug — fixed

Reported on mobile and desktop: the add-exercise list rendered as unreadable slivers.

A flex item normally refuses to shrink below its content, but that floor only applies
while `overflow` is visible. `.p-button` sets `overflow: hidden` for the ripple, which
removes it, so in a flex column capped at `max-h-110` a page of 50 rows was compressed
from ~62px to ~18px each. Shrinking happens before scrolling, so `overflow-y: auto` did
not save it. Fixed with `flex-shrink: 0` on the row.

Worth knowing: this is **not** a PrimeNG 21 → 22 regression, which was the first
hypothesis. Isolated it with a controlled probe — same markup as a `<button>` and a `<div>`
collapses identically with `overflow: hidden` and is fine with `overflow: visible`. A
codebase sweep found the picker was the only list matching the signature; the notification
bell has the same layout shape but keeps visible overflow, so it is unaffected.

## Coach side — what exists now

**The replay tells the truth.** `workout-log-replay` is the coach's view of a client's
session (`?coach=1`), and it was rendering none of the Stage 2 work: a skipped exercise
looked identical to an untouched one, and swaps were invisible. It now strikes through a
skipped exercise with a tag and hides its empty set table, and names the substitution
("Swapped from Romanian Deadlift") via an eager-loaded association rather than a bare id.
`setActualLabel` also stopped dropping distance on cardio sets — a 5km run in 26:30 read
as "26 min".

**`CLIENT_COMPLETED_WORKOUT`** fires in-app when a client finishes assigned work. In-app
only: a coach with ten clients does not want ten emails. Freestyle stays private.

**The roster shipped** — `GET /coach/roster`. Who is on track and who is slipping, without
opening each client. A read-model over assigned workout statuses and logs; no migration,
nothing captured specially for it. Scoped to ACTIVE relationships, INSTRUCTOR-only, on its
own controller so it never sits behind the personal-progress routes.

Each client carries one reason rather than a bare flag, ordered by urgency:
`NEVER_STARTED` (assigned but never logged) → `SILENT` (14+ days quiet) → `DROPPED`
(adherence fell 20+ points against the prior window) → `BEHIND` (under half the work due).
Two judgment calls worth keeping: a client with **no active plan is never flagged**,
because they have nothing to be behind on; and **nothing due yields null adherence, not
0%** — the question does not apply, and averaging zeros would drag the roster mean down
for reasons unrelated to adherence.

### One destination for people

The roster shipped as its own nav item next to Clients, and that was wrong. Two entries
for the same people, with the rich client profile hanging off the *secondary* one — the
directory couldn't reach it at all. Roster and Clients are two lenses on one list, not two
destinations, so they now share `/coaching/clients` with a switch: **Needs attention**
(default, the roster) and **All clients** (the table, where invite/notes/archive live).
`?view=all` deep-links the table. `/coaching/roster` redirects.

`CoachRoster` became a section rather than a page: no page header of its own, and no
`MessageService` provider — it inherits the host page's so the two lenses can't stack
duplicate toasts.

**The client profile never fetched anything.** It read the client from router navigation
state, so the `:id` in the URL was decorative and a refresh or a bookmark landed on "not
found" — and nothing in the app ever passed that state, so the page had been unreachable
since it was written. It now resolves from `ActivatedRoute` against a new
`GET /clients/:clientId`, which returns the same `ClientRow` shape as a list row so there
is no second code path for "arrived by link". Declared after every literal `@Get` in the
controller — registered earlier, a wildcard param swallows `/clients/invites`.

One trap worth keeping in mind: the list merges `instructor_client` relationships with
pending `client_request` rows, and **a request row carries a `clientId`** for an existing
user. It looks openable and 404s. `requestType` is the discriminator, not `status` — a
PENDING *relationship* is fine to open, a PENDING *request* is not.

**Remaining:** the docked number pad, superset execution, and offline sync.

## Supersets — what it would actually take

Schema and API are done: `superset_group_id` is written on create, deep-copied through
assign, and carried onto the log. But **nothing in the app ever sets it** (the builder only
renders an `SS1` badge if the value happens to exist), and the logger renders a flat list.
So it is two features, and authoring has to come first because execution has nothing to
render otherwise.

Roughly 150–250 lines for authoring and 200–300 for execution, all frontend. The cost is
not the lines, it is the edge cases the design's clean A1 ⇄ A2 pair does not cover: uneven
set counts between the pair, skipping one half, swapping one half, groups of three, adding
a set to one member mid-workout. Each needs deciding rather than discovering, and they all
land in the focus-advance logic.

Suggested split: ship authoring plus *visual* grouping in the logger (bracketed block,
shared rest after the last member, sets still independently tickable) and leave the
alternating auto-advance as a follow-up. That is most of the value for a third of the risk
and needs none of the five answers above.

## Rate limits will bite a repeated sweep

Two throttles are deliberately tight and both fire under repeated end-to-end runs:
login at 10 per 15 minutes (IP-level brute-force protection) and program creation at 30
per hour. The sweep caches tokens to disk and aborts loudly on either, because a blank
token or a 429 otherwise cascades into a dozen assertions that read like regressions and
are not.

## Known fragility (pre-existing, surfaced by this work)

`messaging.controller.integration.spec.ts` is not parallel-safe. It boots a full Nest
application in `beforeAll`, and under Jest's default workers it fails intermittently
(roughly one run in three) on the blocks/reports tests. Confirmed pre-existing: the suite
passes 3/3 in isolation and 2/2 with `--runInBand`, and the pre-change baseline is stable
only because there were fewer suites competing for workers.

Nothing in the workouts or progress work touches messaging. If CI starts flaking, add
`--runInBand` to `test:ci` or isolate that spec into its own Jest project — left alone
here because it affects the whole team's CI time and is not this feature's call to make.

## Environment note

The web app needs **Node 24.15+** (Angular 22). `node_modules` was stale at Angular 21
against a lockfile pinning 22, so the app did not build at all before this work;
`npm ci` plus a newer Node fixed it. Serve with:

```bash
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
```

## Build stages

Each stage is independently shippable. Ordered by value per unit of effort.

### Stage 1 — Migration 056 + service rework
Backend only, no user-visible change. Everything downstream depends on it.

Beyond the migration: `RoutineService` and `RoutineController` fold into the program
services, `ProgramController` opens to `USER` with an ownership scope, and
`ProgramAssignmentService` learns self-assignment (skip the ACTIVE-relationship check when
`assignment_kind = 'SELF'`).

Also: delete `routine.service.spec.ts` (383 lines) and fold its coverage into the program
specs. Expect churn across the 74-suite test base — the program/assignment services grow,
the routine service disappears.

### Stage 2 — Logger fixes (highest value per unit of effort)
- **Polymorphic set rows.** Pure frontend. Every column already exists
  (`duration_seconds`, `distance_meters`, `rpe`, `rir`). Makes planks and runs loggable
  for the first time.
- **Skip as a real state** — uses the new `is_skipped` column, drops from the progress
  denominator, undo strip.
- **Swap** — endpoint + `swapped_from_exercise_id`, reuses the existing catalog picker.
- **Completion notification to the coach.** Tiny; the builder pattern already exists in
  `workout/notifications.ts` and only `programAssignedForClient` currently fires. Closes
  a loop that's been open since V1.

### Stage 3 — Training home
The new front door. After Stage 1 the "unified active-plans read" is one query, so this
is mostly frontend.

Ship v0 without the scheduler if you want it sooner: today's assigned workout + routines
shelf + resume tile all work off existing reads.

**Push back on one design call:** the proposed mobile tab bar drops Sessions on the
grounds that it's lower-frequency than logging. True for a solo lifter, wrong for someone
whose whole relationship with MotionHive is booking classes — and those are appointments
you can be late for. Keep Sessions reachable in the bar.

### Stage 4 — Progress
Backend aggregates + frontend. No schema change: every number already exists. PRs are
stored dated in `one_rep_max`; volume, streak and consistency are queries over
`logged_set` and `workout_log`.

Biggest retention lever in the plan — the route currently renders the literal string
`Progress works`.

### Stage 5 — Authoring
- Save-a-workout-as-a-program (the conversion moment, off the completion screen)
- Simplified single-workout editor for solo users, reusing the builder's set rows
- The light scheduler: assign programs to weekdays, weekly or N-week block
- Seed the starter program library (see gap below)

### Deferred
- **Offline sync.** Hardest item, least urgent — with retry-on-reconnect you get degraded
  UX, not lost data.
- **Sharing/consent model.** Phase-two-facing, and it's a consent surface that deserves
  care rather than a quick endpoint. The `share_off_plan` column lands in Stage 1 so the
  shape is reserved.
- **Coach roster / adherence.** Phase two. It's a read-model over what Stages 2–4 already
  write.

---

## Gaps in the V2 design worth fixing before build

1. **Starter routine templates have no home.** Training-home screen 1C offers "Browse
   starter routines" with a Full-body starter and a PPL template. Nothing like that
   exists, and it's absent from the design's own fields table. `routine.userId` is
   `NOT NULL` today, so system-owned templates can't exist — the rewrite fixes this via
   nullable `program.owner_id`, but the *content* still needs authoring and seeding.
   This screen is the entire first-run experience for a solo user, so it matters.
2. **Decorative emoji.** V2 uses 🔥 on streak and 🎉 on records. Part 2 explicitly flagged
   the no-emoji-in-UI-strings rule and argued emoji were acceptable only as a rating
   affordance, not as copy. These are copy.
3. **Sessions in the mobile tab bar** — see Stage 3.

## What the design got right, and to keep

Its fields cross-check was verified against the code and is accurate throughout,
including the corrections from the audit (it does not repeat the stale "last time lookup
is missing" claim). The "inheriting, not losing access" treatment of a coach departing is
the strongest part and should survive implementation intact: the card flips to
**"Yours now"**, and the assignment already survives coach-archive in the backend today.
