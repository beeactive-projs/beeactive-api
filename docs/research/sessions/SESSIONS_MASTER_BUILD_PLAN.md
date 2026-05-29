# Sessions — Master Build Plan (Backend)

> **Date:** 2026-05-15
> **Status:** living plan; updated after each phase audit.
> **Companions:** `SESSIONS_AUDIT_2026-05-15.md` (defect list), `SESSIONS_DESIGN_VS_PLAN.md` (design ↔ research reconcile), `SESSIONS_CONTEXT.md` (history of the module before migration 046).

This plan turns the audit findings into shippable phases. Each phase produces a small, reviewable PR (~250-700 LOC including tests). After each phase, a structured **stage audit** is run before opening the next phase. Phases are designed so the FE work can begin against the API as soon as Phase B lands — earlier phases are foundation, later phases are independent surfaces.

---

## 0. Operating principles (apply to every phase)

These are *non-negotiable rules* drawn from CLAUDE.md and from the audit. They shape every endpoint, service method, and test.

### 0.1 Code-quality rules

- **Thin controllers.** Controller method = unwrap req → call service → return. No HTML rendering, no field-picking, no DTO branching. If a controller grows past ~10 lines of body, push logic into the service.
- **DTOs over `@Query` strings.** Anything that paginates `extends PaginationDto`. Anything beyond a single slug/token gets a DTO with class-validator.
- **ParseUUIDPipe on every `:id` param.** Never `@Param('id') id: string` raw.
- **Strict types, no `any`.** Use `unknown` + narrowing, or declare an interface.
- **One file per concern.** Service per responsibility. Don't grow a 1300-line god service like the legacy `session.service.ts` was — split when crossing ~400 LOC.
- **`@ApiEndpoint(SessionDocs.x)`.** Per-endpoint Swagger docs go to `src/common/docs/session.docs.ts`. Inline `@ApiEndpoint({...})` blocks are forbidden.

### 0.2 Database & transactions

- **Always use transactions** for multi-table writes. Pass `{ transaction: tx }` to every ORM call inside.
- **`SELECT … FOR UPDATE`** (pessimistic lock) on the instance row whenever participants change (book, cancel-booking, promote). Same pattern as the legacy `joinSession`.
- **Op.iLike** not `Op.like` (Postgres).
- **JSON `@>` / `?`** operators when filtering JSONB, never MySQL syntax.
- **Maintain denormalised counters atomically.** `session_instance.confirmed_count`, `pending_approval_count`, `waitlisted_count`, `attended_count` are mutated in the same tx as the participant insert/update. Never recompute from a JOIN at read time.

### 0.3 Avoiding N+1 (the core efficiency rule)

- **Every list endpoint that returns nested objects MUST use `include:` with explicit `attributes:` allowlists.** Eager-load: `instructor` (id, firstName, lastName, avatarUrl), `venue` (id, name, city), `group` (id, name, slug). Never lazy-load inside a `.map()`.
- **Counts come from denormalised columns**, not from `COUNT(*)` over participants. If we need a count, it lives on the parent row and is incremented/decremented in the booking flow.
- **Aggregations get their own endpoint.** Profile badges → `GET /sessions/my/counts` returns `{ upcoming, pendingApproval, past, cancelled }` (4 small queries, none of them paginated, no participant payload). Mirror the existing `GET /payments/my/counts` pattern.
- **Page size limits.** `@Min(1) @Max(100)` on every limit. No way to ask for "all".
- **`raw: false` only when you need entity behavior.** Otherwise prefer `raw: true` + `nest: true` for read-mostly lists — half the memory of full hydrated models.
- **Avoid `findAll` without where.** Every read gets a scope (instructor_id, date range, status). Even "discover" caps to "next 90 days".
- **Indexes already exist** from migration 046 — verify each new query uses one via `EXPLAIN`. Add indexes when adding new filter dimensions.

### 0.4 Caching policy

For sessions specifically:

- **No request-scoped caching in services** (data changes too fast — participant counters move on every book).
- **HTTP-level caching only for public read endpoints** that are anonymous-readable:
  - `GET /sessions/discover` → `Cache-Control: public, max-age=60`
  - `GET /sessions/public/:instructorSlug/:templateSlug` → `Cache-Control: public, max-age=120`
  - `GET /sessions/instances/:id/public` → same as above
  - Everything else: `Cache-Control: no-store`.
- **No Redis caching layer in v1.** Postgres + denormalised counters + good indexes is enough at our scale. Revisit if a profiler ever shows N+1 on a hot path.

### 0.5 Security checklist (applied per endpoint)

When introducing a new endpoint:

1. Auth required? (`AuthGuard('jwt')`) or explicitly `@Public()`?
2. Role-gated? (`@Roles('INSTRUCTOR'…)`)
3. Owner-scoped? Use `assertOwned(entity, callerId, e => e.instructorId, { onMismatch: 'hide' })` — **already exists at [src/common/utils/ownership.utils.ts](../../../src/common/utils/ownership.utils.ts)**.
4. `ParseUUIDPipe` on every `:id` param.
5. Rate-limited via `@Throttle()`?
6. Inputs validated by class-validator? URLs `IsUrl({ protocols: ['https'] })`?
7. Outputs free of PII the caller shouldn't see? (private notes, foreign user emails, etc.)
8. Errors return stable codes? Use the standard error shape; codes go in error `message` or a separate `code` field.
9. Cross-tenant access policy explicit? 404 for "exists but not yours" (avoid existence leak).
10. Audit logging — for sensitive writes (approve, decline, refund, etc.), log who did what to which entity with a request ID.

### 0.6 Notification cadence (per `notification-defaults.ts`)

The defaults map is already authored. Adhere to it:

