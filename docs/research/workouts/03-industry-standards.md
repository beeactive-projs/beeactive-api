# Industry Standards & Open Vocabularies

**Scope:** What standards exist for workout / exercise / nutrition data, which ones working apps actually use, and which ones to adopt vs reference vs ignore.

**Bottom line:** Adopt schema.org NutritionInformation column shape verbatim (saves you forever). Adopt USDA FoodData Central as the meal-plan seed. Borrow Garmin FIT exercise category enum as a *nullable export field*, not an internal model. Skip everything else.

## 1. Exercise / movement classification

### What exists

- **Six-pattern functional taxonomy** (squat / hinge / lunge / push / pull / carry + rotation as a modifier). Push and pull each split into horizontal/vertical. This is the consensus across NSCA, NASM, ACE, StrongFirst, Functional Movement Systems — but **folk-canonical, not an ISO spec.** [NSCA's PTQ 10.2 paper](https://www.nsca.com/contentassets/3d09f06f0b4c4f6fbd8cc382ed1f3d4a/ptq-10.2.1-progressive-strategies-for-teaching-fundamental-resistance-training-movement-patterns.pdf) covers the "fundamental resistance training movement patterns" pedagogically; there's no enum.
- **[ExRx.net Classifications](https://exrx.net/Questions/ExerciseClassAnalyses)** — taxonomizes by *utility* (basic/auxiliary), *mechanics* (compound/isolation), *force* (push/pull), *plane*, and *muscle group / joint articulation*. The most data-shaped public-domain fitness taxonomy. No formal license — de facto reference.
- **[SNOMED CT](https://www.findacode.com/snomed/68130003--physical-activity.html)** has codes like `68130003 Physical activity (observable entity)`; **ICF (WHO)** has activity codes. These are clinical/rehab terminologies. **Not used by consumer fitness apps.** Matters only if MotionHive ever needs healthcare interop (PT referrals).
- **[WHO PA Guidelines](https://www.ncbi.nlm.nih.gov/books/NBK566046/)** classify by MET intensity: 3-6 METs = moderate, ≥6 METs = vigorous. Useful as an *exercise attribute* (MET value) but no exercise IDs.

### Adoption decision

- **Adopt:** `movement_pattern` enum on `exercise` (SQUAT / HINGE / LUNGE / PUSH_HORIZONTAL / PUSH_VERTICAL / PULL_HORIZONTAL / PULL_VERTICAL / CARRY / ROTATION / ANTI_ROTATION / LOCOMOTION / ISOLATION).
- **Adopt:** `mechanic` enum (COMPOUND / ISOLATION).
- **Adopt:** `force` enum (PUSH / PULL / STATIC).
- **Adopt (nullable):** `met_value DECIMAL(3,1)` for cardio-style exercises.
- **Ignore:** SNOMED, ICF for V1.

## 2. Workout / training data interchange

### What exists

- **[Garmin FIT SDK](https://developer.garmin.com/fit/file-types/workout/)** — binary format with a large `ExerciseCategory` enum (~70 categories like `BENCH_PRESS`, `SQUAT`, `DEADLIFT`, `PLANK`, `RUN`, `BIKE`) and per-category sub-enum (`BARBELL_BENCH_PRESS`, `INCLINE_DUMBBELL_BENCH_PRESS`). Workout step messages carry `duration_type`, `target_type`, `intensity`, `repeat`, plus an `exercise_name` int mapped via Exercise Title lookup. **The most widely-deployed strength-workout interchange.** Used by every Garmin watch.
- **[Apple HealthKit `HKWorkoutActivityType`](https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype)** — ~75 high-level activity types (`running`, `traditionalStrengthTraining`, `functionalStrengthTraining`, `yoga`, `pilates`, `hiit`). Designed for **session classification, NOT set/rep detail.**
- **[Health Connect `ExerciseSessionRecord`](https://developer.android.com/reference/androidx/health/connect/client/records/ExerciseSessionRecord)** — Android successor to Google Fit (which sunsets late 2026). Similar shape to HealthKit: session-level type enum, no set/rep model.
- **[TrainingPeaks structured workout](https://help.trainingpeaks.com/hc/en-us/articles/115000325647-Structured-Workout-sync-and-Manual-Export)** — exports `.ERG` / `.MRC` (power-based), `.FIT`, `.ZWO`. Block-based: warmup / steady / interval / cooldown with target zones (power, HR, pace). Excellent for endurance, poor for strength.
- **[Zwift `.ZWO`](https://github.com/h4l/zwift-workout-file-reference/blob/master/zwift_workout_file_tag_reference.md)** — XML with `<Warmup>`, `<SteadyState>`, `<IntervalsT>`, `<Cooldown>`, `<Ramp>`, `<FreeRide>`. Power values are FTP fractions. Endurance-only.
- **No open exercise-prescription format spans both strength and endurance cleanly.** PT/coaching world uses PDF.

### Adoption decision

- **Don't try to *be* FIT-shaped internally** — too binary, too cycling-biased.
- **Adopt as nullable export columns:**
  - `exercise.fit_category VARCHAR(50)` and `exercise.fit_subcategory VARCHAR(50)` — populate over time, enables future FIT export.
  - `workout_log.hk_activity_type VARCHAR(50)` and `workout_log.health_connect_exercise_type VARCHAR(50)` — populate for sessions that should sync to OS-level health platforms.
- **For endurance-style structured workouts (intervals)**, the `exercise_block` entity with a `kind` enum already covers this — borrow Zwift's block model conceptually (warmup / steady / interval / ramp / cooldown), but don't import the file format.

## 3. Sets / reps / load representation

### What exists — Hevy is the de facto standard

[Hevy public API](https://api.hevyapp.com/docs/) and their [programming docs](https://www.hevyapp.com/features/exercise-programming-options/) are the closest thing to a strength-training data shape standard:

- `set.type` enum: `normal | warmup | dropset | failure` (plus superset linking on the exercise via `supersetId`).
- Per-set fields: `weight_kg | reps | duration_seconds | distance_meters | rpe`.
- Rep ranges (e.g. 8–12) stored as min/max on the *template*; actuals as a single int on the *log*.
- Tempo: **not** modeled as a structured field in Hevy. Stored as free-text notes if at all.
- Cluster sets / rest-pause: also not modeled — coaches encode them as multiple sets or in notes.

### Universal conventions across apps

- **RPE 1–10** (Rate of Perceived Exertion, Tuchscherer scale) and **RIR** (reps-in-reserve, RPE 10−RIR=actual RPE) are the universal currency. Store `rpe` as `DECIMAL(3,1)` (allows 7.5).
- **Tempo notation** `3-1-1-0` (eccentric-bottom pause-concentric-top pause). Four ints; sometimes "X" = explosive. Store as `CHAR(7)` or four nullable smallints.
- **%1RM** and `e1RM` (estimated 1RM via Epley/Brzycki) are usually computed, not stored.
- **AMRAP / EMOM / Tabata / For Time** are CrossFit-flavored — modeled as workout-level *protocols*, not set-level. Captured via `exercise_block.kind`.

### Adoption decision

Lock these fields on `prescribed_set` and `logged_set` (full schema in [05-db-schema.md](./05-db-schema.md)):

- `set_type` enum: `NORMAL | WARMUP | WORKING | DROPSET | FAILURE | AMRAP | REST_PAUSE | CLUSTER`
- `target_reps_min`, `target_reps_max` (nullable)
- `target_weight_kg` (nullable)
- `target_weight_percent_1rm` (nullable)
- `target_duration_s` (nullable)
- `target_distance_m` (nullable)
- `target_rpe DECIMAL(3,1)` (nullable)
- `target_rir SMALLINT` (nullable)
- `rest_after_seconds INTEGER` (nullable, per-set)
- `tempo CHAR(7)` (nullable, opaque format `3-1-1-0`)

Logged set mirrors this minus the `target_*` prefixes, plus `completed_at` and `notes`.

**Keep planned and logged separate.** Overlaying them is the #1 schema regret in the space.

**Treat distance and time as first-class peers of reps/weight.** Running and isometric holds break apps that didn't.

## 4. Muscle / anatomy reference

### What exists

- **[wger](https://github.com/wger-project/wger)** uses Latin anatomical names (`Pectoralis major`, `Latissimus dorsi`, `Biceps brachii`). ~15 primary + secondary muscles.
- **[Free Exercise DB](https://github.com/yuhonas/free-exercise-db)** uses common English: `chest`, `shoulders`, `triceps`, `quadriceps`, `hamstrings`, `glutes`, `lats`, `middle back`, `lower back`, `traps`, `neck`, `abdominals`, `forearms`, `calves`, `biceps`, `adductors`, `abductors`. **17 muscle names.**
- **[ExerciseDB API](https://www.exercisedb.dev/docs)** uses 10 `bodyPart`s and ~150 `target` muscle names (much finer-grained).
- **CC SVG diagrams** of male/female muscular system available on [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_human_muscular_system) and FreeSVG (CC0).

### Adoption decision

- **Two tables:** `muscle` (id, common_name, latin_name, body_region) and `exercise_muscle` (exercise_id, muscle_id, role enum `PRIMARY | SECONDARY | STABILIZER`).
- **Seed from Free Exercise DB's muscle list** (public domain, 17 common names).
- **Latin name as a separate column**, not the PK — display common name to users, allow filtering by either.
- **For UI**, use a CC0 SVG from Wikimedia Commons with `id` attributes matching our muscle keys.

## 5. Equipment vocabulary

### What exists

- **No standardized controlled vocabulary.** Schema.org has nothing.
- **wger equipment list** (12 items: barbell, bench, dumbbell, gym mat, incline bench, kettlebell, pull-up bar, none, swiss ball, SZ-bar, machine, cable).
- **Free Exercise DB equipment** (~12 values: `body only`, `machine`, `other`, `foam roll`, `kettlebells`, `dumbbell`, `cable`, `barbell`, `medicine ball`, `exercise ball`, `e-z curl bar`, `bands`).
- **ExerciseDB** uses ~30 values (granular: `smith machine`, `leverage machine`, `sled machine`, `assisted`).

### Adoption decision

- **Roll our own `equipment` table** (~15 rows) seeded from Free Exercise DB.
- **Many-to-many** `exercise_equipment`.
- Include a synthetic `BODYWEIGHT` entry so filters work uniformly (don't conflate with NULL).
- Don't make this an enum — instructors will want to add their own equipment over time.

## 6. Nutrition / meal plans (forward-compat)

### What exists

| Source | License | Coverage | Use case |
|---|---|---|---|
| **[USDA FoodData Central](https://fdc.nal.usda.gov/)** | **CC0 / public domain** | ~300k items, generic + branded | **Primary seed for meal plans** |
| **[OpenFoodFacts](https://world.openfoodfacts.org/)** | **ODbL (share-alike — viral on derived DBs)** | ~4M products, barcode-indexed | **Barcode lookup only, NEVER co-mingled** |
| **[CIQUAL (ANSES, France)](https://www.anses.fr/en/content/ciqual-nutritional-composition-table)** | CC-BY | ~3,500 French foods | Optional, French market |
| **Edamam** | $299+/mo | Recipe + nutrition analysis | Per-nutrient cost |
| **Spoonacular** | $300+/mo | Points-based, easy to overrun | Skip |
| **Nutritionix** | $1,850+/mo | Premium branded/restaurant | Skip |
| **FatSecret** | Free 5k calls/day | Decent generics | Backup option |

### The schema.org standard

**[schema.org `Recipe`](https://schema.org/Recipe)** + **[schema.org `NutritionInformation`](https://schema.org/NutritionInformation)** — JSON-LD canonical fields:

```
calories, proteinContent, fatContent, carbohydrateContent,
fiberContent, sugarContent, sodiumContent, cholesterolContent,
saturatedFatContent, transFatContent, unsaturatedFatContent,
servingSize
```

**This is the de facto column set every nutrition app uses.** Adopt verbatim.

### The ODbL trap

OpenFoodFacts is ODbL (Open Database License) — share-alike clause is **viral on derived databases**. If we ingest OFF data into our DB, the share-alike clause arguably forces us to release our combined DB as open data. The conservative read makes co-mingling OFF into our DB inappropriate for a commercial SaaS.

**Safe pattern:** store the barcode as a foreign reference, fetch nutrition live from OFF on demand. Never copy the nutrition fields into our `food` table from OFF sources.

### Adoption decision (when meals ship — NOT V1)

- **Column set:** schema.org `NutritionInformation` verbatim. Add `per_amount_g DECIMAL(7,2)` (e.g. 100g) so values are normalizable. **This is the single most important nutrition-side decision.**
- **Primary seed:** USDA FDC (CC0, safe to redistribute commercially).
- **Branded barcode lookups:** OpenFoodFacts live API only. Store `barcode VARCHAR(20) → off_product_id` foreign reference. **No nutrition fields copied.**
- **Tables:** `food`, `food_serving` (1 cup, 100g, 1 medium apple), `recipe`, `recipe_ingredient (food_id, amount, serving_id)`, `meal`, `meal_entry`.
- **Recipe nutrition is computed**, not stored. Cache the materialized view later if needed.

## 7. Programming / periodization

### What exists

- **Macrocycle / mesocycle / microcycle** terminology is universal in S&C literature (TrainingPeaks, NASM, NSCA) — but not standardized as a data shape. Macro ≈ season (months-year), meso ≈ phase (3–6 weeks), micro ≈ week.
- **Periodization models**: linear, undulating (DUP), block, conjugate (Westside) — none encoded as a standardized data shape. CoachRx and TrainingPeaks implement them as a 3-level container hierarchy with phase tags.

### Adoption decision

- **Don't bake periodization models into enums** — they evolve, and overengineering this kills V1 velocity.
- **Use a flat 3-level container:** `program → program_workout (week_index, day_index) → prescribed_exercise → prescribed_set`.
- **Free-text `phase` label** on `program_workout` if coaches want to tag "deload week" etc. No structured periodization engine.
- `program.periodization_model VARCHAR(50)` nullable — UX hint only, no schema constraint.

## 8. License-safe seed data — summary

| Data type | Source | License | Verdict |
|---|---|---|---|
| Exercises (~870 with images) | **Free Exercise DB** | **Unlicense (public domain)** | ✅ **V1 primary seed** |
| Exercises (~1,000 with images) | wger | CC-BY-SA 3.0 (data) | ✅ Usable per-row with attribution; SA viral on DB |
| Exercises (1,900+ with videos) | MuscleWiki | Proprietary, partnership available | ⚠️ V2 via licensed partnership |
| Foods | **USDA FoodData Central** | **CC0 / public domain** | ✅ **Primary nutrition seed (when meals ship)** |
| Foods (branded, EU barcodes) | OpenFoodFacts | ODbL (share-alike) | ⚠️ Reference by API only, never co-mingle |
| Foods (French) | CIQUAL | CC-BY | Optional with attribution |
| Muscle SVG diagrams | Wikimedia Commons / FreeSVG | CC0 | ✅ Safe, no attribution needed |
| Recipe schema | schema.org `Recipe` | CC-BY-SA 3.0 (vocab only) | ✅ Use the JSON-LD shape — vocab is free |

## What to lock in vs leave flexible

### Lock in (painful migrations if changed later)

1. **Planned vs logged separation.** `prescribed_set` and `logged_set` as separate tables. Overlaying them later requires backfill nightmares.
2. **Set primitive:** `(set_type, reps_min, reps_max, weight_kg, weight_percent_1rm, duration_s, distance_m, rpe, rir, rest_after_seconds, tempo)`. All nullable. **Distance and time as first-class peers** of reps/weight from day one.
3. **Weight in kilograms in DB; convert at the edge.** Same for distance (meters), duration (seconds). Mixed units in storage is the worst migration in this space.
4. **Nutrition column set = schema.org `NutritionInformation`** verbatim, normalized per 100g. Diverging means re-mapping every external feed forever.
5. **`muscle` + `equipment` as their own tables**, not enums. New ones get added monthly in practice.
6. **CHAR(36) UUIDs everywhere** (consistent with MotionHive convention).
7. **Don't co-mingle OpenFoodFacts data into our tables** — ODbL share-alike will eat our IP. Reference-only when nutrition ships.

### Leave flexible (will evolve naturally)

1. **Periodization model** — flat hierarchy with free-text phase labels. Don't pre-bake linear/undulating/conjugate into schema.
2. **Movement pattern taxonomy** — enum, but expect it to grow. Don't FK against it from a million tables.
3. **`exercise.fit_category` / `hk_activity_type` / `health_connect_exercise_type`** — nullable strings, populate when needed. Don't build the cross-walk on day one.
4. **Tempo, cluster sets, rest-pause** — nullable fields and a `set_type` enum that we extend over time.
5. **Recipe nutrition** — compute on read from `recipe_ingredient` × `food.nutrition`. Caching that materialized view comes later.

## The bets most likely to bite

If we mess up any of these, expect a painful migration:

- ❌ Planned/logged conflation
- ❌ Nutrition column drift away from schema.org
- ❌ OpenFoodFacts data contamination
- ❌ Provider IDs as foreign keys

Get those four right; everything else is recoverable.

## Sources

- [NSCA PTQ 10.2 — Fundamental Resistance Training Movement Patterns](https://www.nsca.com/contentassets/3d09f06f0b4c4f6fbd8cc382ed1f3d4a/ptq-10.2.1-progressive-strategies-for-teaching-fundamental-resistance-training-movement-patterns.pdf)
- [ExRx.net Classifications](https://exrx.net/Questions/ExerciseClassAnalyses)
- [SNOMED 68130003](https://www.findacode.com/snomed/68130003--physical-activity.html)
- [WHO PA Guidelines](https://www.ncbi.nlm.nih.gov/books/NBK566046/)
- [Garmin FIT SDK workout file types](https://developer.garmin.com/fit/file-types/workout/)
- [Garmin FIT cookbook](https://developer.garmin.com/fit/cookbook/encoding-workout-files/)
- [Apple HealthKit HKWorkoutActivityType](https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype)
- [Health Connect ExerciseSessionRecord](https://developer.android.com/reference/androidx/health/connect/client/records/ExerciseSessionRecord)
- [TrainingPeaks structured workout export](https://help.trainingpeaks.com/hc/en-us/articles/115000325647-Structured-Workout-sync-and-Manual-Export)
- [Zwift ZWO reference](https://github.com/h4l/zwift-workout-file-reference/blob/master/zwift_workout_file_tag_reference.md)
- [Hevy programming docs](https://www.hevyapp.com/features/exercise-programming-options/)
- [Hevy sets and reps](https://www.hevyapp.com/features/how-to-write-sets-and-reps/)
- [Hevy RPE](https://www.hevyapp.com/features/how-to-calculate-rpe/)
- [N1 Training: Tempo notation](https://n1.training/understanding-tempo/)
- [USDA FoodData Central](https://fdc.nal.usda.gov/)
- [OpenFoodFacts](https://world.openfoodfacts.org/)
- [OpenFoodFacts API](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [OpenFoodFacts terms](https://world.openfoodfacts.org/terms-of-use)
- [CIQUAL](https://www.anses.fr/en/content/ciqual-nutritional-composition-table)
- [schema.org NutritionInformation](https://schema.org/NutritionInformation)
- [schema.org Recipe](https://schema.org/Recipe)
- [TrainingPeaks periodization](https://www.trainingpeaks.com/blog/macrocycles-mesocycles-and-microcycles-understanding-the-3-cycles-of-periodization/)
- [Wikimedia muscular system SVGs](https://commons.wikimedia.org/wiki/Category:SVG_human_muscular_system)
