# Session Module — End-to-End Flows

> Living reference. Each phase of the build plan adds its flow here.
> Companion to the architecture notes in `docs/research/sessions/`.

---

## Table of contents

- [Template lifecycle](#template-lifecycle) — create, update, regenerate, delete (Phase A — shipped)
- [Instance lifecycle](#instance-lifecycle) — list, detail, cancel scope, reschedule (Phases B, D)
- [Booking lifecycle](#booking-lifecycle) — book, approve/decline, cancel-booking, waitlist auto-promote (Phase C)
- [Public surface](#public-surface) — discover, slug-resolved share links (Phase E)
- [Client utilities](#client-utilities) — /my, counts, .ics, join-info (Phase F)
- [Notifications](#notifications) — who fires, who hears, channel defaults (Phase G — partially shipped)

---

## Template lifecycle

The **template** is the "class concept" the instructor maintains. One-off
sessions are still a template with one instance. Recurring series are
one template + N generated instances. Templates own series-level state
(`status: ACTIVE | ENDED | CANCELLED`); instances own per-occurrence
state (`status: SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED`).

### Create (`POST /sessions/templates`)

1. DTO-validate (`@IsFutureOrCloseToNow` on `firstStartAt`, `@IsUrl({protocols:['https']})` on `meetingUrl`, `@MaxLength(4000)` on `description`, timezone, etc.).
2. Validate timezone against `Intl.supportedValuesOf('timeZone')`.
3. Defense-in-depth past-date check at service.
4. Sanitize `title` + `description` (`stripHtml` — drops `<script>` etc.).
5. **Ownership preflight (Phase A IDOR fix)**: if `venueId`, `VenueService.get(callerId, venueId)`. If `groupId`, `GroupService.getById(groupId, callerId)`. Each throws 404 on mismatch via `assertOwned({onMismatch:'hide'})` — no existence leak.
6. Open tx → generate unique slug (`<safe-title>` then `-2`, `-3`, … then random suffix) → insert template row.
7. If non-recurring → create 1 instance dated `firstStartAt`.
8. If recurring and `generateInitialInstances` (default 0 instances unless `initialInstancesCount` is set) → expand `recurrenceRule` via `RecurrenceService` and create N instance rows.
9. Commit tx; return `{ template, generatedInstances, warnings: [] }`.

### Regenerate (`POST /sessions/templates/:id/regenerate`)

For recurring templates only. Finds the latest existing `occurrenceIndex` and appends `count` more, capped by the rule's `endAfterOccurrences`. Idempotent: rerunning is safe — the unique constraint `(template_id, occurrence_index)` prevents duplicates.

### Update (`PATCH /sessions/templates/:id`)

Partial update of any non-immutable field. **`venueId`/`groupId` re-validated** for cross-instructor IDOR (Phase A). `meetingProvider` re-derived if `meetingUrl` changes. Does NOT touch already-generated instances — they keep their own snapshots.

### Delete (`DELETE /sessions/templates/:id`)

Atomically (single tx):

1. Update all future scheduled instances → `CANCELLED, cancelledAt=now`.
2. Update template → `status=ENDED, endedAt=now`.
3. Soft-delete (`deleted_at`) the template.

Past instances are preserved for history/reporting.

---

## Instance lifecycle

_Phase B will populate this section._

## Booking lifecycle

The participant lifecycle moves through five statuses on
`session_participant` (the row is **one per `(instance_id, user_id)`**,
enforced by a UNIQUE constraint — a returning user reactivates their
existing row instead of inserting a new one):

```
                          approvalRequired=true
              ┌─────────────────────────────────────────┐
   (no row)   │                                         ▼
      │       │                                  PENDING_APPROVAL
      │       │                                  /        \
      │   approvalRequired=false                / approve   \ decline
      │       │      cap reached?              /             \
      │       │       /        \              ▼               ▼
   book()─────┴──> CONFIRMED   WAITLISTED   CONFIRMED       DECLINED
                     │              │
                     │              │  oldest waitlister auto-promoted
                     │              │  ─── 2h pre-start cutoff ───
                     │              ▼
                     │           CONFIRMED
                     │
              cancel-booking
                     │
                     ▼
                CANCELLED  ← can rebook (reactivates this row in place)
```

### Book (`POST /sessions/instances/:id/book`)

1. Open tx, `SELECT … FOR UPDATE` on the instance with template eager-loaded.
2. Preconditions: caller != instructor, template ACTIVE, instance SCHEDULED, `startAt > now`.
3. Evaluate access (`SessionAccessService`) — 403 if not eligible / not participating.
4. Look up existing participant row (lock).
   - If non-terminal → 409 `ALREADY_BOOKED`.
   - If terminal (CANCELLED / DECLINED) → reactivate in place: status, snapshot, bookingNote replaced; old timestamps cleared.
5. Decide target status:
   - `approvalRequired=true` → PENDING_APPROVAL.
   - else, if `(confirmedCount + pendingApprovalCount) < cap` → CONFIRMED.
   - else if `waitlistEnabled` → WAITLISTED.
   - else → 409 `CAPACITY_HIT_NO_WAITLIST`.
6. Build snapshot (price, currency, cancel cutoff, meeting URL) and persist.
7. Increment the denormalised counter for the target status.
8. If CONFIRMED, schedule 24h + 1h reminder rows (no-op if startAt is within the kind's offset).
9. Outbox: notify user (booking outcome) + notify instructor (PARTICIPANT_JOINED, in-app only).
10. Commit → `outbox.flush()`.

### Cancel-booking (`POST /sessions/instances/:id/cancel-booking`)

1. Lock instance + template. Reject if instance not SCHEDULED.
2. Find the caller's participant row, lock it. 404 if missing, 409 if already terminal.
3. Compute `WITHIN_WINDOW | OUTSIDE_WINDOW` from `participant.snapshotCancelCutoffH` — **not** the live template. Terms-as-booked are immutable.
4. Update participant: status=CANCELLED, cancelReason, cancelledAt; decrement counter; delete unsent reminder rows.
5. **Auto-promote** (only if previous status was CONFIRMED and `waitlistEnabled`):
   - WaitlistService re-reads the live `confirmedCount` (defense-in-depth against shrunken caps).
   - Refuses to promote inside `startAt - 2h`.
   - Selects oldest waitlister `ORDER BY bookedAt ASC`, locks them, flips to CONFIRMED, schedules reminders.
6. Outbox: notify instructor (PARTICIPANT_LEFT), notify promoted user if any (SESSION_STATUS_CHANGED).
7. Commit → flush.

**Known quirk: a PENDING cancellation does not auto-promote a waitlister.** The pending row was a soft hold (not a real seat). When `approvalRequired=true` AND `waitlistEnabled=true` (uncommon combination), the queue is processed by the instructor through approve/decline, not by the waitlist service.

### Approve / Decline / Patch (instructor)

- **Approve**: PENDING → CONFIRMED. If `confirmedCount >= cap` since the pending row was created (e.g. capacity shrank, or another pending was approved), routes to WAITLISTED (if enabled) or DECLINED.
- **Decline**: PENDING → DECLINED with optional reason shown to the client.
- **Patch**: instructor sets `attended` (only after `startAt`) and/or `privateNote`. Private note is HTML-stripped server-side, owner-only on read.

### Capacity = `instance.capacityOverride ?? template.capacity ?? null`

Null means uncapped. Capacity-shrink validation arrives in Phase D — Phase C does not allow shrinking capacity below the existing confirmed count.

### Counters

`confirmedCount`, `pendingApprovalCount`, `waitlistedCount` on `session_instance` are denormalised. Every status transition adjusts them in the same tx as the participant row. The `attendedCount` column is written post-session only (Phase G). Drift recovery is *not* implemented in v1 — if drift becomes a real problem, a nightly reconciliation script becomes a follow-up.

### Race condition strategy

`SELECT … FOR UPDATE` on the instance row, then the participant row. Two concurrent `book()` calls on capacity=1 serialise: the first acquires both locks, inserts CONFIRMED, increments to 1. The second blocks on the instance lock; when released, it re-reads `confirmedCount=1` and routes to WAITLISTED (or 409). The unit test for this case is mock-serialised; real concurrency requires a DB integration test.

## Public surface

_Phase E will populate this section._

## Client utilities

_Phase F will populate this section._

## Notifications

The session module declares **7 notification types** in
`notification-types.ts`. Defaults (from `notification-defaults.ts`):

| Type | Channels | Notes |
|---|---|---|
| `SESSION_REMINDER_24H` | in-app + email + push | Worker dispatches T-24h |
| `SESSION_REMINDER_1H` | in-app + push | Worker dispatches T-1h |
| `SESSION_CANCELLED` | in-app + email + push | Affects user's plans |
| `SESSION_RESCHEDULED` | in-app + email + push | Affects user's plans |
| `SESSION_STATUS_CHANGED` | in-app only | Informational lifecycle |
| `PARTICIPANT_JOINED` | in-app only | Roster churn, instructor-facing |
| `PARTICIPANT_LEFT` | in-app only | Roster churn, instructor-facing |

Builders live in `notifications.ts`. They take **primitives only** (id,
name, Date) — never Sequelize entities, to avoid lazy-association
explosions when an outbox flushes after commit.

**Outbox pattern** (`notification/notification-outbox.ts`):

```ts
// inside the booking tx:
outbox.add(participantJoinedForInstructor(instructorId, userName, session));
// after tx.commit():
await outbox.flush();
// on rollback: outbox automatically discards (nothing was flushed).
```

**Cadence rules** (the "send when good to send" part):

- **Reminders** dedupe via the DB `UNIQUE (participant_id, kind)` on `session_reminder_schedule`.
- **Series cancellations** fan out to `DISTINCT user_id` across affected participants — one notification per person, not one per affected instance.
- **Auto-promote** fires exactly once per promotion (workflow inside the cancel-booking tx).
- **Instructor's own action never notifies themselves** — booking own session is rejected at the service layer.
