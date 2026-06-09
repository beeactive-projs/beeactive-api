# Workouts module — pending jobs (blocked on jobs module)

The workouts feature has several deferred / time-driven concerns that
need the jobs module to land before they can ship. Captured here so
they're not forgotten when the jobs module is built.

See also: [project_jobs_module_pending.md](../../../../.claude/projects/-Users-ionutbutnaru-Documents-mystuff-beeactive-api/memory/project_jobs_module_pending.md)
(repo-level memory) and `notification-types.ts` (the dormant
`WORKOUT_DUE_TODAY` / `WORKOUT_OVERDUE` enum slots that already exist).

## Jobs to add when the jobs module ships

### 1. `workout-reminders.processor` — daily, 6:00 local

For each `assigned_workout` whose `scheduled_date = today` and whose
`status IS NULL`, fire `WORKOUT_DUE_TODAY` to the client.

```ts
// pseudocode
@Cron('0 6 * * *', { timeZone: 'Europe/Bucharest' })
async sendDueTodayReminders() {
  const due = await assignedWorkoutModel.findAll({
    where: {
      scheduledDate: today(),
      status: { [Op.is]: null },
    },
    include: [{ model: ProgramAssignment, include: ['client'] }],
  });
  for (const aw of due) {
    await notify(buildWorkoutDueTodayNotification(aw));
  }
}
```

### 2. `workout-overdue.processor` — daily, 9:00 local

For `assigned_workout` whose `scheduled_date < today - 1` and
`status IS NULL OR status = 'IN_PROGRESS'`, fire `WORKOUT_OVERDUE`.
Only once per assignment (dedup via notification `fingerprint`).

### 3. `fork-count-drift-audit.processor` — weekly, low-priority

Reconcile `exercise.fork_count` against the live fork count:

```sql
UPDATE exercise SET fork_count = subq.cnt
  FROM (
    SELECT forked_from_id AS id, COUNT(*) AS cnt
      FROM exercise
     WHERE deleted_at IS NULL AND forked_from_id IS NOT NULL
     GROUP BY forked_from_id
  ) subq
 WHERE exercise.id = subq.id
   AND exercise.fork_count <> subq.cnt;
```

The fork tx maintains the counter atomically; drift should be zero. But
having a periodic drift audit as a safety net is cheap and catches any
future code path that forgets the counter update.

### 4. `exercise-media-license-expiry.processor` — daily

For `exercise_media` rows with `licensed_until <= today`, soft-disable
(do not delete — the audit trail matters). V1 doesn't license any media
this way (jsDelivr is free, YouTube is embed-by-reference) but V2 with
MuscleWiki / Cloudinary uploads will need this.

### 5. `workout-log-completion-summary.processor` — weekly

Email instructors a digest of their clients' workout logs from the past
week. Triggered Monday mornings. Aggregation query against `workout_log`
+ `logged_exercise` + `logged_set`.

### 6. `recurring-program-generator.processor` — N/A (deferred to V2)

V1 has no recurring programs — programs assign once and that's it.
V2 will need a generator if we add "auto-extend by N more weeks" UX.

## Why not inline these now

Per the locked constraint in `project_jobs_module_pending.md`:

> Do NOT inline cron with `setTimeout` / `@Cron` — wait for the jobs
> module so retry/observability/distributed-lock concerns are uniform.

The notification enum already has `WORKOUT_DUE_TODAY` / `WORKOUT_OVERDUE`
defined and the builders can be added to `exercise/notifications.ts` /
`workout/notifications.ts` ahead of time — the jobs processors will just
import and call them.

## Touch points already in place

- `assigned_workout.scheduled_date` — drives reminders & overdue
- `exercise.fork_count` — atomic in the fork tx; drift audit is a safety net
- `exercise_media.licensed_until` — column exists; reads filter it out

When the jobs module is ready, the deltas to enable these are:
1. A new file per processor under `src/modules/jobs/processors/`
2. The notification builders for any new types (`WORKOUT_DUE_TODAY` /
   `WORKOUT_OVERDUE` are already in the enum + defaults map)
3. No schema changes (the counters / columns / FKs all exist already)
