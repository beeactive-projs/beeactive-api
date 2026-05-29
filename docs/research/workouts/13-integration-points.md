# 13 — Integration points: workouts ↔ rest of the backend

> **Audit date:** 2026-05-22 — written *after* the session rewrite (migration 046) shipped, *after* the jobs module landed, and *after* messaging/review/venue/post/notification consolidated. This audit supersedes the integration assumptions in [06-module-layout.md](./06-module-layout.md).

## Why this audit

The original workouts research ([04-locked-decisions.md](./04-locked-decisions.md), [06-module-layout.md](./06-module-layout.md)) was written on 2026-05-13. In the nine days since, several modules that workouts touches have shipped or changed shape:

- **Session module** was rewritten by migration 046 into a two-table template + instance design (the old single-table `session` referred to in [06-module-layout.md](./06-module-layout.md#L324-L329) no longer exists).
- **Jobs module** moved from "pending" to "live with BullMQ + base worker pattern".
- **Notification system** moved from Phase 1 stub to Phase 6: real producer API, outbox pattern, defaults map, channels, receipts, BullMQ email worker.
- **Messaging** module shipped (DMs + group chats + safety stack).
- **Review** module shipped (read-only v1, instructor reviews).
- **Venue** module exists and is FK'd from `session_template.venue_id` (cascade SET NULL).
- **Post** module shipped — has its own search-index call sites and notification builders that workouts can copy from.

The workouts scope is also expanding beyond the original locked decisions:

- User self-authored workouts and saved templates (so workouts have a USER author surface, not just INSTRUCTOR assignment).
- Personal Records (PRs).
- Privacy controls (workouts default private, optional share-with-coach).
- YouTube video attachments on workouts (not just exercises).
- Architecture-aware (but deferred) achievements/badges.
- Workouts visible from multiple surfaces: standalone "my workouts", attached to a session, inside a program.

This document is the integration contract — what workouts touches, what each touched module currently looks like, and what's needed before the workouts migration can land cleanly.

---

## Per-module findings

### session — newly rewritten (migration 046)

**Current state.** The legacy `session` table is gone. New shape: [session_template](../../../src/modules/session/entities/session-template.entity.ts) + [session_instance](../../../src/modules/session/entities/session-instance.entity.ts) + [session_participant](../../../src/modules/session/entities/session-participant.entity.ts) + [session_reminder_schedule](../../../src/modules/session/entities/session-reminder-schedule.entity.ts). One template per class concept, N instances per template (one for one-off, many for recurring). Each instance carries denormalized counters (`confirmedCount`, `pendingApprovalCount`, `waitlistedCount`, `attendedCount`). Per-occurrence overrides live on the instance (`titleOverride`, `venueIdOverride`, `meetingUrlOverride`, `capacityOverride`). Sanitisation, ownership preflight, snapshot-at-booking semantics — all already in. See [SESSION-FLOWS.md](../../../src/modules/session/SESSION-FLOWS.md) for the full walkthrough.

There is **no "what's done during the session"** field today. `session_template` and `session_instance` describe **when/where/who/how-much-money** — they don't describe **content**. There is no `notes`, no `agenda`, no `exercises` column. The instructor's only content surface today is `description` (TEXT, sanitised via `stripHtml`).

**Integration point.** Workouts should be attachable to a session instance. Locked decision §6 in [04-locked-decisions.md](./04-locked-decisions.md#L70-L77) said sessions and workouts are independent in V1. The expanded scope reverses that for one specific surface: a logged workout (`workout_log`) can optionally reference the session instance it was performed at, and an instructor's program/template can optionally be attached to a session as "the workout for this class".

Two clean options:

1. **`workout_log.session_instance_id NULL FK session_instance(id) ON DELETE SET NULL`** — the homework/post-session link. The session row stays clean; the workout log carries the back-reference. Lowest blast radius.
2. **`session_template.workout_template_id NULL FK workout_template(id) ON DELETE SET NULL`** OR a join table — only needed if instructors want to say "every Tuesday hot yoga class uses this routine". Defer to V2.

Option (1) only. The relevant changes live entirely inside `workout/`; the session module does not need to import anything from `workout/`.

**Action needed.** None on the session side. Workouts' migration adds the FK on the workout-side table.

**Risk.** Low. Session module is stable post-046. The only thing to watch: `session_instance.deletedAt` is paranoid — workouts must use `ON DELETE SET NULL` not `CASCADE`, because soft-deleting a session shouldn't orphan logged history.

---

### client — `instructor_client` is the relationship spine

**Current state.** [InstructorClient](../../../src/modules/client/entities/instructor-client.entity.ts) — CHAR(36) UUID PK `id`, FKs `instructorId` + `clientId` to `user(id)`, status (`PENDING | ACTIVE | ARCHIVED`), `initiatedBy`. Backed by `client_request` for invitation audit trail. Lifecycle: PENDING → ACTIVE → ARCHIVED.

The PK is **`id`, not `(instructor_id, client_id)`** — i.e. a composite uniqueness is not enforced at the model level today (migration 028 dropped the blanket UNIQUE; this is intentional to let archived relationships co-exist with active ones).

**Integration point.** Workouts uses `instructor_client.id` in two places:

1. `program_assignment.instructor_client_id` — the binding between an assignment and the active coaching relationship. As described in [06-module-layout.md](./06-module-layout.md#L325-L328), nullable FK. Workouts checks the relationship is `ACTIVE` before allowing an assignment (status check, not just existence).
2. Workout share-with-coach: when the client opts to share a self-authored workout/PR with their coach, the visibility check resolves "my coaches" from `instructor_client` rows where `clientId = me AND status = 'ACTIVE'`.

**Action needed.** None on the client module. Workouts' migration adds the FK; service code looks up `InstructorClient.findOne({ where: { id, status: 'ACTIVE' } })` for assignment write paths.

**Risk.** Low. Watch out for status drift — workouts must check `status='ACTIVE'`, not just the row existing (PENDING and ARCHIVED rows would otherwise let workouts leak across cancelled relationships).

---

### notification — Phase 6 producer API (live)

**Current state.** The notification system has matured well past the "Phase 1 stub" line in CLAUDE.md. What ships today:

- [NotificationType enum](../../../src/modules/notification/notification-types.ts) at `src/modules/notification/notification-types.ts` lives in its own file specifically so the defaults map can import it without circular-import drama. Comment block at the top says it explicitly: *"Adding a new type is a zero-migration change — just add the value here and an entry in NOTIFICATION_DEFAULTS."*
- [NOTIFICATION_DEFAULTS](../../../src/modules/notification/notification-defaults.ts) — Record<NotificationType, ChannelPreferences>. Every type MUST appear here or `resolveChannels` falls back to IN_APP_ONLY (safe default but probably not what we want).
- [NotificationService.notify(params)](../../../src/modules/notification/notification.service.ts#L99) + `notifyMany(userIds, params)` — the producer-facing API. Persists notification + receipts in one tx, then synchronously fans out per-channel delivery (in-app = receipt row, email = BullMQ job, push/sms = stubbed `skipped:not_implemented`).
- [NotificationOutbox](../../../src/modules/notification/notification-outbox.ts) — collects `NotifyParams` inside a tx, fires them after commit via `flush()` or `discard()` on rollback. **This is the pattern producers should use** — the post and session modules both use it heavily (search `// notify-after-commit` for examples).
- [format.ts](../../../src/modules/notification/format.ts) — `formatMoney(cents, currency)`, `formatDueDate(date)`, `formatSessionTime(date, timezone)`. Workouts will add `formatVolume(kg, sets, reps)` style helpers in its own builder file (workouts-specific, not shared) following the same pattern.
- **Builder convention** — every module has its own `notifications.ts` next to the service ([post/notifications.ts](../../../src/modules/post/notifications.ts), [session/notifications.ts](../../../src/modules/session/notifications.ts), [messaging/notifications.ts](../../../src/modules/messaging/notifications.ts)). Builders take **primitives only** (id, name, Date, cents, currency) — never Sequelize entities. CLAUDE.md is explicit on this: lazy associations explode when an outbox flushes after commit.

**Integration point.** Workouts will declare new notification types and add them to two files:

1. [notification-types.ts](../../../src/modules/notification/notification-types.ts) — append a `// ── Workouts ──` block:
   - `PROGRAM_ASSIGNED`
   - `EXERCISE_FORKED`
   - `CLIENT_COMPLETED_WORKOUT`
   - `CLIENT_SHARED_WORKOUT_RESULTS` (new — the expanded-scope share-with-coach surface)
   - `WORKOUT_DUE_TODAY` (stub — fires from jobs cron once that worker ships)
   - `WORKOUT_OVERDUE` (stub — ditto)

2. [notification-defaults.ts](../../../src/modules/notification/notification-defaults.ts) — append matching entries in the `NOTIFICATION_DEFAULTS` map. The conservative defaults (consistent with the existing taxonomy):
   - `PROGRAM_ASSIGNED` → IN_APP_AND_EMAIL (client wants the email so it's not lost in app silence — mirrors `CLIENT_REQUEST_ACCEPTED`).
   - `EXERCISE_FORKED` → IN_APP_ONLY (informational, no urgency).
   - `CLIENT_COMPLETED_WORKOUT` → IN_APP_ONLY (instructor-facing roster activity; matches `PARTICIPANT_JOINED`).
   - `CLIENT_SHARED_WORKOUT_RESULTS` → IN_APP_AND_EMAIL (instructor expects to see this even if not in the app today).
   - `WORKOUT_DUE_TODAY` → IN_APP_AND_PUSH (time-sensitive; matches `SESSION_REMINDER_1H`).
   - `WORKOUT_OVERDUE` → IN_APP_AND_EMAIL (matches `INVOICE_DUE_SOON`).

3. **Builders file** — new `src/modules/workout/notifications.ts` (and `src/modules/exercise/notifications.ts` for `EXERCISE_FORKED`). Click targets need agreement up front:
   - `PROGRAM_ASSIGNED` → `{ screen: 'workouts', queryParams: { assignmentId } }` (FE route TBD; matches [06-module-layout.md](./06-module-layout.md) §"Notification builders").
   - `EXERCISE_FORKED` → `{ screen: 'exercises', entityId: originalExerciseId }`.
   - `CLIENT_COMPLETED_WORKOUT` → `{ screen: 'coaching/clients', entityId: clientId }`.
   - `CLIENT_SHARED_WORKOUT_RESULTS` → `{ screen: 'coaching/clients', entityId: clientId, queryParams: { tab: 'shared' } }`.

**Action needed.**

- Add 6 enum values to [notification-types.ts](../../../src/modules/notification/notification-types.ts).
- Add 6 entries to `NOTIFICATION_DEFAULTS` in [notification-defaults.ts](../../../src/modules/notification/notification-defaults.ts).
- Create `src/modules/workout/notifications.ts` + `src/modules/exercise/notifications.ts` with primitives-only builders.
- Use `NotificationOutbox` inside any service method that opens a tx and fires notifications; place `notify()` directly only when the call is post-commit.

**Risk.** Zero — this is the documented "add a notification type" path. The only watch: don't forget the defaults entry. A type without a defaults entry silently falls back to `IN_APP_ONLY` via [`resolveChannels`](../../../src/modules/notification/notification-defaults.ts#L132).

---

### jobs — module exists, BullMQ backed (Phase 6)

**Current state.** [06-module-layout.md](./06-module-layout.md#L332) marked jobs as pending. It now exists. Layout:

```
src/modules/jobs/
├── jobs.module.ts          # @Global, registers BullModule queue(s)
├── jobs.service.ts         # producer API: enqueue<K>(name, payload, opts)
├── job-registry.ts         # typed catalog: QueueName enum + JobPayloads interface
├── bull-board.setup.ts
├── common/
│   ├── base.worker.ts      # WorkerHost extension; error classification
│   ├── job-context.ts      # tagged logger
│   └── errors.ts           # PermanentError, TemporaryError
└── workers/notifications/
    └── email-send.worker.ts
```

Key patterns:

- **`JobsService.enqueue<K>(name, payload, opts)`** — `K extends keyof JobPayloads`; types are end-to-end. Payload shape is enforced at the call site. See [jobs.service.ts#L81](../../../src/modules/jobs/jobs.service.ts#L81).
- **Job registry**: one file ([job-registry.ts](../../../src/modules/jobs/job-registry.ts)) lists `QueueName`, `JobPayloads`, `QUEUE_DEFAULTS`. Naming: `<queue>.<job>` (e.g. `notifications.email_send`). Adding a job = add a key to `JobPayloads` + add a worker file + register the worker as a provider in `jobs.module.ts`.
- **Worker pattern**: extend `BaseWorker<'queue.job'>`, implement `handle(payload, ctx)`. `BaseWorker` ([base.worker.ts](../../../src/modules/jobs/common/base.worker.ts)) handles error→retry classification: throw `PermanentError` for skip-remaining-retries, `TemporaryError` (or anything else) for retry-with-backoff.
- **Redis-not-configured graceful degradation**: when `REDIS_HOST` is unset (local dev), `JobsService.enqueue()` returns `null` and logs a warning; the producer in [notification.service.ts](../../../src/modules/notification/notification.service.ts#L281-L294) falls back to synchronous send. Workouts should follow the same fallback pattern wherever it can.
- **Schedule module**: [`ScheduleModule.forRoot()`](../../../src/app.module.ts#L84) is registered but **no `@Cron` decorators exist anywhere in the codebase** (`grep -rn '@Cron'` returned zero). Cron is wired up; the convention has not been set yet. Workouts will be the first or second module to need it (race with session reminder dispatch, which is also pending the jobs module per [SESSION-FLOWS.md](../../../src/modules/session/SESSION-FLOWS.md#L1) Phase G).

**Integration point.** Workouts adds a new queue (`workouts`) and at least four jobs:

| Job key | Payload | Trigger |
|---|---|---|
| `workouts.due_today_scan` | `{}` | daily cron 06:00 user-tz; fans out `WORKOUT_DUE_TODAY` notifications via NotificationService.notifyMany |
| `workouts.overdue_scan` | `{}` | daily cron 18:00; fires `WORKOUT_OVERDUE` for assignments >24h overdue |
| `workouts.youtube_oembed_fetch` | `{ exerciseId, youtubeUrl }` | one-shot job on exercise create/update; fetches oEmbed thumbnail + uploads to Cloudinary (per [04-locked-decisions.md](./04-locked-decisions.md) §8) |
| `workouts.recurring_assignment_advance` | `{ assignmentId }` | weekly cron (or on-demand) to extend a recurring assignment's next-week workout queue |

Add `Workouts = 'workouts'` to `QueueName` ([job-registry.ts#L30](../../../src/modules/jobs/job-registry.ts#L30)), add the four entries to `JobPayloads`, add a `QUEUE_DEFAULTS[QueueName.Workouts]` block (probably attempts=3, backoff=5s — workouts ops are less hot than email).

**Action needed.**

- Add `Workouts` to `QueueName` enum.
- Add 4 entries to `JobPayloads` interface.
- Add `QUEUE_DEFAULTS[QueueName.Workouts]`.
- Register the queue in `jobs.module.ts` imports (`BullModule.registerQueue({ name: QueueName.Workouts, defaultJobOptions: ... })`).
- Create `src/modules/jobs/workers/workouts/due-today-scan.worker.ts` (and the other three) extending `BaseWorker`.
- Register each worker as a provider in `jobs.module.ts`.
- Wire the cron triggers — the convention is yet-to-be-set across the codebase; recommend a small `WorkoutsCronService` in the workouts module that uses `@Cron(CronExpression.EVERY_DAY_AT_6AM)` and calls `jobsService.enqueue('workouts.due_today_scan', {})`. Keeps the trigger out of the worker file.

**Risk.** Medium. The jobs module shipped one job (`notifications.email_send`). Workouts will be the first big consumer adding multiple queues and crons — minor convention churn possible. Specifically:

- The cron-trigger convention (`@Cron` on a service vs in the worker file) is unsettled. Recommend trigger-service, worker-handler split for clarity.
- Bull Board ([bull-board.setup.ts](../../../src/modules/jobs/bull-board.setup.ts)) probably needs the new queue added to its UI registration.
- Existing per-queue retention (`removeOnComplete: { age: 86400 }`) is tuned for `notifications` (high-volume short-jobs). The `youtube_oembed_fetch` job is rare but slow (~2s) — different defaults may make sense.

---

### search — `search_doc` index (Phase 2 of the search module)

**Current state.** [SearchDoc](../../../src/modules/search/entities/search-doc.entity.ts) is one denormalized table with columns `entity_type`, `entity_id`, `title`, `subtitle`, `body`, `tags TEXT[]`, `city`, `is_public`, `owner_id`, `avatar_url`, plus generated `search_vector` (tsvector) and `search_text` (trigram). Indexing is per-entity-type via methods on [SearchIndexService](../../../src/modules/search/search-index.service.ts) — currently: `upsertUser`, `upsertInstructor`, `upsertGroup`, `upsertSession`, `upsertPost`. Each method idempotently reads the source entity and writes a row via the private `_upsert` helper. `removeIfExists(entityType, entityId)` covers soft-deletes.

`SearchEntityType` ([search-doc.entity.ts#L10](../../../src/modules/search/entities/search-doc.entity.ts#L10)) is the source-of-truth list of entity-types the index supports. The FE-facing search filter enum lives in [search-query.dto.ts](../../../src/modules/search/dto/search-query.dto.ts).

**Call sites today**: post / group / user / profile / session services all import `SearchIndexService` and call `upsert*` after commit + `removeIfExists` on soft-delete (catch + log; never blocks the write). See [post.service.ts#L149](../../../src/modules/post/post.service.ts#L149), [group.service.ts#L219](../../../src/modules/group/group.service.ts#L219), [user.service.ts#L330](../../../src/modules/user/user.service.ts#L330), [profile.service.ts#L151](../../../src/modules/profile/profile.service.ts#L151) for examples.

**Integration point.** Both `exercise` and `program` should be searchable per locked decisions (workouts owners can find their exercises and programs; FE typeahead in the program builder needs it).

Add to [search-doc.entity.ts](../../../src/modules/search/entities/search-doc.entity.ts):

```ts
export type SearchEntityType =
  | 'user' | 'instructor' | 'group' | 'session' | 'tag' | 'post'
  | 'exercise' | 'program';
```

Add to [search-index.service.ts](../../../src/modules/search/search-index.service.ts):

- `upsertExercise(exerciseId, tx?)` — title = exercise name; subtitle = primary muscle + equipment; body = instructions; tags = movement pattern + mechanic; isPublic = `visibility === 'PUBLIC'`; ownerId = `owner_id` (null for SYSTEM).
- `upsertProgram(programId, tx?)` — title = program name; subtitle = duration + level; body = description; tags = goal tags; isPublic = false (V1 has no public programs per [04-locked-decisions.md](./04-locked-decisions.md) §3); ownerId = `instructor_id`.

Add to [search-query.dto.ts](../../../src/modules/search/dto/search-query.dto.ts):

```ts
export const SEARCH_ENTITY_FILTERS = [
  'all', 'people', 'instructors', 'groups', 'sessions', 'tags',
  'exercises', 'programs',
] as const;
```

And matching branches in [search.service.ts#L196-L207](../../../src/modules/search/search.service.ts#L196-L207) (the `type` → `entity_type[]` mapping for read filters) plus the rank-weight `CASE` ([search.service.ts#L148](../../../src/modules/search/search.service.ts#L148)).

**Action needed.**

- Extend the `SearchEntityType` union.
- Add `upsertExercise` + `upsertProgram` methods.
- Extend the FE-facing `SEARCH_ENTITY_FILTERS` enum and the read-side type→entity_type mapping in `SearchService`.
- Call sites: `ExerciseService.create/update` → `searchIndexService.upsertExercise(id)`; `ExerciseService.softDelete` → `searchIndexService.removeIfExists('exercise', id)`. Same pattern for `ProgramService`. Best-effort: `.catch(err => logger.error(...))` — search drift is preferable to write rollback (same pattern as post.service).

**Risk.** Low. The search module is the most pattern-consistent in the codebase — there's a literal recipe to follow. The only watch: workout `workout_log` is intentionally **NOT** indexed (private user data, no value to search globally). Same for `personal_record` / PRs.

---

### post — feed surface for share-with-coach + PR posts

**Current state.** [Post](../../../src/modules/post/entities/post.entity.ts) is **group-scoped** in V1: every post `belongsTo` exactly one group via `groupId NOT NULL`. There is no personal feed / no profile timeline. There is **no `entityRef` column** today — a post is text + `mediaUrls: string[]` (Cloudinary). Cross-posting is server-side fan-out (one row per group). Approval state: APPROVED / PENDING / REJECTED depending on group's `MemberPostPolicy`.

**Memory note** ([project_posts_feature_decisions.md](../../../.claude/projects/-Users-ionutbutnaru-Documents-mystuff-beeactive-api/memory/project_posts_feature_decisions.md)): "V1 = group posts but schema is general (post + post_audience) so personal feed plugs in later without migrations." Actual `post` table today does **not** have a `post_audience` join — it has `groupId` directly. Either the memory note is aspirational, or the audience table was deferred. Either way: a personal feed surface does **not** exist today.

**Integration point.** The expanded workouts scope wants PRs and workouts to be share-able. Three options, in increasing order of footprint:

1. **No integration in V1.** Sharing a PR creates an in-app notification to the user's coaches (`CLIENT_SHARED_WORKOUT_RESULTS`). No social/feed surface. Simplest. Aligns with the [04-locked-decisions.md](./04-locked-decisions.md) "workouts are independent of social surfaces" spirit.
2. **Post into a group.** Client posts "Just hit a new PR 🎉 +5kg deadlift" into a group they're a member of, attaching a `workout_log_id` reference. Requires adding a nullable `entityRef: { type: 'workout_log' | 'personal_record', id: UUID }` column to `post` table, plus a hydration step in `post.service.ts` to render the attached card.
3. **Personal feed.** Defer until a personal feed surface exists. Don't block workouts on it.

**Recommended V1.** Option (1). Defer (2) and (3). It's the lowest-coupling approach — `post` schema does not change, and workouts ships independent of feed design.

If we later want option (2), the cleanest add is:

```sql
ALTER TABLE post
  ADD COLUMN entity_ref_type VARCHAR(40) NULL,
  ADD COLUMN entity_ref_id   CHAR(36)    NULL,
  ADD CONSTRAINT post_entity_ref_pair_chk
    CHECK ((entity_ref_type IS NULL) = (entity_ref_id IS NULL));
```

…plus a polymorphic hydrator in `post.service.ts`. **Don't ship this in the workouts migration** — it's a feed change, not a workouts change.

**Action needed.** None for V1. If we want PR-sharing-to-group, that's a separate ticket post-launch.

**Risk.** Cross-cutting if we try to ship (2) now. Skip it.

---

### messaging — DMs + group chats (newly shipped)

**Current state.** Full messaging stack: conversations (DIRECT / GROUP), participants, messages, reports, blocks, suspensions, velocity alarms, SSE streams, admin tools. [Message.kind](../../../src/modules/messaging/entities/message.entity.ts#L18-L24) is `TEXT | SYSTEM_JOIN | SYSTEM_LEAVE | SYSTEM_RENAME | SYSTEM_ROLE_CHANGE`. There is no `ENTITY_REF` kind, no message-attachment table. `MessageMetadata` ([message.entity.ts#L31](../../../src/modules/messaging/entities/message.entity.ts#L31)) is a small JSONB with `threatFlags` + `system` — no general entity attachment shape.

**Integration point.** None for V1. The hypothetical "coach sends a workout via DM" flow does not need messaging to know about workouts — the coach can include a link in the message body, and the FE renders it as a card via URL preview (out of scope). If we want first-class entity attachments in messages, that's a messaging-module change, not a workouts-module change.

**Action needed.** None.

**Risk.** None.

---

### user — what columns does workouts add?

**Current state.** [User entity](../../../src/modules/user/entities/user.entity.ts) — already carries: `countryCode`, `city`, `language`, `timezone`, `handle`, `privacySettings` (JSONB, per-field privacy map), `avatarUrl`. No counters, no streak field, no `workoutCount`.

**Integration point.** The locked decisions ([04-locked-decisions.md](./04-locked-decisions.md)) keep all workout state in workout tables — no denormalized counters on `user`. The expanded scope mentions achievements/badges; the architecture should be aware but the *build* is deferred. Locked plan for achievements/badges = separate table (`user_achievement` or similar), referenced by user_id. **Do not add counters to `user` for V1.**

If we later add a streak field, the right home is a `user_workout_stats` join (1:1, lazy-loaded) so the hot `user` row stays small. Not in V1.

**Action needed.** None.

**Risk.** Pressure to add a streak/PR-count column "for performance" — resist; compute on read or denormalize into a separate small table when needed.

---

### profile — instructor metadata

**Current state.** [InstructorProfile](../../../src/modules/profile/entities/instructor-profile.entity.ts) has `displayName`, `specializations: string[]`, `bio`, `certifications`, `yearsOfExperience`, `isAcceptingClients`, `socialLinks`, plus visibility flags (`showSocialLinks`, `showEmail`, `showPhone`, `isPublic`).

**Integration point.** None forced by workouts. If we eventually want "preferred coaching style" (strength / hypertrophy / endurance / mobility) as a profile attribute, that's a profile-module change, not a workouts-module change. The `specializations` array already covers this if we agree on a vocabulary.

**Action needed.** None.

**Risk.** None.

---

### payment — V1 workouts are not paid content

**Current state.** Stripe Connect Express, 8 entities, 10 services. Products / subscriptions / invoices all exist for instructor-billed-client coaching/sessions. No product type for "program purchase".

**Integration point.** None per [04-locked-decisions.md](./04-locked-decisions.md) explicit out-of-scope: "Paid programs / Stripe Connect on workouts ❌". V2+ might add `product.kind = 'PROGRAM_PURCHASE'` with a one-time charge model, but that's a payment-module change, not a workouts one.

**Action needed.** None.

**Risk.** None.

---

### review — newly added, read-only V1

**Current state.** [Review](../../../src/modules/review/entities/review.entity.ts) — public reviews left on an instructor's `instructor_profile_id`. Rating + body + monthsIn. Read-only in V1 (write endpoints deferred).

**Integration point.** None. Workouts neither produces nor consumes reviews.

**Action needed.** None.

**Risk.** None.

---

### role — INSTRUCTOR + USER both needed

**Current state.** [Role entity](../../../src/modules/role/entities/role.entity.ts). Seeded roles (per [005_seed_roles_permissions.sql](../../../migrations/005_seed_roles_permissions.sql#L11-L15)): `SUPER_ADMIN`, `INSTRUCTOR`, `USER`. `WRITER` added by migration 017. CLAUDE.md mentions `SUPPORT` and `ADMIN` too — these may be seeded by later migrations or aspirational. The three workouts cares about (`SUPER_ADMIN`, `INSTRUCTOR`, `USER`) are all live.

**Integration point.** Workouts uses `@Roles('INSTRUCTOR')` on program management endpoints, `@Roles('USER')` on logging endpoints. `@Roles('SUPER_ADMIN')` for editing `SYSTEM` exercises and for `POST /search/reindex`-style admin ops (mirrors [search.controller.ts#L74](../../../src/modules/search/search.controller.ts#L74)). All decorators + guards already exist ([`@Roles`](../../../src/common/decorators/roles.decorator.ts), `RolesGuard`).

**Action needed.** None.

**Risk.** None.

---

### venue — should `workout_log` carry a `venue_id`?

**Current state.** [Venue entity](../../../src/modules/venue/entities/venue.entity.ts). Owned by `instructor_profile_id`, kind ∈ {GYM, STUDIO, PARK, OUTDOOR, CLIENT_HOME, ONLINE, OTHER}. Sessions reference one via `session_template.venue_id` (ON DELETE SET NULL).

**Integration point.** Should `workout_log` have a `venue_id`?

**For**: Symmetry with session. Analytics ("which gyms perform best?"). Reproducibility on PR reviews ("which gym was this 200kg squat at?").

**Against**: Venues belong to **instructors**, not clients. A self-authored client workout has no instructor venue. Forcing `venue_id` nullable + only-meaningful-for-coached-workouts is muddled. The free-form `location` field on `workout_log` (the kind of thing Hevy ships) covers the rare cases.

**Verdict**: **Skip the FK in V1.** Add `workout_log.location_text VARCHAR(120) NULL` instead. If V2 wants venue-anchored analytics, add the nullable FK then.

**Action needed.** None on the venue module.

**Risk.** None.

---

### group — V1 explicitly excludes group assignment

**Current state.** Group module is stable, group-scoped posts work, group-scoped sessions work. No "group programs".

**Integration point.** None per [04-locked-decisions.md](./04-locked-decisions.md) §7: "Individual clients only in V1. No group program assignment." The schema reservation lives on the workout side (`program_assignment.target_type ENUM('CLIENT')` — V2 adds `'GROUP'` without migrating).

**Action needed.** None.

**Risk.** None.

---

## Drift between original research and current state

This section is the gap diary between [04-locked-decisions.md](./04-locked-decisions.md) / [06-module-layout.md](./06-module-layout.md) (written 2026-05-13) and the codebase at 2026-05-22.

| Topic | Original research said | Current reality | Action |
|---|---|---|---|
| **Target migration number** | "046_workouts_foundation.sql (or next available)" | **Migration 046 is `046_sessions_rewrite.sql`** (shipped 2026-05-15 to 2026-05-20 in commits ending at `6c3be87`). The next free number is **047**. | Workouts ships as `047_workouts_foundation.sql`. |
| **Migration numbering gaps** | n/a | Numbers 040, 041 are skipped (migrations jump 039 → 042). This is intentional — those numbers were taken by branches that never landed. Use 047, not 040 or 041. | Use 047. |
| **Session module is "untouched" by workouts** | [06-module-layout.md](./06-module-layout.md#L328) | Mostly still true. The expanded scope adds **one** session touchpoint: `workout_log.session_instance_id NULL FK` (homework/post-session log). The session module side is zero-change. | Add the FK on the workouts side only. |
| **Jobs module pending** | [06-module-layout.md](./06-module-layout.md#L332): "pending. `WORKOUT_DUE_TODAY` / `WORKOUT_OVERDUE` notifications remain dormant" | Jobs module is **live** with BullMQ. Workouts can ship the cron-fired reminders in V1 instead of stubbing. | Add `Workouts` queue, four jobs, four workers, a `WorkoutsCronService`. |
| **Notification type adds** | "add to the `NotificationType` enum in `notification.service.ts`" | Enum moved to dedicated file [notification-types.ts](../../../src/modules/notification/notification-types.ts) (re-exported from `notification.service.ts`). Adds must also touch [notification-defaults.ts](../../../src/modules/notification/notification-defaults.ts). | Touch both files, not just one. |
| **`searchService.upsertDoc(...)`** | [06-module-layout.md](./06-module-layout.md#L308) implies a generic upsert | Actual API is **per-entity-type** methods on `SearchIndexService`: `upsertExercise`, `upsertProgram` need to be added next to existing `upsertUser` / `upsertGroup` / etc. | Add two new methods + extend `SearchEntityType`. |
| **`CLIENT_SHARED_WORKOUT_RESULTS` not in original research** | Original called out 3 notification types + 2 stubs | Expanded scope adds a 6th type for the share-with-coach surface. | Add the 6th type + default. |
| **YouTube oEmbed handling** | [04-locked-decisions.md](./04-locked-decisions.md) §8: "On create/update, we fetch oEmbed thumbnail and cache it to Cloudinary" | Synchronous fetch on a controller request is a bad idea (200-800ms; YouTube can be slow). Now that jobs module is live, this should be `workouts.youtube_oembed_fetch` job. | Re-plan: job-based oEmbed fetch with optimistic placeholder thumbnail until job completes. |
| **Post integration** | Memory note `project_posts_feature_decisions.md`: "post + post_audience" schema is general | Actual `post` table has `group_id NOT NULL` — no `post_audience` table, no `entityRef` columns. PR-sharing-to-feed is NOT a drop-in. | Defer PR-sharing-to-post to V2; V1 = notification-only. |

---

## Dependencies

### Modules workouts directly depends on (imports from)

- `user` — for FKs (`owner_id`, `client_id`, etc.) and the `User` entity in includes.
- `client` — for `instructor_client.id` FK on `program_assignment` + ACTIVE-relationship lookups.
- `session` — for the optional `session_instance_id` FK on `workout_log`.
- `notification` — for `NotificationService` + `NotificationOutbox` + `NotificationType` enum.
- `search` — for `SearchIndexService` + `SearchEntityType` extension.
- `jobs` — for `JobsService.enqueue` + the new `Workouts` queue + worker base class.
- `common/services/cloudinary.service.ts` — for YouTube oEmbed thumbnail caching.
- `common/utils/text.utils.ts` — for `stripHtml` on exercise/program text fields.
- `common/utils/html.utils.ts` — for `escapeHtml` in email templates (PR-shared, program-assigned).
- `common/dto/pagination.dto.ts` — for `extends PaginationDto` on list DTOs.
- `common/guards/roles.guard.ts` + `common/decorators/roles.decorator.ts` — for `@Roles('INSTRUCTOR' | 'USER' | 'SUPER_ADMIN')`.

### Modules workouts integrates with as a producer (writes to)

- **`notification`** — `notify()` / outbox.flush() for 6 notification types (4 active + 2 cron-fired).
- **`search`** — `upsertExercise()` / `upsertProgram()` on create/update; `removeIfExists()` on soft-delete.
- **`jobs`** — `enqueue('workouts.due_today_scan', ...)` etc. from a cron service; `enqueue('workouts.youtube_oembed_fetch', ...)` on exercise create/update.
- **`cloudinary`** — uploads on YouTube thumbnail caching (via the oEmbed worker).

### Modules workouts can defer integration with

- **`post`** — PR-sharing-to-feed is a V2 conversation; V1 = notification only.
- **`messaging`** — no integration; URLs in message body are fine.
- **`payment`** — paid programs are out-of-scope.
- **`venue`** — workout_log uses free-text `location_text` instead of an FK in V1.
- **`group`** — group program assignment is explicit V2 scope.
- **`review`** — orthogonal.
- **`profile`** — no schema change.

---

## Concrete additions to existing modules

Before the workouts migration (047) ships, the following non-workouts files need to be edited or added.

### Add to `src/modules/notification/notification-types.ts`

```ts
// ── Workouts ─────────────────────────────────────────────
PROGRAM_ASSIGNED = 'PROGRAM_ASSIGNED',
EXERCISE_FORKED = 'EXERCISE_FORKED',
CLIENT_COMPLETED_WORKOUT = 'CLIENT_COMPLETED_WORKOUT',
CLIENT_SHARED_WORKOUT_RESULTS = 'CLIENT_SHARED_WORKOUT_RESULTS',
WORKOUT_DUE_TODAY = 'WORKOUT_DUE_TODAY',
WORKOUT_OVERDUE = 'WORKOUT_OVERDUE',
```

### Add to `src/modules/notification/notification-defaults.ts`

```ts
// ── Workouts ─────────────────────────────────────────────
[NotificationType.PROGRAM_ASSIGNED]: IN_APP_AND_EMAIL,
[NotificationType.EXERCISE_FORKED]: IN_APP_ONLY,
[NotificationType.CLIENT_COMPLETED_WORKOUT]: IN_APP_ONLY,
[NotificationType.CLIENT_SHARED_WORKOUT_RESULTS]: IN_APP_AND_EMAIL,
[NotificationType.WORKOUT_DUE_TODAY]: IN_APP_AND_PUSH,
[NotificationType.WORKOUT_OVERDUE]: IN_APP_AND_EMAIL,
```

### Add to `src/modules/search/entities/search-doc.entity.ts`

Extend the union type:

```ts
export type SearchEntityType =
  | 'user' | 'instructor' | 'group' | 'session' | 'tag' | 'post'
  | 'exercise' | 'program';
```

### Add to `src/modules/search/search-index.service.ts`

Two new methods: `upsertExercise(exerciseId, tx?)` and `upsertProgram(programId, tx?)`. Pattern is mechanical — see `upsertPost` ([search-index.service.ts#L286](../../../src/modules/search/search-index.service.ts#L286)) as the closest template.

Extend `reindexAll()` to include both new entity types.

### Add to `src/modules/search/dto/search-query.dto.ts`

```ts
export const SEARCH_ENTITY_FILTERS = [
  'all', 'people', 'instructors', 'groups', 'sessions', 'tags',
  'exercises', 'programs',
] as const;
```

### Add to `src/modules/search/search.service.ts`

Two branches in the `type → entity_type[]` mapping ([search.service.ts#L196-L207](../../../src/modules/search/search.service.ts#L196-L207)) and the rank-weight `CASE` ([search.service.ts#L148](../../../src/modules/search/search.service.ts#L148)). Suggested weights: `exercise: 1.1` (most-searched workouts entity), `program: 1.0`.

### Add to `src/modules/jobs/job-registry.ts`

```ts
export enum QueueName {
  Notifications = 'notifications',
  Workouts = 'workouts',
}

export interface JobPayloads {
  'notifications.email_send': { ... },
  'workouts.due_today_scan': Record<string, never>,
  'workouts.overdue_scan': Record<string, never>,
  'workouts.youtube_oembed_fetch': { exerciseId: string; youtubeUrl: string },
  'workouts.recurring_assignment_advance': { assignmentId: string },
}

export const QUEUE_DEFAULTS = {
  ...,
  [QueueName.Workouts]: {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5_000 },
      removeOnComplete: { age: 7 * 86_400, count: 5_000 },
      removeOnFail: { age: 30 * 86_400, count: 5_000 },
    },
  },
};
```

### Add to `src/modules/jobs/jobs.module.ts`

```ts
BullModule.registerQueue({
  name: QueueName.Workouts,
  defaultJobOptions: QUEUE_DEFAULTS[QueueName.Workouts].defaultJobOptions,
}),
```

Plus the four worker classes registered as providers.

### Add to `src/modules/jobs/workers/workouts/`

Four worker files (`due-today-scan.worker.ts`, `overdue-scan.worker.ts`, `youtube-oembed-fetch.worker.ts`, `recurring-assignment-advance.worker.ts`), each extending `BaseWorker<'workouts.X'>`.

### Add to `src/modules/jobs/bull-board.setup.ts`

Register the new `workouts` queue in the Bull Board UI mounts.

### Create `src/common/docs/exercise.docs.ts` + `src/common/docs/workout.docs.ts`

Per the `@ApiEndpoint` + per-module docs convention (CLAUDE.md "Key Patterns").

### Create the workouts module files (per `06-module-layout.md`)

Not in scope of this audit — that's the workouts research's job.

---

## Order of work

What must happen, what can run in parallel, what's blocking what.

### Phase 0 — pre-flight (not blocking, do at any time)

- Confirm next migration number with `git log --all --oneline migrations/ | head -20` once more right before authoring 047. (As of 2026-05-22 develop branch, **047 is free**.)
- Decide on the cron-trigger convention (recommended: `WorkoutsCronService` with `@Cron` decorators that call `jobsService.enqueue(...)`). This becomes a precedent for the upcoming session reminder dispatch worker too.

### Phase 1 — extend shared catalogs (parallelisable, low-risk)

These can land as a single small PR independent of workouts, or as the first commit of the workouts branch:

1. Add 6 notification types + defaults.
2. Extend `SearchEntityType` + `SEARCH_ENTITY_FILTERS`.
3. Add `Workouts` queue + 4 jobs to `job-registry.ts` + register in `jobs.module.ts`.

Land these first. They're isolated and reviewable on their own.

### Phase 2 — workouts migration (047)

The workouts schema migration. Includes:

- exercise + taxonomy tables
- program + prescription tables
- program_assignment + assigned_* tables
- workout_log + logged_* tables (with `session_instance_id` nullable FK)
- one_rep_max
- personal_record (new — expanded scope)
- self-authored workout tables (new — expanded scope; user-owned `workout` distinct from instructor-prescribed `assigned_workout`)
- All indexes + CHECK constraints

Depends on Phase 1 only insofar as the migration introduces enum values that the entities use — the migration itself is self-contained SQL.

### Phase 3 — workouts module code (the big one)

- Entities (Sequelize models)
- DTOs (with `extends PaginationDto` on list DTOs)
- Services (`ExerciseService`, `ProgramService`, `ProgramAssignmentService`, `WorkoutLogService`, `OneRepMaxService`, `PersonalRecordService`, `WorkoutTemplateService` for self-authored)
- Controllers (thin)
- Swagger docs files
- `workout/notifications.ts` + `exercise/notifications.ts` builders
- Search index call sites (`searchIndexService.upsertExercise(id)` etc.)
- Cron service (`WorkoutsCronService`) with `@Cron` triggers

Phase 3 parallelisable as: (Exercise+Taxonomy track) || (Program+Assignment track) || (Log+OneRepMax track) || (Self-authored+PR track).

### Phase 4 — workouts job workers

- `due-today-scan.worker.ts`
- `overdue-scan.worker.ts`
- `youtube-oembed-fetch.worker.ts`
- `recurring-assignment-advance.worker.ts`

Depends on Phase 3 services (workers call into them). Can land in the same PR or a follow-up.

### Phase 5 — exercise catalogue seed

Run `scripts/seed-exercises.ts` (per [04-locked-decisions.md](./04-locked-decisions.md) §11) against staging then prod. Idempotent. Not a migration — a script.

### Phase 6 — tests

Match the test coverage profile of the existing modules (CLAUDE.md "Test coverage"): service-layer unit tests for every business rule, integration tests for the copy-on-assign transaction, mocked-Stripe-style mocked-Cloudinary for the YouTube oEmbed worker.

### What is NOT in V1 (parking lot)

Pulled directly from [04-locked-decisions.md](./04-locked-decisions.md) "out of scope" + this audit's findings:

- Post/feed integration for PR-sharing (V2).
- Messaging entity attachments (V2 — messaging-module change).
- Group program assignment (V2).
- Public program library / marketplace (V2).
- Paid programs / Stripe Connect (V2).
- Achievements/badges build (architecture-aware, build deferred).
- Wearable / HealthKit sync (V3).
- Custom exercise video upload — YouTube URL only for V1.

---

## Summary

The workouts feature is **mostly additive** against the current backend. Five concrete touchpoints in existing modules (notification types + defaults, search entity types + index methods, jobs queue + workers + cron, optional `session_instance_id` FK on `workout_log`, role checks with `@Roles`) — all of them well-paved paths that other modules have already walked. The big risks are not in integration but in workouts' own internal complexity (copy-on-assign, %1RM resolution, three-layer snapshot fidelity, recurring assignment generation) — which are the workouts research's domain.

The single load-bearing drift from the original research: **migration 046 is gone (sessions rewrite took it); workouts is 047**.
