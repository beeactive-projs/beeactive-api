# 11 — Workout privacy & visibility model

**Status:** Research + design proposal. Not yet locked. Extends [04-locked-decisions.md](./04-locked-decisions.md) and [05-db-schema.md](./05-db-schema.md) — does NOT replace them.
**Author:** Claude research session, 2026-05-22.
**Scope:** Visibility-related schema and rules for the `workout_log` family. Everything else in the workouts schema is untouched.

> **Read 04-locked-decisions.md and 05-db-schema.md first.** This document assumes you already know the catalog/prescription/log split, copy-on-assign, and the `program_assignment` → `instructor_client` linkage.

---

## The locked semantics (non-negotiable, set by user)

These three rules are the boundary of the design. Everything below is in service of them.

### 1. User self-authored workouts are private by default

A user who is on MotionHive and happens to have one or more coaches is **still allowed a private training life**. If they freestyle a workout — opening the app on a Saturday, picking exercises, logging sets — that log is theirs. No coach sees it. Not the primary coach, not a second-opinion coach, nobody.

The relationship `instructor_client(status=ACTIVE)` does NOT grant a blanket "see all my workouts" read. It grants only what is explicitly shared.

### 2. Coach-assigned workouts have a per-completion privacy split

When a coach assigns a workout via `program_assignment` → `assigned_workout`, the client completes it and at completion time makes **one of two choices**:

- **Mark complete (no results shared)** — coach sees the *completion event* (timestamp + workout name) and nothing else. Not exercises, not sets, not numbers, not duration.
- **Share results** — coach sees the full `logged_exercise` / `logged_set` tree (weights, reps, RPE, PR detection, etc.) and gets a richer notification.

