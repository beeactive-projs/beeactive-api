# 09 — Personal records (PR) detection & storage

**Status:** Research, not yet locked. Sibling of `04-locked-decisions.md` — once the user signs off, the PR-related rows below get migrated into `04` (locked) and `05-db-schema.md` (DDL).
**Owner:** ionut.butnaru
**Last updated:** 2026-05-22
**Migration impact:** Adds **1 table** (`personal_record`) + **1 enum** (`pr_kind`) + **1 column** (`workout_log.share_with_coach`) on top of the workouts foundation migration (046). Either folds into 046 if not yet shipped, or ships as 047.

## Why this research exists

V1 of the workouts module ships `one_rep_max` (already designed in `05-db-schema.md`) as the table that drives `%1RM` resolution. The user has now locked a new requirement on top of that:

> Users should hit PRs and we want to track them, optionally publish them, and use them as a foundation for future achievements/badges.

That sentence collapses three product questions into one:

1. **What is a PR in MotionHive?** Heaviest single lift? Best estimated 1RM? Volume PR? Cardio PR? Plank PR? Every fitness app draws this line differently — picking the wrong set in V1 means either bloated tables that nobody reads or a thin set that gets retrofit in three months.
2. **How is one stored and computed?** Cache rows that get rewritten on every workout, or a denormalised computed view over `logged_set`? The two have very different write-path costs and surfacing latencies.
3. **Who sees it?** The lifter, always. The coach — only if the lifter opts in. That last constraint is load-bearing and locked: **PR sharing with the coach is opt-in.** Default is private.

The document below surveys 7 apps to answer (1), gives a recommendation on (2), and gives a schema spec that respects (3).

What this doc explicitly does NOT do:

- It does not design the achievements/badges layer — that's its own research note (likely `10-achievements.md`). The PR table is intentionally shaped so the achievements engine can subscribe to it later without migration.
- It does not design the "public PR feed" or social share UX. The opt-in flag is on `workout_log`, not on `personal_record`, so a future "share this PR card to the feed" can plug in via a separate `pr_share` table without touching the PR rows themselves.
- It does not implement live-during-workout PR detection in the FE. Backend stores the row + emits a notification; the FE can layer a banner/confetti modal whenever it ships.

## Apps surveyed

Seven apps span the bodybuilding/powerlifting/general-strength/cardio spectrum. The bottom three rows (Strava, Garmin, StrengthLog) are added as supplementary references — they're not direct competitors but they pin down what mature PR detection looks like for cardio (Strava/Garmin) and per-rep-range strength (StrengthLog).

| App | Audience | PR kinds tracked (per docs / community) | 1RM formula | Multi-rep PRs? | Cardio PRs? |
|---|---|---|---|---|---|
| **Hevy** | General strength | Heaviest weight for reps, best 1RM, best set volume, most reps, best duration | Estimated (formula not officially named, community: Epley-style) | Yes — "Set Records" per rep count | Distance + duration PRs only (no pace/segment) |
| **Strong** | General strength / powerlifting | Estimated 1RM, weight (heaviest), max volume, best set per rep range | Estimated (community: Epley) | Yes — "best set at each rep" | Limited — distance/duration on cardio exercises |
| **StrongLifts 5x5** | Linear-progression beginners | "PR star" on any new heaviest set; total reps PR | None explicitly exposed | Implicit (every weight increase is a PR) | Not applicable (strength-only program) |
| **Fitbod** | AI-driven general strength | Estimated Strength (e1RM), Weight PR, Volume PR, Reps PR | **Modified Brzycki** (documented) | Yes — but emphasises the e1RM trend over per-rep PRs | None |
| **Boostcamp** | Powerlifting / programmed lifters | Max weight per rep range, max volume per session, max reps at a given weight, lifetime bests, e1RM curve | Estimated (formula not officially named) | Yes — explicitly "per rep range" | None |
| **JEFIT** | Bodybuilding | New 1RM, 5-rep PB, heaviest set of 12, dated PR history | Estimated (calculator-style, formula unspecified) | Yes — "per rep range" | Cardio module exists but PRs not the focus |
| **BodySpace** (Bodybuilding.com) | Bodybuilding social network | Workout log + rating; PR tracking present but community-feed-first | Not a documented feature | Light | None |
| **Strava** (ref) | Cardio | Best efforts at benchmark distances (1km, 1mi, 5k, 10k, half, full), longest, fastest segment | n/a | n/a | Yes — gold standard for cardio PRs |
| **Garmin Connect** (ref) | Cardio | Fastest 1km/1mi/5k/10k/half/full, longest run/ride, best power outputs | n/a | n/a | Yes — automatic + manual override |
| **StrengthLog** (ref) | Strength training, RM-per-rep emphasis | "PR!" all-time, "YR!" yearly record, per-rep-count RM | Estimated (per-rep RM tracked instead) | **Yes — every rep count individually** | Limited |

## What counts as a PR — per app

Each section below cites the source on the per-claim level. Documented = pulled from the app's help-center article. Community = pulled from reviews/Reddit/comparison sites (lower confidence).

### Hevy

**Documented PR kinds** (from the Hevy help center "Personal Records (PRs) and Set Records Explained"):