| Type | Channels | When fired |
|---|---|---|
| `SESSION_REMINDER_24H` | in-app + email + push | T-24h from `start_at`, scheduled at booking, dispatched by worker (jobs module pending) |
| `SESSION_REMINDER_1H` | in-app + push | T-1h, same lifecycle |
| `SESSION_CANCELLED` | in-app + email + push | When instance moves to CANCELLED (single, scope=this, thisAndFuture, series) |
| `SESSION_RESCHEDULED` | in-app + email + push | When `start_at` changes on an instance (reschedule flow) |
| `SESSION_STATUS_CHANGED` | in-app only | Lifecycle (SCHEDULED→IN_PROGRESS→COMPLETED). Informational. |
| `PARTICIPANT_JOINED` | in-app only (instructor) | Someone booked. Noisy, do not email. |
| `PARTICIPANT_LEFT` | in-app only (instructor) | Someone cancelled. Same. |

**Deduplication rules** (the "don't send too many" part):

- **Reminders are idempotent by `(participant_id, kind)`** — DB UNIQUE prevents double-scheduling.
- **Cancel + reschedule on the same instance within 60 seconds** → coalesce: send only the reschedule (the cancel is redundant once the new time is set).
- **Cascade cancellations** (series cancel → 50 instances cancel → 200 participants notified) → fire **one notification per participant**, not one per instance. Build the audience by `DISTINCT user_id` across all affected participants in the same tx.
- **Auto-promote from waitlist** → fires `BOOKING_PROMOTED` (new type, deferred to Phase G) once per promotion, never spam if multiple seats open.
- **Instructor's own action never triggers a notification to themselves.** (Booking your own session is rejected at the service layer anyway.)

### 0.7 NotificationOutbox usage (the "send when it's good to be sent" rule)

`notify()` opens its own transaction. Calling it inside the booking tx and then rolling back leaves an orphan alert. So:

- Inside the tx callback → `outbox.add(builder(...))`.
- After `tx.commit()` → `outbox.flush()`.
- After `tx.rollback()` → `outbox.discard()` (automatic on a fresh outbox if `flush` was never called).

Builder functions live in `src/modules/session/notifications.ts`. They take **primitives only** (id, name, dates, cents), never Sequelize entities — entities have lazy associations that fail with cryptic errors when an outbox flushes after commit.

---

## 1. Module shape after all phases

Targeted final layout. Compare to the legacy 1300-line `session.service.ts`; this is a deliberate decomposition.

```
src/modules/session/
├── session.module.ts                  # wires everything, imports Notification + Venue + Group + Client services
├── controllers/
│   ├── session-template.controller.ts # /sessions/templates/*           (instructor)
│   ├── session-instance.controller.ts # /sessions/instances/*           (instructor + participant)
│   ├── session-booking.controller.ts  # /sessions/instances/:id/book... (client)
│   ├── session-discover.controller.ts # /sessions/discover, /sessions/public/*  (@Public + authed)
│   └── session-my.controller.ts       # /sessions/my, /sessions/my/counts (client)
├── services/
│   ├── session-template.service.ts    # template CRUD (already exists)
│   ├── session-instance.service.ts    # instance list/detail/cancel/reschedule
│   ├── session-booking.service.ts     # book/cancel-booking/approve/decline (transactional + lock)
│   ├── session-waitlist.service.ts    # auto-promote on cancel
│   ├── session-conflict.service.ts    # detect overlapping instances
│   ├── session-access.service.ts      # access checks (CLIENTS_ONLY / GROUP_ONLY) + redaction
│   ├── session-discover.service.ts    # public + authed discover
│   ├── session-ics.service.ts         # iCalendar generation
│   ├── recurrence.service.ts          # already exists
│   └── *.spec.ts                      # one per service
├── entities/                          # already exists
├── dto/                               # already exists; will grow
├── notifications.ts                   # NEW — builders for the 7 declared session NotificationTypes
├── SESSION-FLOWS.md                   # NEW — book / cancel / promote walkthrough
└── README.md                          # NEW — module overview + reading order
```

Service responsibilities are intentionally narrow. `SessionBookingService` does not query templates directly — it asks `SessionInstanceService.getById(...)` which already eager-loads the template. This keeps each service unit-testable in isolation.

---

## 2. Phase A — Security hardening + standards alignment

**Goal:** plug the live defects from the audit and align the module with project conventions, without adding any new endpoint.

**Estimated size:** ~350 LOC. **Estimated time:** 1 working day.

### 2.1 Defects to fix

| # | Issue | Fix |
|---|---|---|
| S1 | IDOR on `venueId`/`groupId` | Inject `VenueService` + `GroupService`. Add `assertVenueOwnedByInstructor(venueId, instructorId)` and `assertGroupOwnedByInstructor(groupId, instructorId)`. Call from create + update. Use `assertOwned(…, onMismatch: 'hide')` from common/utils. |
| S2 | No past-date guard on `firstStartAt` | DTO: custom validator `@IsFutureOrCloseToNow({ skewMinutes: 5 })`. Service: re-check in case of clock skew between FE and BE. |
| S3 | HTML/script not sanitized in `title`/`description` | Use `sanitize-html` (add as dep). Centralize in `common/utils/text.utils.ts` as `stripHtml(s, maxLen)` returning plain text. Apply in service on create + update for `title` and `description`. |
| S4 | `meetingUrl` allows http | Switch to `@IsUrl({ protocols: ['https'], require_tld: true })` in both create + update DTOs. |
| S5 | `description` is unbounded TEXT | DTO: `@MaxLength(4000)`. |
| S6 | `preview-recurrence` returns 201 | Add `@HttpCode(200)` to the controller method. |
| S7 | DB schema uses `timestamp without time zone` | **Defer to a follow-up migration.** Out of Phase A scope; the legacy 045 migration moved messaging to `timestamptz`. Add as work item; do NOT mix into security fix PR (separation of concerns). |

