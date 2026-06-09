# Design Brief — MotionHive: Workout Logging (client experience)

**Status:** brief, ready to feed to Claude Design (or human designer).
**Companion:** [exercises-v1.html](./exercises-v1.html) — the exercise catalog brief that's already been designed and built. This brief is the **next module**: what the client does after a program is assigned and they actually open today's workout.
**Schema reference:** [05-db-schema.md](../05-db-schema.md) — `workout_log`, `logged_exercise`, `logged_set`, `assigned_workout`, `assigned_exercise`, `assigned_set`, `one_rep_max`.

---

## Product context

MotionHive is a fitness coaching SaaS. Instructors author **programs** (multi-week, multi-day workout plans), assign them to **clients**, and the client logs their actual workouts in the app. This brief covers **only the client-side logging flows** — building / assigning programs are separate modules.

The client experience has three stages:
1. **Preview** — what's planned for today
2. **Log** — actively working out, ticking off sets, entering actuals
3. **Review** — summary after they finish, plus historical browse

The brief asks you to design all three stages. **Pricing, billing, and program authoring are out of scope** — the client never sees them on these screens.

---

## The users

- **Client (primary, ~95% of usage)** — a person paying an instructor for coaching. Opens the app at the gym; phone in one hand, holding a barbell with the other; sweaty fingers; sometimes in armband; often with audible cues turned on. **Mobile-first by a wide margin.**
- **Instructor (secondary, read-only access to this surface)** — a coach reviewing what their clients logged. Mostly viewing summary cards and individual workout logs in a desktop browser.

When a tradeoff arises between "looks great on desktop" and "thumb-reachable at the gym", choose the latter.

---

## Locked product decisions you can assume

These came out of [04-locked-decisions.md](../04-locked-decisions.md) §5, §9–§15:

| Decision | Rule |
|---|---|
| **Three-layer architecture** | Catalog (exercise) → prescription (program) → assignment (deep copy) → log. The client logs against the assignment, never directly against the program. |
| **Copy-on-assign** | When a coach assigns a program, the entire tree (workouts → exercises → sets) is deep-copied per client. The client's assigned tree is fully theirs to override (per-set, per-exercise swap) without affecting the master. |
| **Mark-complete + optional actuals** | Each set has a checkbox to mark complete. All actual values (reps, weight, duration, distance, RPE, RIR) are nullable — the minimum bar is just the checkbox. |
| **Storage units** | Weight always in **kilograms**, distance in **meters**, duration in **seconds**. UI converts to lbs / miles / minutes per the user's preference. |
| **Snapshot at log time** | `logged_set` snapshots `exercise_name` + `exercise_thumbnail_url` at completion — historical logs survive renamed/deleted exercises. |
| **%1RM resolution** | When a prescribed set has `target_weight_percent_1rm`, the app resolves it to an absolute weight at workout start (using the latest `one_rep_max` for that exercise). The client sees "82.5 kg" not "80% of 1RM". |
| **Independent from sessions** | Workouts are NOT tied to scheduled sessions. A client can log any time; sessions and workouts coexist. |
| **No real-time wearable sync in V1** | FIT/HealthKit columns are placeholders on the schema. |

---

## The data shape (every field the UI can read or write)

### What the client sees BEFORE starting (preview view)

For each assigned workout:
- Workout name (e.g. "Day 1 — Upper")
- Scheduled date (DATE; nullable — clients on flexible plans pick when to do it)
- Phase label (free text, e.g. "Accumulation", "Deload")
- Estimated duration (minutes)
- Notes from the coach (text)
- Per exercise:
  - Exercise name, thumbnail, kind (drives which fields the logger surfaces)
  - Optional alternate-exercise suggestion ("swap with this if needed")
  - Per set:
    - Set type (NORMAL, WARMUP, DROPSET, FAILURE, AMRAP, etc.)
    - Target reps (single or range `min..max`)
    - Target weight (kg) OR target % of 1RM
    - Target duration (s) — for timed exercises
    - Target distance (m) — for distance exercises
    - Target RPE (1.0–10.0) / RIR (reps in reserve)
    - Rest after the set (seconds)
    - Tempo (e.g. "3-1-1-0" — descent / pause / ascent / pause)
    - Coach notes per set (rare but real)

### What the client enters DURING the workout

For each completed set:
- `is_completed` (boolean — the minimum bar)
- `reps` (smallint, nullable)
- `weight_kg` (decimal, nullable)
- `duration_seconds` (int, nullable)
- `distance_meters` (int, nullable)
- `rpe` (decimal 1.0–10.0, nullable)
- `rir` (smallint, nullable)
- `rest_after_seconds` (int, nullable)
- `set_type` — defaults to the planned type but the client can re-tag (e.g. "I went to failure")
- `notes` (text, optional)

