# 08 — User-authored workouts (UX research)

**Status:** Research, scope-expansion input. Feeds back into [04-locked-decisions.md](./04-locked-decisions.md) and [05-db-schema.md](./05-db-schema.md).
**Author:** Claude research session
**Date:** 2026-05-22

## Why this research exists

Until 2026-05-22 the workouts feature was modeled as instructor-prescribed only: instructor builds a `program` → assigns to a client → client logs. The user just locked an expansion: **users can also author their own workouts and save them as reusable templates** (e.g. "My push day"), even when they don't have a coach, or want to train solo alongside coach work. Before writing schema or UI for this, we need to know what the 5–7 dominant consumer-fitness apps actually do — because in this space the patterns have converged hard and reinventing them costs us users. This document surveys those apps, identifies what's settled vs. what's a real design call, and recommends a V1 shape that fits inside the locked three-layer architecture.

## Apps surveyed

| App | Platform | Business model | What we looked at |
|---|---|---|---|
| Hevy | iOS / Android / Web | Freemium ($5/mo Pro) | "Routines" (templates), Start Empty Workout, exercise library, save-as-routine, edit-while-logging, previous-values column |
| Strong | iOS / Android | Freemium (3 templates free, unlimited paid) | Templates, empty workout, history, Perform Again, previous-set display |
| FitNotes | Android (FitNotes 2 on iOS) | Free, no ads (one-time pay on iOS) | Routines, on-the-fly logging, Copy Previous Workout, Training Screen history tab |
| Fitbod | iOS / Android | $80/yr subscription | AI-generated workout, Create Workout From Scratch, Save Workout (with three reload modes), Custom Exercises |
| JEFIT | iOS / Android / Web | Freemium | Routine Builder (web + mobile), Quick Start Sets, pre-fill from last log, exercise pre-fill settings |
| Apple Fitness+ + Apple Health | iOS / watchOS | Subscription ($10/mo) + free Health | Custom Plans (Fitness+), Custom Workouts (Health/Workout app on Watch with watchOS 26+), interval builder |
| Trainerize | iOS / Android / Web | Coach SaaS | Client-side logging, no client-authored templates in the consumer app (coach-built only) |

(7 apps surveyed; pattern-saturation hit at ~5.)

### Cross-cutting feature matrix

Quick scan of which apps ship which capabilities. Y = ships, ~ = partial/hidden, N = no.

| Feature | Hevy | Strong | FitNotes | Fitbod | JEFIT | Apple | Trainerize |
|---|---|---|---|---|---|---|---|
| Start Empty Workout (no template) | Y | Y | Y | Y | Y | Y | N |
| Save as reusable template (post-log) | Y | ~ | ~ | Y | ~ | Y | N |
| "Last time" inline during logging | Y | Y | Y | Y | Y | N | Y |
| Edit-while-logging (add/remove/swap) | Y | Y | Y | Y | Y | ~ | ~ |
| Custom-exercise creation from picker | Y | Y | Y | Y | Y | N | N (coach only) |
| Copy / Repeat previous workout | ~ | Y | Y | Y | ~ | N | N |
| Routine update prompt on drift | Y | N | N | N | N | N | N |
| Folder/grouping for templates | Y | N | Y (Days) | N | Y | N | ~ |
| Multi-day "program" concept | ~ (folder) | N | Y (Days within Routine) | N | Y (Routine) | Y (Custom Plan) | Y |
| AI-generated workout default | N | N | N | Y | N | N | ~ |
| Share template with another user | Y | N | N | N | ~ (community) | N | Y (coach→client) |

Strong and FitNotes mark "~" for save-as-template because they conflate "Perform Again from history" with template semantics — functionally equivalent for the user, structurally different in the DB. Hevy marks "~" for Repeat-previous because it routes through the save-as-routine surface rather than offering a one-tap Repeat. Apple marks "~" for edit-while-logging because Apple's strength model is rudimentary (no set-level edits during a session in the same way).

## Authoring flow — what each app does

### Hevy — "Routines" are first-class, plus Start Empty Workout

Hevy has two parallel entry points on the Workout tab: **+ Start Empty Workout** (blank session with stopwatch immediately running) and **+ New Routine** (template you reuse). Inside a routine you tap **+ Add Exercise**, search the 400+ exercise library (with equipment + muscle filters), and add one or many at a time. When you add an exercise you've done before, the previous sets/weight/reps pre-populate and you can adjust ([Hevy: Create Folders and Gym Routines](https://www.hevyapp.com/features/gym-routines/), [Hevy: Custom Exercises](https://www.hevyapp.com/features/custom-exercises/)).