### 2.2 Standards alignment

- Move the lone controller into `controllers/session-template.controller.ts` to make room for sibling controllers in later phases.
- Move services into `services/` subdir. Update imports.
- Add `notifications.ts` skeleton with **stub builders** (just typed functions that return `NotifyParams`). They don't fire yet — Phase G wires them in. Stubbing now lets later phases just `import` them, no churn.
- Add `SESSION-FLOWS.md` placeholder (1 paragraph + TOC) — will grow per phase.
- Add module entry to root `CLAUDE.md` under "Module Pattern" → "Session Module Shape" (mirror what `PaymentModule` has).

### 2.3 Tests added (Phase A)

| # | Spec | Asserts |
|---|---|---|
| A1 | template-service.spec | foreign `venueId` → 404 (IDOR fix) |
| A2 | template-service.spec | foreign `groupId` → 404 (IDOR fix) |
| A3 | template-service.spec | own `venueId` → 201 (regression) |
| A4 | create-template.dto.spec | past `firstStartAt` → 400 |
| A5 | create-template.dto.spec | `firstStartAt` -3 minutes → 201 (skew window) |
| A6 | template-service.spec | XSS-shaped `title` → stored without `<script>` (sanitization) |
| A7 | create-template.dto.spec | `description` 4001 chars → 400 |
| A8 | create-template.dto.spec | `http://...` meetingUrl → 400 |
| A9 | template-controller.spec | `POST /preview-recurrence` returns 200 |

### 2.4 Phase A — stage audit

After implementation:

- [ ] **Live curl reproduction** of the 3 audit findings — all now fail closed.
- [ ] `npm test` passes; coverage report shows the 9 new tests.
- [ ] `EXPLAIN ANALYZE` on the most expensive query (`POST /sessions/templates` insert path) — confirm no full table scans introduced.
- [ ] `grep -n "any" src/modules/session/` — zero (excluding `// ESLint-disable` for justified spots).
- [ ] `grep -rn "TODO\|FIXME" src/modules/session/` — empty or each one has a follow-up issue number.
- [ ] Swagger UI loads at `/api/docs` and the 7 endpoints render with examples.
- [ ] No new dependencies beyond `sanitize-html` + types.

### 2.5 Acceptance gate

Phase B does not start until Phase A:
- ✅ All 9 new tests pass
- ✅ IDOR repro returns 404
- ✅ Sanitization confirmed (title stripped, description capped)
- ✅ Module README + flows skeleton present

---

## 3. Phase B — Instance read surface

**Goal:** the calendar + detail FE pages have an API to read. Unblocks all FE work.

**Estimated size:** ~500 LOC. **Estimated time:** 2 working days.

### 3.1 Endpoints added

| Endpoint | Auth | Returns | Notes |
|---|---|---|---|
| `GET /sessions/instances` | JWT (any) | Paginated list. Scoped: instructor sees own; non-instructor sees only instances they participate in. | filters: `dateFrom`, `dateTo`, `instructorId`, `templateId`, `status`, `view=week|day|month`. Default 7-day window. Max 100. |
| `GET /sessions/instances/:id` | JWT (any) | Full instance with eager-loaded template (allowlist), instructor (id, name, avatar), venue summary, participant count + first 10 participants (for instructor) or empty (for participant). | 404 for visibility-denied (no existence leak). |
| `GET /sessions/instances/:id/participants` | JWT, instructor-only | Paginated participants list. | Owner-only. Needed to keep `:id` payload small but still let the detail page paginate to "all participants". |

### 3.2 Service work

- New service `SessionInstanceService` (separate file). Responsibilities:
  - `listForCaller(callerId, filters)` — uses two query strategies under the hood: instructor scope (joins instance via instructor_id) OR participant scope (joins via session_participant.user_id). Service auto-selects based on whether `filters.instructorId === callerId`. **One query each path, no N+1.**
  - `getByIdForCaller(callerId, instanceId)` — eager-loads template + instructor + venue. Calls `SessionAccessService.canView(instance, caller)`. 404 if not.
  - `listParticipants(instructorId, instanceId, page, limit)` — owner-gated. Returns `{ id, userId, status, attended, bookedAt, user: {id, firstName, lastName, avatarUrl} }`. **No private_note in this shape** — that field is only returned via `GET /sessions/instances/:id` (which also enforces owner) — keep one path that exposes private_note, not two.
- New service `SessionAccessService` (~80 LOC). Single-purpose: given `instance + caller`, return `{ canView, isOwner, isParticipant, isEligible }`. Used by both detail and discover. **One source of truth for visibility.**

### 3.3 Effective-value resolution

Instance overrides (`titleOverride`, `descriptionOverride`, etc.) need to be resolved into `effectiveTitle`, etc. at the service layer, not at the API consumer. Use the existing `common/utils/effective-value.util.ts` helper (already present) — example:
```ts
import { resolveEffective } from '../../../common/utils/effective-value.util';
const effectiveTitle = resolveEffective(instance.titleOverride, template.title);
```

API response shape includes both raw and resolved values:
```json
{
  "id": "...",
  "title": "Morning Yoga",                    // resolved
  "titleOverride": null,                      // raw override (null = inherited)
  "venue": { "id": "...", "name": "..." },    // resolved
  "venueIdOverride": null
}
```

### 3.4 N+1 mitigation explicit

