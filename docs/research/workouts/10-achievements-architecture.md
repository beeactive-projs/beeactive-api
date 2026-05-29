# 10 — Achievements/badges architecture (deferred implementation, present-day schema impact)

**Status:** Research only. Achievements are **not** in workouts V1. This document exists so the workouts V1 migration does not paint us into a corner when the achievements module ships in Phase 2.
**Last updated:** 2026-05-22
**Owner:** ionut.butnaru

## Why this research exists

The user's scoping note (verbatim):

> Achievements/badges are an ARCHITECTURE concern for now, NOT an implementation priority. V1 ships workouts WITHOUT badges. But the workouts schema must not paint us into a corner — when we eventually add achievements, the workouts data must contain everything the achievement engine needs to read.

That framing yields exactly one question for this document: **"What does the workouts V1 schema need today so that achievements can plug in additively later, without retrofitting?"**

The non-goals are equally important:

- **Do NOT design the achievements module.** Phase 2 will do that with its own research doc.
- **Do NOT reserve schema "just in case."** Every column/table/enum reservation must justify itself against a concrete future Phase-2 scenario the workouts schema would otherwise block.
- **Do NOT ship hidden side-channels.** No "we'll write to this column later and forget about it" debt. If a column is reserved, the rationale lives in this doc.

The output is a short list of schema additions/changes to `05-db-schema.md` plus an explicit "do NOT add these" list. Both lists are load-bearing.

## Investigation A: kinds of achievements in real apps

### Strava

Strava's achievement system is the most mature in the fitness space because it has two parallel surfaces — segments (location-based, social) and personal milestones (per-athlete). Public docs distinguish:

- **Segment crowns (KOM/QOM/CR):** fastest athlete on a segment's all-time leaderboard. Requires per-segment leaderboard recomputation on every effort.
- **Top-10 / top-3 trophies:** segment leaderboard placement.
- **Local Legend:** matches a segment more times than anyone else in the past 90 days. Time-windowed, social.
- **Personal records (PRs):** new best on a segment for the athlete themselves.
- **Challenges:** distance/elevation/time goals — daily, multi-day, or monthly. Trophy Case persists historic challenge badges.

Strava does not publish how their achievement engine is implemented. Strava's engineering blog focuses on infrastructure (cassandra → DynamoDB migration, Kafka, etc.) but doesn't dissect the achievement engine specifically. Best inference: segment leaderboards are clearly precomputed (otherwise the home feed would be uncacheable) and the per-effort "did this beat your PR" check almost certainly fires inside the activity-ingest pipeline.

