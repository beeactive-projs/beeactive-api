# Open Questions & Action Items

**Status as of 2026-05-13:** Research complete, V1 scope locked. The items below are the ONLY unresolved decisions or external dependencies. Resolve them before, during, or after V1 ships (each item notes when).

## 🟡 Pre-implementation (resolve before writing code)

### Q1. Image quality of Free Exercise DB — is it shippable?

**Decision needed before:** Seeding system exercises.

**Action:** Open `https://github.com/yuhonas/free-exercise-db/tree/main/exercises` and click 5 random folders. Look at the JPG pairs. Decide:

- ✅ **Good enough** → ship as-is, upload to Cloudinary, V1 ready.
- ❌ **Below the bar** → V1 ships with text-only system exercises + user-generated YouTube content. MuscleWiki licensing becomes critical-path for V2 polish.

**Time cost:** 10 minutes. Don't skip this — it determines whether V1 ships with images or not.

---

### Q2. YouTube embedding TOS for paid SaaS

**Decision needed before:** Public-launch of custom YouTube-embed feature.

**Concern:** YouTube's TOS technically requires the IFrame Player API for any embed and prohibits "scraping" oEmbed at scale. Embedding instructor-uploaded videos is fine. Embedding *other people's* fitness content into a paid app is grey-zone.