For the workout as a whole:
- `feeling_rating` (1–5 emoji-style score)
- `notes` (free text)
- `duration_seconds` (auto-computed from started_at / completed_at)

### What the client sees AFTER the workout (summary)

Same as above, plus:
- Total volume (sets × reps × weight)
- Total time
- Personal records hit (computed from the logged set vs. their history for the same exercise)
- 1RM auto-suggest (from heavy low-rep sets — Epley formula)
- Coach can leave a comment (separate from per-set notes)

### Workout history list

The client's library of past workouts, paginated, sortable by date or exercise.

---

## Screens to design

Design all of the following, **mobile-first** with responsive expansion to tablet/desktop.

### S1. Today's workout preview

A client opens the app and sees "Today's workout" prominently. If no workout is scheduled for today, show "Up next" with the next workout from any active assignment.

**Must show:**
- Workout name, day-of-week, week-of-program ("Week 2, Day 3")
- Phase label, estimated duration
- Coach's notes (collapsible if long)
- Exercise list (cards) — each shows: name, thumbnail, set count, target ranges
- One primary CTA: **Start workout**

**Decisions to make:**
- Does it auto-expand the first exercise? Or keep it compact?
- Where do the alternate-exercise suggestions surface (inline, or only after Start)?
- How is a "skip today" / "log it tomorrow" affordance shown?

### S2. Active workout — the headliner

The page the client looks at for 60 minutes. Open after tapping Start.

**Must support:**
- A list of exercises with sets-grid per exercise
- For each set row, show:
  - Set number (`#1`)
  - Set type chip (Warmup / Working / Failure / AMRAP — only when not NORMAL)
  - Target column ("3 × 5 @ 82kg, RPE 8")
  - Actual columns (reps, weight, RPE/RIR — based on exercise.kind)
  - Mark-complete checkbox
- After each tick: **rest timer** starts automatically using `rest_after_seconds`. Big audible countdown, +10/-10 nudge buttons, "Skip rest" button.
- "Last time" line at the top of each exercise: previous workout's actuals (a memory aid — Strong does this beautifully).
- Per-set actions: add notes, edit values, change set type (e.g. mark as failure mid-workout).
- Per-exercise actions: add an extra set, swap exercise (opens picker), skip exercise.

**This is the most-used screen in the entire app.** Optimize for one-handed thumb reach, big tap targets (≥48px), high contrast in bright gym lighting.

**Key UX questions:**
- Does the client scroll vertically through all exercises, or is each exercise its own "page"?
- Is the rest timer overlaid full-screen, a sticky banner, or a corner card?
- How is "I just did 6 reps instead of 5" handled — separate input or inline edit on the target?
- How does %1RM resolution surface? ("82kg" with a small "80% of 1RM" subtext? Or just "82kg"?)
- What about exercises with no target weight (bodyweight, plank) — is the "Mark complete" button bigger, no input fields shown?

### S3. Rest timer

While resting between sets. Could be a full overlay, a sticky bottom card, or both depending on state.

**Must show:**
- Big countdown (mm:ss format)
- Audible cue at 0
- "Add 10s" / "Subtract 10s" / "Skip rest" buttons
- Preview of the next set (target values) — keeps the client in flow

**Optional but worth considering:**
- A "what set's coming next" preview
- Auto-start option (start timer immediately on ✓, vs. only after a confirmation)
- Sound + haptics

### S4. Swap exercise / add set / skip exercise

Inline affordances in S2. Design how these appear:
- Swap: opens the **exercise picker** (reuse from the catalog — `/exercises` with multi-select). Replaces the current exercise; logs the swap so the coach can see it.
- Add set: extends the set list by one row, target values copied from the previous set as a starting point.
- Skip: marks the exercise as `SKIPPED`, collapses it visually but keeps it in history.

### S5. Complete workout / summary

After the client taps **Finish workout** on S2.

**Must show:**
- Workout name, duration, total volume
- Per exercise: actual vs. planned diff (e.g. "+5 reps", "-10kg", "✓ as planned")
- PRs hit (heavy lift, longest hold, etc.)
- 1RM auto-suggest if any heavy low-rep set qualifies — "Update your 1RM for Squat to 142kg?"
- Workout feeling (1–5 emoji picker)
- Workout notes (free text)
- One primary CTA: **Save & finish**