Sources:
- [Strava — Getting Started with Achievements](https://communityhub.strava.com/insider-journal-9/getting-started-with-strava-achievements-1534)
- [Strava — The Trophy Case](https://support.strava.com/hc/en-us/articles/216918557-The-Strava-Trophy-Case)
- [Strava — Challenges](https://support.strava.com/hc/en-us/articles/216919177-Strava-Challenges)

### Apple Fitness / Activity

Apple's badge system is structured into ~5 visible categories on-device. The categories themselves are revealing about how the data must be modeled:

- **Close Your Rings** — Perfect Week (all three rings every day for a week), Perfect Month (Move ring every day of a month), All Rings Closed N times.
- **Monthly Challenges** — personalized goal each month (e.g. "burn 15% more move calories than your last 4 months' average").
- **Limited Edition** — seasonal/themed (Heart Month, Earth Day, Pride). These are calendar-windowed.
- **Workouts** — first-of-kind ("first cycling workout"), longest-of-kind, hardest-of-kind.
- **Competitions** — head-to-head against another user; badge issued on win and on participation.

Streak handling is interesting: Apple awards a streak badge **when the streak ends, only if it beats the previous best.** That means the system needs both `current_streak` and `longest_streak` plus the date the longest was set. Long-term streaks of 3,500+ days exist in the wild, which rules out replaying-from-scratch on every read.

Sources:
- [Macworld — How to get every Apple Watch Activity badge](https://www.macworld.com/article/672553/how-to-get-every-apple-watch-activity-achievement-badge.html)
- [Wareable — Apple Watch Activity awards](https://www.wareable.com/apple/how-to-view-earn-apple-watch-awards-challenges-badges-achievements)

### Hevy

Closest to MotionHive in shape (strength-training app, prescription + log model). Hevy's gamification surface is leaner:

- **Personal Records** are the headline feature — 1RM PR, heaviest weight × reps PR, set-volume PR, max reps PR, max duration PR. Computed **live as you save the set** (the in-workout PR notification banner).
- **Badges/medals** appear on the set that triggered the PR and on the workout summary.
- **Streaks** for consistent logging (mentioned in third-party reviews, less prominent than PRs).
- **Workout consistency stats** — most-trained muscle groups, workout frequency.

Hevy's design lesson: in a strength app, the per-set PR check is the canonical "achievement event." Everything else (totals, streaks) is secondary aggregation.

Sources:
- [Hevy — Personal Records explained](https://help.hevyapp.com/hc/en-us/articles/35649367857175-Personal-Records-PRs-and-Set-Records-Explained-How-They-Work-in-the-Hevy-App)
- [Hevy — Live PR Notification feature](https://www.hevyapp.com/features/live-pr/)

### Whoop

Whoop's 2026 refresh repackaged historical stats into achievement-style badges:

- **Recovery streaks** — consecutive days of green-recovery.
- **Sleep streaks** — consecutive days above 70% sleep.
- **Strain streaks** — consecutive days of 10+ strain.
- **Themed cards** — Runner's High, Gear Grinder, Green Monster — composite badges built from the underlying daily metrics.

The interesting design choice: Whoop didn't add new tracking. They built badges on top of existing daily-metric rows. That's the "data is enough, the engine reads it" pattern — the underlying time series wasn't retrofitted; the badge layer was an additive read concern.

Source:
- [Gadgets & Wearables — Whoop's profile refresh adds badges and streaks](https://gadgetsandwearables.com/2026/04/07/whoop-achievements/)

### Fitbit

Fitbit's badges are the oldest and best-documented in the space. ~100+ badges across:

- **Daily step badges** — 5k, 10k, 15k, …, 100k in a single day. Counting milestone, single-event.
- **Lifetime distance badges** — 26 mi to 12,430 mi (named after landmarks: Taj Mahal, Nile). Counting milestone, cumulative.
- **Daily climb badges** — floors climbed in a day.
- **Lifetime climb badges** — cumulative floors.
- **Weight-loss badges** — cumulative weight lost (requires a Fitbit Aria scale).
- **Challenge badges** — temporary, event-based.

Critical implementation detail: **"manually logged activities do not count toward Fitbit Badges."** That's a policy decision (anti-cheat) baked into the rule engine. We will need an equivalent question for MotionHive: do client-logged workouts count? Do instructor-logged workouts count? Do imported workouts count? The schema needs to carry enough provenance to answer those policy questions later.

Sources:
- [Wareable — Fitbit Badges guide](https://www.wareable.com/fitbit/fitbit-badges-guide-864)
- [Develop Good Habits — Fitbit Badge List](https://www.developgoodhabits.com/fitbit-badge-list/)

### Nike Run Club

Distance-pure model:

- **Race-distance milestones** — first 5K, first 10K, first half, first full marathon.
- **Cumulative lifetime distance** — beyond marathon, just kilometres/miles accumulated.
- **Weekly streaks** — consecutive weeks with at least one run.
- **Personal bests** — by distance and pace.
- **Run Level progression** — XP-like accumulation across all runs.
- **Time-limited challenges** — event-tied badges.

Design ethos called out explicitly in the gamification analysis: "competition with your past self rather than competition with other runners." That's a different positioning from Strava — same data, different reward shape. The schema doesn't care about the positioning; the engine layered on top does.

Source:
- [Trophy — Nike Run Club Gamification case study](https://trophy.so/blog/nike-run-club-gamification-case-study)

### Garmin Connect

Garmin runs the most data-driven badge system in this list. Public stats from the third-party badge tracker:

- ~200 regular badges currently available, 1,200+ historical (most are time-limited).
- Filter taxonomy: activities, running, cycling, challenges, steps, Garmin Connect features, health.
- Point system: 1–8 points per badge depending on difficulty. Total points drive a level (1–10).
- Badge classes: **repeatable** (re-earn on each new period, e.g. weekly sleep goal), **one-time** ("I have friends," "added an action"), **challenge** (effort-based, often time-windowed).

Lessons:
- The point/level overlay is independent of the badge definitions — points are an aggregation projection.
- "Repeatable" needs first-class support; a single `(user_id, achievement_id)` row isn't enough.

Sources:
- [Wareable — Garmin Connect badges](https://www.wareable.com/garmin/garmin-badges-guide-list-6404)
- [Garmin — What are Garmin Connect Badge Achievements?](https://support.garmin.com/en-US/?productID=73207&faq=6pECo6UIFn7ergw8kNmfu9&tab=topics)
- [Garmin Badge Database (3rd-party tracker)](https://garminbadges.com/)

### Duolingo (out of fitness, but the streak gold standard)

Duolingo's streak system is the most-studied gamification mechanic in the industry. Key implementation observations from public engineering writing:

- **XP is the shared metric.** Streaks, leagues, and achievements all read XP rather than each having their own event source. That deduplication is load-bearing — they didn't ship 4 parallel event streams.
- **Frontend predicts XP and shows the celebration immediately**, backend reconciles. Latency hidden from the user.
- The streak counter, longest-streak, and freeze counter are all denormalized on the user row.

Sources:
- [Duolingo blog — Frontend prediction](https://blog.duolingo.com/frontend-prediction/)
- [Trophy — Duolingo gamification case study](https://trophy.so/blog/duolingo-gamification-case-study)
- [Medium — Duolingo Streak System breakdown](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)

## Achievement category taxonomy

Synthesising across the seven apps above, every fitness achievement falls into one of six shapes. This taxonomy matters because **each shape has a different read pattern**, and the workouts schema needs to support each read.

| # | Category | Example | What the engine reads | Frequency of evaluation |
|---|---|---|---|---|
| 1 | **Counting milestone (cumulative)** | "100 workouts completed", "1000 km run", "5,000 sets logged" | `SUM/COUNT` over user's log rows | On each new log; cheap if a counter is denormalised |
| 2 | **Counting milestone (single-event)** | "First sub-5-min mile", "First 100kg bench" | `MAX/MIN` over a metric column | On each new log row |
| 3 | **Streak** | "7 days in a row", "10 consecutive weeks logging" | Date arithmetic over distinct log dates | On each new log; per-user state |
| 4 | **Threshold-once / first-of-kind** | "First cycling workout", "First PR" | Existence check | On each new log row |
| 5 | **Composite / conditional** | "3 workouts/week for 4 weeks", "All upper body muscles in 7 days" | Multi-row aggregation with windowing | Periodic batch (nightly) or on-write if expensive |
| 6 | **Time-windowed** | "Most workouts in March", "Active during Heart Month" | Range query with a calendar filter | Often batch at window-close, sometimes on-write |
| 7 | **Social/comparison** | "Top 1% in your age group" | Cross-user aggregation | Batch (out of scope for V2 MotionHive) |

The first four shapes are the 80% — and they all read the **same** underlying workout log. They differ in the SQL, not the storage. That is the architectural fulcrum of this whole document: **if the workouts log captures the right facts, the engine that reads them can ship later without schema change.**

The composite (#5) and time-windowed (#6) shapes also read the same log — they just read it with `GROUP BY` and date filters. Still no new schema.

Social/comparison (#7) is genuinely different — it needs cross-user reads, sometimes cohort tables. It is **out of scope** for MotionHive V2; we're not building a social ranking surface. If we ever do, that's a separate workstream.

## Investigation B: architecture patterns

The achievement-engine literature converges on four patterns. They are not mutually exclusive — real systems pick a mix.

### Pattern 1 — Hard-coded rules

Each badge is a TypeScript function. When a domain event happens (workout completed, set logged, PR detected), every relevant function runs and decides if it triggered.

```ts
// Pseudo-shape
const badges = [
  {
    code: 'FIRST_WORKOUT',
    onEvent: 'WORKOUT_COMPLETED',
    check: async (userId, event, db) =>
      await db.workoutLog.count({ where: { userId, status: 'COMPLETED' } }) === 1,
  },
  {
    code: 'WORKOUTS_100',
    onEvent: 'WORKOUT_COMPLETED',
    check: async (userId, event, db) =>
      await db.workoutLog.count({ where: { userId, status: 'COMPLETED' } }) === 100,
  },
  // ...
]
```

**Pros:**
- Trivial to read, trivial to debug. The rule IS the code.
- Type-safe access to the domain model.
- Easy to test (unit test the function with a fake DB).

**Cons:**
- Every new badge is a deploy.
- Non-engineers (product, marketing) can't define seasonal badges.
- Backfill becomes a script per badge (to award the badge retroactively to existing users).

**When to pick it:** When you have <50 badges total, badges change rarely, and the team is small. This is what Stack Overflow effectively does — the badge logic lives in the Q&A platform's codebase. ([Stack Overflow — badges explained](https://stackoverflow.blog/2021/04/12/stack-overflow-badges-explained/))

### Pattern 2 — Data-driven rule engine

Badge definitions are rows in a `badge_rule` table. A rule contains: an event filter (which events trigger evaluation), an aggregation (count/sum/max/streak), a comparison (>=, ==, between), and a threshold. An interpreter walks the rule against the event log.

```
badge_rule
  id, code, name, event_type, aggregation_kind,
  metric_path, comparator, threshold_value, window_kind, window_duration
```

ActiDoo's `gengine` and Jason Zissman's published gamification engine design both follow this pattern. ([gengine docs](https://gamification-engine.readthedocs.io/en/stable/concepts/), [Zissman Part 2](https://jasonzissman.medium.com/designing-a-scalable-gamification-engine-part-2-data-schema-fb2abfc4feb9))

**Pros:**
- Product team can ship a new badge by inserting a row.
- Backfill is generic — re-run the interpreter against history.
- Seasonal/limited-edition badges become a date-range field on the rule, no code change.

**Cons:**
- The interpreter is a real engine. Pattern matching, windowing, composite rules, time-zones — all of it has to be built.
- Generic schema kills query optimization. Zissman's article calls this out explicitly: "The generic schema introduces performance complexity as it prevents optimization of lookup queries based on known fields."
- Bugs in the interpreter affect every badge simultaneously.

**When to pick it:** When you have >50 badges, an editorial/marketing team that wants to launch seasonal content, or B2B customers who want to define their own badges. Garmin is closest to this shape (1,200+ historical badges is impossible to hard-code).

### Pattern 3 — Event-sourced

Every domain action publishes an immutable event to a stream. Achievement handlers subscribe. Triggered achievements are themselves events appended to the stream. Read models are projections.

**Pros:**
- Full audit log. Replay any badge against any user's history.
- Decouples producers from consumers — workout module emits events, achievement module subscribes without coupling.
- Future-proof for analytics, fraud detection, retroactive rule changes ("we changed the 1RM formula — re-evaluate all PRs since 2020").

**Cons:**
- Operational overhead: event store, consumer offsets, idempotency, ordering, schema evolution of events.
- Requires the team to embrace eventual consistency for badge UI.
- Schema migrations on events are notoriously painful.

**When to pick it:** When the platform already has an event bus and the team is comfortable with CQRS. Strava's infrastructure is closer to this end (Kafka), but no public blog post confirms the achievement engine specifically is event-sourced.

### Pattern 4 — Periodic batch

A nightly cron job walks each user's history and recomputes which badges they have earned. New badges award on the next run.

**Pros:**
- Brutally simple to implement. No event integration, no on-write hooks.
- Idempotent by construction — the recompute job is the source of truth.
- Cheap to add a new badge — just include it in the recompute pass.

**Cons:**
- Latency. User completes their 100th workout, doesn't see the badge until tomorrow morning.
- Fitness apps generally can't accept this — the in-workout PR notification is a core retention surface.
- Scales linearly with `users × badges`. Once you have 10k active users and 100 badges, that's 1M evaluations per day.

**When to pick it:** When badges are decorative ("monthly summary"), latency doesn't matter, or the user base is small. Fitbit's lifetime distance badges are very likely partial-batch — the daily sync is the trigger, not the per-step event.

### Pattern 5 (the actual winner) — Hybrid

Real systems run a hybrid:

- **Hot path on write:** counting milestones, single-event PRs, first-of-kind badges. Evaluated in-line with the domain action because the user is staring at the screen. Hevy's live-PR banner is this.
- **Cold path on batch:** composite, time-windowed, streak-rollover (e.g. "your streak hit a new record yesterday"), social/cohort. Evaluated in a nightly job because they're expensive multi-row aggregations.
- **Definitions stored as data** so product can add badges, but evaluation is dispatched to specialised handlers per category (streak handler, counter handler, PR handler) — not a single generic interpreter.

This is the architecture Zissman's series ends up at — generic event ingest, specialised evaluation. ([Zissman Part 3](https://jasonzissman.medium.com/designing-a-scalable-gamification-engine-part-3-event-processing-f231e05fcb1d))

## What real apps probably do

These are best-effort reconstructions from public material. Be honest: none of these apps publish their achievement engine internals.

| App | Best-guess pattern | Why we think so |
|---|---|---|
| Strava | Hybrid; segment-leaderboard precomputed, PR on-write | The home feed shows fresh PRs the moment you sync; segment leaderboards are paginated server-side. Cassandra/DynamoDB stack is well-documented but the achievement layer is not. |
| Apple Fitness | On-write (in Health app, on-device) + cloud rollups | iOS posts the badge notification before the watch finishes syncing to iCloud; computation is local to the device. Long streak persistence implies a denormalised counter, not a replay. |
| Hevy | Hard-coded on-write | Live PR banner is too fast to be batch. Set count and roster of PR kinds (1RM, heaviest×reps, volume, max reps, max duration) is small enough that hard-coded checks are sensible. |
| Whoop | Periodic batch | The 2026 release repackaged existing daily metrics into badges. No claim of real-time achievement notification. |
| Fitbit | Hybrid; daily step badges on sync, lifetime on daily rollup | Step badges fire when the device syncs (effectively on-write). Lifetime distance is cumulative and almost certainly maintained by a daily rollup job. |
| Nike Run Club | On-write with batch fallback | The post-run summary shows badges earned during the run — must be on-write. Cumulative lifetime totals probably maintained as user-row counters. |
| Garmin Connect | Data-driven, batch-evaluated | 200 concurrent + 1,200 historical badges, frequent monthly releases, repeatable badge concept — this is operationally a rule-engine. |
| Duolingo | Hybrid; on-write streak math, cached current/longest on user | Streak math is too central to be batch. Counters denormalised on the user row are well-documented (`current_streak`, `longest_streak`). |

Uncertainty: none of these companies publish their achievement engine's internals. The above is inference from product behaviour + tangential engineering blog posts. For MotionHive, we should **not** treat any of this as ground truth.

Sources:
- [Stack Overflow — Badges explained](https://stackoverflow.blog/2021/04/12/stack-overflow-badges-explained/)
- [Trophy — How to Build a Streaks Feature](https://trophy.so/blog/how-to-build-a-streaks-feature)
- [Plotline — Streaks and Milestones for Gamification](https://www.plotline.so/blog/streaks-for-gamification-in-mobile-apps)
- [Tiger Abrodi — Implementing a Daily Streak System](https://tigerabrodi.blog/implementing-a-daily-streak-system-a-practical-guide)
- [Oracle — Calculate longest and current consecutive streaks with SQL](https://blogs.oracle.com/sql/how-to-calculate-the-longest-and-current-consecutive-streaks-with-oracle-sql)

## Recommended pattern for MotionHive V2

When the achievements module ships, the recommended shape is:

**Hybrid evaluation, data-defined rules with category-specific handlers.**

- A small `achievement` definitions table (code, name, category, threshold, repeatable flag, valid_from/valid_until). Editable by admins, no deploy required to add a new badge.
- A small set of category-specific evaluators in code: `CounterEvaluator`, `PrEvaluator`, `StreakEvaluator`, `FirstOfKindEvaluator`, `CompositeEvaluator`. Each implements the same `evaluate(userId, event, definition, db)` interface but has specialised SQL inside.
- Hot path: workout-completion / set-save calls the achievement service synchronously (or via a Bull job, when jobs module ships) with the just-emitted domain event. Service dispatches to the relevant evaluator(s) for definitions where `event_type` matches.
- Cold path: nightly cron walks the `composite` and `streak_rollover` definitions. (Blocked on jobs module.)
- Output: `user_achievement` row (one per user-per-definition for non-repeatable, one per user-per-definition-per-instance for repeatable) + a domain event `ACHIEVEMENT_EARNED` for the notification module to consume.

**Critically: this engine reads from the existing `workout_log`, `logged_exercise`, `logged_set`, `one_rep_max` tables.** It does not need a new event-sourced parallel store. The workouts schema already has the facts.

This is a Phase-2 spec. **It is NOT being built in V1.** It is included here only to anchor the V1 schema decisions.

### Phase-2 read-pattern sketches against the V1 schema

To prove the V1 schema actually carries enough facts for the engine to do its job, here are the SQL shapes each category-evaluator would execute. None of them require a new table; all of them rely only on what is already in `05-db-schema.md` (plus the one `entry_method` addition).

**(a) Counting milestone — "100 completed workouts."**

```sql
-- Triggered by domain event WORKOUT_COMPLETED for userId
SELECT COUNT(*)::int AS n
FROM workout_log
WHERE user_id = :userId
  AND status  = 'COMPLETED'
  AND entry_method <> 'BACKFILLED'  -- anti-cheat policy at Phase-2 time
  AND deleted_at IS NULL;
-- Compare against the badge's threshold; award if equal.
```

Uses `idx_workout_log_user_date`. Single-user counts scale fine to millions of log rows.

**(b) Single-event PR — "first sub-5-min mile."**

```sql
-- Triggered by domain event SET_COMPLETED
SELECT MIN(duration_seconds) AS best_seconds
FROM logged_set ls
JOIN logged_exercise le ON le.id = ls.logged_exercise_id
WHERE le.exercise_id = :mileExerciseId
  AND ls.is_completed = TRUE
  AND ls.distance_meters >= 1609   -- one statute mile
  AND ls.duration_seconds IS NOT NULL
  AND le.workout_log_id IN (
    SELECT id FROM workout_log
    WHERE user_id = :userId AND status = 'COMPLETED'
  );
-- Award if best_seconds <= 300 and this is the first time it's <= 300
-- (Phase 2's user_achievement row enforces "first time" via uniqueness on
--  (user_id, achievement_id) when achievement.repeatable = FALSE).
```

**(c) Strength PR — "first 100kg bench."** This one is even cheaper because `one_rep_max` already de-duplicates.

```sql
SELECT MAX(weight_kg)
FROM one_rep_max
WHERE user_id = :userId AND exercise_id = :benchExerciseId;
-- Award if MAX >= 100 and a user_achievement row doesn't already exist.
```

**(d) Daily streak — "7 consecutive days with a completed workout."**

```sql
WITH workout_days AS (
  SELECT DISTINCT date_trunc('day', completed_at AT TIME ZONE :userTz)::date AS day
  FROM workout_log
  WHERE user_id = :userId
    AND status = 'COMPLETED'
    AND entry_method <> 'BACKFILLED'
),
gaps AS (
  SELECT day,
         day - (ROW_NUMBER() OVER (ORDER BY day))::int * INTERVAL '1 day' AS streak_group
  FROM workout_days
)
SELECT COUNT(*) AS streak_length, MAX(day) AS streak_last_day
FROM gaps
GROUP BY streak_group
ORDER BY streak_last_day DESC
LIMIT 1;
-- Award if streak_length >= 7 AND streak_last_day = CURRENT_DATE (active streak).
```

The Oracle-published recipe ([source](https://blogs.oracle.com/sql/how-to-calculate-the-longest-and-current-consecutive-streaks-with-oracle-sql)) is the canonical pattern; PostgreSQL handles it identically with `date_trunc` instead of `TRUNC`. Note the dependency on a per-user timezone — see open question #8.

**(e) First-of-kind — "first cardio workout."**

```sql
SELECT EXISTS (
  SELECT 1 FROM workout_log wl
  JOIN logged_exercise le ON le.workout_log_id = wl.id
  JOIN exercise e ON e.id = le.exercise_id
  WHERE wl.user_id = :userId
    AND wl.status = 'COMPLETED'
    AND e.kind = 'CARDIO'
);
-- Award on first true result. user_achievement uniqueness prevents re-award.
```

**(f) Composite — "trained all major muscle groups in 7 days."**

```sql
SELECT COUNT(DISTINCT m.body_region) AS regions_hit
FROM workout_log wl
JOIN logged_exercise le ON le.workout_log_id = wl.id
JOIN exercise_muscle em ON em.exercise_id = le.exercise_id AND em.role = 'PRIMARY'
JOIN muscle m ON m.id = em.muscle_id
WHERE wl.user_id = :userId
  AND wl.completed_at >= NOW() - INTERVAL '7 days'
  AND wl.status = 'COMPLETED';
-- Award if regions_hit covers all required regions.
```

This is the most complex shape. It's why composite evaluators belong on the cold path (nightly batch) — too expensive to run on every set save.

**Every query above reads tables that already exist in 05-db-schema.md.** That is the demonstration that V1 is not painting us into a corner.

### Why a Phase-2 `user_achievement` table is enough — sketch only

For completeness — this is **not** being built in V1, only sketched here so the V1 schema decisions above are anchored against a concrete future shape:

```sql
-- Phase 2, NOT in migration 046:
CREATE TABLE achievement (
  id              CHAR(36) PRIMARY KEY,
  code            VARCHAR(80) NOT NULL UNIQUE,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  category        achievement_category NOT NULL,   -- COUNTER, PR, STREAK, FIRST_OF_KIND, COMPOSITE, TIME_WINDOWED
  event_type      VARCHAR(80) NOT NULL,            -- 'WORKOUT_COMPLETED', 'SET_COMPLETED', etc.
  rule_config     JSONB NOT NULL,                  -- category-specific config (threshold, exercise_id filter, etc.)
  repeatable      BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from      TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  icon_url        VARCHAR(500),
  points          SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_achievement (
  id                     CHAR(36) PRIMARY KEY,
  user_id                CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  achievement_id         CHAR(36) NOT NULL REFERENCES achievement(id) ON DELETE RESTRICT,
  earned_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Optional FK to the workout/set that triggered it (nullable: streak rollovers have no single trigger row):
  triggered_workout_log_id  CHAR(36) REFERENCES workout_log(id) ON DELETE SET NULL,
  triggered_logged_set_id   CHAR(36) REFERENCES logged_set(id)  ON DELETE SET NULL,
  -- Metric snapshot at award time (for "you ran 5.2km — your first 5K"):
  snapshot                JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per non-repeatable achievement per user:
CREATE UNIQUE INDEX idx_user_achievement_unique
  ON user_achievement (user_id, achievement_id)
  WHERE achievement_id IN (SELECT id FROM achievement WHERE repeatable = FALSE);
-- (Implemented in practice as a partial unique index or a CHECK + service-layer guard.)
```

This shape covers all six categories from the taxonomy. It is the minimum viable shape; V2 design will refine.

## What workouts V1 schema MUST include to not block V2

This is the actionable part of the document. Each entry below is an addition to `05-db-schema.md` (or a confirmation that an existing field is sufficient) with the concrete Phase-2 scenario it unblocks.

### MUST #1 — `workout_log.duration_seconds` and `workout_log.completed_at` are populated for every completed workout

**Already in the schema.** Both columns exist on `workout_log`. The only requirement is that `WorkoutLogService.completeWorkout` actually fills them when the user marks the workout complete.

**Why it's load-bearing for V2:** every "X workouts in Y days" and "longest workout" badge reads these. If `completed_at` is null, the date-windowed streak evaluator has nothing to work with.

**Action:** confirm the V1 service writes `completed_at = NOW()` and `duration_seconds = NOW() - started_at` on the COMPLETED transition. Add an integration test that fails if the transition leaves either null.

### MUST #2 — `logged_set.weight_kg`, `reps`, `duration_seconds`, `distance_meters` accept actuals (already nullable)

**Already in the schema.** Wide nullable set table — kept as-is.

**Why:** PR detection (1RM, heaviest × reps, max reps, max distance, max duration) needs the raw set numbers. Mark-complete-only sets contribute to counting badges ("100 sets logged") but not PR badges.

**Action:** none. Schema is already correct.

### MUST #3 — `one_rep_max` table exists and is written on every set that beats the previous 1RM

**Already in the schema.** `one_rep_max` table is part of V1.

**Why:** the PR-badge evaluator wants `MAX(weight_kg) WHERE user_id = ? AND exercise_id = ?` to be a cheap index lookup. Without the dedicated table, the engine has to walk every `logged_set` ever recorded.

**Action:** confirm `WorkoutLogService.completeSet` (or wherever PR detection happens) writes a `one_rep_max` row when applicable. Add a test for the write path.

### MUST #4 — `exercise.kind` enum is present and accurate per exercise

**Already in the schema.** `exercise_kind ENUM('STRENGTH', 'CARDIO', 'DURATION', 'DISTANCE', 'BODYWEIGHT', 'MOBILITY')`.

**Why:** "first cardio workout" and "first strength PR" badges read this. If every exercise were `STRENGTH` by default, the kind-filtered badges would all fire on the first workout.

**Action:** confirm the Free Exercise DB seed maps `category` → `exercise.kind` cleanly. Spot-check a few rows after seed.

### MUST #5 — `logged_set.completed_at` is populated when `is_completed = true`

**Already in the schema.** Both columns exist.

**Why:** Streak and time-windowed evaluators need set-level timestamps for two reasons. (1) Some streaks are "log a set every day" rather than "complete a workout every day" — the granularity matters. (2) Composite badges ("upper-body set + lower-body set on the same day") need same-day comparison at set granularity.

**Action:** confirm the set-mark-complete path writes `completed_at = NOW()`.

### MUST #6 — Reserve `ACHIEVEMENT_EARNED` notification type in the enum

**Cost:** one enum value addition.

**Why:** when the achievements module ships, it will dispatch a notification via `NotificationService.notify(builder(...))`. The notification module's enum needs the value. If we don't reserve it now, adding it later is still cheap (it's just an enum extension, no data migration) — but writing it down here means the workouts V1 migration can add it pre-emptively in a one-liner.

**Action:** in migration 046, add `ALTER TYPE notification_type ADD VALUE 'ACHIEVEMENT_EARNED'` (if `notification_type` is a Postgres enum) — or no migration needed if `notification_type` is a string in the model.

**Caveat:** double-check the current `notification` module's enum representation before writing the migration. If it's a TypeScript enum stored as varchar, this MUST is a no-op (just add the TS enum value when the achievements module ships).

### MUST #7 — `workout_log.user_id` is indexed for date-range scans

**Already in the schema.** `idx_workout_log_user_date ON workout_log (user_id, started_at DESC)`.

**Why:** every streak and time-windowed badge does `WHERE user_id = ? AND started_at BETWEEN ? AND ?`. The composite index already supports this.

**Action:** none.

### MUST #8 — Provenance: capture `workout_log.source` (programmatic vs manual vs imported)

**This is the only NEW column being recommended.** Add a column to `workout_log`:

```sql
ALTER TABLE workout_log
  ADD COLUMN entry_method VARCHAR(20) NOT NULL DEFAULT 'CLIENT_LOGGED';

-- Conceptual values, enforced at the service layer (or as an enum later):
--   'CLIENT_LOGGED'      — user opened the app and logged
--   'INSTRUCTOR_LOGGED'  — instructor logged on behalf of the client
--   'IMPORTED'           — imported from a wearable / external app (future)
--   'BACKFILLED'         — admin-inserted, e.g. historical migration
```

**Why:** Fitbit's policy "manually logged activities do not count toward badges" is a real anti-cheat lever. We do not know today whether instructor-logged workouts should count toward client PR badges, but **we need the data captured to answer the question later.** Without this column, every old log is indistinguishable from a "real" client log, and any anti-gaming policy applied retroactively is impossible.

**Tradeoff considered:** could be a JSONB `metadata` column instead. Rejected — querying JSONB to filter out non-counting entries is an order of magnitude slower than a varchar with a partial index, and we don't have other metadata fields competing for the slot.

**Action:** add this column to migration 046. Default value `'CLIENT_LOGGED'` makes the migration safe on existing data (when there is any). Service layer fills it explicitly on each insert.

### MUST #9 — Do NOT add a `user_achievement` placeholder table

This is a "MUST NOT" disguised as a MUST. Spelled out explicitly because the temptation is real.

**Why:** Creating an empty `user_achievement` and `achievement` table in migration 046 sounds like cheap namespace reservation. It is not. Empty tables in production are confusing (which one is the canonical one when V2 lands?), they create RBAC questions ("can this role query the table?"), and they ship with no validated shape — when V2 actually designs the achievements module, the chosen shape will be different from whatever we placeholder today.

**Decision:** Phase 2's first migration will introduce both tables fully designed. V1 does not pre-create them.

## What workouts V1 schema does NOT need to include

The over-engineering trap. For each item below: people will be tempted to add it; here is why we say no.

### NOT — A generic `workout_event` event-log table

**Tempting because:** an event log feels future-proof. If we ever go event-sourced, we already have the events.

**Rejected because:**
- The workout log IS the event log. `workout_log` rows are "WORKOUT_COMPLETED" events. `logged_set.completed_at` rows are "SET_COMPLETED" events. `one_rep_max` rows are "PR_DETECTED" events. Adding a second parallel event table duplicates writes, doubles transaction size, and creates two sources of truth.
- If V2's achievements engine genuinely needs an event log (say, for replay), it can derive one from existing tables. The facts are there.
- The cost of adding an event table later is real but bounded — it would be a backfill from existing tables, runnable as a one-shot migration. The cost of carrying an unused event table for years is also real and unbounded.

**Decision:** no `workout_event` table. The fact tables are the event log.

### NOT — Denormalised counter columns on `user`

**Tempting because:** Duolingo has `current_streak` on the user row. Doing the same for `total_workouts_completed`, `current_workout_streak`, `total_volume_kg_lifted` would make badge checks `O(1)`.

**Rejected because:**
- Counters on `user` are write-amplification: every set completion would touch the user row, contending with the same row across concurrent workouts. The current MotionHive `user` table is hot enough already (auth, profile, payment).
- Until we know which counters the engine actually wants, every speculative counter is wrong by definition.
- The right time to add denormalised counters is when a slow query is observed. PostgreSQL with the existing `idx_workout_log_user_date` index will count completed workouts for a single user in single-digit milliseconds — not a bottleneck.
- If we genuinely need read-side counters, they belong on a `user_stats` sidecar table (one row per user, separate from the auth-critical `user` row). That's a V2 decision.

**Decision:** no counter columns on `user`. If V2 needs them, V2 ships a `user_stats` table.

### NOT — A `triggered_achievements` JSONB column on `workout_log`

**Tempting because:** a column on the log row that records which badges fired during that workout is convenient for the UI — fetch the workout, get the badges, render the celebration.

**Rejected because:**
- This is a denormalisation of `user_achievement`. The join `user_achievement.triggered_by_workout_log_id` is the right model — workout-log row stays clean, achievements track which workout produced them.
- JSONB on every log row is dead weight for the 99% of cases that don't trigger an achievement.
- If a badge rule changes ("we changed the 1RM formula"), the JSONB column is stale and there's no mechanism to recompute.

**Decision:** no `triggered_achievements` column. The (future) `user_achievement` table will hold an FK to the triggering `workout_log_id` or `logged_set_id`.

### NOT — Reserve `program.kind = 'ACHIEVEMENT'` or similar enum value

**Tempting because:** we already reserved `program.kind = 'HABIT'`, `'MEAL'`, `'HYBRID'` for future modules.

**Rejected because:** achievements are not a `program.kind`. They are a separate domain. Adding the value would imply a confusing model (an achievement is a kind of program?). No save.

### NOT — A `metric` column tagged with "uses for achievements"

**Tempting because:** flagging which logged-set fields are "achievement-eligible" might let us hand-wave the engine.

**Rejected because:** the engine reads what it reads. The schema doesn't need to know which columns it cares about — the rule definitions in Phase 2 will say which metric they aggregate.

### NOT — Pre-emptive `points` or `xp` columns

**Tempting because:** Duolingo has XP. Garmin has badge points. Some users want a global level system.

**Rejected because:**
- An XP system is a product decision, not a schema decision. Until we know whether MotionHive will have one (and what events earn how much), every column is premature.
- If XP ships, the natural home is on `user_achievement.points_awarded` plus a `user_stats.total_points` rollup — not a column on the workout log.

**Decision:** zero XP/points columns in V1.

### NOT — A `season` or `event_window` table for seasonal challenges

**Tempting because:** Strava and Garmin have monthly challenges.

**Rejected because:** challenges are an achievements-engine concept. When V2 ships seasonal badges, the `achievement` definition table will have `valid_from` / `valid_until` columns — no separate season table needed.

## Summary of schema deltas to `05-db-schema.md`

For migration 046 (workouts foundation), the achievements-driven additions are:

1. **`workout_log.entry_method VARCHAR(20) NOT NULL DEFAULT 'CLIENT_LOGGED'`** — provenance for future anti-cheat policy.
2. **`notification_type` enum value `ACHIEVEMENT_EARNED`** — only if `notification_type` is a Postgres enum; otherwise a no-op TS enum extension when V2 lands. Check first.

That is the entire delta. **Two changes**, both additive, both with concrete Phase-2 scenarios that they unblock. Everything else the achievements engine needs is already present in the V1 schema or already excluded by deliberate decision.

This is intentionally minimal. The user's framing was "don't paint us into a corner" — not "build a corner with a parking spot reserved for the future module."

## Open questions

Questions that will be relevant when the achievements module is designed, but **do not** need answering for the workouts V1 schema. Listed here so they aren't lost.

1. **Do instructor-logged workouts count toward client achievements?** Policy question. `entry_method = 'INSTRUCTOR_LOGGED'` will give the engine the data to either include or exclude these.
2. **Do imported workouts count?** Same as above. `entry_method = 'IMPORTED'`. Wearable integration is its own workstream — pinning the answer now is premature.
3. **Repeatable badges: per-instance row in `user_achievement` or counter on a single row?** Garmin model. V2 design decision.
4. **Are achievements tied to the platform (MotionHive-wide) or per-instructor (each instructor defines their own badges for their clients)?** The latter is a powerful coaching tool but a much bigger module. Pinning this now is premature.
5. **PR celebration: in-workout banner (Hevy) vs. post-workout summary (NRC) vs. both?** UX question for V2.
6. **Backfill policy: when the achievements module ships, do existing users earn retroactive badges for past workouts?** Strong default: yes, run a one-shot backfill. Confirm at V2 design time.
7. **Streak grace period: missed-day rules ("streak freezes" à la Duolingo)?** V2 product decision.
8. **Timezone-of-record for streaks:** server-time / user-time / instructor-time? Whichever is chosen needs to be consistent — store the user's tz on `user` (already exists as `country_code` proxy; may need a real `timezone` field by then). Not a V1 blocker because workouts don't have streak logic yet.
9. **Do we ship a notification when an instructor's client earns an achievement?** `CLIENT_EARNED_ACHIEVEMENT` would be a useful coaching surface. V2.

## Sources cited

- [Strava — Getting Started with Achievements](https://communityhub.strava.com/insider-journal-9/getting-started-with-strava-achievements-1534)
- [Strava — The Trophy Case](https://support.strava.com/hc/en-us/articles/216918557-The-Strava-Trophy-Case)
- [Strava — Challenges](https://support.strava.com/hc/en-us/articles/216919177-Strava-Challenges)
- [Macworld — How to get every Apple Watch Activity badge](https://www.macworld.com/article/672553/how-to-get-every-apple-watch-activity-achievement-badge.html)
- [Wareable — Apple Watch Activity awards](https://www.wareable.com/apple/how-to-view-earn-apple-watch-awards-challenges-badges-achievements)
- [Hevy — Personal Records explained](https://help.hevyapp.com/hc/en-us/articles/35649367857175-Personal-Records-PRs-and-Set-Records-Explained-How-They-Work-in-the-Hevy-App)
- [Hevy — Live PR Notification feature](https://www.hevyapp.com/features/live-pr/)
- [Gadgets & Wearables — Whoop's profile refresh adds badges and streaks](https://gadgetsandwearables.com/2026/04/07/whoop-achievements/)
- [Wareable — Fitbit Badges guide](https://www.wareable.com/fitbit/fitbit-badges-guide-864)
- [Develop Good Habits — Fitbit Badge List](https://www.developgoodhabits.com/fitbit-badge-list/)
- [Trophy — Nike Run Club Gamification case study](https://trophy.so/blog/nike-run-club-gamification-case-study)
- [Wareable — Garmin Connect badges](https://www.wareable.com/garmin/garmin-badges-guide-list-6404)
- [Garmin — What are Garmin Connect Badge Achievements?](https://support.garmin.com/en-US/?productID=73207&faq=6pECo6UIFn7ergw8kNmfu9&tab=topics)
- [Garmin Badge Database (3rd-party tracker)](https://garminbadges.com/)
- [Duolingo blog — Frontend prediction](https://blog.duolingo.com/frontend-prediction/)
- [Trophy — Duolingo gamification case study](https://trophy.so/blog/duolingo-gamification-case-study)
- [Medium — Duolingo Streak System breakdown](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)
- [Stack Overflow — Badges explained](https://stackoverflow.blog/2021/04/12/stack-overflow-badges-explained/)
- [Trophy — How to Build a Streaks Feature](https://trophy.so/blog/how-to-build-a-streaks-feature)
- [Plotline — Streaks and Milestones for Gamification](https://www.plotline.so/blog/streaks-for-gamification-in-mobile-apps)
- [Tiger Abrodi — Implementing a Daily Streak System](https://tigerabrodi.blog/implementing-a-daily-streak-system-a-practical-guide)
- [Oracle — Calculate longest and current consecutive streaks with SQL](https://blogs.oracle.com/sql/how-to-calculate-the-longest-and-current-consecutive-streaks-with-oracle-sql)
- [Jason Zissman — Scalable Gamification Engine Part 2 (Data Schema)](https://jasonzissman.medium.com/designing-a-scalable-gamification-engine-part-2-data-schema-fb2abfc4feb9)
- [Jason Zissman — Scalable Gamification Engine Part 3 (Event Processing)](https://jasonzissman.medium.com/designing-a-scalable-gamification-engine-part-3-event-processing-f231e05fcb1d)
- [ActiDoo gengine — Concepts](https://gamification-engine.readthedocs.io/en/stable/concepts/)
- [ActiDoo gengine — GitHub](https://github.com/ActiDoo/gamification-engine)
- [arXiv — An Architecture for Software Engineering Gamification](https://arxiv.org/pdf/2402.00233)