**Action:** Skim [YouTube Terms of Service](https://www.youtube.com/t/terms) §III.E and the [Developer Policies](https://developers.google.com/youtube/terms/developer-policies). Confirm:

1. Embedding via IFrame is allowed for any public video ✓ (universal practice)
2. Fetching oEmbed thumbnails for caching is OK at modest volume ✓ (standard pattern)
3. Whether displaying embedded videos *inside a paid product* needs a YouTube partner agreement (probably not, but worth a check)

**Time cost:** 20 minutes. If anything looks risky, the fallback is "store URL only, embed at view time via iframe, never cache the video itself."

---

### Q3. Cloudinary cost projection

**Decision needed before:** Mass-upload of Free Exercise DB images.

**Math:** ~870 exercises × 2 JPGs × ~150 KB each ≈ **260 MB** for the V1 seed. Then ongoing: custom exercise YouTube thumbnails (one ~30 KB JPG each).

Cloudinary's free tier is 25 GB storage + 25 GB monthly bandwidth. We're at ~1% of storage budget for the seed.

**Action:** None for V1 — well within free tier. Re-evaluate when we hit 1,000+ instructors with significant custom exercise libraries.

---

## 🟢 Parallel-to-V1 (can happen alongside implementation)

### Q4. MuscleWiki partnership inquiry — the email

**Decision needed before:** Any V2 media-overlay work.

**Action:** Email MuscleWiki (contact via [their site](https://musclewiki.com/contact)) with the following:

> Subject: Licensing inquiry — fitness coaching SaaS integration
>
> Hi MuscleWiki team,
>
> I'm building MotionHive, a fitness coaching platform where independent instructors deliver workout programs to their clients. I'd like to enrich our exercise catalog with your video demonstrations, and I want to do this through a proper license rather than relying on the public API alone.
>
> Specific questions:
>
> 1. **Caching:** Does a license allow caching your video metadata and thumbnails locally in our database, with videos served via your CDN at view time? Or does it require live API calls for every read?
> 2. **Display context:** Our videos would be embedded inside a paid SaaS product (instructors pay us, then deliver content to their clients). Is this compatible with your licensing terms?
> 3. **Attribution:** I assume "Created by MuscleWiki" + link is the attribution requirement — is anything else required?
> 4. **Pricing:** What does a startup-tier license (under 1,000 active instructors) cost? What's the inflection point where pricing scales?
> 5. **Coverage:** Can we license the full 1,900-exercise catalog, or only specific subsets?
> 6. **Term:** Annual contract, monthly, custom? Termination policy and what happens to cached content?
>
> Happy to send more product context or get on a call.
>
> Best,
> Ionut

**Time cost:** 15 minutes to send. Response time: ~3–10 business days for a real B2B inquiry.

**Decision tree on their response:**
- ✅ **Reasonable terms** (caching OK, < $500/mo at our stage) → V2 critical path includes MuscleWiki media overlay.
- ⚠️ **Restrictive terms** (no caching, > $2k/mo) → V2 critical path becomes "instructor uploads via Cloudinary" instead.
- ❌ **No response or refused** → V1 + user YouTube + future Cloudinary uploads is the permanent path. No degradation to MotionHive — we just don't have the polished video library.

---

### Q5. Strava / Polar Flow / Whoop / Oura integrations — separate research

**Decision needed before:** Any wearable-sync feature.

**Status:** Out of V1 scope and not researched in this round. These are tracker integrations (data IN from devices), not exercise catalog sources.

**Action:** If wearable sync becomes a roadmap item, kick off a separate research doc under `docs/research/wearable-sync/`. The schema is already prepared (nullable `hk_activity_type`, `health_connect_exercise_type` columns), so this is non-blocking.

---

## 🔵 Post-V1 (revisit after we ship)

### Q6. Per-exercise tracking fields — auto-populate or manual?

**Discussion:** The `exercise.tracking_fields JSONB` column drives which set fields the UI surfaces. Two approaches:

- **Auto-populate** based on `exercise.kind`: STRENGTH → `[reps, weight, rpe]`, CARDIO → `[duration, distance, rpe]`, etc.
- **Manual per-exercise** with sensible defaults from `exercise.kind`.

V1 implementation: **auto-populate from `kind`**. If instructors complain that they want different fields per exercise, switch to manual + defaults — additive, no migration.

**Re-evaluate after:** First 100 instructors use the product.

---

### Q7. AMRAP / EMOM / Tabata / Cluster UI

**Status:** Schema supports all of these. V1 UI ships only straight sets + supersets.

**Re-evaluate after:** First user requests for "is there a way to program a CrossFit-style WOD?" If it's frequent, prioritize the block UI. If it's not, defer indefinitely — these are CrossFit / advanced strength tropes that may not be MotionHive's audience.

---

### Q8. Group program assignment

**Status:** Out of V1 scope. Schema is ready (just need a `target_type` enum and `group_id` column on `program_assignment`).

**Re-evaluate after:** First instructor with 20+ clients running the same program complains about per-client manual assignment.

---

### Q9. Public program library / marketplace

**Status:** Out of V1 scope. Significant scope expansion (revenue model, moderation, search ranking, instructor-attribution surface).

**Re-evaluate after:** Instructor density supports a marketplace AND there's clear demand from clients to discover programs outside their instructor.

---

### Q10. Meal plans — when?

**Status:** Schema reserves namespace via `program.kind = 'MEAL'`. No meal-plan tables built.

**Re-evaluate after:** Workout core is stable AND instructors are asking for nutrition tooling. Build order:
1. `food` (seeded from USDA FoodData Central)
2. `recipe` + `recipe_ingredient`
3. `meal_plan` + `meal_plan_day` + `meal`
4. Plug into existing `program` shell as `kind = 'MEAL'`
5. Reuse `program_assignment` deep-copy pattern verbatim for meal plan assignments

Estimated effort: similar to workouts (40–55 hours).

---

### Q11. Jobs module dependency for reminders

**Status:** Blocked on the jobs module being built (see `project_jobs_module_pending.md`).

**Notification stubs exist:** `WORKOUT_DUE_TODAY` and `WORKOUT_OVERDUE` are in the `NotificationType` enum but no service fires them in V1. When the jobs module ships, the cron just needs to:

```ts
// Pseudo-code in jobs/workout-reminders.processor.ts
@Cron('0 6 * * *')  // 6am daily
async sendDueTodayReminders() {
  const today = todayDate();
  const assigned = await findAssignedWorkoutsScheduledFor(today);
  for (const aw of assigned) {
    await notificationService.notify(buildWorkoutDueTodayNotification(aw));
  }
}
```

Don't inline this as `setTimeout` / `@Cron` in V1 — that's the explicit anti-pattern from `project_jobs_module_pending.md`.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Free Exercise DB image quality below bar | Medium | High | Q1 check before seeding; fallback is text-only V1 |
| YouTube embed restrictions in TOS | Low | Medium | Q2 check; standard practice across industry |
| MuscleWiki refuses partnership | Medium | Low | V1 ships without them; user uploads cover the gap |
| Sequelize transaction performance on deep-copy assignment | Low | Medium | Bulk inserts (`bulkCreate`); benchmark with 12-week program |
| Wide nullable `prescribed_set` schema bloats DB | Very low | Low | Most rows have 5–10 fields populated; storage is cheap |
| Jobs module delay blocks workout reminders | High | Low | Reminders are a nice-to-have; V1 ships without them |

## Decision log

Every entry that exits this list (resolved, deferred, or rejected) should be moved here with date and outcome.

| Date | Item | Outcome |
|---|---|---|
| — | — | — |