| Risk | Mitigation |
|---|---|
| Listing 50 instances → 50 queries for venue, 50 for template, 50 for instructor | Single `findAndCountAll({ include: [ {Template, …}, {Venue, …}, {Instructor, attributes: [id, firstName, lastName, avatarUrl]} ] })` |
| Participant count per instance | Already denormalised on `session_instance.confirmed_count` etc. — return them in the row, don't re-aggregate. |
| First 10 participants per instance | Done in `getByIdForCaller` via single `include` with `limit: 10` on `participants`. NOT done in the list endpoint — too costly. |
| Status filter "I'm attending" | Driven by a single JOIN to `session_participant WHERE user_id = caller AND status IN (CONFIRMED, PENDING_APPROVAL, WAITLISTED)` — index `idx_sp_user_status` already exists. |

### 3.5 Tests added (Phase B)

| # | What | Asserts |
|---|---|---|
| B1 | instance-service.spec | instructor sees own instances |
| B2 | instance-service.spec | USER sees only participated instances |
| B3 | instance-service.spec | OPEN instance visible to USER who hasn't booked |
| B4 | instance-service.spec | GROUP_ONLY hidden from non-member |
| B5 | instance-service.spec | redacted detail for blocked caller (returns title+startAt only) |
| B6 | instance-service.spec | eager-load shape — single SQL, asserted via mock spy count |
| B7 | instance-service.spec | date range bounds enforced (180-day max) |
| B8 | instance-controller.spec | participants endpoint owner-only |

### 3.6 Phase B — stage audit

- [ ] **N+1 audit:** wrap test calls in `sequelize.addHook('beforeQuery')` and assert query count ≤ 3 for `GET /sessions/instances` with 50 rows.
- [ ] `EXPLAIN ANALYZE` on the calendar-shaped query: `WHERE instructor_id = X AND start_at BETWEEN Y AND Z ORDER BY start_at` — must use `idx_si_instructor_start`.
- [ ] curl: list with no filters, list with date range, list as non-participant USER → empty, list as participant USER → 1 row, detail as non-owner → redacted, detail with malformed UUID → 400.
- [ ] Verify no `private_note` ever appears in a non-owner response (grep test).
- [ ] Open Swagger → 3 new endpoints render with examples.
- [ ] Run live IDOR check from Phase A — still failing closed.

---

## 4. Phase C — Booking flow (the hardest)

**Goal:** clients can book sessions. Instructors can approve/decline. The product becomes real here.

**Estimated size:** ~700 LOC. **Estimated time:** 4 working days (race conditions and edge cases).

### 4.1 Endpoints

| Endpoint | Auth | Body | Returns | Notes |
|---|---|---|---|---|
| `POST /sessions/instances/:id/book` | JWT (any) | `{ bookingNote? }` | `{ status: 'CONFIRMED' \| 'PENDING_APPROVAL' \| 'WAITLISTED', participantId }` | Throttle 5/min/user; FOR UPDATE on instance. |
| `POST /sessions/instances/:id/cancel-booking` | JWT (own booking) | `{ reason?, message? }` | `{ status: 'CANCELLED', cancellation: 'WITHIN_WINDOW'\|'OUTSIDE_WINDOW', promotedUserId? }` | Uses snapshot cutoff, not template. |
| `POST /sessions/instances/:id/participants/:participantId/approve` | JWT, instructor | `{}` | `{ status: 'CONFIRMED' \| 'WAITLISTED' }` | If capacity hit since pending, lands as WAITLISTED. |
| `POST /sessions/instances/:id/participants/:participantId/decline` | JWT, instructor | `{ reason? }` | `{ status: 'DECLINED' }` | |
| `PATCH /sessions/instances/:id/participants/:participantId` | JWT, instructor | `{ attended?, privateNote? }` | participant row | Allowed only after `start_at`. |

### 4.2 Booking service core algorithm

```ts
async book(callerId, instanceId, dto): Promise<BookResult> {
  return sequelize.transaction(async (tx) => {
    // 1. Lock the instance row
    const instance = await Instance.findOne({
      where: { id: instanceId },
      include: [{ model: Template, required: true }],
      lock: tx.LOCK.UPDATE,
      transaction: tx,
    });
    if (!instance) throw new NotFoundException();

    // 2. Reject preconditions (no notifications fired yet)
    if (instance.instructorId === callerId)
      throw new BadRequestException('Cannot book your own session');
    if (instance.status !== 'SCHEDULED')
      throw new ConflictException('Session not bookable');
    if (instance.startAt <= new Date())
      throw new ConflictException('Session already started');

    // 3. Access check
    await accessService.assertCanBook(instance, callerId, tx);

    // 4. Idempotency — duplicate booking?
    const existing = await Participant.findOne({
      where: { instanceId, userId: callerId },
      transaction: tx,
    });
    if (existing && !['CANCELLED', 'DECLINED'].includes(existing.status))
      throw new ConflictException('ALREADY_BOOKED');
    // (Reactivate a CANCELLED row in place if found — reuses the unique-constraint slot.)

    // 5. Decide target status
    const cap = effectiveCapacity(instance);
    const activeCount =
      instance.confirmedCount + instance.pendingApprovalCount;
    let targetStatus: ParticipantStatus;
    if (instance.template.approvalRequired) {
      targetStatus = 'PENDING_APPROVAL';
    } else if (cap == null || activeCount < cap) {
      targetStatus = 'CONFIRMED';
    } else if (instance.template.waitlistEnabled) {
      targetStatus = 'WAITLISTED';
    } else {
      throw new ConflictException('CAPACITY_HIT_NO_WAITLIST');
    }

    // 6. Build snapshot fields from CURRENT template values
    const snapshot = buildSnapshot(instance.template, instance);

    // 7. Insert (or reactivate)
    const participant = await upsertParticipant({
      existing, instanceId, userId: callerId,
      status: targetStatus,
      bookingNote: dto.bookingNote ?? null,
      ...snapshot,
    }, tx);

    // 8. Bump denormalised counter atomically
    await incCounter(instanceId, targetStatus, tx);

    // 9. Schedule reminders if CONFIRMED
    if (targetStatus === 'CONFIRMED') {
      await scheduleReminders(participant, instance, tx);
    }

    // 10. Queue notifications post-commit
    outbox.add(bookingForUser(callerId, instance, targetStatus));
    outbox.add(participantJoinedForInstructor(
      instance.instructorId, callerId, instance,
    ));

    return { status: targetStatus, participantId: participant.id };
  }).then(async (result) => {
    await outbox.flush();
    return result;
  });
}
```