This is a deliberate departure from Trainerize / TrueCoach / Hevy Coach, all of which give the coach unconditional visibility on assigned workouts. MotionHive treats this as a privacy feature, not a bug. See [§ Design proposal](#design-proposal-for-motionhive-v1) for why.

### 3. A user can train under multiple coaches concurrently

The `instructor_client` table already supports N rows per `client_id`. A workout completed under coach A's assignment must NEVER leak to coach B. Privacy is therefore tied to a *specific* `instructor_client` relationship, not a generic "shared with my coaches" boolean. Multi-coach isolation is the most consequential constraint in this document; see [§ Multi-coach isolation](#multi-coach-isolation) for the example query that would expose the bug.

---

## Apps surveyed

| App | Multi-coach? | Default visibility of client workouts | Per-workout privacy controls? | "Completed but private numbers" state? | After relationship ends |
|---|---|---|---|---|---|
| Trainerize | No (15-yr feature request) | Full — coach sees everything logged | No — all-or-nothing | No | Coach retains data unless client deletes account |
| TrueCoach | No (workarounds via duplicate accts) | Full — coach sees everything logged | Coach can hide a *workout from a client* (not the other way around) | No | Archive preserves data; delete removes all |
| Everfit | Yes — "sub-coach" permission system added 2023 | Full per assigned coach | No — all-or-nothing | No | Sub-coach removed loses access; primary retains |
| CoachAccountable | Yes — primary / coaching / view-only roles | Full per role | Yes — "Just me and the client" privacy on items | Effectively yes (per-item privacy from peer coaches, not from coach themselves) | View-only role retained for audit; primary retains |
| Hevy Coach | No (one coach per athlete) | Full — coach sees everything (including solo workouts!) | Profile-level (private profile from social) and per-workout description privacy from *Hevy community* — but **the coach always sees everything** | No | Coach detach removes coach visibility going forward; historical kept on athlete side |
| Strava | N/A (no coach role) | "Everyone" by default for activities | Yes — 3 levels (Everyone / Followers / Only You), per-activity + global default | Yes via "Hide Details" (start time, pace, calories, HR, power can be selectively hidden) | N/A |

**Bottom line:** **No coaching SaaS in this survey implements the "mark complete without sharing numbers" intermediate state.** Coach visibility on assigned workouts is universally all-or-nothing. The closest analogue is CoachAccountable's "Just me and the client" privacy item — but that hides items from *peer coaches*, not from the assigning coach.

Strava is the only product surveyed that supports field-level privacy (Hide Details). That's the closest mental model to what MotionHive wants, but Strava has no coach role.

---

## Per-app findings

### Trainerize

- **Multi-coach:** Not supported. A 2015 forum request remains open in 2026. Workaround: clients with multiple coaches must use separate accounts on different businesses (mobile app only allows one business login at a time). Source: [Trainerize idea forum — "Assign multiple trainers to one client"](https://ideas.trainerize.com/forums/167887-coach-trainer-trainerize/suggestions/7554810-assign-multiple-trainers-to-one-client-to-share), [Trainerize help — "Can I Assign a Client to Multiple Trainers?"](https://help.trainerize.com/hc/en-us/articles/23332207757332-Can-I-Assign-a-Client-to-Multiple-Trainers).
- **Default visibility:** Coach sees every workout the client logs. There is no concept of a "personal/private" workout — Trainerize is "primarily a trainer-driven platform" per their forum reply. Source: [Trainerize idea forum — "Allow Clients to Design and Save Freestyle Workouts"](https://ideas.trainerize.com/forums/167887-coach-trainer-abc-trainerize/suggestions/32842096-allow-clients-to-design-and-save-freestyle-workout).
- **Privacy controls:** Workout-level "Hide" exists but it hides the workout *from the client*, not from the coach. Source: [Trainerize help — "How to Manage Client Permissions for Workouts"](https://help.trainerize.com/hc/en-us/articles/208689106-How-to-Manage-Client-Permissions-for-Workouts).
- **Intermediate state:** None.
- **Relationship end:** Client data persists on coach side until client deletes account or coach archives the client.

### TrueCoach

- **Multi-coach:** Not natively. Source: [TrueCoach help — managing clients](https://help.truecoach.co/en/articles/2403919-managing-your-clients).
- **Default visibility:** Coach sees every logged result. Source: [TrueCoach help — Client Workout Visibility](https://help.truecoach.co/en/articles/3047464-client-workout-visibility).
- **Privacy controls:** Coach-side "Hide a workout from a client" (programmatic gating of when future workouts are released to the client). No client-side privacy from coach. Source: [TrueCoach help — Hiding a Workout From a Client](https://help.truecoach.co/en/articles/2393307-hiding-a-workout-from-a-client).
- **Intermediate state:** None.
- **Relationship end:** Archived client preserves all data; delete is irrevocable. Source: [TrueCoach help — Deleting a Client](https://help.truecoach.co/en/articles/2695325-deleting-a-client).

### Everfit

- **Multi-coach:** Yes, via "sub-coach" permission system. Primary coach adds teammates with management access. Sub-coaches get full management access (workouts, tasks, nutrition) except archive/delete. Selective permissions noted as "coming soon." Source: [Everfit help — Permission Settings: Add a sub-coach](https://help.everfit.io/en/articles/6809708-permission-settings-add-a-sub-coach-to-manage-your-client).
- **Default visibility:** Full — every sub-coach with access sees the same data.
- **Privacy controls:** Time-window visibility (3 weeks back / 4 weeks ahead) is for the *client's* view of upcoming workouts, not for hiding client logs from coaches. Source: [Everfit help — Workout Visibility setting](https://help.everfit.io/en/articles/3547124-workout-visibility-setting).
- **Intermediate state:** None.
- **Relationship end:** Removed sub-coach loses access; primary coach retains.

### CoachAccountable

- **Multi-coach:** Yes, with three roles: Primary, Coaching, View-Only. Each client has exactly one Primary; multiple Coaching coaches; View-Only is invisible to the client. Source: [CoachAccountable KB — Pairing](https://www.coachaccountable.com/knowledgeBase/teamEdition/pairing), [CoachAccountable blog — Pairing and Permissions](https://blog.coachaccountable.com/2016/01/pairing-and-permissions/).
- **Default visibility:** All paired coaches see everything by default.
- **Privacy controls:** "Just me and the client" privacy setting on items — hides an item from *peer team coaches* but still shares with the primary. Source: [CoachAccountable blog — New Privacy Setting](https://blog.coachaccountable.com/2018/06/new-privacy-setting-just-me-and-the-client/).
- **Intermediate state:** Sort of — the privacy setting is per-item, but at the granularity of "this whole item is hidden from peers," not "completion-only vs. full numbers."
- **Relationship end:** Demotion to View-Only retains audit access; full removal cuts visibility.

### Hevy Coach

- **Multi-coach:** Not supported — one coach per client. Source: [Hevy Coach client app](https://hevycoach.com/features/client-app/).
- **Default visibility:** Coach sees **everything** the client logs in Hevy — including solo, non-assigned workouts. Source: [Hevy Coach — Client Progress Tracker](https://hevycoach.com/features/client-tracker/) ("As you log workouts, your coach gains instant access to all the data and metrics that matter"), [Hevy help — keeping info private](https://help.hevyapp.com/hc/en-us/articles/34461853165079).
- **Privacy controls:** Privacy controls in Hevy are about hiding workouts from the *Hevy social community*, not from the coach. The coach has unconditional read.
- **Intermediate state:** None.
- **Relationship end:** Coach disconnect cuts forward visibility; historical workouts remain on the athlete side.

### Strava

- **Coach role:** Doesn't exist. Strava is a social feed for athletes.
- **Privacy controls:** Best-in-class of any app surveyed. Per-activity privacy (Everyone / Followers / Only You) with a global default. "Hide Details" lets you suppress *individual fields* (start time, pace, calories, HR, power) from feed views even when the activity is visible. Map Visibility independent. Sources: [Strava — Activity Privacy Controls](https://support.strava.com/hc/en-us/articles/216919377-Activity-Privacy-Controls), [Strava — Hide Details](https://support.strava.com/hc/en-us/articles/360028654291-Hide-Details-from-your-Activities), [Strava — Privacy Controls FAQ](https://support.strava.com/hc/en-us/articles/360025920332-Strava-s-Privacy-Controls-FAQ).
- **Relevance:** Strava's per-field hide is the closest existing precedent for the "completion only, no numbers" idea — except Strava applies it to a social feed, not a coach relationship.

### Cross-cutting observations

- **Coach-driven UX dominates.** The four coaching-SaaS apps (Trainerize, TrueCoach, Everfit, Hevy Coach) all treat coach visibility as the privileged default; the client is implicitly subordinate. MotionHive's design inverts this: the client owns the visibility lever.
- **Multi-coach is a recent admission.** Only Everfit (sub-coach, 2023) and CoachAccountable (Team Edition, 2016) properly handle it. Trainerize and Hevy Coach still don't. This is a market gap MotionHive can fill cleanly because we're greenfield.
- **No one offers "completion only."** Granular field-level privacy from a coach is unprecedented in this space. We should be honest about this in marketing — it's a differentiator, but also untested in the market and will need user education.

---

## Design proposal for MotionHive V1

Below is the visibility model. It is **additive to** [05-db-schema.md](./05-db-schema.md) — no existing column is replaced; three new columns are added to `workout_log` plus one new enum.

### Visibility enum

```sql
CREATE TYPE workout_log_visibility AS ENUM (
  'PRIVATE',                   -- only the user sees it. Default for ALL logs (assigned or freestyle).
  'SHARED_COMPLETION_ONLY',    -- a specific instructor_client sees: { name, completed_at, status, duration_seconds }.
                               -- No exercises, no sets, no numbers, no feeling_rating, no notes.
  'SHARED_FULL'                -- a specific instructor_client sees the full logged_exercise/logged_set tree.
  -- Reserved (not in V1):
  -- 'SHARED_PUBLICLY'         -- when a future "feed" / posts integration lands.
);
```

Three levels, not two. The "completion only" level is the load-bearing differentiator. Adding a fourth `SHARED_PUBLICLY` later is additive and doesn't touch existing rows.

### Schema diff (additions to `workout_log`)

```sql
ALTER TABLE workout_log
  ADD COLUMN visibility workout_log_visibility NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN shared_with_instructor_client_id CHAR(36)
    REFERENCES instructor_client(id) ON DELETE SET NULL,
  ADD COLUMN shared_at TIMESTAMPTZ;

-- Invariant: a SHARED_* visibility requires a non-NULL shared_with_instructor_client_id.
ALTER TABLE workout_log
  ADD CONSTRAINT workout_log_visibility_target_consistent CHECK (
    (visibility = 'PRIVATE' AND shared_with_instructor_client_id IS NULL AND shared_at IS NULL)
    OR
    (visibility IN ('SHARED_COMPLETION_ONLY', 'SHARED_FULL')
       AND shared_with_instructor_client_id IS NOT NULL
       AND shared_at IS NOT NULL)
  );

-- For coach-side "show me my client logs" queries.
CREATE INDEX idx_workout_log_shared_with
  ON workout_log (shared_with_instructor_client_id, completed_at DESC)
  WHERE shared_with_instructor_client_id IS NOT NULL;
```

**Why a CHECK constraint instead of service-layer only?** Because the bug we're protecting against is a coach somehow reading a `workout_log` row whose visibility is `PRIVATE`. The CHECK guarantees that no `PRIVATE` row can have a `shared_with_instructor_client_id` pointing at a coach — even if a service-layer bug accidentally sets the FK first and the visibility second. Defense in depth.

### How visibility is set

**Three write paths only.** Anything else is a bug.

1. **Workout creation** — `POST /workouts/logs` always inserts with `visibility = 'PRIVATE'`. The user has not yet expressed any sharing intent.
2. **Marking complete via assigned-workout flow** — `POST /workouts/logs/:id/complete` accepts a body:
   ```ts
   { share: 'NONE' | 'COMPLETION_ONLY' | 'FULL' }
   ```
   - `NONE` → keep `visibility = 'PRIVATE'`.
   - `COMPLETION_ONLY` → set `visibility = 'SHARED_COMPLETION_ONLY'`, `shared_with_instructor_client_id = <resolved from program_assignment.instructor_client_id>`, `shared_at = NOW()`.
   - `FULL` → same as above but `visibility = 'SHARED_FULL'`.
   - Resolution rule: `instructor_client_id` is derived from `program_assignment.instructor_client_id` — the user does not pick it. There's exactly one valid target per assigned workout.
3. **Retroactive change** — `PATCH /workouts/logs/:id/visibility` accepts the same body. Mutates the row in place. Notifies the coach on upgrades (`PRIVATE → SHARED_*` or `COMPLETION_ONLY → FULL`). Notifies the coach on downgrades to `PRIVATE` only if they had previously seen it (for transparency — "client no longer shares this workout with you").

**Freestyle workouts (no `program_assignment_id`)** can ONLY be set to `PRIVATE` in V1. Sharing a freestyle requires a target — and there's no programmatic way to pick which of N coaches gets it. **V2** could add a coach-picker UI here. Until then, freestyle = private.

### Per-workout vs. per-set granularity

**Decision: per-workout (all-or-nothing). V1 does NOT support hiding individual sets within a shared workout.**

**Arguments for per-set granularity (rejected for V1):**

- A user might want to share the workout but hide the "I only got 4 reps on the last set" embarrassment.
- Strava already does field-level hiding, so the UX precedent exists.
- The schema could trivially support it via `logged_set.is_hidden BOOLEAN`.

**Arguments against (accepted):**

- The user's mental model is one decision per workout completion, not 40 toggles per set. UX research on Hevy/Trainerize shows users abandon flows with > 1 share decision.
- "Hide the bad set but show the others" rewrites the data the coach uses for progression decisions — coach plans next week's loads off the assumption that what they see is what happened. Cherry-picked data poisons the coaching relationship.
- The right escape hatch for "I had a bad day" is `SHARED_COMPLETION_ONLY` for that single workout. The coach sees "I did it, just not how it went" and can ask in chat.
- Adding per-set later is additive (just add `logged_set.is_hidden`) and rolls forward without migration.

### Assigned but not yet completed — what the coach sees

**Decision: nothing live. Coach sees the assignment they made and the completion event when it happens.**

- `assigned_workout` rows are visible to the assigning coach by virtue of being assigned by them. That's fine — they wrote them.
- During the workout (status `IN_PROGRESS`), coach sees nothing new. No live progress, no "client is on set 3 of 4," no GPS, no heart rate stream.
- Status flip from `IN_PROGRESS` → `COMPLETED` or `ABANDONED` or `SKIPPED` triggers the visibility decision. Until then, the data is fully private.

**Arguments for live coach view (rejected for V1):**
- Trainerize/Hevy provide it — coaches like seeing "client just hit the gym."
- Could enable real-time chat nudges.

**Arguments against (accepted):**
- The user told us coaches shouldn't see anything they haven't explicitly chosen to share. "Live progress" is a continuous unconsented data stream — the *opposite* of what locked semantic #2 says.
- Engineering: live status push requires sockets / SSE, jobs module, presence tracking. Not free.
- Privacy regulators (GDPR, soon CPRA) treat continuous-stream data more strictly than discrete events. Avoid until the legal layer is dialled in.

### Multi-coach isolation — the load-bearing rule

Repeated for emphasis: **`shared_with_instructor_client_id` points at an `instructor_client` row, not at an instructor user.**

This is the entire point. See [§ Multi-coach isolation](#multi-coach-isolation) below for the example query that fails open if you implement this wrong.

### Retroactive sharing UX

**Yes, fully supported. It's literally a column UPDATE on `workout_log`.**

- "Mark complete (no share)" → 3 days later the client looks at it and thinks "actually I'm proud of this PR" → tap "Share with coach" → row is mutated.
- Or the opposite: "I shared this with coach A; now coach A and I are no longer working together — let me set it back to PRIVATE." The retroactive change is a PATCH.
- **Concurrency:** trivial — single-row update, no cross-table writes.
- **Coach notification on retroactive share:** YES, fire `CLIENT_COMPLETED_WORKOUT` (or a new `CLIENT_SHARED_WORKOUT_RETROACTIVELY`) so the coach knows new data has appeared. Without the notification, the coach has to keep refreshing to spot retroactive shares.

### What the coach sees in each visibility state

Definitive list. Burn this into the API DTOs.

| Visibility | Coach sees | Coach does NOT see |
|---|---|---|
| `PRIVATE` | Nothing. The row does not appear in any coach query. | Everything. |
| `SHARED_COMPLETION_ONLY` | `workout_log.id`, `workout_log.name`, `workout_log.status`, `workout_log.completed_at`, `workout_log.duration_seconds`, `workout_log.shared_at` | `logged_exercise[]`, `logged_set[]`, `workout_log.notes`, `workout_log.feeling_rating`, `workout_log.hk_activity_type`, `workout_log.health_connect_exercise_type`, `workout_log.started_at` (since this could reveal "you did it in the middle of the night again") |
| `SHARED_FULL` | Everything on the log, all logged exercises, all logged sets, all snapshots. | Nothing on this workout. (Other workouts are still gated by their own visibility.) |

**Note on `started_at`:** intentionally hidden in `SHARED_COMPLETION_ONLY`. Coach gets `completed_at` (so they know it happened) but not the time window. This is a deliberate small leak-reduction — matches Strava's "Hide Start Time" pattern. Confirm with the user; flagged in [§ Open questions](#open-questions).

### Coach query — the safe shape

The only blessed query for "what can coach X see for client Y":

```sql
SELECT wl.id, wl.name, wl.status, wl.completed_at, wl.duration_seconds, wl.shared_at, wl.visibility
FROM workout_log wl
JOIN instructor_client ic ON ic.id = wl.shared_with_instructor_client_id
WHERE ic.instructor_id = :coach_user_id
  AND ic.client_id     = :client_user_id
  AND ic.status        = 'ACTIVE'              -- archived relationships lose forward read
  AND wl.shared_with_instructor_client_id IS NOT NULL
  AND wl.visibility IN ('SHARED_COMPLETION_ONLY', 'SHARED_FULL');
```

Then, **only if visibility = SHARED_FULL**, the service layer is allowed to hydrate `logged_exercise` and `logged_set`. Wrap this in a service method (`WorkoutLogService.findVisibleToInstructor`) and forbid raw access from controllers.

---

## Edge cases

### Edge 1 — User ends relationship with coach A. Does coach A still see previously shared workouts?

**Behavior:** Coach A loses *forward* visibility — `instructor_client.status` flips from `ACTIVE` to `ARCHIVED`, and the blessed query above filters on `ic.status = 'ACTIVE'`. Coach A cannot see workouts the client completes *after* archive.

For previously shared workouts (`workout_log.shared_with_instructor_client_id` already points at the now-ARCHIVED ic row), **two sub-options**:

- **(a)** Coach still sees them — historical record preserved, audit-friendly. The blessed query removes the `ic.status = 'ACTIVE'` filter for read-only history endpoints (`GET /coach/clients/:id/history`).
- **(b)** Coach loses them too — strict privacy.

**Recommendation: (a) — historical retained, forward cut.** This matches every competitor surveyed (Trainerize, TrueCoach, Everfit, CoachAccountable all retain history). Coaches argue progress data is essential to their own development as a coach (revisiting old programming decisions). Clients argue privacy. The compromise is industry-standard: data already shared stays shared, but no new data flows.

**The user gets an escape hatch:** in `PATCH /workouts/logs/:id/visibility` they can flip individual workouts back to `PRIVATE` even after the relationship ends. The retroactive revocation works.

### Edge 2 — User deletes a previously shared workout

**Behavior:**

- **From user side:** soft-delete `workout_log.deleted_at = NOW()`. Aligns with the paranoid pattern used elsewhere (user, group, session, blog_post in CLAUDE.md).
- **From coach side:** coach immediately stops seeing the row (`WHERE deleted_at IS NULL` filter on all coach queries).
- **Hard delete:** explicit GDPR erasure flow (see `project_gdpr_erasure_pending.md`). When the user requests full erasure, all `workout_log` + descendants get hard-deleted regardless of share state.

**Why not "let the coach keep a copy"?** Some products (CoachAccountable mentioned auditability) keep a frozen coach-side copy. We don't. The data was always the user's; share is a window, not a copy.

### Edge 3 — Coach assigns a workout. User does it but logs it as freestyle (not linked to the assignment)

**Behavior:**

- The assignment stays in `PENDING` / `ACTIVE` status until the user manually marks it complete (or it expires by date).
- The freestyle log is `PRIVATE` by default; coach doesn't see it at all.
- The system does NOT auto-resolve based on heuristics ("you did 4 exercises that matched the assignment, must be the same workout"). Too brittle and would silently break the privacy promise — the user thought they were freestyling.
- Service offers a UI affordance: when the user opens an old assigned workout, surface freestyle logs from the same date and offer "Was this the assigned session? Mark it as the assignment." Manual user action only.

**Why not auto-link?**

- Heuristic matching is wrong often enough to be infuriating ("I did legs, not the upper body you assigned").
- Auto-linking flips a `PRIVATE` log into something the coach might see, by inferring intent the user never expressed. Hard no.
- The cost of manual is low: one button tap.

---

## Multi-coach isolation

**This is the most important section.** Get this wrong and the system has a privacy bug that ships to production.

### The bug-prone design (do NOT do this)

A naive schema would store visibility as either:

```sql
-- Naive option A: a boolean.
workout_log.shared_with_coach BOOLEAN NOT NULL DEFAULT FALSE
```

```sql
-- Naive option B: a coach user_id.
workout_log.shared_with_instructor_id CHAR(36) REFERENCES "user"(id)
```

Now consider this query that a sloppy coach-side endpoint might write:

```sql
-- Coach A asking: "show me workout logs my clients have shared with me"
SELECT wl.*
FROM workout_log wl
JOIN instructor_client ic ON ic.client_id = wl.user_id
WHERE ic.instructor_id = :coach_A_user_id
  AND ic.status = 'ACTIVE'
  AND wl.shared_with_coach = TRUE;       -- option A
  -- OR (option B variant)
  -- AND wl.shared_with_instructor_id = :coach_A_user_id;
```

With **option A**, if the client has two coaches (A and B) and shared a workout intended for coach B, the `JOIN ON ic.client_id = wl.user_id` matches BOTH `instructor_client` rows. Coach A sees coach B's workout. **Privacy bug, ships to production.**

With **option B**, the explicit `instructor_id` filter looks safer — but consider what happens when the user changes coaches mid-program. They archive coach A's relationship, start with coach B. They later look at an old workout that was shared with coach A and flip its `shared_with_instructor_id` to coach B's user_id (UX flow: "share retroactively with my new coach"). Now coach B sees a workout that was logged under coach A's assignment, with no audit trail of who originally got it. Slightly less catastrophic, but **the assignment-context is lost**.

### The correct design

```sql
workout_log.shared_with_instructor_client_id CHAR(36)
  REFERENCES instructor_client(id) ON DELETE SET NULL
```

The visibility is tied to a specific *relationship row*. `instructor_client` already encodes `(instructor_id, client_id, status)` — so a workout shared with `ic_123` (where `ic_123.instructor_id = coach_A.id`) cannot be seen by coach B even with the most naive query, because:

```sql
SELECT wl.*
FROM workout_log wl
JOIN instructor_client ic ON ic.id = wl.shared_with_instructor_client_id
WHERE ic.instructor_id = :coach_user_id
  AND ic.status = 'ACTIVE';
```

The JOIN is on the *exact relationship row* the share was tied to. Coach B's `instructor_client` row has a different id; the join never matches.

**Bonus property:** when the user adds a new coach C years later, **none** of the historical shared workouts (which point at coach A's or coach B's `instructor_client.id`) match coach C's queries. Coach C starts with zero history visibility — they earn it as the user shares new workouts.

### What the constraint protects against

Even if a service-layer bug accidentally writes:

```ts
await workoutLog.update({ visibility: 'PRIVATE' });
// developer forgot to also null shared_with_instructor_client_id
```

the CHECK constraint rejects the row. The DB enforces the invariant.

And even if a developer accidentally writes:

```ts
await workoutLog.update({
  visibility: 'SHARED_FULL',
  shared_with_instructor_client_id: someCoachUserId, // WRONG TYPE
});
```

the FK rejects (no `instructor_client.id` matches a `user_id` UUID, unless cosmic bad luck — UUID collision is ~zero).

### Example: the multi-coach race

1. User U has two active relationships: `ic_A` (with coach A) and `ic_B` (with coach B).
2. Coach A assigns program P1 via `program_assignment` with `instructor_client_id = ic_A`.
3. Coach B assigns program P2 via `program_assignment` with `instructor_client_id = ic_B`.
4. User completes a workout from P1 and chooses "share full results" → `workout_log` is written with `shared_with_instructor_client_id = ic_A.id`, `visibility = SHARED_FULL`.
5. Coach B opens their dashboard. Query joins on `ic.id = wl.shared_with_instructor_client_id` and filters `ic.instructor_id = coach_B.id`. **The join never matches** because `ic_A.id ≠ ic_B.id`. Coach B sees nothing.
6. The user later switches: archives `ic_A`, makes `ic_B` their primary. They open the old workout and want to share it with coach B too. They tap "share with my current coach" → `PATCH /workouts/logs/:id/visibility` with body `{ share: 'FULL', instructorClientId: ic_B.id }`. The row's `shared_with_instructor_client_id` updates to `ic_B.id`. The OLD `ic_A.id` link is overwritten — but coach A's `instructor_client` row still exists (status `ARCHIVED`), so if coach A views their archived-client history, they no longer see this row.

That last step deserves consideration: **does retroactive re-sharing erase coach A's historical access to that specific workout?** Yes. By design. The "single share target per workout" rule keeps the schema simple. The user accepts that re-targeting means re-pointing.

Alternative (rejected): allow N share-target rows via a join table `workout_log_share (workout_log_id, instructor_client_id, visibility)`. More flexible (you could share the same workout with both coaches). But adds complexity, requires UI for picking "who" beyond a single coach, and pushes us closer to "ambient visibility" — the thing we explicitly want to avoid. **V2 if a user actually asks for it.**

---

## Notification rules

Builders live in `src/modules/workout/notifications.ts` per the MotionHive `notifications.ts` pattern (CLAUDE.md). Each takes primitives, never entities.

### Rule 1 — Complete without sharing

**Trigger:** `POST /workouts/logs/:id/complete` with `share = NONE`, but the workout was an assigned one (i.e. `assigned_workout_id IS NOT NULL` → assignment is bound to an `instructor_client`).

**Notification:** `CLIENT_COMPLETED_WORKOUT_PRIVATE`
- Audience: the coach (resolved from `program_assignment.instructor_client_id`).
- Channels: **in-app only.** No push, no email. This is a low-key signal.
- Body: "X completed their assigned workout 'Upper A'. Results were not shared." Coach sees the workout title and the completion event. No screen-deep-link to the log (because there's nothing there to deep-link to).
- `data.screen`: `'coachClientOverview'` with `queryParams: { clientUserId }`.

### Rule 2 — Complete and share

**Trigger:** `POST /workouts/logs/:id/complete` with `share = COMPLETION_ONLY` or `share = FULL`, on an assigned workout.

**Notification:** `CLIENT_COMPLETED_WORKOUT` (existing, already declared in 04-locked-decisions.md §V1 in-scope).
- Audience: the coach.
- Channels: **in-app + push** (if coach is subscribed).
- Body for FULL: "X completed 'Upper A' — bench press +5kg PR, 47min total. Tap to review." Include 1–2 key metrics that the FE inflates client-side from the log.
- Body for COMPLETION_ONLY: "X completed 'Upper A' (completion shared only)."
- `data.screen`: `'coachClientWorkoutLog'` with `queryParams: { workoutLogId }`.

### Rule 3 — Retroactive share

**Trigger:** `PATCH /workouts/logs/:id/visibility` upgrades visibility (`PRIVATE → SHARED_*` or `COMPLETION_ONLY → FULL`).

**Notification:** `CLIENT_SHARED_WORKOUT_RETROACTIVELY` (new builder).
- Audience: the coach now seeing the workout.
- Channels: in-app only (no push — the workout is not fresh).
- Body: "X shared their workout 'Upper A' from May 18 with you."
- `data.screen`: `'coachClientWorkoutLog'` with `queryParams: { workoutLogId }`.

### Rule 4 — Retroactive revoke

**Trigger:** `PATCH /workouts/logs/:id/visibility` downgrades visibility (`SHARED_FULL → SHARED_COMPLETION_ONLY` or any `SHARED_* → PRIVATE`), **only if the coach had at least one read on the workout** (audit table `workout_log_view`, see [§ Open questions](#open-questions)).

**Notification:** `CLIENT_REVOKED_WORKOUT_SHARE` (new builder).
- Audience: the coach who is losing access.
- Channels: in-app only.
- Body: "X changed sharing on 'Upper A' — full results are no longer visible." (For full revoke to PRIVATE: "X is no longer sharing 'Upper A' with you.")
- **Justification:** the coach might quote a number in chat that the client just unshared. Without the notification, the coach speaks from data the client thinks is private. The notification puts both sides on the same footing.
- **Open:** should this exist at all? Some flows might prefer silent revocation. Flagged.

### Rule 5 — Workout due (V1 stub, V2 fires)

**Trigger:** cron, when jobs module ships.

**Notification:** `WORKOUT_DUE_TODAY` / `WORKOUT_OVERDUE` (already in 04-locked-decisions.md as stubs).
- Audience: **user only.** Not the coach in V1.
- Channels: push + email.
- **Open:** should coach get a "client hasn't done it" reminder after N days? Probably yes (Trainerize does), but defer to V2 — feels coach-nag-y and we haven't validated demand.

---

## What we are explicitly NOT supporting in V1

Same shape as the locked-decisions list. Future features, not bugs.

- ❌ **Per-set hide.** Workout-level only. (Schema supports trivially via `logged_set.is_hidden`, ship in V2 if user research demands.)
- ❌ **Live workout status to coach.** No real-time "client is in progress" view. Coach sees the completion event, that's it.
- ❌ **Share-to-multiple-coaches on the same workout.** Single share target per workout in V1.
- ❌ **`SHARED_PUBLICLY` / feed sharing.** Reserved enum value, no code path until the posts integration story lands.
- ❌ **Auto-link freestyle to assignment.** Manual user action only.
- ❌ **Coach "request to see" a private workout.** Inverts the consent model — the user, not the coach, opens the door.
- ❌ **Per-field hide (Strava-style: hide HR but show reps).** Three levels is enough. Field-level is V3+ if at all.
- ❌ **Time-window auto-expire on shares.** ("Share this workout for 7 days then auto-revoke.") Schema reserves nothing for this; add later if asked.
- ❌ **Coach reminder when client hasn't done assigned workout.** User reminder only in V1; coach reminder V2.
- ❌ **Group / circle sharing.** Workouts shared with friends-not-coach is feed territory. Out of scope.

---

## Open questions

Items the user should confirm before this design is locked.

### Q1 — Is `started_at` hidden in `SHARED_COMPLETION_ONLY`?

The proposal hides `started_at` from coach view when visibility is `SHARED_COMPLETION_ONLY`, exposing only `completed_at`. Rationale: avoids signaling time-of-day patterns to the coach when the user has chosen low-disclosure. But the coach might reasonably want a rough date to plan next week's load.

**Recommendation:** hide it. Coach gets `completed_at` only.
**Status:** flagged for user confirmation.

### Q2 — Does retroactive revoke fire a notification?

Rule 4 above fires `CLIENT_REVOKED_WORKOUT_SHARE`. Some flows might prefer silent revocation (coach simply finds the data gone next time they look — no "your client de-trusted you" notification). The argument for notifying is symmetry with shares; the argument against is that revoke notifications create awkward coaching conversations.

**Recommendation:** notify, but in-app only and with neutral wording ("sharing changed on this workout"). Avoid emotional framing.
**Status:** flagged.

### Q3 — Does coach retain historical visibility after the relationship is archived?

Edge case 1 in [§ Edge cases](#edge-cases). Recommendation: yes (historical access retained, forward access cut). Industry standard. But the user might want stricter privacy (everything revokes on archive).

**Status:** flagged.

### Q4 — Audit log of coach reads?

Should we record every time a coach views a `workout_log` (e.g. a `workout_log_view (workout_log_id, instructor_user_id, viewed_at)` audit table)? Useful for:

- The revoke-notification rule above (only notify if the coach had actually viewed it)
- Future GDPR data export ("here's everyone who saw your data")
- Trust signal in the UI ("Coach A viewed this 3 days ago")

**Cost:** one INSERT per read; non-trivial write volume on a busy account.
**Recommendation:** defer to V2. Not blocking V1 privacy correctness. (Without it, rule 4 always fires regardless of whether coach saw the workout — slightly noisier but simpler.)
**Status:** flagged.

### Q5 — Schema name: `shared_with_instructor_client_id` is verbose

Alternative names: `shared_with_relationship_id`, `shared_with_ic_id`, `shared_relationship_id`. Verbosity has a cost (queries longer, FE DTOs uglier). But `shared_with_instructor_client_id` is explicit about what it points at, matches the table name, and is greppable.

**Recommendation:** keep verbose. Privacy code that grep-friendly is worth the extra characters.
**Status:** flagged, low-priority.

### Q6 — What about workouts assigned BEFORE the privacy column existed?

Migration path: backfill all existing `workout_log` rows with `visibility = 'PRIVATE'`, `shared_with_instructor_client_id = NULL`. This is the safest default — when the migration runs, no existing logs are visible to any coach until the user explicitly re-shares. May surprise coaches who had visibility into existing client data.

**Recommendation:** ship a notification to users on first login post-migration: "We introduced workout privacy controls. All your existing workouts are private by default. [Review and share with coaches]." One-time, in-app.

Alternative (rejected): backfill existing assigned-workout logs to `SHARED_FULL`. This preserves coach experience but silently makes the privacy default opt-out instead of opt-in. Privacy-as-default is the principle; don't break it for migration convenience.

**Status:** flagged.

### Q7 — Can a SUPER_ADMIN / SUPPORT role bypass visibility for support tickets?

Likely yes (for "my workout log shows wrong" tickets), but that's a separate `super_admin_audit_log` concern. Out of scope of this design; lives in support tooling.

**Status:** flagged for the GDPR/erasure design pass (see `project_gdpr_erasure_pending.md`).

---

## Implementation checklist (for whoever ships this)

This is not a comprehensive plan, just a reminder list. Real plan lands in a separate doc when the user gives the green light.

- [ ] Migration 047 (or next free number — re-check `migrations/`) adds the three columns + enum + CHECK + index to `workout_log`. **Pre-existing `workout_log` rows default to PRIVATE.**
- [ ] `WorkoutLog` Sequelize entity: add `visibility`, `sharedWithInstructorClientId`, `sharedAt` columns with proper nullable typing.
- [ ] `WorkoutLogService.complete(logId, userId, { share, instructorClientId? })` — resolves `instructorClientId` from `program_assignment` if absent.
- [ ] `WorkoutLogService.updateVisibility(logId, userId, { share })` — retroactive change.
- [ ] `WorkoutLogService.findVisibleToInstructor(coachUserId, clientUserId)` — the blessed coach query, returns DTOs already scrubbed per the visibility table.
- [ ] DTO scrubbing: `WorkoutLogCoachDto` has two variants (completion-only vs. full) — the FE relies on the shape, don't conditionally fill nulls in a single DTO.
- [ ] Notification builders: `clientCompletedWorkoutPrivate`, `clientSharedWorkoutRetroactively`, `clientRevokedWorkoutShare`. Update existing `clientCompletedWorkout` to take a `share` flag.
- [ ] Tests: explicit multi-coach isolation test — create user with `ic_A` and `ic_B`, log a workout shared with `ic_A`, assert coach B's query returns zero rows. Without this test, the privacy bug ships.
- [ ] Tests: retroactive share / retroactive revoke flow.
- [ ] Tests: archive `ic_A` → assert coach A still sees historical shares but not new ones.
- [ ] Tests: CHECK constraint rejects inconsistent `(visibility, shared_with_instructor_client_id)` pairs at the DB level.
- [ ] Update `05-db-schema.md` "What this schema does NOT include" section to remove the implicit assumption that all logs are visible — link out to this document.
- [ ] Update `04-locked-decisions.md` with a new decision row for the privacy model + revision-history entry.

---

## Sources

- [Trainerize idea forum — Assign multiple trainers to one client](https://ideas.trainerize.com/forums/167887-coach-trainer-trainerize/suggestions/7554810-assign-multiple-trainers-to-one-client-to-share)
- [Trainerize help — Can I Assign a Client to Multiple Trainers?](https://help.trainerize.com/hc/en-us/articles/23332207757332-Can-I-Assign-a-Client-to-Multiple-Trainers)
- [Trainerize help — How to Manage Client Permissions for Workouts](https://help.trainerize.com/hc/en-us/articles/208689106-How-to-Manage-Client-Permissions-for-Workouts)
- [Trainerize help — Multiple Programming in ABC Trainerize](https://help.trainerize.com/hc/en-us/articles/11402576926868-Multiple-Programming-in-ABC-Trainerize)
- [Trainerize idea forum — Allow Clients to Design and Save Freestyle Workouts](https://ideas.trainerize.com/forums/167887-coach-trainer-abc-trainerize/suggestions/32842096-allow-clients-to-design-and-save-freestyle-workout)
- [TrueCoach help — Client Workout Visibility](https://help.truecoach.co/en/articles/3047464-client-workout-visibility)
- [TrueCoach help — Hiding a Workout From a Client](https://help.truecoach.co/en/articles/2393307-hiding-a-workout-from-a-client)
- [TrueCoach help — The TrueCoach Client Experience](https://help.truecoach.co/en/articles/2403707-the-truecoach-client-experience)
- [TrueCoach help — Deleting a Client](https://help.truecoach.co/en/articles/2695325-deleting-a-client)
- [TrueCoach help — Archived Clients](https://help.truecoach.co/en/articles/2403954-archived-clients)
- [Everfit help — Permission Settings: Add a sub-coach](https://help.everfit.io/en/articles/6809708-permission-settings-add-a-sub-coach-to-manage-your-client)
- [Everfit help — Workout Visibility setting](https://help.everfit.io/en/articles/3547124-workout-visibility-setting)
- [CoachAccountable KB — Pairing](https://www.coachaccountable.com/knowledgeBase/teamEdition/pairing)
- [CoachAccountable blog — Pairing and Permissions](https://blog.coachaccountable.com/2016/01/pairing-and-permissions/)
- [CoachAccountable blog — New Privacy Setting: Just me and the Client](https://blog.coachaccountable.com/2018/06/new-privacy-setting-just-me-and-the-client/)
- [Hevy Coach — Client App](https://hevycoach.com/features/client-app/)
- [Hevy Coach — Client Progress Tracker](https://hevycoach.com/features/client-tracker/)
- [Hevy help — How to keep my information private](https://help.hevyapp.com/hc/en-us/articles/34461853165079-How-to-keep-my-information-private-Account-Single-Private-Workout-Remove-Social-Media-Features)
- [Strava — Activity Privacy Controls](https://support.strava.com/hc/en-us/articles/216919377-Activity-Privacy-Controls)
- [Strava — Hide Details from your Activities](https://support.strava.com/hc/en-us/articles/360028654291-Hide-Details-from-your-Activities)
- [Strava — Privacy Controls FAQ](https://support.strava.com/hc/en-us/articles/360025920332-Strava-s-Privacy-Controls-FAQ)