**Open questions:**
- Is the 1RM auto-suggest a modal interrupt, or a "you can update this in your profile" hint?
- Where does the coach's auto-notification fire from (server-side `CLIENT_COMPLETED_WORKOUT`) — does the summary screen explicitly say "Your coach will see this"?

### S6. Workout history

The client's library of past workouts.

**Must support:**
- Paginated list, newest first
- Per row: date, workout name, duration, total volume, feeling rating
- Filters: by program, by date range, by exercise
- Tap a row → full workout summary (same shape as S5 but read-only)

### S7. 1RM tracking

A "Personal records" surface in the profile or progress area. Per-exercise chart of 1RM over time.

**Must support:**
- List of exercises with a recorded 1RM (current value + last-updated date)
- Tap an exercise → chart of all 1RM entries with date
- Manual entry: add a 1RM for any exercise (date defaults to today)
- Edit / delete prior entries

### S8. Freestyle workout

Optional — for clients who aren't on a coached program. Tap "Start workout" without an assigned plan.

**Flow:**
- Tap "Start" → blank workout
- Add exercises one by one (using the catalog picker)
- For each exercise, add as many sets as wanted (no targets)
- Log actuals
- Finish

### S9. Edit / delete past workout

Realistic case: client forgot a set, or hit Finish prematurely.

**Decisions to make:**
- Edit window (24h? 48h? Forever?)
- Can they edit set values, or only delete the whole workout?
- Audit trail visible to the coach? (e.g. "edited 23 hours after finishing")

### S10. States

For every screen above:
- Loading (workout details fetching)
- Empty (no assigned program — show "Start a freestyle workout" CTA + "Wait for your coach to assign one")
- Error (network failed mid-workout — what state is the in-progress workout in?)
- Offline (no network during a workout — log to local storage, sync later)

**Offline support is real.** Gyms have spotty wifi. Decide the offline strategy: queue writes locally and sync on reconnect, or refuse to start without a connection?

---

## Cross-cutting concerns

### Gym-floor UX

- All primary actions are thumb-reachable on a 6.7" phone (no top-of-screen primary buttons)
- Tap targets ≥48px (touch + sweat fingers)
- High contrast for outdoor / bright-gym lighting (dark backgrounds where the user reads timers)
- Minimal text fields — number pads pre-selected for weight/reps; voice input where it makes sense
- Audible / haptic cues so the user doesn't have to look at the screen during rest

### One-handed operation

- Sometimes the user has a kettlebell in one hand, phone in armband. Critical actions reachable thumb-up. Avoid two-handed gestures.

### Visual reference

MotionHive doesn't have a published design system. Reference points worth studying:
- **Strong** (the app) — gold standard for one-handed logging, the "Last time" hint, simple set rows
- **Hevy** — modern aesthetic, fewer features, very clean
- **Jefit** — busier; lots of feature surface area visible at once (don't copy this)

### Accessibility

- High-contrast number inputs
- Audio cues optional but defaults ON for rest timer
- Voice-over labels on all interactive elements
- Color never the sole signal — pair color with icon + text

---

## What to deliver back

1. **Wireframes / mockups** for S1–S10
2. **Fields-used summary** — for each screen, explicitly list every schema field the UI reads or writes. This is what we'll cross-check against the migration before building.
3. **Fields-needed list** — anything you wanted but isn't in the schema. These become candidates for column additions BEFORE we write code.
4. **Open questions** — anything you assumed. Numbered list, with your working assumption stated in each.
5. **Component inventory** — reusable pieces (SetRow, RestTimer, ExerciseLogCard, WorkoutSummary, FeelingPicker, OneRepMaxChart, etc.)
6. **State diagram** for the workout lifecycle: ASSIGNED → IN_PROGRESS → COMPLETED / SKIPPED / ABANDONED. What triggers each transition, and what happens to in-progress writes if the user closes the app?

---

## What this brief DELIBERATELY ignores

- Group programs (clients in V1 are individually assigned — no group/cohort comparison views)
- Coach-side review tools (separate brief)
- Real-time multiplayer / "live class" experiences (not a V1 concern)
- Wearable sync (FIT / Apple Health / Strava integration) — schema reserves placeholders; no UI
- Meal-plan tracking (separate module, separate brief)
- Stripe / billing (V1 workouts are free for assigned clients)

---

**Send the design back as a single self-contained HTML file** (matching the exercises module brief's deliverable shape), or as a multi-screen Figma frame. Whichever you can deliver well. Optimize for **the fields-used / fields-needed lists** — those are the critical artifact that informs the BE schema audit.