### 4.3 Cancel-booking algorithm (auto-promote)

```ts
async cancelBooking(callerId, instanceId, dto): Promise<CancelResult> {
  return sequelize.transaction(async (tx) => {
    const instance = await Instance.findOne({
      where: { id: instanceId },
      lock: tx.LOCK.UPDATE, transaction: tx,
    });
    if (!instance) throw new NotFoundException();
    const participant = await Participant.findOne({
      where: { instanceId, userId: callerId },
      transaction: tx,
    });
    if (!participant) throw new NotFoundException();
    if (['CANCELLED', 'DECLINED'].includes(participant.status))
      throw new ConflictException('Already cancelled');

    // Cutoff math from the snapshot, not the template (terms-as-booked)
    const cutoffMs = participant.snapshotCancelCutoffH * 3600_000;
    const withinWindow = (instance.startAt.getTime() - Date.now()) > cutoffMs;

    const oldStatus = participant.status;
    await participant.update({
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: dto.reason ?? null,
    }, { transaction: tx });

    await decCounter(instanceId, oldStatus, tx);
    await deleteReminderRows(participant.id, tx);

    let promotedUserId: string | null = null;
    if (oldStatus === 'CONFIRMED' && instance.template.waitlistEnabled) {
      promotedUserId = await waitlistService.tryPromote(instance, tx);
    }

    outbox.add(bookingCancelledForUser(callerId, instance));
    outbox.add(participantLeftForInstructor(
      instance.instructorId, callerId, instance,
    ));
    if (promotedUserId) {
      outbox.add(bookingPromoted(promotedUserId, instance));
    }

    return {
      status: 'CANCELLED',
      cancellation: withinWindow ? 'WITHIN_WINDOW' : 'OUTSIDE_WINDOW',
      promotedUserId,
    };
  }).then(async (result) => {
    await outbox.flush();
    return result;
  });
}
```

### 4.4 Waitlist promotion (no double-promote)

`SessionWaitlistService.tryPromote(instance, tx)`:

1. Reject if `now() >= startAt - 2h` (industry-standard pre-start cutoff).
2. `SELECT … FROM session_participant WHERE instance_id = X AND status = 'WAITLISTED' ORDER BY booked_at LIMIT 1 FOR UPDATE` — same tx.
3. Flip to CONFIRMED, increment counter, schedule reminders, return their userId.
4. If no one waiting → return null.

The whole operation is inside the parent tx, so a rollback discards the promotion atomically.

### 4.5 Approve/decline flow