1. **Heaviest weight lifted for reps** — exact heaviest weight that has been used to complete `N` reps in a single set, for any `N`. This is essentially the "set record" surface re-projected as a PR.
2. **Best 1RM (estimated)** — derived from any logged set using a 1RM formula. Hevy does not officially name Epley vs. Brzycki in its public help articles; the community consensus (multiple Reddit threads, app-store reviews, comparison blogs) is that Hevy's e1RM looks Epley-shaped at default settings. This is the metric Hevy graphs as the headline strength trend.
3. **Best set volume (volume load)** — `weight × reps` of a single set. This is the "I did 100kg × 12 = 1200 volume" PR.
4. **Best session volume** — sum of all working-set volume for that exercise across one workout (note: at the *exercise* level inside a session, not workout-wide; Hevy displays it as "max session volume" on the exercise's history page).
5. **Most reps in a set** — for bodyweight or rep-based exercises (pull-ups, push-ups). Triggered without weight.
6. **Best duration** — for plank, hollow hold, dead hang, any DURATION-kind exercise.
7. **Longest distance** — for cardio exercises tracked by distance (running, cycling, rowing).

Documented twist: **"Set Records" vs "Personal Records"** are explicitly separated in the Hevy help center. Set Records is *every* heaviest-weight-at-N-reps cell (a sparse vector across rep counts 1..∞). Personal Records is the narrower set of headline metrics that trigger the live banner: 1RM, top set, top volume, most reps, top duration. The set-records sparse vector is browsable; the PR is the event that fires confetti.

**Assisted-bodyweight nuance** (Hevy help center, "Assisted Bodyweight Exercises"): effective load = `bodyweight − assistance`. Volume formula = `(bodyweight − assistance) × reps`. If user hasn't entered bodyweight, volume isn't computed at all (silently dropped — no negative weight). Assisted bodyweight exercises get **only** "most reps in set" and "most reps in session" PRs — no weight-based PR (because the load isn't comparable across machines/users).

**Surfacing** — three places: (a) **live banner** during the workout the moment a set is marked complete and beats a prior record ("Live PR Notification" feature page on hevyapp.com); (b) **end-of-workout summary** with a medal icon attached to the qualifying set; (c) **per-exercise history page** under "Set Records" and the e1RM trend graph.

**Source URLs**:
- https://help.hevyapp.com/hc/en-us/articles/35649367857175-Personal-Records-PRs-and-Set-Records-Explained-How-They-Work-in-the-Hevy-App
- https://help.hevyapp.com/hc/en-us/articles/38279531346455-Set-Records-vs-Personal-Records
- https://help.hevyapp.com/hc/en-us/articles/36954464726167-1RM-Explained-How-One-Rep-Max-is-Calculated-and-Use-It-Safely
- https://help.hevyapp.com/hc/en-us/articles/34380762441111-Assisted-Bodyweight-Exercises-How-it-Calculates-Volume-and-PRs
- https://www.hevyapp.com/features/live-pr/

### Strong

**Documented PR kinds** (app-store listing + repreturn.com review):

1. **Estimated 1RM record** — headline metric, graphed over time.
2. **Weight record** — heaviest absolute weight on any working set (independent of reps).
3. **Max volume record** — heaviest single-set volume.
4. **Per-rep-range best set** — heaviest weight for `N` reps (community-described as "PR at a specific rep range").

**1RM formula** — not officially named. Community sources (strengthjourneys.xyz, prpath.app comparisons) point to Epley as the default; the app's UI also exposes a configurable formula picker in advanced settings (community-reported, not officially documented).

**Surfacing** — primary location is the "Records" tab inside each exercise's history view: a list of records with their date and a graph showing 1RM progression. Strong does **not** have a live in-workout banner like Hevy's — community reviews specifically call this out as one of Hevy's edges over Strong.

**Source URLs**:
- https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577
- https://www.strong.app/
- https://repreturn.com/hevy-app-review/ (comparison section)
- https://www.prpath.app/blog/strong-app-review-2026.html
- https://prpath.app/blog/strong-vs-hevy-2026.html

### StrongLifts 5x5

**Documented PR kinds** (stronglifts.com app page):

1. **PR star on any set** — every time a set exceeds the previous best at that lift, the app shows a gold star. This is essentially "heaviest weight ever for this exercise" in a program where progression is the explicit goal.
2. **Total reps PR** — for the "Bodyweight Rows" and similar bodyweight exercises in the program.

StrongLifts is the simplest of the surveyed apps because the program *is* the progression — every Workout B is meant to add 2.5kg to the squat, so a PR is the default outcome, not an event. The star UX is celebratory but data-thin: there isn't a separate "Records" tab to browse, because the workout history already is the records list.

**1RM formula** — not exposed in the app. StrongLifts deliberately avoids the e1RM abstraction; the program targets actual heavy fives, not estimated singles.

**Surfacing** — gold star next to the set, plus a "you hit a PR today!" toast at workout end. No standalone PR page.

**Source URLs**:
- https://stronglifts.com/app/
- https://support.stronglifts.com/article/63-log-workouts
- https://stronglifts.com/reviews/

### Fitbod

**Documented PR kinds** (fitbod.zendesk.com "Fitbod Metrics & Records"):

1. **Estimated Strength (e1RM)** — Fitbod's headline metric. Documented as calculated from a "modified Brzycki formula" (fitbod.me blog post on Estimated Strength). Used both to *measure progress* AND to *prescribe the next workout's weights* (the algorithm calls back into e1RM to decide how heavy to load tomorrow).
2. **Weight Record** — heaviest absolute weight for the exercise.
3. **Volume Record** — heaviest single-set volume.
4. **Rep Record** — most reps in a single set.

Fitbod also surfaces "Benchmark Lifts" (a curated subset of fundamental lifts — bench, squat, deadlift, OHP, row) and **muscle-group strength scores** (e1RM aggregated per muscle, surfaced as the muscle "level"). Neither is strictly a PR table, but they're driven by the same underlying e1RM rows.

**Documented decay**: e1RM is *not* monotonic. If a user hasn't trained the lift recently, the algorithm reduces the estimate to reflect detraining. This is unusual — most apps treat PRs as a one-way ratchet. Fitbod's call here is "we'd rather under-prescribe than over-prescribe and injure you."

**Max Effort Day** (documented feature) — Fitbod scheduled AMRAP sets specifically to re-calibrate e1RM. Two AMRAP sets after working sets, used to recompute the e1RM with fresh data.

**Surfacing** — end-of-workout summary highlights any record hit; standalone "Records" view per exercise; Fitbod said in 2024 marketing that users logged "over 1.2 million new PRs in the app" — implies a notification-style celebration.

**Source URLs**:
- https://fitbod.zendesk.com/hc/en-us/articles/12732749777047-Fitbod-Metrics-Records
- https://fitbod.me/blog/estimated-strength/
- https://fitbod.me/blog/how-fitbod-tracks-your-strength-progress-with-real-time-metrics-and-scores/
- https://fitbod.zendesk.com/hc/en-us/articles/360033675553-Max-Effort-Day
- https://fitbod.me/blog/why-fitbod-is-the-ultimate-training-partner-for-advanced-lifters/

### Boostcamp

**Documented PR kinds** (boostcamp.app workout-tracker landing page):

1. **Max weight per rep range** — explicit "set record per N reps" matrix.
2. **Max volume per session** — heaviest single-session volume per exercise.
3. **Max reps at a given weight** — "how many reps did you ever hit at 100kg?"
4. **Lifetime bests** — aggregate "all-time" PRs.
5. **Estimated 1RM (e1RM) curve** — graphed trend computed from top sets.

Boostcamp leans hardest into the per-rep-range PR shape — the marketing copy explicitly enumerates "max weight per rep range" as a first-class kind. This makes sense for the powerlifting/programmed-lifter audience: a powerlifter cares about their 1RM, 3RM, and 5RM as distinct numbers, not a single "strength" abstraction.

**Documented UX**: PRs are "flagged the moment you hit them, with confetti and a record badge in the workout summary" (boostcamp.app /workout-tracker).

**1RM formula** — not officially named. Community search returns no consensus; the formula picker may be configurable per user (uncertain, community-reported).

**Pro tier**: "Strength Score" — single 0–100 strength score derived from IPF DOTS (a powerlifting scoring formula that normalises lifts by bodyweight). This is interesting prior art for the achievements layer but not a PR per se.

**Source URLs**:
- https://www.boostcamp.app/workout-tracker
- https://www.boostcamp.app/features
- https://www.boostcamp.app/blogs/how-to-hit-a-new-pr-test-your-1-rep-max-guide
- https://www.boostcamp.app/free-workout-app

### JEFIT

**Documented PR kinds** (support.jefit.com + jefit.com product pages):

1. **1RM PR** — new estimated 1RM.
2. **Per-rep-range PB** — "5-rep personal best", "heaviest set of 12", etc.
3. **Volume / total-reps PR** — community-reported, less prominently featured.

JEFIT's marketing emphasises "every PR you've hit — whether it's a new 1RM, a 5-rep personal best, or your heaviest set of 12" — confirming the per-rep-range shape but not breaking out which specific rep counts are tracked.

**1RM formula** — JEFIT has a help article titled "How Does JEFIT Calculate My 1RM?" but the article content was not fully extractable from the search snippet. Community-reported as Epley-style. JEFIT also allows manual 1RM reset (per a Twitter reply from the JEFIT account in the search results).

**Surfacing** — end-of-workout summary with new-record callouts; per-exercise PR dashboard with date stamps; progression line graph of e1RM over time.

**Source URLs**:
- https://support.jefit.com/hc/en-us/articles/202345984-How-Does-JEFIT-Calculate-My-1RM-
- https://support.jefit.com/hc/en-us/articles/201464434-How-Do-I-View-My-Progress-Graphs-
- https://www.jefit.com/
- https://www.jefit.com/analytics
- https://twitter.com/JefitInc/status/334659364969385985 (manual 1RM reset)

### BodySpace (Bodybuilding.com)

**Documented PR kinds**: thin. BodySpace is primarily a social network — feed, profile, photos, training partners. The tracker logs workouts and rates them; PRs as a *distinct surface* aren't part of the documented feature set. Workout-history graphs exist but are bodybuilding-style (volume per muscle group, progress photos) rather than per-rep-range PR matrices.

For MotionHive purposes, BodySpace is more useful as a reference for the **social-feed model around fitness data** (which is how the user's "optionally publish" requirement should land long-term) than as a PR-detection reference.

**Source URLs**:
- https://www.bodybuilding.com/help/track_mobile.htm
- https://shop.bodybuilding.com/pages/bodyspace
- https://play.google.com/store/apps/details?id=com.bodybuilding.rise

### Strava (reference — cardio gold standard)

**Documented PR kinds** (Strava help center "Best Efforts" and "All-Time PRs"):

1. **Best efforts at benchmark distances** (running: 1km, 1mi, 5k, 10k, 15k, 21k, 42k; cycling: similar set plus power-based bests).
2. **Top three lifetime efforts** at each benchmark distance.
3. **Top ten annual efforts** at each benchmark distance.
4. **Longest run / ride / activity**.
5. **Best power output** (cycling, per-duration: best 5s power, best 1min power, best 20min power, etc.).

**Detection mechanism**: automatic from GPS data. Strava scans the activity stream for any rolling window that beats a prior benchmark distance (e.g. "fastest contiguous 5km within today's 10km run"). Requires good-quality GPS; missing/erratic points disqualify the segment for PR consideration. Uses elapsed time, not moving time.

**This is the model the cardio PR types in MotionHive should aspire to, eventually.** V1 won't have GPS-stream parsing (no FIT/HealthKit ingest is in V1 scope), but the schema should leave room.

**Source URLs**:
- https://support.strava.com/hc/en-us/articles/16601494390285-Best-Efforts-Running
- https://support.strava.com/hc/en-us/articles/19685360245005-Best-Efforts-Overview
- https://support.strava.com/hc/en-us/articles/216918487-All-Time-PRs
- https://support.strava.com/hc/en-us/articles/19686060262669-Best-Efforts-Cycling

### Garmin Connect (reference)

**Documented PR kinds** (Garmin Connect help):

1. Fastest time over benchmark distances (1km, 1mi, 5k, 10k, half, marathon).
2. Longest run / ride.
3. Best heart rate / VO2max.

**Detection mechanism**: device-side. The watch detects new PRs during the activity ("New PR!" beep on-wrist) and the cloud reconciles when uploaded. Also supports manual "Set as PR" override.

**Source URLs**:
- https://support.garmin.com/en-US/?faq=GePPQ3FJYO0A8TAHLeC7CA
- https://support.garmin.com/en-US/?faq=Hti0IpSxeX2dPzfU1J8Er9
- https://support.garmin.com/en-US/?faq=unLSr8lk0z5EUCi0k8Yys8

### StrengthLog (reference — per-rep RM purist)

**Documented PR kinds** (help.strengthlog.com "Personal Records and Yearly Records"):

1. **Per-rep RM** — best 1RM, best 3RM, best 5RM, best 10RM, **and every other rep count** as a separate record.
2. **Yearly record (YR!)** — best for the current calendar year.
3. **All-time PR (PR!)** — lifetime best.

StrengthLog is the maximalist position on per-rep PRs: every rep count is a tracked record. The user can grind for "Yearly Records" as smaller, more achievable targets when the all-time PR is out of reach. This is a clean design — it makes the per-rep PR explicit and the time-windowed PR a first-class concept.

For MotionHive, the YR! / PR! split is worth borrowing for the future achievements layer, **not** for V1. V1 only needs all-time PRs.

**Source URLs**:
- https://help.strengthlog.com/help-article/personal-records-and-yearly-records/

## PR kinds — universal vs. advanced

Cross-cutting the per-app data above, here is the breakdown of which PR kinds are universal (every serious app does it) vs. advanced (only specialist apps do it):

| PR kind | Hevy | Strong | StrongLifts | Fitbod | Boostcamp | JEFIT | Verdict |
|---|---|---|---|---|---|---|---|
| Heaviest absolute weight | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **Universal** |
| Heaviest weight at N reps (per-rep-range) | ✓ | ✓ | implicit | ✓ | ✓ | ✓ | **Universal** |
| Estimated 1RM (e1RM) | ✓ | ✓ | ✗ | ✓ (headline) | ✓ | ✓ | **Universal** |
| Best set volume (weight × reps) | ✓ | ✓ | ✗ | ✓ | ✗ | partial | **Universal** |
| Best session volume (per exercise) | ✓ | partial | ✗ | ✗ | ✓ | partial | Common |
| Most reps in single set (bodyweight) | ✓ | ✓ | partial | ✓ | ✓ | ✓ | **Universal** |
| Best duration (plank, hold) | ✓ | partial | ✗ | ✗ | ✗ | ✗ | Advanced |
| Best distance (cardio) | ✓ | partial | ✗ | ✗ | ✗ | ✗ | Advanced |
| Best pace / fastest 5k / segment PR | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Advanced (Strava territory) |
| Most reps at a given weight | ✗ | partial | ✗ | ✗ | ✓ | partial | Advanced |
| Yearly record (YR!) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Advanced (StrengthLog only) |

### V1 MotionHive PR kinds (recommended)

Based on the universal column, V1 should ship:

1. **`HEAVIEST_WEIGHT`** — heaviest absolute weight on any working set for this exercise. One row per exercise per user, replaced when beaten.
2. **`HEAVIEST_AT_REPS`** — heaviest weight at exactly `N` reps. One row per `(exercise, user, reps)` triple, replaced when beaten. Covers per-rep-range PRs.
3. **`ESTIMATED_1RM`** — best estimated 1RM derived from any single set. One row per exercise per user, replaced when beaten. Drives the headline strength trend.
4. **`BEST_SET_VOLUME`** — heaviest single-set `weight × reps`. One row per exercise per user, replaced when beaten.
5. **`MOST_REPS`** — most reps in a single set, irrespective of weight. One row per exercise per user, replaced when beaten. Required for bodyweight exercises.
6. **`BEST_DURATION`** — longest time in a single set (plank, dead hang). One row per exercise per user, replaced when beaten. Only meaningful for `exercise.kind = 'DURATION'`.
7. **`BEST_DISTANCE`** — longest distance in a single set (cardio). One row per exercise per user, replaced when beaten. Only meaningful for `exercise.kind IN ('DISTANCE', 'CARDIO')`.

### Out of V1 scope

- **Pace-based / segment PRs** (Strava-style fastest 5k inside a longer run) — needs GPS stream parsing, which is not in V1. Schema is forward-compat: `BEST_DURATION_AT_DISTANCE` can be added as an enum value later without migration.
- **Yearly / monthly windowed records** (StrengthLog's YR!) — defer to the achievements layer where time-windowed bests are a natural fit. The `achieved_at` column on `personal_record` is the substrate; the time-window logic lives in the achievements engine.
- **Most reps at a given weight** — Boostcamp does this and it's clever, but it's two orthogonal axes (weight bucketing + rep count) that complicate the UI. Defer.
- **Best session volume per exercise** — derivable from `workout_log` aggregates on demand. Don't materialise.
- **Per-muscle-group strength scores** (Fitbod-style) — derivable from per-exercise e1RMs. Defer.
- **DOTS / Wilks scoring** (Boostcamp's "Strength Score") — bodyweight-normalised. Achievements layer.

## Computation: live vs. background job

The two options:

**Option A — live, in the request that completes the set/workout**:
- When a `logged_set` is marked complete (or when a `workout_log` is set to `COMPLETED`), the service compares the new value against the current PR row and updates it inline.
- Pros: immediate user feedback ("PR!" banner can fire from the same response). Single source of truth — PR is always consistent with the latest log. No queue lag.
- Cons: every set-complete write does N reads + possibly N writes (one per PR kind that applies). Most are cheap (single-row lookup on a covering index) but it adds up if a user logs 30 sets in a workout.

**Option B — background job, fired post-workout-complete**:
- `workout_log.status = COMPLETED` enqueues a `recompute-prs-for-workout` job. Worker scans all `logged_set` rows in the workout, diffs against current PR rows, applies updates, fires notifications.
- Pros: keeps the set-complete write path lean. Easy to backfill (just enqueue jobs for every historical `workout_log`). Easy to retry.
- Cons: lag between completing a workout and seeing the PR — Hevy's live banner is impossible. Need the jobs module to exist (it currently does, per the recent commit log).

**Recommendation: hybrid (mostly A with B as fallback)**.

- **Live (Option A) on workout completion** — when `PATCH /workout-logs/:id/complete` flips status to `COMPLETED`, the service computes PRs *for that workout* synchronously inside the same transaction. PR rows updated; notification builders pushed to the `NotificationOutbox` (existing pattern — see CLAUDE.md "Notifications" section); outbox flushed post-commit.
- **Live per-set is overkill for V1.** Hevy's "live during workout" banner is a UX flourish that requires the FE to know about PRs the moment a set is checked. We can ship that in V2 by exposing a `POST /workout-logs/:id/sets/:setId/check-pr` endpoint that returns `{ prHit: true/false, kind: 'HEAVIEST_AT_REPS' }`. V1 ships the end-of-workout summary modal — that's the moment of truth for 80% of the celebration value.
- **Job (Option B) only for backfill** — one-shot script that re-derives all PR rows from historical `logged_set` data (for users who had workouts pre-PR-feature, or to recover from a bad deploy). Lives in `scripts/backfill-prs.ts`, not a recurring worker.

Why live-on-completion (not live-per-set) is the right V1 trade-off:

- The user explicitly framed PRs as a foundation for "future achievements/badges." Achievements care about *what happened in a workout*, not *what's happening right now*. Workout-completion is the natural commit boundary for both.
- The end-of-workout summary already exists as a natural UX moment ("you completed your workout!"). Attaching the PR celebration to that screen is a clean V1 ship.
- Per-set live detection has hairy edge cases: what if the user undoes a set? Re-checks it? Edits the weight after marking complete? Doing PR detection only at workout-completion sidesteps the entire "did I undo this PR?" problem.

### Where the computation lives

Service-layer method, called from `WorkoutLogService.complete()`:

```ts
// pseudo, lives in PersonalRecordService
async detectAndPersistPRs(
  workoutLogId: string,
  tx: Transaction,
): Promise<PersonalRecord[]> {
  // 1. Load all logged_set rows for the workout, grouped by logged_exercise.
  // 2. For each (exercise, user) pair, fetch the current PR rows.
  // 3. For each set, compute candidate PR values across all kinds applicable to exercise.kind.
  // 4. Diff against current PRs. If beaten, update the row + record the achieving set.
  // 5. Return the list of new PRs (caller fires notifications via outbox).
}
```

`one_rep_max` is updated as a side effect: when an `ESTIMATED_1RM` PR is set, the same set's estimated 1RM is also inserted into `one_rep_max` with `source = 'ESTIMATED_EPLEY'`. This keeps the existing %1RM resolution pipeline working without a separate code path.

## Estimated 1RM formulas

The two formulas the surveyed apps converge on:

**Epley** (Boyd Epley, 1985, U. of Nebraska strength program):
```
e1RM = weight × (1 + reps / 30)
```

**Brzycki** (Matt Brzycki, 1993, Princeton):
```
e1RM = weight × 36 / (37 − reps)
```

**Lombardi** (less common):
```
e1RM = weight × reps^0.10
```

### Accuracy characteristics

| Reps performed | Epley accuracy | Brzycki accuracy | Notes |
|---|---|---|---|
| 1 | exact (returns input) | undefined as reps → 1 the formula returns weight (correct) but is highly sensitive | use measured 1RM, not estimated |
| 2–5 | good | **best** | Brzycki is the powerlifting community default |
| 6–10 | **best** | good | Epley is the bodybuilding/general community default |
| 11+ | degrades, over-estimates | degrades, also imprecise | neither formula is reliable; consider using "highest rep set" not "estimated 1RM" for high-rep work |

**Crossover point**: Epley and Brzycki produce identical results at exactly **10 reps**. Below 10 reps, Epley estimates higher; above 10 reps, Epley estimates lower.

### Which apps use which (per research above)

- **Fitbod** — documented "modified Brzycki". Officially named in their Estimated Strength blog post.
- **Hevy** — not officially documented. Community consensus: Epley-shaped at default settings.
- **Strong** — not officially documented; community consensus Epley; possibly user-configurable in advanced settings.
- **Boostcamp** — not officially documented.
- **JEFIT** — has a help article (not fully visible in the WebSearch snippet); community-reported as Epley-style.
- **StrongLifts** — does not expose e1RM at all.

### Recommendation for MotionHive

**Use Epley as the default e1RM formula.** Reasons:

1. **It is the de facto industry default.** When in doubt, match the lifter's mental model from other apps they've used.
2. **It works well in the 3–10 rep range**, which is where the vast majority of strength training happens.
3. **It is simple, well-understood, and trivially auditable.** No "modified" qualifier needed — a coach reading our API docs can re-derive the number on a napkin.
4. **It composes cleanly with `one_rep_max.source = 'ESTIMATED_EPLEY'`** which is already defined in `05-db-schema.md`. No new enum value needed; the existing schema already foresaw this.

If user feedback drives demand for Brzycki later, the existing `one_rep_max.source` column already includes `'ESTIMATED_BRZYCKI'` as a valid value. A future setting `user_preference.preferred_1rm_formula` could swap the formula per user without a schema change. **Defer that switch until at least one paying instructor asks for it.**

### Edge cases

- **`reps = 0`**: not a meaningful input. PR computation skips the set.
- **`reps = 1`** (a true 1RM lift): e1RM = weight. The PR is the lift itself. `one_rep_max.source = 'TESTED'`.
- **`reps > 12`**: still compute the e1RM, but flag it as `source = 'ESTIMATED_EPLEY'` and trust it less (the achievements layer can choose not to celebrate e1RM PRs derived from very-high-rep sets — that decision lives outside the PR table).
- **`weight = 0`**: bodyweight exercise. No e1RM computed. `MOST_REPS` is the only weight-axis PR.
- **Assisted bodyweight** (negative effective weight, e.g. assisted pull-ups with more assistance than bodyweight): per Hevy precedent, skip volume + e1RM PRs. Only `MOST_REPS` applies.

## Storage: row-per-PR vs. compute-on-read

The tradeoff:

**Row-per-PR (cached)**: maintain a `personal_record` table with one row per `(user, exercise, kind, [reps_bucket])`. Read is `O(1)` by index. Write happens at workout-completion.

**Compute-on-read (no table)**: derive PRs by querying `logged_set` history with window functions. Read is `O(N)` over the user's history per exercise. Write is free (no PR rows).

### Why row-per-PR wins for MotionHive

1. **Read patterns dominate**. The profile screen, end-of-workout summary, exercise-history page, achievements engine, and (eventually) social PR feed all want to read PRs quickly and frequently. Recomputing from `logged_set` on every profile load is wasteful — the user reads their PRs hundreds of times more than they hit new ones.

2. **The "you just hit a PR" event needs an explicit row anyway.** The notification builder, the achievement-eligibility scan, and the FE confetti modal all want a stable identifier — `personal_record.id` — to reference. Compute-on-read produces an ephemeral value with no anchor.

3. **Achievements layer leans on PR rows.** When the achievements engine ships, it'll subscribe to "new PR row inserted/updated" as the canonical trigger. A computed view doesn't give us that trigger surface without an extra layer.

4. **Stale-PR risk is bounded**. The only way the cached PR row gets stale is if (a) a `logged_set` is deleted, or (b) the PR detection logic itself changed. (a) is rare (users don't delete completed workouts often) and the fix is "on workout delete, recompute PRs for that exercise". (b) is even rarer and the fix is the backfill script.

5. **Compute-on-read at scale is brutal.** Per-rep-range PRs alone are `O(N)` per rep count. A user with 5 years of training data + 20 lifts × ~12 rep counts = 1200 row scans per profile view. Doable with the right indexes, but a write-once-read-many cache table is dramatically simpler.

### Storage budget reality check

Back-of-envelope:
- Avg active user has ~30 exercises in regular rotation.
- PR kinds per exercise: 4 (weight, e1RM, volume, most-reps) for STRENGTH; same plus duration/distance for cardio.
- `HEAVIEST_AT_REPS`: ~12 rep counts per exercise (1, 2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 50+).
- Total rows per user: 30 × (4 + 12) = 480 PR rows.
- 100k users × 480 = 48M rows. Single table, one CHAR(36) PK, two CHAR(36) FKs, a small numeric value, a timestamp. **Trivial** at Postgres scale with the right indexes.

## Recommended schema for MotionHive V1

### New enum

```sql
CREATE TYPE pr_kind AS ENUM (
  'HEAVIEST_WEIGHT',     -- heaviest absolute weight, any reps
  'HEAVIEST_AT_REPS',    -- heaviest weight at N reps (rep_bucket required)
  'ESTIMATED_1RM',       -- best estimated 1RM derived from a set
  'BEST_SET_VOLUME',     -- heaviest single-set weight × reps
  'MOST_REPS',           -- most reps in a single set, irrespective of weight
  'BEST_DURATION',       -- longest single-set duration (plank, hold)
  'BEST_DISTANCE'        -- longest single-set distance (cardio)
);
```

V2-reserved values (NOT added in V1 — add additively when the achievements layer asks for them):
- `MOST_REPS_AT_WEIGHT` (Boostcamp-style)
- `BEST_PACE_AT_DISTANCE` (Strava-style)
- `BEST_DURATION_AT_DISTANCE` (e.g. fastest 5k inside a longer run)
- `BEST_POWER_FOR_DURATION` (cycling power-curve PRs)

### `personal_record` table

```sql
CREATE TABLE personal_record (
  id                           CHAR(36) PRIMARY KEY,
  user_id                      CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  exercise_id                  CHAR(36) NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  kind                         pr_kind NOT NULL,

  -- Bucket discriminator (only used for HEAVIEST_AT_REPS; NULL for all other kinds)
  rep_bucket                   SMALLINT,

  -- The PR value itself. Exactly one of these is populated; semantics depend on `kind`:
  --   HEAVIEST_WEIGHT, HEAVIEST_AT_REPS    → value_weight_kg
  --   ESTIMATED_1RM                        → value_weight_kg
  --   BEST_SET_VOLUME                      → value_volume_kg (weight × reps)
  --   MOST_REPS                            → value_reps
  --   BEST_DURATION                        → value_duration_seconds
  --   BEST_DISTANCE                        → value_distance_meters
  value_weight_kg              DECIMAL(7,2),
  value_volume_kg              DECIMAL(10,2),
  value_reps                   SMALLINT,
  value_duration_seconds       INTEGER,
  value_distance_meters        INTEGER,

  -- Provenance — what set produced this PR
  achieving_logged_set_id      CHAR(36) REFERENCES logged_set(id) ON DELETE SET NULL,
  achieving_workout_log_id     CHAR(36) REFERENCES workout_log(id) ON DELETE SET NULL,

  -- For ESTIMATED_1RM: which formula produced the estimate
  formula                      VARCHAR(20),   -- 'EPLEY' | 'BRZYCKI' | NULL (for non-1RM kinds)

  -- Snapshots — preserve the achievement even if the source set/exercise is later renamed
  exercise_name_snapshot       VARCHAR(200) NOT NULL,
  reps_snapshot                SMALLINT,
  weight_kg_snapshot           DECIMAL(6,2),
  duration_seconds_snapshot    INTEGER,
  distance_meters_snapshot     INTEGER,

  -- Lifecycle
  achieved_at                  TIMESTAMPTZ NOT NULL,
  previous_value_numeric       DECIMAL(10,2),   -- for "+5kg from last PR" UX, NULL on first record
  previous_achieved_at         TIMESTAMPTZ,     -- when the prior PR was set, NULL on first record

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Exactly one PR row per (user, exercise, kind, rep_bucket). Replaced (UPDATE) when beaten.
  -- NULL rep_bucket needs special handling — we use COALESCE in the unique index.
  CONSTRAINT pr_rep_bucket_only_for_at_reps CHECK (
    (kind = 'HEAVIEST_AT_REPS' AND rep_bucket IS NOT NULL AND rep_bucket > 0)
    OR (kind <> 'HEAVIEST_AT_REPS' AND rep_bucket IS NULL)
  ),
  CONSTRAINT pr_value_required CHECK (
    value_weight_kg IS NOT NULL
    OR value_volume_kg IS NOT NULL
    OR value_reps IS NOT NULL
    OR value_duration_seconds IS NOT NULL
    OR value_distance_meters IS NOT NULL
  )
);

-- Uniqueness: one PR row per (user, exercise, kind, rep_bucket).
-- Use a sentinel for NULL rep_bucket so the unique index treats kinds without
-- a rep_bucket as a single key.
CREATE UNIQUE INDEX idx_personal_record_unique
  ON personal_record (user_id, exercise_id, kind, COALESCE(rep_bucket, -1));

-- Hot reads — profile and exercise-history pages
CREATE INDEX idx_personal_record_user_exercise
  ON personal_record (user_id, exercise_id, kind);

-- "All my PRs across all exercises, newest first" — for a PR feed view
CREATE INDEX idx_personal_record_user_achieved
  ON personal_record (user_id, achieved_at DESC);

-- "All PRs ever set on this exercise" — for instructor's view of a client
CREATE INDEX idx_personal_record_exercise
  ON personal_record (exercise_id, achieved_at DESC);
```

### Sequelize model sketch

```ts
@Table({ tableName: 'personal_record', timestamps: true, underscored: true })
export class PersonalRecord extends Model<PersonalRecord> {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID) id!: string;

  @ForeignKey(() => User) @Column(DataType.UUID) userId!: string;
  @ForeignKey(() => Exercise) @Column(DataType.UUID) exerciseId!: string;

  @Column(DataType.ENUM(...Object.values(PrKind))) kind!: PrKind;
  @AllowNull(true) @Column(DataType.SMALLINT) repBucket!: number | null;

  @AllowNull(true) @Column(DataType.DECIMAL(7, 2)) valueWeightKg!: string | null;
  @AllowNull(true) @Column(DataType.DECIMAL(10, 2)) valueVolumeKg!: string | null;
  @AllowNull(true) @Column(DataType.SMALLINT) valueReps!: number | null;
  @AllowNull(true) @Column(DataType.INTEGER) valueDurationSeconds!: number | null;
  @AllowNull(true) @Column(DataType.INTEGER) valueDistanceMeters!: number | null;

  @ForeignKey(() => LoggedSet) @AllowNull(true) @Column(DataType.UUID)
  achievingLoggedSetId!: string | null;
  @ForeignKey(() => WorkoutLog) @AllowNull(true) @Column(DataType.UUID)
  achievingWorkoutLogId!: string | null;

  @AllowNull(true) @Column(DataType.STRING(20)) formula!: string | null;

  @Column(DataType.STRING(200)) exerciseNameSnapshot!: string;
  @AllowNull(true) @Column(DataType.SMALLINT) repsSnapshot!: number | null;
  @AllowNull(true) @Column(DataType.DECIMAL(6, 2)) weightKgSnapshot!: string | null;
  @AllowNull(true) @Column(DataType.INTEGER) durationSecondsSnapshot!: number | null;
  @AllowNull(true) @Column(DataType.INTEGER) distanceMetersSnapshot!: number | null;

  @Column(DataType.DATE) achievedAt!: Date;
  @AllowNull(true) @Column(DataType.DECIMAL(10, 2)) previousValueNumeric!: string | null;
  @AllowNull(true) @Column(DataType.DATE) previousAchievedAt!: Date | null;
}
```

### Decision: replace-in-place, not append-only history

Each `(user, exercise, kind, rep_bucket)` keeps **one row** — the current best. When a new PR is hit, the row is **UPDATED** in place (not inserted as new). The `previous_value_numeric` / `previous_achieved_at` columns capture "what was the PR before this one, and when?" for the "+5kg from last PR" UX.

Why not append-only history? Three reasons:

1. **PR history over time is already in `logged_set`.** Any "show me my squat 5RM progression" graph can be reconstructed by scanning `logged_set` filtered by reps=5 and ordered by date. The PR table is a *current state* cache, not a history.
2. **Unique constraint enforcement is trivial** when one row per key. Append-only would need a separate `is_current` flag, more complex indexes, and a "demote prior" trigger.
3. **Storage stays bounded.** Replace-in-place keeps the table at ~480 rows per user. Append-only could grow to thousands per user (one row per beat-the-PR event).

The user-facing "PR history graph" can be served by:

```sql
SELECT ls.weight_kg, ls.completed_at
FROM logged_set ls
JOIN logged_exercise le ON le.id = ls.logged_exercise_id
JOIN workout_log wl ON wl.id = le.workout_log_id
WHERE wl.user_id = :userId
  AND le.exercise_id = :exerciseId
  AND ls.reps = :repBucket
  AND ls.is_completed = TRUE
ORDER BY ls.weight_kg DESC, ls.completed_at ASC
LIMIT 100;
```

— that's the "Set Records" history surface (à la Hevy's per-rep matrix), derivable directly from logs without a separate history table.

### Rep buckets — which `N` values do we materialise?

Two options:

**Option 1 — every rep count**: insert a row for `HEAVIEST_AT_REPS` with `rep_bucket = N` for every distinct `reps` value the user has ever logged. Pros: completeness. Cons: a user who has logged 1..50 reps gets 50 PR rows per exercise. Unbounded.

**Option 2 — fixed bucket set**: hardcode `rep_bucket IN (1, 3, 5, 8, 10, 12, 15, 20)`. Map any logged set's reps to the **largest bucket ≤ logged reps** (so a 9-rep set counts as a candidate for the 8-bucket; a 7-rep set counts as a candidate for the 5-bucket). Pros: bounded (8 rows per exercise). Cons: a 6-rep PR doesn't get its own row.

**Option 3 — every rep count up to a cap**: track `1..20` individually, then bucket `21+` as a single "high-rep" PR. ~21 rows per exercise. Bounded but more granular than Option 2.

**Recommendation for V1: Option 3 (1..20 individually, 21+ as a single bucket).**

- StrengthLog uses Option 1 (every rep count) and lifters love it. We approximate that fidelity up to 20 reps.
- Above 20 reps is endurance work where e1RM formulas degrade anyway — a single bucket is fine.
- Storage stays bounded (~21 rows per exercise × ~30 exercises × 100k users = 63M rows. Still fine).
- Encoded as: `rep_bucket = MIN(actual_reps, 21)`. Reps 21..∞ collapse to bucket 21.

### Integration with existing schema

**`one_rep_max`** — already in `05-db-schema.md`. Relationship:

- When a `personal_record` row of `kind = 'ESTIMATED_1RM'` is upserted, **also** insert a row into `one_rep_max` with `weight_kg = the new estimate` and `source = 'ESTIMATED_EPLEY'`. This keeps the existing `%1RM` resolution pipeline (used by `assigned_set.resolved_weight_kg`) working unchanged.
- `one_rep_max` is intentionally append-only history (per its existing design — `recorded_at` is the time axis). `personal_record` is current-state. The two coexist: `one_rep_max` is for graphs and prescription resolution, `personal_record` is for "what's my best ever."
- A future tested 1RM (user manually logs a 1-rep lift) writes both: `one_rep_max(source='TESTED')` and `personal_record(kind='ESTIMATED_1RM', formula=NULL, value_weight_kg=lifted)`. The achievements layer can prefer tested over estimated when deciding what to celebrate.

**`logged_set`** — the source of truth for raw set data. `personal_record.achieving_logged_set_id` references the specific set that produced the PR. Snapshots (`reps_snapshot`, `weight_kg_snapshot`) are filled at PR-write time so the row stays meaningful even if the set is later edited or deleted (the FK is `ON DELETE SET NULL`).

**`workout_log`** — `personal_record.achieving_workout_log_id` references the workout that contained the PR set. Used to (a) jump from the PR row back to the full workout context, (b) enforce the opt-in sharing rule (see next section).

**`exercise`** — `personal_record.exercise_id` is the exercise the PR is against. `exercise_name_snapshot` survives an exercise rename or soft-delete. `ON DELETE CASCADE` because a deleted exercise's PRs are no longer meaningful (this is a different call than `one_rep_max`, which also cascades).

**Future achievements/badges layer** — out of scope here, but the shape it'll subscribe to:
- "First time the user hit a `HEAVIEST_AT_REPS` at `rep_bucket = 5` for any compound lift → award `FIRST_5RM` badge."
- "User has 10 PRs of `kind = 'ESTIMATED_1RM'` across distinct exercises → award `ALL_ROUNDER` badge."
- "User PR'd a deadlift `HEAVIEST_AT_REPS rep_bucket=1` exceeding 2× bodyweight → award `DEADLIFT_2X` badge."

The achievements engine reads `personal_record` rows + cross-references `user.country_code`/bodyweight/etc. The PR table is shaped to be that reliable substrate — never edited after `previous_value_numeric` updates, monotonic per `(user, exercise, kind, rep_bucket)`, with stable snapshots.

## Surfacing & UX

Three primary surfaces, in priority order:

### 1. End-of-workout summary modal (V1, highest priority)

When the client completes a workout (`PATCH /workout-logs/:id/complete`), the response includes:

```json
{
  "workoutLog": { "id": "...", "status": "COMPLETED", "durationSeconds": 3120 },
  "newPersonalRecords": [
    {
      "id": "...",
      "kind": "HEAVIEST_AT_REPS",
      "exerciseId": "...",
      "exerciseNameSnapshot": "Barbell Back Squat",
      "repBucket": 5,
      "valueWeightKg": "127.50",
      "previousValueNumeric": "120.00",
      "previousAchievedAt": "2026-03-08T...",
      "achievedAt": "2026-05-22T..."
    },
    {
      "id": "...",
      "kind": "ESTIMATED_1RM",
      "exerciseId": "...",
      "exerciseNameSnapshot": "Barbell Back Squat",
      "valueWeightKg": "148.75",
      "formula": "EPLEY",
      "previousValueNumeric": "140.00",
      "previousAchievedAt": "2026-03-08T..."
    }
  ]
}
```

FE shows a celebratory modal with one card per PR. Confetti and a share-to-coach button (opt-in toggle wired to `workout_log.share_with_coach`).

### 2. Per-exercise history page (V1)

`GET /exercises/:id/personal-records?userId=me` returns all PR rows for that exercise. FE renders:
- The headline metrics (top of page): current e1RM, heaviest weight, best volume, most reps.
- A "Set Records" table: rep count × weight grid, derived from `personal_record` rows where `kind = 'HEAVIEST_AT_REPS'`.
- A 1RM trend line: derived from `one_rep_max` rows ordered by `recorded_at`.

### 3. Profile-level "Records" tab (V1)

`GET /users/me/personal-records?cursor=...&limit=...` returns the user's PRs newest-first across all exercises. Renders as a feed: "Squat 5RM 127.5kg — 2 days ago," "Bench 1RM 95kg — 1 week ago," etc.

### 4. Coach client-detail view (V1, gated on opt-in)

`GET /clients/:clientId/personal-records?cursor=...&limit=...`, instructor-only. Returns the same shape as #3 **but filtered to PRs whose `achieving_workout_log` has `share_with_coach = TRUE`**. See "Opt-in sharing" below.

### 5. PR feed / social card (V2+, out of V1)

The "publish a PR to a feed" angle the user mentioned is closest to BodySpace/Hevy's social shape. V1 does not ship a feed. The opt-in flag is on the `workout_log`, **not** on the PR row, precisely so a future `pr_share` table (per-PR explicit publish) can layer on without touching V1 data.

### Notification builders (V1)

Add to `notification-types.ts` and `workout/notifications.ts`:

- **`USER_HIT_PR`** — in-app + optional push, fires when a `personal_record` is upserted on a workout the user owns. Subject: "You hit a new PR — Squat 5RM 127.5kg!" Tap → deep-links to the per-exercise PR page.
- **`CLIENT_HIT_PR`** — instructor-only, in-app + email (toggleable). Fires only when the underlying `workout_log.share_with_coach = TRUE`. Subject: "Jane Doe hit a new Squat 5RM — 127.5kg." Tap → deep-links to the client detail page.

Both builders take primitive arguments (PR id, exercise name, value, formatted display string) per the existing notifications convention (CLAUDE.md: "Builders live in `<module>/notifications.ts` and take primitive arguments… never Sequelize entities").

## Opt-in sharing — how PRs interact with workout visibility

**Locked**: PR sharing with the coach is opt-in. Default is private. Without opt-in, the coach sees "workout completed" but not the numbers or the PRs.

### Where the flag lives

On `workout_log`, not on `personal_record`:

```sql
ALTER TABLE workout_log
  ADD COLUMN share_with_coach BOOLEAN NOT NULL DEFAULT FALSE;
```

Why on `workout_log` and not on `personal_record`:

1. **Granularity matches user intent.** Users opt in/out per workout ("share today's session with my coach"), not per PR ("share my 5RM but not my 3RM"). A per-workout flag is what the FE toggle controls.
2. **All numbers are bundled.** "Share this workout" means coach sees weights, reps, RPE, notes, AND PRs from that workout. Separating PR visibility from log visibility would be cognitively dissonant ("the coach sees my PR but not the set that produced it?").
3. **PR rows stay simple.** No per-row visibility flag, no audit trail on changes-of-mind. The PR is owned by the user, period. Visibility to the coach is derived from the workout it came from.

### Default state

The toggle defaults to `FALSE`. The user has to explicitly flip it ON. Even when an instructor assigns the workout (via `program_assignment`), the coach does **not** automatically see numbers — they see completion status, no numbers.

### What the coach sees without opt-in

`GET /clients/:clientId/workout-logs` — returns log rows with:
- `id`, `name`, `status`, `startedAt`, `completedAt`, `durationSeconds`, `feelingRating`.
- **Not**: `loggedExercise[].loggedSet[].weight_kg`, `.reps`, `.duration_seconds`, etc.
- **Not**: PRs from that workout.

Coach UI: "Jane Doe completed Workout 12/12 on Tuesday. (Numbers not shared.)"

### What the coach sees with opt-in

Everything. Full numbers, full PRs, RPE, notes. Plus a `CLIENT_HIT_PR` notification on each new PR.

### Enforcement layer

**Service-layer guard, not DB constraint.** `PersonalRecordService.listForCoach(coachUserId, clientUserId)` runs:

```sql
SELECT pr.*
FROM personal_record pr
JOIN workout_log wl ON wl.id = pr.achieving_workout_log_id
WHERE pr.user_id = :clientUserId
  AND wl.share_with_coach = TRUE
  AND EXISTS (
    SELECT 1 FROM instructor_client ic
    WHERE ic.instructor_id = :coachUserId
      AND ic.client_id = :clientUserId
      AND ic.status = 'ACTIVE'
  )
ORDER BY pr.achieved_at DESC;
```

Two gates: the `share_with_coach` flag and an active `instructor_client` relationship. Defence in depth.

**Edge cases**:

- **What if the user toggles a workout's share flag back to `FALSE` *after* the coach already saw the PR?** Future reads return empty (the PR no longer satisfies the join). The notification that already fired is already delivered — we don't try to retract it. UX rationale: this matches every social-network "I unshared a post" expectation — past notifications stand; future visibility is gated.

- **What if a PR's `achieving_workout_log` is NULL** (e.g., backfilled from a deleted workout)? Coach does **not** see it. NULL fails the `share_with_coach = TRUE` filter. Safe-by-default.

- **What if the user shares Workout A (which set the 5RM PR to 120kg) but not Workout B (which beat it to 127.5kg)?** The PR row has `achieving_workout_log_id = WorkoutB.id`. Coach sees nothing — the current PR is gated by B's flag. Coach does NOT see the stale 120kg either (the row was overwritten). UX: the coach's view of "my client's PRs" reflects only PRs the client opted to share — by design.

### Why not put a "share this PR" toggle on the PR row instead

Considered and rejected:

- It would let users share a PR *without* sharing the workout that produced it — "look at this number, but don't see how I got there." That undermines coaching: a coach can't help if they only see the highlight and not the context.
- It doubles the consent surface (two toggles: one per workout, one per PR) for negligible flexibility gain.
- It complicates the audit trail (which toggle "wins"?).

If a future product requirement is "let users post a PR card to a public social feed without exposing the workout," that's a separate **publish** action (different from the coach-visibility concept) and lives in a future `pr_share` table — not on the PR row.

## Computation walkthrough — end-to-end

For concreteness, here's the V1 happy path when a user completes a workout containing a PR set:

```
1. Client app → PATCH /workout-logs/:id/complete
2. WorkoutLogService.complete(id):
   a. Begin transaction
   b. UPDATE workout_log SET status='COMPLETED', completed_at=NOW(), duration_seconds=...
   c. PersonalRecordService.detectAndPersistPRs(workoutLogId, tx):
      i.   SELECT logged_set + logged_exercise + exercise FROM workout, grouped by exercise
      ii.  For each exercise group:
           - Fetch current PR rows for (user_id, exercise_id) — typically ≤20 rows
           - For each logged_set in the group where is_completed=TRUE:
             * Compute candidate values for each applicable PR kind:
               - HEAVIEST_WEIGHT: weight_kg
               - HEAVIEST_AT_REPS (bucket=MIN(reps,21)): weight_kg
               - ESTIMATED_1RM: weight_kg × (1 + reps/30)  // Epley
               - BEST_SET_VOLUME: weight_kg × reps
               - MOST_REPS: reps
               - BEST_DURATION: duration_seconds
               - BEST_DISTANCE: distance_meters
             * For each candidate, if no PR row exists OR candidate > current PR value:
               - UPSERT personal_record row (using ON CONFLICT for the unique index)
               - Record the previous_value_numeric / previous_achieved_at
               - Append to outbox: notification.notify(userHitPr(...))
      iii. For new ESTIMATED_1RM PRs: also INSERT INTO one_rep_max (source='ESTIMATED_EPLEY')
   d. If workout_log.share_with_coach=TRUE AND there are PRs:
      - Append to outbox: notification.notify(clientHitPr(coach_id, ...))
   e. Commit transaction
   f. Flush outbox (post-commit) — notifications dispatched
3. Response → { workoutLog, newPersonalRecords: [...] }
```

Notable patterns followed:
- All DB writes pass `{ transaction: tx }` (CLAUDE.md transaction rule).
- Notifications use the outbox pattern, flushed post-commit (CLAUDE.md notify-after-commit rule).
- Notification builders take primitives (PR id, formatted string), not Sequelize entities.
- Both layers (FE-via-response + notification) are needed — the response surfaces the PR for the immediate "you just completed your workout" modal; the notification surfaces it later for users who navigated away.

## Open questions

These need a yes/no from the user before the migration ships:

1. **Epley as default formula** — confirm, or do you want Brzycki (Fitbod's choice)? Default recommendation: **Epley**.

2. **Rep-bucket scheme** — confirm Option 3 (every rep count 1..20, then `21+` as a single bucket). Or do you want Option 2 (fixed buckets `{1,3,5,8,10,12,15,20}`)?

3. **Should the user be able to manually log a tested 1RM**, separate from a workout? StrongLifts and Garmin both have a "Set as PR" manual entry. If yes, that's a small endpoint: `POST /personal-records` with `kind='ESTIMATED_1RM', formula=NULL, value_weight_kg=lifted, achieving_logged_set_id=NULL`. Recommended: **yes for V1** — covers the user who has a tested 1RM from outside the app.

4. **PR row delete behavior on `workout_log` delete** — `ON DELETE SET NULL` is the current spec, leaving the PR row with a NULL `achieving_workout_log_id`. Alternative: cascade delete (PR row disappears). Recommendation: **SET NULL** + the next workout's PR detection naturally rebuilds the PR if a higher value exists in remaining logs (or, more honestly, leave it stale — the user-facing impact is negligible). The backfill script can be the cleanup mechanism if needed.

5. **`share_with_coach` default** — confirmed FALSE per the locked decision. Add a future `user_preference.default_workout_visibility` so a power user can toggle to "share by default" if they want — but **defer that preference** to V1.5; V1 just has the per-workout toggle defaulting to FALSE.

6. **Notification rate-limit / coalescing** — a user who PRs 5 lifts in one workout would receive 5 `USER_HIT_PR` notifications. Should we coalesce to one ("You hit 5 PRs in today's workout!") in V1, or fire individually and let the FE group? Recommendation: **fire one summary notification** per workout when count > 1, individual notification when count = 1. Cleaner mailbox, no spammy push storm.

7. **Coach notification when a client hits multiple PRs in a shared workout** — same question. Recommendation: **one summary per workout**, regardless of PR count.

8. **Does the achievements/badges design get its own research note?** Recommendation: **yes**, as `10-achievements.md`. PR table is the substrate; achievements engine subscribes to PR upserts; badges are downstream of achievements. Keep the PR doc focused on PRs.

9. **Does V1 include the FE confetti modal**, or is that V1.5? Recommendation: BE ships the PR detection + response payload + notification in V1; FE ships a minimal "X new PRs!" toast in V1 and the full confetti modal in V1.5. Either way the BE shape doesn't change.

10. **Live in-workout per-set PR detection** (Hevy-parity) — V2 or never? Recommendation: **V2 maybe**, depending on whether users ask for it. The end-of-workout modal covers 80% of the celebration value; live per-set is a UX flourish for advanced lifters. Schema doesn't need to change either way.

## Sources (consolidated)

### Hevy
- [Personal Records (PRs) and Set Records Explained](https://help.hevyapp.com/hc/en-us/articles/35649367857175-Personal-Records-PRs-and-Set-Records-Explained-How-They-Work-in-the-Hevy-App)
- [Set Records vs Personal Records](https://help.hevyapp.com/hc/en-us/articles/38279531346455-Set-Records-vs-Personal-Records)
- [1RM Explained: How One-Rep Max is Calculated](https://help.hevyapp.com/hc/en-us/articles/36954464726167-1RM-Explained-How-One-Rep-Max-is-Calculated-and-Use-It-Safely)
- [Assisted Bodyweight Exercises: How it Calculates Volume and PRs](https://help.hevyapp.com/hc/en-us/articles/34380762441111-Assisted-Bodyweight-Exercises-How-it-Calculates-Volume-and-PRs)
- [Exercise Performance Tracking in Library](https://help.hevyapp.com/hc/en-us/articles/35382889578135-Exercise-Performance-Tracking-in-Library-Weight-Bodyweight-Cardio-and-Duration-Based-Exercises)
- [Live Personal Record Notification feature page](https://www.hevyapp.com/features/live-pr/)
- [How to Use Hevy's Live Activity on iOS and Android](https://help.hevyapp.com/hc/en-us/articles/35649846517399-How-to-Use-Hevy-s-Live-Activity-on-iOS-and-Android)
- [PR Meaning Workout: How, When, and Why to Test](https://www.hevyapp.com/pr-meaning-workout/)

### Strong
- [Strong Workout Tracker app-store listing](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)
- [Strong landing](https://www.strong.app/)
- [Strong vs Hevy comparison (prpath.app)](https://prpath.app/blog/strong-vs-hevy-2026.html)
- [Strong App Review (prpath.app)](https://www.prpath.app/blog/strong-app-review-2026.html)
- [Strong App Review (repreturn)](https://repreturn.com/hevy-app-review/)

### StrongLifts 5x5
- [StrongLifts app page](https://stronglifts.com/app/)
- [How to Log Workouts and Sets](https://support.stronglifts.com/article/63-log-workouts)
- [StrongLifts Reviews](https://stronglifts.com/reviews/)

### Fitbod
- [Fitbod Metrics & Records](https://fitbod.zendesk.com/hc/en-us/articles/12732749777047-Fitbod-Metrics-Records)
- [Estimated Strength: Fitbod's Main Metric of Progress](https://fitbod.me/blog/estimated-strength/)
- [How Fitbod Tracks Your Progress with Real-Time Metrics and Strength Scores](https://fitbod.me/blog/how-fitbod-tracks-your-strength-progress-with-real-time-metrics-and-scores/)
- [Max Effort Day](https://fitbod.zendesk.com/hc/en-us/articles/360033675553-Max-Effort-Day)
- [Why Fitbod Is The Ultimate Training Partner For Advanced Lifters](https://fitbod.me/blog/why-fitbod-is-the-ultimate-training-partner-for-advanced-lifters/)

### Boostcamp
- [Boostcamp Workout Tracker landing](https://www.boostcamp.app/workout-tracker)
- [Boostcamp Features](https://www.boostcamp.app/features)
- [How to Hit a New PR (Boostcamp blog)](https://www.boostcamp.app/blogs/how-to-hit-a-new-pr-test-your-1-rep-max-guide)

### JEFIT
- [How Does JEFIT Calculate My 1RM?](https://support.jefit.com/hc/en-us/articles/202345984-How-Does-JEFIT-Calculate-My-1RM-)
- [How Do I View My Progress Graphs?](https://support.jefit.com/hc/en-us/articles/201464434-How-Do-I-View-My-Progress-Graphs-)
- [JEFIT app-store listing](https://apps.apple.com/us/app/jefit-workout-plan-gym-tracker/id449810000)
- [JEFIT analytics page](https://www.jefit.com/analytics)

### BodySpace (Bodybuilding.com)
- [How Do I Track a Workout Using the Mobile BodySpace App?](https://www.bodybuilding.com/help/track_mobile.htm)
- [BodySpace product page](https://shop.bodybuilding.com/pages/bodyspace)
- [Bodybuilding.com Fitness App (Google Play)](https://play.google.com/store/apps/details?id=com.bodybuilding.rise)

### Reference apps
- [Strava: Best Efforts Overview](https://support.strava.com/hc/en-us/articles/19685360245005-Best-Efforts-Overview)
- [Strava: Best Efforts Running](https://support.strava.com/hc/en-us/articles/16601494390285-Best-Efforts-Running)
- [Strava: Best Efforts Cycling](https://support.strava.com/hc/en-us/articles/19686060262669-Best-Efforts-Cycling)
- [Strava: All-Time PRs](https://support.strava.com/hc/en-us/articles/216918487-All-Time-PRs)
- [Garmin: What Criteria Determines a Personal Record?](https://support.garmin.com/en-US/?faq=GePPQ3FJYO0A8TAHLeC7CA)
- [Garmin: How Are Running and Cycling Personal Records Determined?](https://support.garmin.com/en-US/?faq=Hti0IpSxeX2dPzfU1J8Er9)
- [Garmin: How Do I Manage My Personal Records?](https://support.garmin.com/en-US/?faq=unLSr8lk0z5EUCi0k8Yys8)
- [StrengthLog: Personal Records and Yearly Records](https://help.strengthlog.com/help-article/personal-records-and-yearly-records/)

### Formula references
- [1RM Formulas Explained (weightliftcalculator.com)](https://www.weightliftcalculator.com/articles/1rm-formulas-explained)
- [1RM Calculator (arvo.guru) — Epley vs Brzycki vs Lander](https://arvo.guru/resources/one-rep-max-formulas)
- [Brzycki Formula explained (arvo.guru)](https://arvo.guru/resources/brzycki-formula)
- [Epley Formula (vcalc.com)](https://www.vcalc.com/wiki/epley-formula-1-rep-max)
- [One-Rep Maximum (Wikipedia)](https://en.wikipedia.org/wiki/One-repetition_maximum)
- [How to Calculate Your E1RM: 7 Formulas (strengthjourneys.xyz)](https://www.strengthjourneys.xyz/articles/how-do-i-calculate-my-e1rm-estimated-one-rep-max)
