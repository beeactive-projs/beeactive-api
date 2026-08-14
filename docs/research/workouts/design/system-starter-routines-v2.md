# MotionHive starter routines v2

Research + design spec for the next revision of the system starter catalogue (`program.owner_id IS NULL AND program.source = 'SYSTEM'`). This is a specification document only. No migration is included here; a follow-up migration ports this content in, in the same idempotent, slug-resolved style as `057_system_starter_routines.sql`.

## How many, and why

**Ten routines.** Up from the five in migration 057.

The brief asks for five things: a brand-new-lifter full body entry point, a push/pull/legs split, an upper/lower split, a no-equipment option, and (if warranted) a short session and a dumbbell-only session. Mapped one for one, with a little judgment on the full body count, that comes to:

- Full body, two routines (A and B, see judgement call below) — the day-one entry point
- Push day, Pull day, Leg day — the three-day split
- Upper body, Lower body — the four-day split (two templates, each run twice a week)
- No equipment, no excuses — the travel/home option
- Dumbbell only — the "I own one thing, a pair of dumbbells" option
- Quick 20 — the time-crunch option

That is ten. I considered stopping at eight (dropping Quick 20 and the second full body routine) and considered going to twelve (adding an upper/lower B pair, mirroring push/pull/legs' single pass). Ten is where the catalogue stops answering "what shape of training do I want" and would start answering "what specific week 3 variation do I want," which is a program-builder problem, not a starter-catalogue problem. Everyone who lands on this list with a stated goal (new lifter, split lifter, no gym, dumbbells only, no time) finds a direct answer in one screen, and nothing on the list is a near-duplicate of anything else on it in framing, even where a few exercises repeat across entries.

I did not add an advanced routine. Boostcamp's own level copy is a good proxy for why: their "advanced" tier is defined as three-plus years of consistent training, having already run "many programs," where "progress is hard to come by." That is not a starter-catalogue user. Someone at that stage is either building their own program or has outgrown a "pick this and go" list. The exercise catalogue backs this up too: 525 of 871 active rows are BEGINNER, 298 INTERMEDIATE, 58 ADVANCED, and the brief itself says to strongly prefer BEGINNER and well-known compounds. An advanced routine here would either dip into that thin 58-row ADVANCED slice (mostly obscure variants) or mislabel an ordinary compound lift as "advanced," neither of which is honest.

### Judgement call: a second full body routine

Migration 057 shipped one full body routine ("run it two or three times a week"). I added a second ("Full body B") so a rank beginner training three times a week for a few weeks has two shapes to alternate rather than the exact same four lifts every session — the same logic behind StrongLifts and Starting Strength shipping an A/B pair instead of one workout. This is the one place I went beyond a literal reading of the brief ("full-body sessions," plural, was ambiguous — it could just mean "run this routine repeatedly"). I flag it here rather than sliding it in silently. If the product call is "no, one full body routine is enough," Full Body B is the one line item to cut and the count drops to nine.

## Difficulty label scheme

### What the market does

I checked the labeling used by the apps named in the brief.

**Hevy** splits its 25+ routine library by explicit level plus equipment: eight beginner programs (four gym, three dumbbell-only, one equipment-free), ten intermediate, eight advanced, with a top-of-screen filter bar for Level, Goal, and Equipment ([Hevy routine library](https://www.hevyapp.com/features/gym-workout-routines/)).

**Jefit** filters its routine database by goal, muscle group, equipment, and difficulty, using Beginner / Intermediate / Advanced, and writes plain-language definitions per tier tied to time training ([Jefit routines](https://www.jefit.com/routines)).

**Boostcamp** uses the same three-tier scheme with explicit experience thresholds: beginner has not trained consistently before, intermediate is one to three years in and still adding weight or reps month to month, advanced is three-plus years in and finds progress hard to come by ([Boostcamp programs](https://www.boostcamp.app/programs)).

**Nike Training Club** sorts its library into Beginner / Intermediate / Advanced too, and additionally profiles the user into one of the three tiers via an onboarding quiz so the app can default-filter to a relevant slice ([NTC review coverage](https://www.garagegymreviews.com/nike-training-club-review)).

**Fitbod** has the user set a "Fitness Experience Level" of Beginner / Intermediate / Advanced directly, which gates which exercises and how much complexity the generator will pull in ([Fitbod FAQs](https://fitbod.me/faqs/)).

**Centr** asks for beginner / intermediate / advanced (alongside body stats) during onboarding and uses it to scale reps, weight, and intensity across its programs, including a beginner/intermediate/"hard" choice inside Centr Power specifically ([Centr review coverage](https://www.reviewed.com/health/content/centr-chris-hemsworth-app-review)).

**Strong** is the outlier: it ships no pre-built routine library at all (bring-your-own-program, log it manually), so it has no difficulty vocabulary to compare against ([Strong app review](https://repreturn.com/strong-app-review/)).

Six for six of the apps that actually ship a routine library use the same three-word vocabulary: **Beginner, Intermediate, Advanced.** Nobody in this set uses "Level 1/2/3," "New/Some/Experienced," star ratings, or a five-tier scheme. The one thing that varies is whether the tier is a property of the routine (Hevy, Jefit, Boostcamp) or a property of the user that filters routines (NTC, Fitbod, Centr) — most products actually do both, tag the content and profile the user, then match.

### Recommendation

**Use Beginner / Intermediate / Advanced**, exactly the vocabulary already sitting in `exercise.level` (`exercise_level` enum: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`).

Reasoning: it is the vocabulary every comparable app already trained its users on, so nobody has to learn a house-specific scale ("Level 2" means nothing without a legend; "Intermediate" means something on sight). It also removes a translation layer in our own data model — a routine's exercises already carry `exercise.level`, and having `program.level` speak the same enum means one shared `LevelBadge` component and one shared filter chip set can serve both the exercise library and the routine library on the frontend, and a future "does this routine's stated level match the level of the exercises inside it" sanity check becomes a plain equality comparison instead of a string-mapping exercise.

I looked at whether MotionHive's userbase (day-one beginners specifically, per the brief) warrants softer framing than "Advanced" implies about the two tiers we do use, something like "New to lifting / Some experience," Boostcamp's approach in spirit. I don't recommend it: it reads a little more welcoming but it is one more vocabulary a user has to map onto the "Beginner/Intermediate/Advanced" they already know from every other app on their phone, for a benefit that is mostly cosmetic. Keeping the three standard words, and doing the welcoming work in the routine descriptions themselves (which is exactly what the existing 057 copy already does, e.g. Full body starter's "give a shape to copy and adjust, not to prescribe" framing), gets the same outcome without inventing a scale.

## Schema recommendation

`program` today has no level/difficulty column. Three places it could live:

**Option A — new enum column `program.level` (recommended).** Add `level exercise_level` (reuse the existing enum type; a routine can only need the same three values an exercise needs) as a nullable column, indexed for filtering. Nullable because plenty of `program` rows will never carry an editorial difficulty (a user's own copied-and-edited routine has no reason to be labeled), and only system starters and any future curated/instructor-published content need it set.

- *Pro:* type-safe. Filtering is `WHERE level = 'BEGINNER'`, no parsing, no typo risk, enforced at the database.
- *Pro:* consistent with `exercise.level` — same enum, same three values, shared frontend component.
- *Pro:* cheap to index: `CREATE INDEX idx_program_level ON program(level) WHERE deleted_at IS NULL`, and it composes cleanly with the existing `folder = 'MotionHive starters'` / `source = 'SYSTEM'` filters already used to select the starter set.
- *Con:* it is a migration. Given this deliverable is explicitly research-only, that migration is a follow-up, not something shipped here.

**Option B — reuse `goal_tags` jsonb.** This is actually already halfway true: migration 057 puts a difficulty word as the *first* element of `goal_tags` today (`'["beginner", "full_body", "strength"]'`), it was just never formalized as the field to read for difficulty.

- *Pro:* zero migration. Ships today.
- *Con:* no type safety — `goal_tags` is free-form jsonb, so "beginner" vs "Beginner" vs "begginer" is a silent bug, not a constraint violation.
- *Con:* ambiguous shape. `goal_tags` mixes difficulty ("beginner"), structure ("split," "full_body"), and muscle focus ("push," "legs," "strength") in one flat array with no key names, so "which tag is the difficulty" is a convention enforced by nothing but code review. A tag added in the wrong position, or a routine tagged `["push", "beginner", "split"]` instead of `beginner`-first, silently breaks any code assuming position 0.
- *Con:* filtering needs a jsonb containment query (`goal_tags @> '["beginner"]'::jsonb`) instead of an indexed equality check, and sorting by difficulty (Beginner < Intermediate < Advanced, for a segmented filter UI) needs a `CASE` expression since jsonb array position carries no order semantics.

**Option C — reuse `folder`.** Rejected outright. `folder` already means something today: it is how the five 057 routines are grouped under "MotionHive starters" as a collection, and it is presumably how a future "my folders" user-organization feature will work too. Overloading it to also carry difficulty would collide two unrelated concerns (which collection is this in vs. how hard is this) onto one string column, and a routine can only be in one folder, so a starter routine could never simultaneously be "in the MotionHive starters folder" and "labeled Beginner" the way `folder` is currently used.

**Recommendation: ship Option A when a migration is on the table.** For this specification, since no migration is included per the task scope, I have written every routine below with its difficulty stated in prose and mirrored into `goal_tags[0]` in the same convention 057 already established (Option B), so the content is ready to insert unchanged by a migration once `program.level` exists, and degrades gracefully (searchable via `goal_tags`) if it ships before the column does.

### Filtering

With Option A live: `GET /programs?level=BEGINNER` (or `?level=BEGINNER,INTERMEDIATE` for a multi-select chip row), implemented as a `DTO` field validated against the enum (per house convention: list DTOs extend `PaginationDto`, raw `@Query()` strings are reserved for token/slug params, so this is a proper enum-typed field, not a raw string passthrough). Combine with the existing implicit filter (`source = 'SYSTEM' AND owner_id IS NULL`, or `folder = 'MotionHive starters'`) for the starter-catalogue screen specifically, and drop that combination for a general "browse all routines, filter by level" screen once instructor-published or user-shared routines can also carry a level. A facet count per chip ("Beginner (5)", "Intermediate (5)") is a cheap `GROUP BY level` alongside the existing folder/source filter and reads well as the top-of-screen filter bar, the same shape Hevy, Jefit, and Boostcamp all converged on independently.

---

## The routines

Ten routines. Exercises A through E below (Full body starter, No equipment no excuses, Push day, Pull day, Leg day) are the five from migration 057, carried forward unchanged in content, since they already match the target house style and none of the new structure gives a reason to revise them. Routines F through J are new.

Rest values, rep ranges, and set counts below follow the conventions already established in 057: beginner full-body/no-equipment work sits at 3 sets, compounds get more rest than isolation/bodyweight work, and any intermediate "day" gets a heavier main lift (4 sets, longer rest) followed by lighter secondary work.

### A. Full body starter

**Difficulty:** Beginner
**Description:** A complete session in four movements. Squat, push, pull, brace. Run it two or three times a week with a rest day between, and add a little weight when the last rep still feels solid.
**Equipment:** A kettlebell (or a single dumbbell held goblet-style) and a surface to elevate your hands for the push-up.
**Length:** about 45 minutes

| # | Exercise | id | Sets | Reps/Hold | Rest | Note |
|---|---|---|---|---|---|---|
| 1 | Goblet Squat | `4833fe64-cb2a-4297-8b7b-cbc4a80e4648` | 3 | 8-12 | 90s | Hold the weight at your chest. Sit down between your hips, not back. |
| 2 | Incline Push-Up | `4d0d9085-974c-49b6-af3f-873c42590158` | 3 | 8-12 | 60s | The higher the surface, the easier it is. Lower it as you get stronger. |
| 3 | Bent Over Two-Dumbbell Row | `031de2b3-5947-4876-969e-945e7908aa21` | 3 | 8-12 | 60s | Flat back, ribs down. Pull to your hips rather than your chest. |
| 4 | Plank | `e7761843-b190-4c9c-8c9f-1e59c5ffef70` | 3 | 30s hold | 45s | Squeeze your glutes. Stop the set when your hips start to sag. |

Unchanged from 057. Why these: one exercise per fundamental pattern (squat, horizontal push, horizontal pull, anti-extension brace) is the smallest set that touches the whole body, and every exercise here is BEGINNER level with a single, common piece of equipment.

### B. No equipment, no excuses

**Difficulty:** Beginner
**Description:** Nothing but your bodyweight and a floor. Useful when travelling, or on the days getting to a gym is the thing standing in the way.
**Equipment:** None.
**Length:** about 30 minutes

| # | Exercise | id | Sets | Reps/Hold | Rest | Note |
|---|---|---|---|---|---|---|
| 1 | Bodyweight Squat | `1ebebc79-7522-45d5-a5bc-d26f23f5d242` | 3 | 12-20 | 60s | Slow on the way down, quick on the way up. |
| 2 | Incline Push-Up | `4d0d9085-974c-49b6-af3f-873c42590158` | 3 | 8-15 | 60s | A kitchen counter works. So does a wall on a bad day. |
| 3 | Walking Lunge | `7f448a15-412e-4dca-82f3-919f61d7b0b3` | 3 | 10-12 | 60s | Count reps per leg. Short steps if your knees complain. |
| 4 | Dead Bug | `34cae44a-e235-43b8-91a3-762910602fc4` | 2 | 8-10 | 45s | Press your lower back into the floor the whole time. |
| 5 | Plank | `e7761843-b190-4c9c-8c9f-1e59c5ffef70` | 2 | 30s hold | 45s | Finish here. Quality over duration. |

Unchanged from 057. Why these: every single exercise in this catalogue's `bodyweight`/`STRENGTH` overlap for the squat, lunge, push, and brace patterns, tagged `Bodyweight` equipment with nothing else attached.

### C. Push day

**Difficulty:** Intermediate
**Description:** Chest, shoulders and triceps. The push half of a push, pull, legs week. Pair it with Pull day and Leg day for a simple three day split.
**Equipment:** A pair of dumbbells.
**Length:** about 50 minutes

| # | Exercise | id | Sets | Reps | Rest | Note |
|---|---|---|---|---|---|---|
| 1 | Dumbbell Bench Press | `90029411-87bb-44c3-970f-30cde16d530d` | 4 | 6-10 | 120s | Heaviest movement first, while you are fresh. |
| 2 | Dumbbell Shoulder Press | `7f273403-37bd-4d1c-ba04-2e21d0391cf6` | 3 | 8-12 | 90s | Press slightly in front of your ears, not behind. |
| 3 | Incline Push-Up | `4d0d9085-974c-49b6-af3f-873c42590158` | 2 | 10-20 | 60s | Finisher. Take these close to failure. |

Unchanged from 057.

### D. Pull day

**Difficulty:** Intermediate
**Description:** Back and biceps. The pull half of a push, pull, legs week. Lead with the pulldown while you are fresh, then row.
**Equipment:** A cable machine and a pair of dumbbells.
**Length:** about 50 minutes

| # | Exercise | id | Sets | Reps | Rest | Note |
|---|---|---|---|---|---|---|
| 1 | Close-Grip Front Lat Pulldown | `8dd14ddf-3210-42b3-8190-9c7f3ec2c5c9` | 4 | 8-12 | 90s | Lead with your elbows, not your hands. |
| 2 | Bent Over Two-Dumbbell Row | `031de2b3-5947-4876-969e-945e7908aa21` | 3 | 8-12 | 90s | Control the weight on the way down. No shrugging. |
| 3 | Romanian Deadlift | `59f817ee-5861-4c43-8dc3-280088c83048` | 3 | 8-10 | 90s | Push your hips back. Stop when you feel your hamstrings, not your lower back. |

Unchanged from 057.

### E. Leg day

**Difficulty:** Intermediate
**Description:** Quads, hamstrings and glutes in four movements. Heaviest first, single leg work after, and finish with something that does not need a barbell.
**Equipment:** A kettlebell or dumbbell, and a barbell.
**Length:** about 50 minutes

| # | Exercise | id | Sets | Reps | Rest | Note |
|---|---|---|---|---|---|---|
| 1 | Goblet Squat | `4833fe64-cb2a-4297-8b7b-cbc4a80e4648` | 4 | 8-12 | 120s | Work up to a weight you could still do two more with. |
| 2 | Romanian Deadlift | `59f817ee-5861-4c43-8dc3-280088c83048` | 3 | 8-10 | 90s | Hinge, do not squat. The bar stays close to your legs. |
| 3 | Walking Lunge | `7f448a15-412e-4dca-82f3-919f61d7b0b3` | 3 | 10-12 | 60s | Reps are per leg. |
| 4 | Single Leg Glute Bridge | `de6ea7da-2e1e-482d-9d3e-84f64f49c78b` | 3 | 10-15 | 45s | Drive through your heel and pause at the top. |

Unchanged from 057.

### F. Full body B

**Difficulty:** Beginner
**Description:** The second full body session, for the weeks you are training three times and do not want to repeat the exact same four lifts every time. Hinge, press, row, brace, same idea as your first full body day with a different set of movements underneath it. Alternate the two across the week.
**Equipment:** A pair of dumbbells and a floor.
**Length:** about 45 minutes

| # | Exercise | id | Sets | Reps/Hold | Rest | Note |
|---|---|---|---|---|---|---|
| 1 | Dumbbell Lunges | `6eda5ff5-5bc5-4bb0-9ca1-b59f5df08d21` | 3 | 8-12 | 90s | Step through fully and keep your chest up. Reps are per leg. |
| 2 | Standing Dumbbell Press | `d8216094-15d0-4ca0-83f1-9b2c54d3bbc8` | 3 | 8-12 | 60s | Brace your stomach before you press so your lower back does not arch. |
| 3 | One-Arm Dumbbell Row | `f35ba0f0-93f1-4bb5-8aa8-b2f25307ead2` | 3 | 8-12 per arm | 60s | Rest your free hand on a bench or chair. Pull to your hip. |
| 4 | Dead Bug | `34cae44a-e235-43b8-91a3-762910602fc4` | 3 | 8-10 | 45s | Move slowly. Your lower back should stay flat on the floor the whole time. |

**Why these earned their slot:** the four patterns mirror Full body starter (lower body, push, pull, brace) but nothing in the exercise list overlaps with it, so alternating the two genuinely varies the stimulus instead of running the same session under two names. Dumbbell Lunges swaps in for Goblet Squat as the lower-body slot (unilateral instead of bilateral, still `BEGINNER`/`COMPOUND`). Standing Dumbbell Press swaps in for Incline Push-Up as a vertical push instead of horizontal. One-Arm Dumbbell Row swaps in for the two-dumbbell row, unilateral and needing no bench, so the equipment list stays "a pair of dumbbells." Dead Bug swaps in for Plank as a second, distinct beginner brace pattern.

### G. Dumbbell only

**Difficulty:** Beginner
**Description:** Everything here needs is a pair of dumbbells, nothing else. No bench, no rack, no machine. Built for a home setup or a hotel gym that has weights and not much more.
**Equipment:** A pair of dumbbells.
**Length:** about 40 minutes

| # | Exercise | id | Sets | Reps/Hold | Rest | Note |
|---|---|---|---|---|---|---|
| 1 | Dumbbell Squat | `1f78c684-5ff7-42d9-9b84-64bd6a22c244` | 3 | 8-12 | 90s | Hold a dumbbell in each hand at your sides. Chest up, sit down between your hips. |
| 2 | Stiff-Legged Dumbbell Deadlift | `8de27252-2da4-4611-b4ed-d5b94afd66d6` | 3 | 8-12 | 90s | Soft knees, hinge at the hips. Keep the dumbbells close to your legs on the way down. |
| 3 | Dumbbell Bench Press | `90029411-87bb-44c3-970f-30cde16d530d` | 3 | 8-12 | 90s | Press the dumbbells up and slightly in, so they finish over your chest, not your face. |
| 4 | One-Arm Dumbbell Row | `f35ba0f0-93f1-4bb5-8aa8-b2f25307ead2` | 3 | 8-12 per arm | 90s | Flat back, pull to your hip. Finish one side, then switch. |
| 5 | Plank | `e7761843-b190-4c9c-8c9f-1e59c5ffef70` | 3 | 30s hold | 45s | Squeeze your glutes. Stop the set when your hips start to sag. |

**Why these earned their slot:** this is the "complete" template, one exercise per pattern (squat, hinge, horizontal push, horizontal pull, brace), and every loaded movement is tagged with `Dumbbell` as its only equipment in the catalogue, nothing that assumes a bench, rack, or machine is nearby. This is the one routine where the hinge pattern (Stiff-Legged Dumbbell Deadlift) shows up, since Pull day and Leg day both use the barbell Romanian Deadlift instead, which this routine's equipment constraint rules out.

### H. Quick 20

**Difficulty:** Beginner
**Description:** Three lifts, short rest, done in about twenty minutes. For the days training almost gets skipped because there is not enough time to do a full session. Something is always better than nothing.
**Equipment:** A pair of dumbbells.
**Length:** about 20 minutes

| # | Exercise | id | Sets | Reps | Rest | Note |
|---|---|---|---|---|---|---|
| 1 | Dumbbell Squat | `1f78c684-5ff7-42d9-9b84-64bd6a22c244` | 3 | 12-15 | 45s | Move at a steady pace. This is a short session, not a slow one. |
| 2 | Standing Dumbbell Press | `d8216094-15d0-4ca0-83f1-9b2c54d3bbc8` | 3 | 10-12 | 45s | Press straight overhead. Brisk reps, still controlled. |
| 3 | Bent Over Two-Dumbbell Row | `031de2b3-5947-4876-969e-945e7908aa21` | 3 | 10-12 | 45s | Flat back, ribs down. Straight into the next set once you have your breath back. |

**Why these earned their slot:** three of the biggest, simplest dumbbell compounds available, one per major pattern (squat, push, pull), so the whole body gets touched in nine total working sets. Shortened rest (45s against the usual 60-90s) is what actually buys back the time, not fewer or lighter sets, so the session stays a real training stimulus and not just a stretch break.

### I. Upper body

**Difficulty:** Intermediate
**Description:** Chest, back, shoulders and arms in one session. Half of an upper, lower split, the most common four day a week structure. Run this and Lower body twice each across the week.
**Equipment:** A pair of dumbbells and a cable machine.
**Length:** about 50 minutes

| # | Exercise | id | Sets | Reps | Rest | Note |
|---|---|---|---|---|---|---|
| 1 | Dumbbell Bench Press | `90029411-87bb-44c3-970f-30cde16d530d` | 4 | 6-10 | 120s | Heaviest lift of the day. Get it done while you are fresh. |
| 2 | Close-Grip Front Lat Pulldown | `8dd14ddf-3210-42b3-8190-9c7f3ec2c5c9` | 4 | 8-12 | 90s | Lead with your elbows, not your hands. |
| 3 | Dumbbell Shoulder Press | `7f273403-37bd-4d1c-ba04-2e21d0391cf6` | 3 | 8-12 | 90s | Press slightly in front of your ears, not behind. |
| 4 | Bent Over Two-Dumbbell Row | `031de2b3-5947-4876-969e-945e7908aa21` | 3 | 8-12 | 90s | Control the weight on the way down. No shrugging. |
| 5 | Dumbbell Bicep Curl | `cbf2dcee-70f4-49da-b768-9b701daa6639` | 3 | 10-15 | 60s | Keep your elbows pinned to your sides. No swinging the weight up. |
| 6 | Triceps Pushdown | `aba1ec1a-e493-4bc5-b9fd-e615ab7816b4` | 3 | 10-15 | 60s | Keep your elbows tucked and still. Only your forearms move. |

**Why these earned their slot:** an upper/lower split runs each session more often per week than a push/pull/legs split (twice each versus once), so it earns more total upper body volume per session, hence the two extra arm isolation exercises Push day does not carry. The four compound slots (horizontal push, vertical pull, vertical push, horizontal pull) reuse the same well-established lifts from Push day and Pull day rather than inventing new ones. Reusing a proven compound across two structurally different templates is normal, not a shortcut. It's the same lift doing the same job in a different weekly pattern.

### J. Lower body

**Difficulty:** Intermediate
**Description:** Quads, hamstrings, glutes and calves, built around machines instead of free weights. The other half of an upper, lower split. Heaviest first, then isolation work for whatever is still fresh.
**Equipment:** A leg press machine, a barbell and bench, a leg curl machine, a leg extension machine, and a calf raise machine.
**Length:** about 50 minutes

| # | Exercise | id | Sets | Reps | Rest | Note |
|---|---|---|---|---|---|---|
| 1 | Leg Press | `1eb68ff2-3b3d-4d08-a6c9-5185a0964acd` | 4 | 8-12 | 120s | Feet mid platform, knees tracking over your toes. Do not slam the lockout. |
| 2 | Barbell Hip Thrust | `09d58585-1135-455b-997a-747f16f43a1f` | 3 | 8-12 | 90s | Shoulders on the bench, chin tucked. Squeeze your glutes hard at the top. |
| 3 | Seated Leg Curl | `5bb0dac6-a68c-40ae-adb5-df8d0fc269b4` | 3 | 10-15 | 60s | Slow on the way back. Do not let the weight stack drop. |
| 4 | Leg Extensions | `83ce7c43-8354-4667-902f-ce295447ae34` | 3 | 10-15 | 60s | Light to start. This joint does not need to be tested. |
| 5 | Standing Calf Raises | `5bee1f76-a8b3-41d0-b427-f334a2a074e7` | 3 | 12-20 | 45s | Full stretch at the bottom, full squeeze at the top. |

**Why these earned their slot:** Leg day already covers the free-weight version of leg training (goblet squat, Romanian deadlift, walking lunge, single leg glute bridge). Lower body is deliberately built around machines instead, so a user choosing between "the three day split" and "the four day split" gets a genuinely different training experience rather than the same leg session copy-pasted under two names. Leg Press stands in as the primary compound where Leg day uses Goblet Squat. Barbell Hip Thrust is the glute-dominant hinge, where Leg day and Pull day both already use Romanian Deadlift. Seated Leg Curl and Leg Extensions are the isolation counterparts free weights do not target directly (hamstring curl, quad extension), and Standing Calf Raises closes out the session the same way Leg day closes with a low-fatigue-cost accessory movement.

---

## Summary table

| Routine | Difficulty | Equipment | Length |
|---|---|---|---|
| Full body starter | Beginner | Kettlebell/dumbbell | 45 min |
| Full body B | Beginner | Dumbbells | 45 min |
| No equipment, no excuses | Beginner | None | 30 min |
| Dumbbell only | Beginner | Dumbbells | 40 min |
| Quick 20 | Beginner | Dumbbells | 20 min |
| Push day | Intermediate | Dumbbells | 50 min |
| Pull day | Intermediate | Cable, dumbbells | 50 min |
| Leg day | Intermediate | Kettlebell/dumbbell, barbell | 50 min |
| Upper body | Intermediate | Dumbbells, cable | 50 min |
| Lower body | Intermediate | Machines, barbell | 50 min |

Five beginner, five intermediate. No advanced (see "How many, and why" above).

---

## Gaps, unverifiable ids, and judgement calls

**Every exercise id in this document was verified live against the database** (`exercise.slug`, `exercise.id`, `exercise.name`, `deleted_at IS NULL`, one active row per slug) as part of writing this spec. None were invented or assumed. The queries and their output are reproducible against `beeact_demo`.

**Exercises I wanted but the catalogue does not have:**
- A plain bodyweight double-leg hip thrust or glute bridge (non-single-leg, no barbell). The catalogue only has `Single Leg Glute Bridge` (bodyweight, already used in Leg day) and `Barbell Glute Bridge` / `Barbell Hip Thrust` (both `INTERMEDIATE`, both barbell). This is why Lower body's glute movement is barbell-loaded rather than bodyweight, and why I didn't add a glute bridge variant to the no-equipment or dumbbell-only routines.
- A pull-up or assisted pull-up. Vertical pull in this catalogue is entirely cable-based (`Close-Grip Front Lat Pulldown` is the only clean fit); there is no bodyweight vertical pull option, which is why no routine here uses one. The `pull_up_bar` equipment row exists in the `equipment` table, but I did not find an exercise tagged with it that fit the beginner/well-known bar the brief sets.
- A true two-arm dumbbell "goblet"-style squat tagged as `Dumbbell` equipment. `Goblet Squat` itself is tagged `Kettlebell` only in this dataset (not `Dumbbell`), which is why the two dumbbell-equipment-only routines (Dumbbell only, Quick 20) use `Dumbbell Squat` instead of reusing `Goblet Squat`, even though in the real world a goblet squat is commonly done with either.

**Data-fidelity note, not a blocker:** `Dumbbell Bench Press` and `Barbell Hip Thrust` are tagged in `exercise_equipment` with only `Dumbbell` and `Barbell` respectively, with no `Bench` row attached, even though both movements are ordinarily performed on one. I followed the database's own tagging rather than adding an equipment requirement the catalogue itself doesn't record (and migration 057 already set this precedent, using `Dumbbell Bench Press` in Push day without flagging a bench). Worth a follow-up pass on `exercise_equipment` completeness for bench-dependent lifts if the equipment filter becomes user-facing.

**Judgement calls made, summarized:**
1. Added a second full body routine ("Full body B") beyond the literal five-item checklist, reasoned through above under "How many, and why." Easy to cut if the product call is one full body routine.
2. Built Quick 20 around dumbbells rather than bodyweight, so it reads as a distinct use case from "No equipment, no excuses" (weights available but no time) rather than a near-duplicate of it (no weights, more time).
3. Deliberately differentiated Leg day (free weights) from Lower body (machines) even though both train the same muscles, so a user does not see two copy-pasted leg sessions when comparing the three-day and four-day splits.
4. Did not build an Advanced routine, reasoned through above.
5. Carried the difficulty label as `goal_tags[0]` in the interim (matching 057's existing convention), pending the recommended `program.level` enum column landing in a real migration.