Approve:
- Owner-only.
- Re-check capacity. If full, land as WAITLISTED (and notify user that they're now waiting).
- Decrement `pending_approval_count`, increment target counter.
- Schedule reminders if CONFIRMED.

Decline:
- Owner-only.
- Decrement `pending_approval_count`.
- Notify user (in-app + email — they were waiting on this decision).

### 4.6 Counter sanity guard

Every counter mutation goes through:
```ts
async function incCounter(instanceId, status, tx) {
  const field = STATUS_TO_COUNTER[status];
  if (!field) return;
  await Instance.increment(field, { where: { id: instanceId }, transaction: tx });
}
```
This keeps the field name table-driven and prevents typos. The list of fields is `{ PENDING_APPROVAL: 'pendingApprovalCount', CONFIRMED: 'confirmedCount', WAITLISTED: 'waitlistedCount' }`. Add a periodic check job (Phase G+) that reconciles `COUNT(*)` against the column for the previous 24h, alerts on drift.

### 4.7 Tests added (Phase C)

15+ tests:

| # | What |
|---|---|
| C1 | book → CONFIRMED when capacity available |
| C2 | book → PENDING_APPROVAL when `approvalRequired=true` |
| C3 | book → WAITLISTED when capacity hit + waitlist enabled |
| C4 | book → 409 `CAPACITY_HIT_NO_WAITLIST` when capacity hit + waitlist disabled |
| C5 | book → 400 self-booking blocked |
| C6 | book → 409 double-book blocked |
| C7 | book → reactivates a CANCELLED row in place (unique-constraint reuse) |
| C8 | book — race condition: 2 simultaneous bookings on capacity=1 → one CONFIRMED, one WAITLISTED |
| C9 | cancel-booking — within window flag correct |
| C10 | cancel-booking — auto-promotes the oldest waitlister |
| C11 | cancel-booking — does NOT auto-promote inside 2h of start |
| C12 | cancel-booking — counter decrements correctly |
| C13 | approve — capacity check honored (lands as WAITLISTED if full) |
| C14 | decline — moves to DECLINED, notifies user |
| C15 | snapshot immutability — booking after a template price change still reflects original snapshot |
| C16 | counter reconciliation — denorm matches COUNT(*) for a series of book/cancel ops |
| C17 | private_note never appears in non-owner response |

### 4.8 Phase C — stage audit

- [ ] **Race condition test** (C8) passes 100/100 runs with concurrent transactions.
- [ ] **EXPLAIN** on the booking SELECT FOR UPDATE — uses primary key, sub-millisecond.
- [ ] **Counter drift check**: after a 50-step random book/cancel/promote script, denorm columns equal `COUNT(*)` per status. (Add as a one-off integration test.)
- [ ] **Notification audit**: trigger 1 cancellation of a 30-person session. Observe exactly 30 SESSION_CANCELLED events queued, plus 1 PARTICIPANT_LEFT to instructor. Not 30 × 30, not 30 to instructor.
- [ ] **N+1 audit** on book endpoint: query count = 6 (lock, dup-check, snapshot, insert, increment, reminder rows). Asserted in unit test via spy.
- [ ] **Live curl + verify in DB**: book session, cancel, see waitlister promoted, see reminder rows deleted then re-inserted for promoted user.

---

## 5. Phase D — Cancel/reschedule scopes + conflict detection + overrides

**Goal:** instructor can cancel single occurrence, this+future, or whole series. Edit per-occurrence overrides. Conflict warnings on save.

**Estimated size:** ~500 LOC. **Estimated time:** 2 working days.

### 5.1 Endpoints

| Endpoint | Body | Behavior |
|---|---|---|
| `POST /sessions/instances/:id/cancel` | `{ scope: 'this'\|'thisAndFuture'\|'series', reason?, message?, rescheduleTo? }` | Bulk-cancel per scope; notify each affected participant exactly once. |
| `POST /sessions/instances/:id/reschedule` | `{ newStartAt, message? }` | Update `start_at` + `end_at` (preserving duration); fires SESSION_RESCHEDULED to all CONFIRMED + PENDING + WAITLISTED. Recomputes conflicts. |
| `PATCH /sessions/instances/:id` | (subset of fields) | Sets `isOverride=true` and the matching `*Override` columns. Capacity-shrink below confirmed count → 400. |

### 5.2 Conflict service

`SessionConflictService.recomputeFor(instructorId, instanceId, tx)`:
1. Find all of caller's other instances with `start_at` within ±2h of this instance's `start_at`.
2. Build the set of overlapping ids.
3. Update `conflicting_instance_ids` on this row AND on each peer.
4. Return `{ code: 'CONFLICT', instanceIds }[]` for surfacing as warnings.

Conflicts are non-blocking. Save succeeds either way. FE shows a warning banner.

### 5.3 Cancel scopes

- `this`: only this instance → CANCELLED.
- `thisAndFuture`: this and every instance with `start_at >= this.start_at` and `template_id = this.template_id`, status='SCHEDULED'.
- `series`: same as above but also flip template `status = CANCELLED`. Past instances untouched.

Notification fan-out is `DISTINCT user_id` over all impacted participants — one cancellation notice each, regardless of how many of their bookings were affected.

### 5.4 Tests added (Phase D)

| # | What |
|---|---|
| D1 | cancel scope=this → only this row |
| D2 | cancel scope=thisAndFuture → all future siblings affected, past untouched |
| D3 | cancel scope=series → template + future instances cancelled |
| D4 | cancel — one notification per user, not per instance |
| D5 | reschedule → notification fires, conflicts recomputed |
| D6 | override capacity below confirmed count → 400 |
| D7 | conflict — overlapping save sets `conflictingInstanceIds` on both sides |
| D8 | conflict — no overlap → empty array, no false positives |
| D9 | override does not affect siblings |
| D10 | reschedule preserves duration |

### 5.5 Phase D — stage audit

- [ ] **N+1 audit**: cancel scope=series on a 50-instance series → query count ≤ 6 (1 fetch + 1 update template + 1 update instances + 1 distinct users + 1 outbox flush + 1 commit).
- [ ] **Notification dedup**: 30 participants, 50 instances cancelled, same person on 10 of them → that person receives 1 SESSION_CANCELLED, not 10.
- [ ] EXPLAIN on the `thisAndFuture` UPDATE — uses `idx_si_template_start`.
- [ ] curl: full cancel-scope matrix, reschedule, override + retrieve.

---

## 6. Phase E — Public + discover surface

**Goal:** anonymous users can browse OPEN/FREE sessions. Marketing wedge unblocked.

**Estimated size:** ~400 LOC. **Estimated time:** 2 working days.

### 6.1 Endpoints

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /sessions/discover` | `@Public()` | Paginated list of upcoming instances. Unauthed → OPEN+FREE only. Authed → also eligible CLIENTS_ONLY/GROUP_ONLY. Throttle 30/min anonymous, 60/min authed. |
| `GET /sessions/public/:instructorSlug/:templateSlug` | `@Public()` | Redacted-public view of next upcoming instance. Pretty URL. 404 if not OPEN/FREE. |
| `GET /sessions/instances/:id/public` | `@Public()` | Same redacted shape but UUID-addressable. For FE share links. |

### 6.2 Redacted-public shape

```ts
interface PublicInstance {
  id: string;
  templateId: string;
  startAt: ISODateTime;
  endAt: ISODateTime;
  durationMinutes: number;
  title: string;
  description: string;          // first 500 chars, plain text
  type: SessionType;
  access: SessionAccess;
  locationKind: LocationKind;
  // ONLY for IN_PERSON:
  venue: { id: string; name: string; city: string | null } | null;
  // NEVER returned publicly:
  // meetingUrl, participants, private_note, instructor email
  instructor: { id: string; handle: string; firstName: string; lastName: string; avatarUrl: string | null };
  spotsAvailable: number | null;   // null if no capacity OR if GROUP_ONLY non-member
  priceAmountCents: number;
  priceCurrency: string;
  isFull: boolean;
  isWaitlistOpen: boolean;
}
```

For GROUP_ONLY shown to non-member: only `{ id, templateId, startAt, endAt, type, access, instructor, title, isBlocked: true }`.

### 6.3 Caching

- `GET /sessions/discover` → `Cache-Control: public, max-age=60, s-maxage=60`. Stale-while-revalidate=120.
- Slug routes → `Cache-Control: public, max-age=120, s-maxage=120`.
- Vary by `Authorization` so authed users get personalized eligible results without poisoning the anonymous cache.

### 6.4 Tests added (Phase E)

| # | What |
|---|---|
| E1 | discover unauthed → only OPEN+FREE |
| E2 | discover authed (with client relationship) → includes CLIENTS_ONLY for that instructor |
| E3 | discover excludes CANCELLED status |
| E4 | slug resolution — case-insensitive, falls back to 404 |
| E5 | public instance view — meetingUrl NEVER present |
| E6 | GROUP_ONLY non-member → blocked shape |
| E7 | throttle hits at 31st anonymous req in 60s |
| E8 | discover query uses `idx_st_access_recurring` (assert via EXPLAIN string match) |

### 6.5 Phase E — stage audit

- [ ] **Privacy audit script**: programmatic check that no field listed in the "never returned publicly" list appears in any public response. Run as part of CI.
- [ ] **EXPLAIN** on discover query — uses indexes, no seqscan.
- [ ] **Burst test**: 100 requests/30s against `/sessions/discover` — first 30 succeed, 31..100 → 429.
- [ ] **CDN-ready headers** verified via curl.

---

## 7. Phase F — Client utilities

**Goal:** the user's "my sessions" UX, .ics download, day-of join info, profile counts.

**Estimated size:** ~350 LOC. **Estimated time:** 1.5 working days.

### 7.1 Endpoints

| Endpoint | Returns |
|---|---|
| `GET /sessions/my?tab=upcoming\|pendingApproval\|past\|cancelled` | Paginated bookings. |
| `GET /sessions/my/counts` | `{ upcoming, pendingApproval, past, cancelled }` — 4 small COUNT(*) queries from the index. No payload. |
| `GET /sessions/instances/:id/ics` | `text/calendar`. Single event. Anonymous if instance is OPEN/FREE; auth required otherwise. |
| `GET /sessions/instances/:id/join-info` | `{ meetingUrl, joinActiveFrom, joinActiveUntil, instructorJoined }`. Confirmed participants only. |

### 7.2 Counts implementation note

**Do NOT fetch the list to get counts.** `GET /sessions/my/counts` runs 4 indexed `SELECT COUNT(*) WHERE user_id = X AND status = Y` queries in parallel and returns one object. Mirrors the existing `GET /payments/my/counts` pattern.

If we need a combined "upcoming + count" UX someday, it's still cheaper to fetch the list once for tab-1 and call `/counts` for the badges than to over-fetch all tabs.

### 7.3 .ics generation

- Plain string build (no library — RFC 5545 is simple enough; spec linked in audit).
- Single VEVENT per call.
- Fields: `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `LOCATION` (or `URL` for ONLINE), `ORGANIZER`, `STATUS` (CONFIRMED/CANCELLED), `LAST-MODIFIED`.
- Cache `Content-Type: text/calendar; charset=utf-8` + `Content-Disposition: attachment; filename="session-<id>.ics"`.

### 7.4 Tests (Phase F)

| # | What |
|---|---|
| F1 | my upcoming filter — only future instances |
| F2 | my past filter — past instances |
| F3 | my counts returns 4 numbers, no payload |
| F4 | counts query count == 4 (no N+1) |
| F5 | .ics DTSTART matches DB |
| F6 | .ics CANCELLED instance has STATUS:CANCELLED |
| F7 | join-info auth-gated, non-participant → 403 |
| F8 | join-info joinActiveFrom = startAt − 5min |
| F9 | join-info → 404 if user is not CONFIRMED |

### 7.5 Phase F — stage audit

- [ ] **counts is 4 queries flat**, asserted in test via query spy.
- [ ] .ics validates against an external iCal parser (use `node-ical` lib in test only — don't ship in runtime).
- [ ] N+1 audit on `/my?tab=upcoming` — single query with eager template + venue.

---

## 8. Phase G — Notifications + follow-up

**Goal:** every state change emits the right notifications (defaults already in place). Instructor can blast a follow-up to attendees.

**Estimated size:** ~300 LOC. **Estimated time:** 1.5 working days.

### 8.1 Builders

Implement `src/modules/session/notifications.ts` with these typed builders:

```ts
export function sessionBookedForUser(userId, instance, status): NotifyParams
export function bookingPromotedForUser(userId, instance): NotifyParams
export function bookingDeclinedForUser(userId, instance, reason): NotifyParams
export function bookingCancelledForUser(userId, instance): NotifyParams
export function sessionCancelledForUser(userId, instance, reason, message): NotifyParams
export function sessionRescheduledForUser(userId, instance, oldStartAt, newStartAt): NotifyParams
export function participantJoinedForInstructor(instructorId, userName, instance): NotifyParams
export function participantLeftForInstructor(instructorId, userName, instance): NotifyParams
export function sessionFollowUpForUser(userId, instance, message, attachmentUrl?): NotifyParams
```

Each takes **primitives only** (id, name, startAt as Date, instance.title — never a full Sequelize entity).

### 8.2 Wiring

Replace every stub builder added in Phase A with the live version. No changes to the call sites in Phase C/D — they already call `outbox.add(builder(...))`.

### 8.3 Follow-up endpoint

`POST /sessions/instances/:id/follow-up` — body `{ audience: 'all'|'attended'|'noshow'|'userIds', userIds?, message, attachmentUrl? }`. Owner-only. Allowed only after `endAt`. Fans out via outbox.

### 8.4 Tests (Phase G)

| # | What |
|---|---|
| G1 | each builder produces a NotifyParams with required keys + defaults from notification-defaults |
| G2 | book triggers exactly 2 notifications (user + instructor), correct types |
| G3 | tx rollback discards outbox (existing pattern in notification-outbox.spec, regression) |
| G4 | series cancel — 1 notif per user, not per instance |
| G5 | follow-up restricted to `endAt` past |
| G6 | follow-up audience filters work |
| G7 | dedupe on rapid cancel+reschedule within 60s (coalesce rule) — emits only reschedule |

### 8.5 Phase G — stage audit

- [ ] Trigger every state change in a script; verify the right notification rows appear in DB.
- [ ] Verify defaults map honored — email-required types do produce email rows; in-app-only types do not.
- [ ] Trigger 1000 participants on a single cancel → outbox flushes in < 2s (no N+1 inside the loop).
- [ ] Reminder schedule rows are written on book but **not yet dispatched** (worker pending — that's the jobs module).

---

## 9. Post-Phase G — what's NOT in v1

Locked out of scope, deferrals motivated:

1. **Reminder dispatch worker** — depends on the jobs module. Phase G writes the schedule rows; worker reads them. Tracked in `project_jobs_module_pending.md`.
2. **Payment-gated booking** — entire flow out of scope; design says manual invoice for v1.
3. **Public booking link / Calendly-style standalone** — out of scope; the public showcase + slug routes cover the marketing angle.
4. **Class packs / punch cards** — separate model entirely.
5. **No-show fee automation** — requires SetupIntent. Park.
6. **iCal subscription feed (multi-event)** — single-event `.ics` is enough.
7. **Native push notifications via Firebase/APN** — defaults map declares push channel, but transport requires device-token + push provider (existing in `notification/device.controller.ts`). Hook up only after the FE is collecting tokens.
8. **Timezone migration to `timestamptz`** — separate dedicated migration; tracked as a follow-up to Phase A.
9. **Search index reintegration** — sessions used to be indexed in `search_doc`. After Phase B, add a hook: on instance create/update/cancel, upsert/remove from search. Tracked as a Phase H stretch goal.

---

## 10. End-to-end test plan (after all phases)

Beyond per-phase unit tests, two integration suites:

### 10.1 Full instructor journey

1. Create recurring template (WEEKLY, Tue/Thu, 8 instances).
2. Regenerate +4 more.
3. Approve 3 PENDING_APPROVAL bookings on the first 2 instances.
4. Cancel scope=this on instance #3.
5. Reschedule instance #5.
6. Edit override on instance #7 (different venue).
7. Cancel scope=thisAndFuture on instance #9.
8. Send follow-up to attendees of instance #1.
9. Verify: notifications sent correctly, counters consistent, conflict warnings present where expected.

### 10.2 Full client journey

1. Discover (unauthed) → see OPEN sessions.
2. Sign up + login.
3. Discover (authed) → see CLIENTS_ONLY for instructors who have you.
4. Book OPEN session → CONFIRMED.
5. Book CLIENTS_ONLY session → CONFIRMED (or PENDING_APPROVAL if flag set).
6. Book full session → WAITLISTED.
7. Verify reminder rows scheduled.
8. Cancel-booking on first session → see SESSION_CANCELLED + auto-promote if applicable.
9. Get `/my/counts` → expect {1,1,0,1} (CONFIRMED, PENDING, PAST, CANCELLED).
10. Download .ics for confirmed session.
11. After endAt, instructor marks attended via PATCH.

### 10.3 Security regression suite (always run)

- IDOR: foreign venue, foreign group, foreign session, foreign participant → all 404.
- Cross-tenant list pollution: USER list never shows another's confirmed bookings.
- Public surface: meeting URL never present, private note never present.
- Throttle: discover 30/min anonymous, book 5/min/user enforced.
- Counter drift: after 100-op random script, denorm equals COUNT(*).
- XSS: `<script>` in every text field is stripped server-side.
- Past-date: every `startAt`-sensitive create rejected if past.

---

## 11. Performance budgets

We hold these targets; CI alerts on regression. Measured against local DB with 10k seed templates + 50k instances + 200k participants.

| Endpoint | Target p50 | Target p99 | Notes |
|---|---|---|---|
| `GET /sessions/templates` (page 1, 20) | < 50ms | < 200ms | indexed on `(instructor_id, status)` |
| `GET /sessions/instances` (week view, 50 rows) | < 80ms | < 250ms | indexed on `(instructor_id, start_at)` |
| `GET /sessions/instances/:id` | < 30ms | < 100ms | PK lookup + 3-way join |
| `POST /sessions/instances/:id/book` | < 100ms | < 500ms | locks the row but holds tx briefly |
| `GET /sessions/my/counts` | < 30ms | < 80ms | 4 indexed counts |
| `GET /sessions/discover` | < 60ms | < 250ms | indexed + CDN cache |
| `POST /sessions/instances/:id/cancel?scope=series` (50 instances, 200 participants) | < 300ms | < 800ms | bulk UPDATE + DISTINCT users + outbox flush |

Anything outside p99 → add an index, denormalise a counter, or split the call.

---

## 12. Open questions (must be answered before Phase B)

(Repeated from audit §11; restated here as a gate.)

1. **D1 Waitlist** — auto-add (Mindbody) or approval-to-promote? *Recommendation: auto-add.*
2. **D4 Public URL pattern** — `motionhive.app/s/<instructorSlug>/<templateSlug>` confirmed?
3. **D7 Authed discover** — include eligible CLIENTS_ONLY/GROUP_ONLY?
4. **D9 Notification channels** — defaults in `notification-defaults.ts` are good as-is?
5. **Jobs module timing** — does reminder worker land before, with, or after Phase G?

The Phase A→G plan above assumes: D1 = auto-add, D4 = yes, D7 = yes, D9 = yes, jobs module = after.

If any answer changes, the affected phase's spec changes; the rest of the plan is stable.

---

*Last updated: 2026-05-15. Update after each phase audit.*