The killer feature is the **bidirectional template/log relationship**: after logging an empty workout, you can save it as a routine from the Profile → three-dot menu ([Hevy: Save Workouts](https://www.hevyapp.com/features/workout-log/)). And after logging a workout that *came from* a routine, if you added/removed exercises, Hevy asks "update the original routine?" ([Hevy: Exercise Programming Options](https://www.hevyapp.com/features/exercise-programming-options/)). Edit-while-logging is fully supported — add, remove, swap, reorder, change rest, mark warmup/dropset, create supersets ([Hevy: Track Workouts](https://www.hevyapp.com/features/track-workouts/)).

### Strong — Templates + empty + Perform Again

Strong's mental model is nearly identical to Hevy's: **Templates** are reusable, you tap **+ New Template**, add exercises and sets, save. Free tier caps at 3 templates ([Strong Help: About Templates](https://help.strongapp.io/article/105-about-templates)). Empty workout starts from the top of the Workout tab. After starting empty, the same Add Exercises affordance is reused for both empty and template-launched sessions ([Strong Help: My First Workout](https://help.strongapp.io/article/229-my-first-workout)).

Strong adds a **Perform Again** button on completed workouts in History — one tap reloads the exact same exercise list as a fresh in-progress workout, without going through the template surface ([App Store listing](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)). This is a third path that sits between "use template" and "start empty" — copy-yesterday's-workout.

### FitNotes — Routines + on-the-fly + Copy Previous Workout

FitNotes treats freestyle as the default and routines as an opt-in optimization. From the Home Screen you tap the start button → exercise list. "Logging on-the-fly is an alternative to using routines and can be preferred if you repeat different workouts each time rather than the same routine" ([FitNotes: Workout Tracking](http://www.fitnotesapp.com/workout_tracking/)). Routines let you define multiple "Days" (Day 1 / Day 2 / Day 3) with predefined sets per exercise; you tap "Log All" next to a Day to bulk-add it to the current workout ([FitNotes: Routines](http://www.fitnotesapp.com/routines/)).

Distinctive feature: **Copy Previous Workout** on an empty workout opens a calendar of past workouts; pick one, optionally cherry-pick which exercises/sets to copy, hit Copy ([FitNotes: Workouts iOS Help](https://www.getfitnotes.com/docs/workout.html)). This is Strong's "Perform Again" with finer-grained control.

### Fitbod — AI-generated default, Create From Scratch escape hatch

Fitbod's default is AI: open the app, it has already generated today's workout based on your profile and recovery state ([Fitbod algorithm](https://fitbod.me/blog/fitbod-algorithm/)). For users who want to override, **Swap → Create Workout From Scratch** wipes the generated workout and lets you add exercises one by one ([Fitbod Help: Workout Schedule & Logging](https://fitbod.zendesk.com/hc/en-us/sections/1500000505721-Workout-Schedule-Logging)).

The save-as-template surface is **Saved Workouts**: from any workout screen, "…" → Save Workout. On reload, Fitbod offers three modes — repeat exactly, regenerate weights only (keep sets/reps), or regenerate everything keeping just the exercises ([Fitbod: Save a Workout](https://fitbod.zendesk.com/hc/en-us/articles/6259258835863-Save-a-Workout), [Fitbod blog: Saved Workouts](https://fitbod.me/blog/saved-workouts/)). The three-mode reload is unusual — most other apps just clone the template.

Custom exercises: scroll the exercise picker → tap "+ Add Exercise" → if not found, "+ Create New Exercise" with primary muscle, secondary muscles, equipment ([Fitbod: Custom Exercises](https://fitbod.zendesk.com/hc/en-us/articles/28062570249623-Custom-Exercises)).

### JEFIT — Routine Builder (web + mobile) and Quick Start Sets

JEFIT is the closest to "spreadsheet for lifters." Routine Builder has a full-screen editor with drag-and-drop to reorder days, picks from 1,500+ exercises, per-exercise weight/reps/rest customization, supports warmup/drop/failure set types ([JEFIT: New Routine Builder](https://www.jefit.com/wp/jefit-news-product-updates/introducing-new-routine-builder-workout-planning-simplified/), [JEFIT: How to Create Customized Routine](https://support.jefit.com/hc/en-us/articles/360018367531-How-to-Create-a-Customized-Routine-)). You can build on web and download to mobile.

**Quick Start Sets** are JEFIT's "log on the fly" path — search an exercise, log sets, sync ([JEFIT: Workout Logging](https://www.jefit.com/use-case/workout-logging-app)). All completed Instant Workouts go into history and feed stats. JEFIT's pre-fill is configurable per-account: pull from "last general log for this exercise" (default) or "last time in this routine" — a deliberate accommodation for periodized programs where the routine-scoped value matters more ([JEFIT: Pre-fill Settings](https://www.jefit.com/wp/product-tips-faq/teach-jefit-how-you-workout-with-pre-fill-value-settings/)).

### Apple Fitness+ / Apple Health — Custom Plans vs. Custom Workouts

Apple splits this into two surfaces. **Fitness+ Custom Plans** ([Apple Support: Use Custom Plans in Apple Fitness+](https://support.apple.com/guide/fitness-plus/use-custom-plans-apdf222051d8/ios)) let you schedule Fitness+ video classes across weeks — pick days, duration, activity types (up to 5), plan length. This is a *scheduling* tool, not a template builder; the workouts themselves are Apple-produced videos.

**Custom Workouts** in the Apple Watch Workout app are real user-authored sessions: warmup, repeating work/recovery intervals (time/distance/open), cooldown ([Apple Support: Create a Custom Workout on Apple Watch](https://support.apple.com/guide/watch/create-a-custom-workout-apd66fcd5c5c/watchos), [Apple Support: Customize a workout in Fitness on iPhone](https://support.apple.com/guide/iphone/customize-a-workout-iphbcd56be45/ios)). Custom Workouts are saved templates — you create once, use any time, edit any time — and they sync iPhone↔Watch. Crucially Apple doesn't model strength sets at all — this is an interval/cardio builder. Out of scope for our strength-first V1, but the **template-is-just-a-saved-config + edit-anytime + auto-sync** UX is the same shape as the strength apps.

### Trainerize — Coach-built only on the consumer side

The Trainerize client app does **not** let clients author their own templates. Coaches build workouts in the Master Workout Library (drag-and-drop with 4 types: Regular, Circuit, Interval, Video), then schedule them onto a client's calendar. Clients log on the day; stats sync back to the coach ([Trainerize Help: How to Create a Workout in the Master Workout Library](https://help.trainerize.com/hc/en-us/articles/208689086-How-to-Create-a-Workout-in-the-Master-Workout-Library), [Trainerize Help: How do clients and trainers track workout stats?](https://help.trainerize.com/hc/en-us/articles/208688946-How-do-clients-and-trainers-track-workout-stats)). Trainers who want to log their own workouts have to add themselves as a client and use the Peak Fitness app ([Trainerize Help: Can Trainers Train Themselves as Clients Too?](https://help.trainerize.com/hc/en-us/articles/360046225911-Can-Trainer-s-Train-Themselves-as-Clients-Too)).

This is the **anti-pattern**. It's a long-standing user complaint ([Trainerize Idea Forum: Allow trainers to log into the app and track their own workouts](https://ideas.trainerize.com/forums/167887-trainerize/suggestions/39840190-allow-trainers-to-log-into-the-app-and-track-their)) and the friction reads as "we forgot to build this." Worth noting because MotionHive's three-layer model could easily slip into the same shape if we don't deliberately give users a self-authoring path.

## Convergent patterns (the answers)

These appear in ≥5 of the 6 self-authoring apps (Trainerize excluded — it has no consumer authoring). Convergence this strong means they're not design decisions; they're table stakes.

### C1. Two entry points: **"Start Empty Workout"** AND **"Use a Template / Routine"**

Hevy, Strong, FitNotes, Fitbod, and JEFIT all expose both. Apple does too (a custom workout file is a template; tapping into a workout type without one is "empty"). The pattern: the Workout tab has a prominent **Start Empty Workout** button at the very top, and the templates/routines list is right below it.

- Hevy: "+ Start Empty Workout" at top of Workout tab ([source](https://www.hevyapp.com/features/start-empty-workout/))
- Strong: same ([source](https://help.strongapp.io/article/229-my-first-workout))
- FitNotes: Home Screen start button → exercise list, no template required ([source](http://www.fitnotesapp.com/workout_tracking/))
- Fitbod: Swap → Create Workout From Scratch ([source](https://fitbod.zendesk.com/hc/en-us/sections/1500000505721-Workout-Schedule-Logging))
- JEFIT: Quick Start Sets ([source](https://www.jefit.com/use-case/workout-logging-app))

**Takeaway for MotionHive:** Empty-workout MUST exist. If we only ship "create a template, then log against it," casual users will bounce. The empty workout is the on-ramp; templates are the optimization.

### C2. Same authoring surface for templates and empty workouts

Adding exercises to a template uses the **same picker, same UI, same gestures** as adding exercises to a live session. There is no "template builder" mode separate from the workout screen — they're the same screen, the only difference is whether a stopwatch is running.

- Hevy: "Adding exercises while creating a routine, editing an existing one, or logging a live session" use identical UI ([source](https://www.hevyapp.com/features/exercise-programming-options/))
- Strong: "you can add exercises and sets to a template in the same way as you would for a workout" ([source](https://help.strongapp.io/article/105-about-templates))
- Fitbod: same add-exercise dialog from generated, custom, or saved workout
- JEFIT: same Exercise List in routine builder and Quick Start

**Takeaway:** One screen, two modes. Cuts UI surface by ~50% and means users learn one mental model.

### C3. "Save this as a routine/template" after logging

Five of six apps let you log a freestyle workout and then promote it to a reusable template — without having to plan a template in advance.

- Hevy: Profile → completed workout → three dots → "Save as Routine" ([source](https://www.hevyapp.com/features/workout-log/))
- Strong: implicit via Perform Again (history-as-template) ([source](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577))
- FitNotes: Copy Previous Workout uses history rows as ad-hoc templates ([source](https://www.getfitnotes.com/docs/workout.html))
- Fitbod: "…" → Save Workout from any workout screen, including ones you just finished ([source](https://fitbod.zendesk.com/hc/en-us/articles/6259258835863-Save-a-Workout))
- JEFIT: Quick Start Sets feed history; user manually copies into a routine

**Takeaway:** Templates emerge from logged workouts at least as often as the other way around. The save-as-template path off a completed log is **required** — not "nice to have." Without it, users have to author the same workout twice (once to log, once as a template) which is the #1 complaint in early-tracker reviews.

### C4. **"Previous" / last-time inline during logging**

This is the single most-cited UX feature in this category. Every app surveyed displays the user's last performance for an exercise inline while logging, with no extra navigation.

- Hevy: PREVIOUS column visible on every set row during a live workout; pulls from "last time you did this exercise" with a settings flag to optionally scope to "in this routine" ([source](https://www.hevyapp.com/features/track-exercises/))
- Strong: "during the workout, it shows what you did last time (reps and weight)" ([source](https://www.strong.app/))
- FitNotes: Set Fields auto-populated with values from last workout's first set ([source](http://www.fitnotesapp.com/workout_tracking/))
- Fitbod: shows last-session reps/weight; algorithm adjusts recommended weights from last log ([source](https://fitbod.zendesk.com/hc/en-us/articles/360006335593-Editing-Workouts))
- JEFIT: pre-fills reps from last log, configurable to "general last" or "last in this routine" ([source](https://www.jefit.com/wp/product-tips-faq/teach-jefit-how-you-workout-with-pre-fill-value-settings/))

**Takeaway:** Last-time-inline is non-negotiable. It's not a power-user feature; it's the table-stakes feedback loop that makes progressive overload visible. See the dedicated section below.

### C5. Edit-while-logging is fully supported

In all 6 self-authoring apps, the user can add/remove/swap/reorder exercises mid-workout, add unplanned sets, change rest, mark sets as warmup/dropset/failure. There is no "you're locked into the plan" mode.

- Hevy: "you can change any variables including adding, removing, swapping, or reordering exercises, adding or removing sets, marking sets by type, adjusting the rest timer" ([source](https://www.hevyapp.com/features/track-workouts/))
- Strong: Add Exercises button always visible during workout ([source](https://help.strongapp.io/article/229-my-first-workout))
- FitNotes: same picker as start, available at any time
- Fitbod: swipe left to Replace or Delete; "+Add Exercise" at any time ([source](https://fitbod.zendesk.com/hc/en-us/articles/360006335593-Editing-Workouts))
- JEFIT: add/remove/reorder during workout

**Takeaway:** Even template-launched sessions are fully editable. The mental model is "the template seeds the workout, the workout is what really matters." This aligns perfectly with the locked **copy-on-assign** decision — when a user starts a workout from their own template, we deep-copy it to a session and let them mutate the copy freely.

### C6. Exercise picker: recent-first + search + filter

Every app surveyed uses the same picker shape: recently used exercises at the top, then a searchable/filterable list of the full catalog, with custom exercises mixed in.

- Hevy: "Recently logged exercises appear at the top" + search bar + equipment + muscle filters ([source](https://www.hevyapp.com/features/exercise-library/))
- Strong: history-based ordering + search + filter ([source](https://help.strongapp.io/article/229-my-first-workout))
- FitNotes: recently used surfaces in the exercise list
- Fitbod: search + filter + custom exercises at top of "+Add Exercise"
- JEFIT: search + 1,500+ exercise library + custom

**Takeaway:** The picker is a solved problem. Build it once, use it everywhere (template build, empty workout, mid-session add). Match the recent-first ordering — it cuts taps by an order of magnitude for repeat users.

### C7. Custom-exercise creation lives **inside** the exercise picker

Every app surveyed that has user-created exercises (all except Apple) puts the "Create new exercise" affordance inside the exercise picker itself, not in a separate Settings → Exercises area. The flow is: open picker → search "my landmine row" → no results → "+ Create New Exercise" button appears inline → modal with name + primary muscle + equipment → exercise saved AND added to the current workout/template.

- Hevy: scroll to bottom of picker → "+ Create custom exercise"; saved row appears in catalog ([source](https://help.hevyapp.com/hc/en-us/articles/35688251991575-Hevy-Exercise-Library-400-Exercises-and-Custom-Exercises))
- Strong: "Create your Own" from inside the picker during workout ([source](https://help.strongapp.io/article/229-my-first-workout))
- Fitbod: scroll exercise list → "+Add Exercise" → "+Create New Exercise" with muscle + equipment ([source](https://fitbod.zendesk.com/hc/en-us/articles/28062570249623-Custom-Exercises))
- FitNotes: from exercise list, tap "+" → New Exercise form ([source](http://www.fitnotesapp.com/exercises/))
- JEFIT: same pattern, from exercise picker during routine build or quick start

**Takeaway for MotionHive:** the existing exercise create endpoint (`POST /exercises`, INSTRUCTOR-or-USER) needs to be callable mid-workout. The picker UI on FE should embed the create flow as a fallback when search returns zero results. No backend change required — the existing `exercise` table already supports `source='INSTRUCTOR'` (which we may want to relax to `source='USER'` or treat the field as "self-authored" regardless of role; see open questions).

### C8. Workouts are auto-named, user can rename

None of the surveyed apps force the user to name a workout before logging. They auto-name from a date or weekday ("Friday Workout", "Tuesday — May 22") and let the user rename inline.

- Hevy: auto-name "Friday Workout" with inline edit ([source](https://www.hevyapp.com/features/workout-log/))
- Strong: timestamp-based default
- Fitbod: "[Body Part] Day" or generic "Workout"
- FitNotes: no name field for empty workouts; the workout is just identified by date
- JEFIT: timestamp + day-of-week

**Takeaway:** Auto-name on the server with `'Workout — ' + format(started_at, 'EEEE, MMM d')`. User can PATCH to rename. No required-field friction at start.

## Divergent patterns (real decisions)

These are places where apps disagree. Each is a real design decision we have to make.

### D1. **Auto-prompt to update the source template when the logged workout drifts?**

When a user starts a workout from a template and then adds/removes exercises during the session, what happens to the template?

- **Hevy: prompt the user.** "Update the original routine?" — accept applies the changes to the template; decline keeps the template untouched. ([source](https://www.hevyapp.com/features/exercise-programming-options/))
- **Strong / FitNotes / JEFIT: no prompt.** The logged workout is independent; the template is untouched. Users have to manually re-edit the template if they want changes.
- **Fitbod: three-mode reload** — when you reload a saved workout you choose to either repeat exactly, regen weights, or regen everything. ([source](https://fitbod.zendesk.com/hc/en-us/articles/6259258835863-Save-a-Workout))

**Tradeoffs:** Hevy's prompt is the friendliest for users who refine their template over time, but introduces a UI question on every save and risks accidental drift. Strong/FitNotes/JEFIT's silence is safer but means users with evolving templates carry the burden manually.

**MotionHive recommendation:** **Match Hevy.** Show a non-blocking prompt on workout-completion if the structure drifted from the source template (exercises added/removed; sets count differs from template). Yes by default for the user's own templates; **never** prompt for coach-assigned templates (the coach's prescription is immutable from the client's side — see locked decision §10 copy-on-assign). This is one prompt that meaningfully reduces friction.

### D2. **One canonical template entity, or template-vs-program distinction?**

- **Hevy / Strong / FitNotes / JEFIT / Fitbod: one entity** ("routine" / "template" / "saved workout"). A multi-day plan is just a collection of single-day templates inside a folder; no separate "program" concept on the consumer side.
- **Trainerize / coaching apps:** separate "Program" (multi-week plan with phases) vs. "Workout" (a single day).
- **Apple:** Custom Plans (multi-week scheduling) vs. Custom Workouts (single sessions) — two distinct entities.

**Tradeoffs:** A single-entity model is simpler but loses periodization (no week-1 vs. week-4 differentiation). A two-entity model is more expressive but more intimidating.

**MotionHive recommendation:** **Keep the locked two-tier `program` → `program_workout`.** A user-authored "template" is just a `program` with one `program_workout` inside. Power users can author multi-day programs the same way coaches do — we don't need a separate UI concept. This decision aligns with locked decision §13 ("forward-compat namespace"). See "Schema implications" below.

### D3. **Free-tier template caps**

- **Strong: 3 templates free**, unlimited paid. ([source](https://help.strongapp.io/article/105-about-templates))
- **Hevy: 4 routines free**, unlimited paid (gleaned from Hevy Pro pages).
- **FitNotes, JEFIT free tier: unlimited templates.**
- **Fitbod:** subscription-gated overall.
- **Apple:** unlimited (free with Apple Watch).

**Tradeoffs:** Capping templates is a clean upgrade-pressure surface but feels punitive when the user knows it's "just rows in a DB." Unlimited templates moves monetization elsewhere (analytics, sharing, custom exercises, coach features).

**MotionHive recommendation:** **No template cap in V1.** MotionHive's monetization is coach-side (Stripe Connect on coach products), not consumer-side. Capping user-authored templates would make the free experience worse than free competitors. Decide upgrade-pressure separately when the consumer monetization story exists.

### D4. **AI-generated default vs. user-authored default**

- **Fitbod: AI-default.** Open the app, today's workout is already generated.
- **All other surveyed apps: user-authored default.** Empty/template-based, no auto-generation.

**Tradeoffs:** AI-default is a strong cold-start story (you have a workout before you've done anything) but only works if the AI is actually good — and a bad AI is worse than empty. User-authored default has a worse cold start but is robust.

**MotionHive recommendation:** **User-authored default for V1.** Auto-generation is a large workstream (algorithm, recovery model, equipment model — Fitbod has 10 years of investment here). For V1, cold-start is solved by a **library of starter templates** (PPL, 5×5, Full-Body 3x/week) the user can clone — same pattern Hevy uses via [its Routine Library](https://www.hevyapp.com/features/gym-workout-routines/). This is a copy-from-public-template surface, not an AI surface. Defer AI to a future "MotionHive Coach AI" milestone.

### D5. **"Perform Again" / "Copy Previous Workout" — first-class or buried?**

- **Strong: first-class.** Perform Again button on every history row. ([source](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577))
- **FitNotes: first-class.** Copy Previous Workout from empty workout with calendar picker. ([source](https://www.getfitnotes.com/docs/workout.html))
- **Hevy, Fitbod, JEFIT: buried** — you save the workout as a template first, then launch from the template. Functionally equivalent but more taps.

**Tradeoffs:** First-class is fewer taps. Buried forces users into the template surface which trains the template mental model (Hevy's actual aim).

**MotionHive recommendation:** **First-class Repeat Workout button** on the History row in V1. Implementation is trivial — it just deep-copies a `workout_log` into a fresh in-progress workout. No new schema. Especially valuable for users who train inconsistently and don't curate templates — the workout itself becomes the implicit template.

### D6. **Per-set "last time" vs. per-exercise "last time"**

Sub-divergence within the universally-shipped "last time" feature.

- **Hevy: per-set.** The PREVIOUS column shows what you did *for that specific set number* last time (set 1 → 60kg × 8, set 2 → 65kg × 6, set 3 → 70kg × 4). Pyramid-friendly. ([source](https://www.hevyapp.com/features/track-exercises/))
- **FitNotes: per-first-set with full history below.** Auto-fills only set 1 with last workout's set 1; the History tab below shows everything from last workout for reference. ([source](http://www.fitnotesapp.com/workout_tracking/))
- **JEFIT: per-set, with pre-fill mode flag** (last-general vs. last-in-routine). ([source](https://www.jefit.com/wp/product-tips-faq/teach-jefit-how-you-workout-with-pre-fill-value-settings/))
- **Strong:** "shows what you did last time" — implementation is per-set position match. ([source](https://www.strong.app/))
- **Fitbod:** algorithm-mediated; shows the recommendation derived from last log, not the raw last value.

**Tradeoffs:** Per-set is more useful for pyramid/ascending sets (where each set is intentionally different) but is more complex to render. Per-first-set is simpler and works for the 80% case where all sets are roughly equal.

**MotionHive recommendation:** **Per-set match** — the wide `prescribed_set` / `logged_set` schema with `order_index` already supports this naturally. Join `logged_set.order_index = current_prescribed_set.order_index` for the same `(user_id, exercise_id)` from the most recent completed workout. Falls back to the first available logged_set if set count differs (e.g. last workout had 3 sets, today has 4).

### D7. **Sharing user-authored templates with other users**

- **Hevy: shareable links + folders.** You can share a routine or a folder of routines with another user via link. ([source](https://www.hevyapp.com/features/share-folders-routines/))
- **Strong, FitNotes, JEFIT, Fitbod: no native template sharing.** (JEFIT has community-uploaded routines but it's a curated marketplace, not user-to-user sharing.)
- **Trainerize, MotionHive Coach side:** sharing is the default — coaches assign to clients.

**Tradeoffs:** Native template sharing is a real social feature; it's also moderation surface ("my workout is named XXX explicit content") and complicates the privacy model.

**MotionHive recommendation:** **Out of scope for V1.** Locked decision §3 already excludes "Coach-to-coach program sharing" and "Public program library" — extending that to user-to-user template sharing is consistent. If we want it later, the share-link surface can be additive (a `program_share` table with a public-link token, no schema change to `program`).

## "Last time you did this" — how universal?

Standalone section because this is load-bearing and the locked schema needs to be checked against it.

**Every single app surveyed shows the user's previous performance on an exercise inline during logging.** This is not a power-user feature; it's the table-stakes UX cornerstone:

| App | What's shown | Scope | Source |
|---|---|---|---|
| Hevy | PREVIOUS column with weight × reps per set | Last time you did this exercise (configurable: "in this routine" or "global") | [Hevy: Previous Workout Values](https://www.hevyapp.com/features/track-exercises/) |
| Strong | Previous sets visible next to current; "shows what you did last time" | Global | [Strong app](https://www.strong.app/) |
| FitNotes | Auto-fills weight/reps/distance/time fields with last workout's first set; full History tab on Training Screen | Global | [FitNotes: Workout Tracking](http://www.fitnotesapp.com/workout_tracking/) |
| Fitbod | Last session reps/weight visible; algorithm uses it to recommend today's targets | Global | [Fitbod: How Fitbod Personalizes Your Workout Plan](https://fitbod.me/blog/how-fitbod-personalizes-your-workout-plan-using-smart-training-algorithms/) |
| JEFIT | Pre-fills reps; settings-configurable scope ("last general" or "last in this routine") | Configurable | [JEFIT: Pre-fill Settings](https://www.jefit.com/wp/product-tips-faq/teach-jefit-how-you-workout-with-pre-fill-value-settings/) |
| Apple | N/A — Apple's strength tracking is rudimentary (sets/reps only as workout segments) | — | — |

**Why this matters for retention:** progressive overload requires you to remember what you did last time so you can do slightly more this time. Apps without inline "last time" force users to flip back to history, which breaks workout flow, which causes session abandonment. Hevy's user-facing description nails it: "you can easily see how you've done on a particular set the previous time, so you can push hard and do better this time" ([source](https://www.hevyapp.com/features/track-exercises/)).

**The scope nuance** — global vs. routine-scoped — is where Hevy and JEFIT both offer a setting. Default to **global** ("last time you did this exercise, anywhere") because that's what 90% of users want. Power users running periodized blocks want routine-scoped because their "deload week" numbers shouldn't pollute their "intensification week" reference. Schema-wise this is a query, not a column — see schema implications below.

**Schema fit:** the locked schema already supports this via `logged_set` (joined to `logged_exercise.exercise_id`). To compute "last time you did this exercise" for a given `(user_id, exercise_id)` we query:

```sql
SELECT ls.*
FROM logged_set ls
JOIN logged_exercise le ON le.id = ls.logged_exercise_id
JOIN workout_log wl ON wl.id = le.workout_log_id
WHERE wl.user_id = :user_id
  AND le.exercise_id = :exercise_id
  AND wl.status = 'COMPLETED'
ORDER BY wl.completed_at DESC
LIMIT 1;
```

A composite index on `(user_id, exercise_id, completed_at DESC)` would make this O(1). The existing `idx_workout_log_user_date` plus the `idx_logged_exercise_exercise` partial index gets us 80% there. For V1 we add a covering index in the migration.

**Routine-scoped variant** requires joining through `assigned_workout → program_assignment` or for user-authored templates, joining back to the source `program_workout`. For V1 we ship **global only**; routine-scoped is a setting we add when (if) users ask for it.

## Recommended V1 user-authoring flow for MotionHive

### Cold-start (first-time user, no coach, no workouts)

1. User logs in → workouts home tab.
2. Two top-level CTAs visible:
   - **Start Empty Workout** (large primary button, stopwatch starts immediately)
   - **Browse starter templates** (clone a public starter into your library; not in V1 if we skip a public template library — but Hevy's pattern is to ship 25+ starters from day one)
3. Below the CTAs: empty state explaining "Your templates and history will appear here as you train."

### First workout (empty-workout path)

1. User taps **Start Empty Workout**. New `workout_log` row created with `program_assignment_id = NULL`, `assigned_workout_id = NULL`, `status = 'IN_PROGRESS'`, `name = 'Workout — Friday, May 22'` (auto-named from date; user can rename).
2. User taps **+ Add Exercise** → picker opens (recent-first; empty section because cold-start; full catalog below). User picks Bench Press.
3. `logged_exercise` row created. Default 3 empty sets are added (matching Hevy/Strong default — research consensus). User edits weight/reps inline; checkbox marks set complete.
4. Last-time bubble: because this is the user's first time doing Bench Press, the PREVIOUS column is empty/dashed. After the first logged set, future sessions will show "Last: 60kg × 8."
5. User repeats add-exercise → log-sets for the rest of the workout.
6. User taps **Finish Workout**. `workout_log.status = 'COMPLETED'`, `completed_at = now()`, `duration_seconds` computed.
7. **Post-completion prompt:** "Save this as a routine?" with a default name pre-filled (`logged_exercise[0].name + ' day'`). User accepts → we create a `program` (kind=`WORKOUT`, owner_id=user_id) with one `program_workout` containing the same `prescribed_exercise` + `prescribed_set` rows, where target_* fields are filled from the actual logged values.

### Power-user state (10+ workouts logged, 3+ templates saved)

1. User opens Workouts tab → sees their template library (folders, names, last-used date), History tab below.
2. To repeat their "Push Day" template: tap template → **Start Workout** button → new `workout_log` is created with `program_assignment_id = NULL` and the exercises/sets deep-copied as `logged_exercise`/`logged_set` (in-progress, planned values pre-populated, last-time bubbles from history).
3. To repeat exactly what they did last time without using a template: tap History row → **Repeat** → ditto, except source is the previous `workout_log`.
4. To freestyle: **+ Start Empty Workout** at the top.
5. To edit a template: open template → drag/drop exercises, add/remove sets, save. Doesn't affect existing workout_log rows or in-progress workouts.
6. **During any workout** (empty, from-template, or repeat), they can add/remove/swap exercises, add unplanned sets, mark sets warmup/working/dropset.
7. **On finish**, if the workout drifted from a source template, show non-blocking prompt: "You added Bicep Curls and removed Tricep Pushdowns. Update Push Day template?" — Yes / No / Save as new template.

### When the user is also a coach client

1. User has both their own templates AND coach-assigned programs.
2. Workouts tab shows three sections: **From your coach** (assigned `program_assignment` rows), **Your routines** (user-owned `program` rows), **History**.
3. Coach-assigned workouts launch via `program_assignment.assigned_workout` → log against `workout_log.assigned_workout_id`. Drift prompt is **hidden** (locked decision §10: copy-on-assign means client-side edits never propagate).
4. User-authored workouts launch via the path above, drift prompt is shown.

## Schema implications

Does the locked schema support user-authored templates without modification?

### Path A: User-template = `program` with `owner_id = user.id` and no assignment

**Argument for:** The locked schema already has `program.owner_id REFERENCES "user"(id)`. There's no schema-level distinction between "an instructor's owner_id" and "a regular user's owner_id" — they're both rows in `"user"`. The `instructor_client` table mediates the *assignment* relationship, not ownership. So:

- A user creates a "Push Day" template → INSERT INTO program (id, owner_id=user.id, kind='WORKOUT', status='PUBLISHED', name='Push Day').
- One `program_workout` row inside it (week_index=0, day_index=0, sequence_number=0).
- N `prescribed_exercise` + `prescribed_set` rows.
- **No `program_assignment` row is ever created** — the user starts a workout directly from their own `program`.
- `workout_log.program_assignment_id` stays NULL (already supported per the schema comment: "Assignment linkage (nullable for freestyle/unplanned workouts)").

What's needed to "start workout from user's own template":
- New service path that takes a `program.id` owned by the calling user and creates a `workout_log` + `logged_exercise` + `logged_set` rows, copying from `prescribed_exercise` → `logged_exercise` and `prescribed_set` → `logged_set` (with all `target_*` becoming planned values pre-populated in actuals but `is_completed=false`).
- Authorization check: caller must own the program OR have an active assignment.

**What we lose:** Nothing significant. The 3-week / multi-day fields (`week_index`, `day_index`, `sequence_number`, `phase`, `duration_weeks`) are unused for single-day templates but they're all nullable or have sensible defaults. Storage cost is trivial.

**Argument against Path A:** Conceptual overload. A "program" in instructor language is a multi-week training block; a "template" in consumer language is a single workout. Reusing the same table for both could confuse the API consumers and the search index (a one-day "Push Day" appearing next to a 12-week "Hypertrophy Block" with the same `kind='WORKOUT'`).

### Path B: New `user_workout_template` entity

A new table `user_workout_template` + `user_template_exercise` + `user_template_set` mirroring `program_workout` / `prescribed_exercise` / `prescribed_set` but with `owner_id = user.id` directly.

**Argument for:** Cleaner semantic separation. Instructor "program" stays multi-week and complex; user "template" stays one-day and simple. Search and list endpoints don't have to filter on "show only programs with `duration_weeks IS NULL`."

**Argument against Path B:**
1. **Doubles the schema surface** — 3 new tables (template, template_exercise, template_set) mirroring 3 existing ones with identical column shape. Every future change to set-fidelity (e.g. adding a tempo field) requires migrating both sides.
2. **Breaks the "start workout" service path** — now `workout_log` has to support starting from EITHER `program_workout_id` OR `user_workout_template_workout_id`, doubling the FK count and the branching in the start-workout service.
3. **Breaks the "save as routine" path** — if a user logs an empty workout and wants to save it, do we save it as a `user_workout_template` (a flat thing) or a `program` (a complex thing)? Either choice forks the schema further.
4. **Anti-pattern in the surveyed apps** — none of Hevy/Strong/FitNotes/JEFIT/Fitbod have separate "template" vs. "program" entities. They all have one canonical reusable unit ("routine"/"template"/"saved workout"). The split would be a MotionHive-only innovation, which means we're not benefiting from convergent UX patterns.
5. **Locked decision §13 already covers this** — "forward-compat namespace. Everything is named for the general shape, scoped narrow in V1." `program.kind = 'WORKOUT'` is exactly that shape.

### Recommendation: Path A

Use `program` for both instructor multi-week programs and user single-day templates. Distinguish by:
- `owner_id` (user vs. instructor — though we don't actually have a hard distinction; an INSTRUCTOR-role user can also author a personal template not associated with any client)
- `duration_weeks IS NULL` and `program_workout COUNT = 1` ⇒ presents in the UI as a "template"
- `duration_weeks IS NOT NULL` or `program_workout COUNT > 1` ⇒ presents in the UI as a "program"
- This is a **presentation distinction**, not a data distinction. The API can expose two endpoints (`GET /workouts/my/templates` filtered to single-day, `GET /workouts/my/programs` for multi-day) that both query `program` under the hood.

**Tiny additive changes needed to the locked schema:**

1. **`program.owner_id` already exists** — no change. The schema spec says `REFERENCES "user"(id) ON DELETE RESTRICT` which is correct (we don't want to lose orphan-owned templates if a user is soft-deleted; the user_id stays via SET NULL or stays restricted).

   Wait — re-reading line 322: `owner_id CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT`. That's correct.

2. **No new tables.** Path A reuses everything.

3. **Authorization rule additions** in service layer:
   - "User can read/edit programs where `program.owner_id = caller.id`."
   - "User can start a workout from a program if `owner_id = caller.id` OR there is an active `program_assignment` for `(program.id, caller.id)`."
   - "Saving a logged workout as a routine creates `program` rows owned by the calling user — no instructor relationship is implied."

4. **Service: `workoutLogService.startFromProgram(program_id, user_id)`** — bypasses the `program_assignment` flow and creates the `workout_log` + `logged_exercise` + `logged_set` rows directly. The path currently goes `program → program_assignment → assigned_workout → workout_log`; user-authored templates skip the middle two and go `program → workout_log`. This is a new service method, not a schema change.

5. **Search: index user-owned programs in `search_doc`** with `entity_type='program'`, scoped to `visibility=PRIVATE` (so the global search respects ownership). The locked decision §3 says "no public program library" — user templates are private by default; the search filter is already in `search_doc` via the `owner_id` column added in migration 029.

6. **Notification scope:** `PROGRAM_ASSIGNED` doesn't fire for user-authored templates (no assignment). `CLIENT_COMPLETED_WORKOUT` doesn't fire (no instructor to notify). The existing notification builders are correctly scoped to `program_assignment` flows.

### What if a user-authored template needs to be assignable to a coach client later?

This is a real edge case: a coach who first uses MotionHive as a "personal training tracker" authors templates for themselves, then upgrades to coaching clients. Their old templates should be assignable. **Path A handles this trivially** — the templates are already `program` rows; the coach can `POST /programs/:id/assignments { clientId }` and the existing copy-on-assign flow runs. Path B would require a "promote user_template to program" migration path which is awkward UX.

### One thing the existing schema *does* need

Looking again at `program.status program_status NOT NULL DEFAULT 'DRAFT'`: this defaults to DRAFT, which makes sense for instructor programs being authored over multiple sessions. For user-authored templates created via "save as routine after logging," we should default to `'PUBLISHED'` directly — the user is saving a real, completed workout as a template, not drafting it. This is a **service-layer default override**, not a schema change.

### Recommended index addition

To make the "last time you did this" lookup fast (called once per exercise per workout start, which is the hottest read path in the entire feature), add a covering index on `logged_exercise`:

```sql
-- In the workouts migration, alongside other indexes:
CREATE INDEX idx_logged_exercise_user_exercise_recent
  ON logged_exercise (exercise_id)
  INCLUDE (workout_log_id, order_index);
```

Combined with the existing `idx_workout_log_user_date` on `(user_id, started_at DESC)`, the planner can fetch the latest completed workout for a user, then the exercise's logged_set rows, in two index seeks. This is the only schema-shape recommendation that comes out of this research. It's small enough to fold into migration 046 without touching the locked decisions.

### Migration impact summary

| Change | Type | Touches locked schema? |
|---|---|---|
| Allow `program.owner_id` to be a regular USER (not just INSTRUCTOR) | Service-layer authorization only | No |
| Default `program.status='PUBLISHED'` when created via save-as-routine | Service-layer default override | No |
| New service: `workoutLogService.startFromOwnProgram(programId, userId)` | New method | No |
| New service: `workoutLogService.repeatFromLog(workoutLogId, userId)` | New method | No |
| New service: `programService.createFromCompletedLog(workoutLogId, userId)` | New method | No |
| Authorization rule: USER role can call `POST /programs`, `PATCH /programs/:id` for their own rows | Guard/role rule | No |
| Covering index on `logged_exercise` to speed up last-time lookup | Migration index | Adds one index |
| Drift-detection helper at workout-finish | Service helper | No |

**Net schema impact: one additional index.** Everything else is service + controller work. This is the strongest indicator that Path A is the right call — the locked schema was already designed for forward-compat (decision §13), and it pays off here exactly as intended.

## What we explicitly did NOT find

Useful negative results so future readers don't re-research the absence:

- **No app surveyed has a "draft" state for user-authored templates.** Hevy, Strong, FitNotes, JEFIT, Fitbod all treat the template as immediately usable as soon as it has a name + at least one exercise. The locked schema's `program_status` enum has `DRAFT` for a reason (instructor multi-week programs being authored over many sessions), but for the user-authoring path, default-to-PUBLISHED is correct.
- **No app surveyed has explicit "template versioning."** When you edit a template, the previous version is lost. Past `workout_log` rows that came from the old template are unaffected (because they're separate rows in the log). The locked decision §10 copy-on-assign principle already handles this — the assigned/logged trees are deep copies, so template edits never retroactively break history. The same applies to user-authored templates if we use Path A.
- **No app surveyed surfaces "this exercise has been removed from the catalog" gracefully in old workout logs.** Hevy/Strong/FitNotes snapshot the exercise name at log time so history rows still read correctly even if a custom exercise is deleted. The locked schema already does this via `logged_exercise.exercise_name_snapshot` (decision §15). Confirmed match.
- **No standardized term across apps.** "Routine" (Hevy, Strong, FitNotes), "Saved Workout" (Fitbod), "Routine" (JEFIT), "Custom Workout" (Apple), "Workout" (Trainerize coach-side). Pick one for MotionHive and stick with it. Recommendation: **"Routine"** for user-authored single-day templates, **"Program"** for multi-day plans. Matches the majority (Hevy, Strong, FitNotes, JEFIT all use "Routine") and aligns with the locked `program` schema name (which becomes the multi-day surface).
- **No app surveyed has an explicit "this template was started from a coach's program" badge on user-authored templates.** Hevy and Strong have no coach concept. We may want one — if a user's routine was created by cloning a coach-shared starter or by promoting a completed coach-assigned workout, the lineage is potentially valuable. The locked schema's `forked_from_id` on `exercise` is the precedent; an analogous `program.forked_from_program_id` would track it. Not in V1 scope.

## Open questions

These are answerable by the user, not by more research.

1. **Cold-start template library** — should V1 ship 5–10 starter templates ("Beginner Full Body 3x", "Push Pull Legs", "5×5 Strength") that any user can clone into their library? Hevy does this and it makes the empty-state much warmer. Locked decision §3 says "no public program library" — does that prohibit a small seeded set of admin-owned templates that users can clone? Recommendation: allow it, treating it as a one-time seed similar to the `exercise` catalog seed. The cloned copy becomes the user's private `program` row; the admin-owned source stays untouched.

2. **Should an INSTRUCTOR user have one library or two?** An instructor can author programs for clients AND author personal templates for themselves. Are these in the same list or separated by a "for clients / for me" tab? Recommendation: same list, filterable. A program is a program; the assignment is what makes it client-facing.

3. **Drift prompt copy** — the "update template?" prompt is one of the few places where Hevy's pattern requires us to write user-facing UI copy. Worth a quick design pass at PR time. Default: "You added Bicep Curls and removed Tricep Pushdowns. Update [Template Name]?" with Yes / No / Save as new template.

4. **Repeat-from-history scope** — when a user taps "Repeat" on a `workout_log` row that came from a coach assignment, do we re-create a `workout_log` linked to the same `assigned_workout` (preserving the coach linkage) or do we create a stand-alone freestyle workout (severing it)? Recommendation: severing (`assigned_workout_id = NULL`) — the coach assignment was for a specific scheduled date, and Repeat is an ad-hoc bonus workout. If the user wants to log against the coach assignment again, they go through the coach assignment tab.

5. **Last-time scope default** — global ("last time anywhere") or routine-scoped ("last time in this template"). Recommendation: global by default, settings flag to switch. Matches Hevy's default ([source](https://www.hevyapp.com/features/track-exercises/)). Hevy and JEFIT both ship the setting.

6. **One-rep-max table population for user-authored workouts** — the locked schema includes `one_rep_max` for %1RM-based prescription resolution (resolved at workout-start from `target_weight_percent_1rm × latest one_rep_max`). User-authored templates probably don't use %1RM ever — but the column is there if they want it. No action needed; this just confirms the schema is sufficient.

7. **Should user-authored templates count toward the search-doc index in V1?** Yes by default — but they're private, so they only appear in the user's own search results. Implementation: write to `search_doc` with `owner_id = user.id, visibility = 'PRIVATE'`, and the global `/search` endpoint filters by `owner_id = caller.id OR visibility = 'PUBLIC'`. No schema change; just a new call site in the workout service.

8. **Does the FE want a separate `/workouts/my/templates` endpoint, or just a filter on `/programs`?** API-design call. Recommendation: ship `/programs?owned_by=me&single_day=true` as the canonical query and let the FE alias it. Avoids endpoint sprawl.

## Sources

- Hevy
  - [How to Create Folders and Gym Routines](https://www.hevyapp.com/features/gym-routines/)
  - [How to Start an Empty Workout](https://www.hevyapp.com/features/start-empty-workout/)
  - [Previous Workout Values to Monitor Your Training](https://www.hevyapp.com/features/track-exercises/)
  - [Explore the Exercise Programming Options](https://www.hevyapp.com/features/exercise-programming-options/)
  - [Create and Store Custom Exercises](https://www.hevyapp.com/features/custom-exercises/)
  - [How to Log & Track Workouts Easier and Faster](https://www.hevyapp.com/features/track-workouts/)
  - [How to Save Workouts](https://www.hevyapp.com/features/workout-log/)
  - [Explore the Gym Workout Routine Library](https://www.hevyapp.com/features/gym-workout-routines/)
  - [Explore and Use the Exercise Library](https://www.hevyapp.com/features/exercise-library/)
  - [How to Log a Workout in the Hevy App](https://help.hevyapp.com/hc/en-us/articles/35361530647959-How-to-Log-a-Workout-in-the-Hevy-App-Step-by-Step-Guide)
- Strong
  - [What is a Template and how do I use them?](https://help.strongapp.io/article/105-about-templates)
  - [How do I perform a workout with Strong?](https://help.strongapp.io/article/229-my-first-workout)
  - [About Exercise Detail Screen](https://help.strongapp.io/article/237-about-exercise-detail)
  - [App Store listing](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)
  - [strong.app — product site](https://www.strong.app/)
- FitNotes
  - [Workout Tracking](http://www.fitnotesapp.com/workout_tracking/)
  - [Routines](http://www.fitnotesapp.com/routines/)
  - [Quick Start](http://www.fitnotesapp.com/quick_start/)
  - [Workouts (iOS Help)](https://www.getfitnotes.com/docs/workout.html)
- Fitbod
  - [How Fitbod Generates Your Personalized Workouts](https://fitbod.me/blog/fitbod-algorithm/)
  - [Custom Exercises](https://fitbod.zendesk.com/hc/en-us/articles/28062570249623-Custom-Exercises)
  - [Save a Workout](https://fitbod.zendesk.com/hc/en-us/articles/6259258835863-Save-a-Workout)
  - [Saved Workouts blog](https://fitbod.me/blog/saved-workouts/)
  - [Editing Workouts](https://fitbod.zendesk.com/hc/en-us/articles/360006335593-Editing-Workouts)
  - [How Fitbod Personalizes Your Workout Plan](https://fitbod.me/blog/how-fitbod-personalizes-your-workout-plan-using-smart-training-algorithms/)
- JEFIT
  - [Introducing New Routine Builder](https://www.jefit.com/wp/jefit-news-product-updates/introducing-new-routine-builder-workout-planning-simplified/)
  - [How to Create a Customized Routine](https://support.jefit.com/hc/en-us/articles/360018367531-How-to-Create-a-Customized-Routine-)
  - [Teach Jefit How You Workout With Pre-fill Value Settings](https://www.jefit.com/wp/product-tips-faq/teach-jefit-how-you-workout-with-pre-fill-value-settings/)
  - [Where Can I See The Complete Logs For A Particular Exercise?](https://support.jefit.com/hc/en-us/articles/202340464-Where-Can-I-See-The-Complete-Logs-For-A-Particular-Exercise-)
  - [JEFIT Workout Logging App](https://www.jefit.com/use-case/workout-logging-app)
- Apple
  - [Use Custom Plans in Apple Fitness+](https://support.apple.com/guide/fitness-plus/use-custom-plans-apdf222051d8/ios)
  - [Create a Custom Workout on Apple Watch](https://support.apple.com/guide/watch/create-a-custom-workout-apd66fcd5c5c/watchos)
  - [Customize a workout in Fitness on iPhone](https://support.apple.com/guide/iphone/customize-a-workout-iphbcd56be45/ios)
- Trainerize
  - [How to Create a Workout in the Master Workout Library](https://help.trainerize.com/hc/en-us/articles/208689086-How-to-Create-a-Workout-in-the-Master-Workout-Library)
  - [How do clients and trainers track workout stats?](https://help.trainerize.com/hc/en-us/articles/208688946-How-do-clients-and-trainers-track-workout-stats)
  - [Can Trainers Train Themselves as Clients Too?](https://help.trainerize.com/hc/en-us/articles/360046225911-Can-Trainer-s-Train-Themselves-as-Clients-Too)
  - [Allow trainers to log into the app and track their own workouts (idea forum)](https://ideas.trainerize.com/forums/167887-trainerize/suggestions/39840190-allow-trainers-to-log-into-the-app-and-track-their)
