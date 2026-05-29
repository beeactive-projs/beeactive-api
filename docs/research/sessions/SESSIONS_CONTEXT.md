# Sessions — Context, Current State, and Future Build Guide

> **Audience:** future-you (and any collaborator) planning sessions work in MotionHive.
> **Scope:** what exists today on the backend, what's missing on the frontend, the
> domain model, where it intersects with groups / clients / payments / venues / notifications,
> and a curated list of pitfalls and decisions to make before extending.
>
> This is a *context document*, not a spec. Treat it like a map: it tells you the
> terrain so you don't waste time discovering it; you still pick the route.

---

## 0. TL;DR — read this first

- **Backend:** ~90% feature-complete. 14 endpoints, full CRUD, recurrence (custom JSON rule), participant lifecycle, calendar, conflict warnings, soft delete, capacity locking, three email touchpoints.
- **Frontend:** ~5% built. Only a placeholder route + an empty `<p>Sessions works</p>` component. No service, no models, no store, no forms.
- **Biggest *hidden* gaps even on the BE:** no `venue_id` on the Sequelize entity (DB has the FK, code doesn't), no NotificationService integration (still uses raw EmailService), no tests, no timezone field, no reminder/cron jobs, no waitlist on full sessions, no audit log on reschedule.
- **Single most important pre-build decision:** **timezone storage**. Add it before you ship UI — retrofitting later means data migration on every existing session row.
- **Don't change** the participant status enum without a migration plan. Status values are FE-contract too.

---

## 1. What a "session" is, conceptually

A **session** in MotionHive is *one delivery of a service by an instructor to one or more clients on a specific date/time*. It is the atomic unit of "work performed" on the platform. Examples:

- a yoga class on Wednesday 7pm at a studio (`sessionType=GROUP`, visibility `PUBLIC` or `GROUP`)
- a 1:1 personal training appointment (`sessionType=ONE_ON_ONE`, visibility `CLIENTS` or `PRIVATE`)
- a Zoom mobility workshop (`sessionType=ONLINE` or `WORKSHOP`, visibility `PUBLIC`)
- a weekly recurring HIIT bootcamp (`isRecurring=true`, instances generated on demand)

**It is NOT** a chat room, a long-running thing, a course, or a subscription period. Each session occupies a single time slot. Recurring sessions are modeled as one template plus N independent instance rows — *not* as a recurrence shadow.

The session is what payments and analytics *should eventually* hinge on, but **today the price/currency columns on session are decorative** — there is no booking → invoice → payment link. See [§9 Payments intersection](#9-payments-intersection).

---

## 2. Current backend implementation

### 2.1 Files

```
src/modules/session/
├── session.module.ts
├── session.controller.ts        (272 lines, 14 routes)
├── session.service.ts           (1302 lines)
├── entities/
│   ├── session.entity.ts        (178 lines)
│   └── session-participant.entity.ts (77 lines)
└── dto/
    ├── create-session.dto.ts
    ├── update-session.dto.ts
    ├── recurring-rule.dto.ts
    ├── recurrence-preview.dto.ts
    ├── generate-instances.dto.ts
    ├── reschedule-session.dto.ts
    ├── clone-session.dto.ts
    ├── discover-sessions.dto.ts
    └── update-participant-status.dto.ts
```

Migrations: [003_create_session_tables.sql](../../../migrations/003_create_session_tables.sql) creates `session` + `session_participant`. [027_location_refactor_and_venue.sql:120-123](../../../migrations/027_location_refactor_and_venue.sql) adds `session.venue_id` FK.

### 2.2 Endpoints (all under `/sessions`)

| Method | Path                                | Role/Guard                  | Notes |
|--------|-------------------------------------|------------------------------|-------|
| POST   | `/`                                 | INSTRUCTOR/ADMIN             | Conflict check is **warning-only** (does not block) |
| GET    | `/`                                 | JWT (any)                    | Visibility-filtered list |
| GET    | `/discover`                         | JWT (any)                    | PUBLIC only, date range capped at 180 days |
| GET    | `/calendar?start=&end=`             | JWT (any)                    | Groups results by ISO date key |
| GET    | `/:id`                              | JWT (any) + visibility check |       |
| PATCH  | `/:id`                              | INSTRUCTOR/ADMIN             | Cancel → emails participants |
| DELETE | `/:id`                              | INSTRUCTOR/ADMIN             | Soft delete, emails participants |
| POST   | `/:id/clone`                        | INSTRUCTOR/ADMIN             | New scheduledAt, recurrence stripped |
| GET    | `/:id/recurrence-preview?weeks=N`   | INSTRUCTOR/ADMIN             | Returns ISO dates, does NOT create |
| POST   | `/:id/generate-instances?weeks=N`   | INSTRUCTOR/ADMIN             | Creates rows, idempotent by (instructor, title, date) |
| PATCH  | `/:id/reschedule`                   | INSTRUCTOR/ADMIN             | Emails all active participants |
| POST   | `/:id/join`                         | JWT (any) + throttle 10/60s  | Pessimistic FOR UPDATE lock |
| POST   | `/:id/leave`                        | JWT (any)                    | Blocked within 2h of start |
| POST   | `/:id/confirm`                      | JWT (any)                    | REGISTERED → CONFIRMED |
| POST   | `/:id/checkin`                      | JWT (any)                    | Allowed −15min to +30min from start |
| PATCH  | `/:id/participants/:userId`         | INSTRUCTOR/ADMIN             | Instructor sets status, auto-emails |

> **Route ordering gotcha** — `/discover` is registered before `/:id` so the static path wins. Don't reorder without testing.

### 2.3 Entity columns

**session** (paranoid, soft-delete via `deleted_at`):

| column            | type          | nullable | notes |
|-------------------|---------------|----------|-------|
| id                | CHAR(36)      | no       | UUIDv4 |
| group_id          | CHAR(36)      | yes      | FK → group, ON DELETE SET NULL |
| instructor_id     | CHAR(36)      | no       | FK → user, ON DELETE CASCADE |
| title             | VARCHAR(255)  | no       |       |
| description       | TEXT          | yes      |       |
| session_type      | enum          | no       | ONE_ON_ONE / GROUP / ONLINE / WORKSHOP |
| visibility        | enum          | no       | PUBLIC / GROUP / CLIENTS / PRIVATE (default `GROUP` in entity, `PRIVATE` in migration — see §11) |
| scheduled_at      | TIMESTAMP     | no       | **stored as UTC; no TZ column** |
| duration_minutes  | INT           | no       | 5–480 enforced at DTO |
| location          | VARCHAR(255)  | yes      | free text, kept for legacy display |
| max_participants  | INT           | yes      | null = unlimited |
| price             | DECIMAL(10,2) | yes      | **decorative — not enforced anywhere** |
| currency          | VARCHAR(3)    | no       | default `'RON'` |
| status            | enum          | no       | DRAFT / SCHEDULED / IN_PROGRESS / COMPLETED / CANCELLED |
| is_recurring      | BOOL          | no       |       |
| recurring_rule    | JSONB         | yes      | shape in §4 |
| reminder_sent     | BOOL          | no       | **never read or written by code** |
| venue_id          | CHAR(36)      | yes      | **exists in DB (mig 027), missing from entity** |
| created_at / updated_at / deleted_at | TIMESTAMP | varies | standard |

**session_participant** (no soft delete, no `updated_at`):

| column         | type      | notes |
|----------------|-----------|-------|
| id             | CHAR(36)  | UUIDv4 |
| session_id     | CHAR(36)  | FK, ON DELETE CASCADE |
| user_id        | CHAR(36)  | FK, ON DELETE CASCADE |
| status         | enum      | REGISTERED / CONFIRMED / ATTENDED / NO_SHOW / CANCELLED |
| checked_in_at  | TIMESTAMP | null until ATTENDED |
| created_at     | TIMESTAMP |       |

`UNIQUE (session_id, user_id)` enforces one participant row per user per session — *cancelled* rows are reused (re-join reactivates instead of inserting).

Indexes: `(instructor_id)`, `(group_id)`, `(scheduled_at)`, `(visibility, scheduled_at)`, `(status)`, `(reminder_sent, scheduled_at)`, `(deleted_at)`, `(venue_id) WHERE venue_id IS NOT NULL` (partial).

### 2.4 Service methods worth knowing about

- `create(userId, dto)` — checks group membership (if `groupId`), runs conflict check (warning only), inserts row, calls `searchIndexService.upsertSession`.
- `joinSession(sessionId, userId)` — **the only path with a real transaction + FOR UPDATE lock**. Pattern to copy when building waitlist or payment-gated join. Reactivates a CANCELLED row instead of inserting a duplicate (otherwise the UNIQUE constraint would throw).
- `leaveSession` — enforces `CANCELLATION_CUTOFF_HOURS = 2` constant.
- `selfCheckIn` — time window `−15 min to +30 min` from `scheduledAt`.
- `rescheduleSession` — updates `scheduled_at`, fires per-participant emails fire-and-forget. **Does not reindex search**, does not write to any audit table, does not refresh the recurrence rule.
- `computeOccurrenceDates(firstAt, rule, maxWeeks, includeFirst)` — recurrence expansion engine. See §4.
- `generateUpcomingInstances` — idempotent because it pre-loads sessions matching `(instructorId, title, scheduled_at BETWEEN ...)` and skips already-existing dates.
- `assertCanViewSession(session, userId)` — single source of truth for visibility. Throws `ForbiddenException` instead of returning a 404, which **leaks the existence** of the session — discuss in §11.

### 2.5 Notification surface (today)

| Trigger                                | Channel | Recipient            | Pattern |
|----------------------------------------|---------|----------------------|---------|
| Session cancelled (status or DELETE)   | Email   | All active participants | `emailService.sendSessionCancelledEmail` |
| Session rescheduled                    | Email   | All active participants | `emailService.sendSessionRescheduledEmail` |
| Participant status changed by instructor | Email | The participant      | `emailService.sendParticipantStatusEmail` |
| User joined/left                       | (log)   | Instructor           | **No email template — log line only** |

All sends are *fire-and-forget*: `.send(...).catch(err => logger.warn(...))`. They are **not** routed through `NotificationService` or `NotificationOutbox`. This means:

- No in-app notifications are produced.
- No retry on transient email failures.
- No idempotency vs. our own retries — Resend has none either.

When extending this module, **use `NotificationService.notify(builder(...))`** (see CLAUDE.md "Notifications" section) — it gives you both the in-app row and the email send, retry-safe.

---

## 3. Current frontend state (don't expect to find much)

| Area                | Status |
|---------------------|--------|
| Route               | `/instructor/sessions` exists, points to a `<p>Sessions works</p>` placeholder |
| HTTP service        | **None.** No `SessionService` under `projects/core/src/lib/services/` |
| Endpoint constants  | Only `SESSIONS.BASE = '/sessions'` defined; no per-route constants |
| Models              | Backend interfaces NOT exported from `public-api.ts`. Only `PublicGroupSession` (subset, read-only) exists on `group.model.ts` |
| Store               | None. The 6 existing stores cover auth/messaging/notifications/public-profile/recent-searches/stripe-onboarding |
| Forms               | None — no create/edit form, no recurrence picker, no venue picker, no visibility picker |
| Calendar widget     | None |
| Discovery UI        | None (search modal mentions sessions but isn't wired) |
| Participant mgmt UI | None |
| Reschedule UI       | None |
| Client-side session display | Read-only block on group preview page (`group-preview.html` lines 99–128): title, time, duration, price |

So when you start FE work you are essentially building greenfield — the BE contract is the only authority.

---

## 4. Recurrence — how it actually works

Recurrence lives in `session.recurring_rule` (JSONB). Shape:

```ts
interface RecurringRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval?: number;             // default 1; "every N periods"
  daysOfWeek?: number[];         // WEEKLY only; 0=Sun..6=Sat
  endDate?: string;              // ISO date, optional
  endAfterOccurrences?: number;  // alternative to endDate
}
```

Flow (already implemented, but no FE):

1. Instructor POSTs `/sessions` with `isRecurring: true` + `recurringRule: {...}`. This creates a *template* session (the first occurrence).
2. FE calls `GET /sessions/:id/recurrence-preview?weeks=12` to render the future dates as a preview — **this only returns dates, it doesn't create anything**.
3. Instructor confirms → FE calls `POST /sessions/:id/generate-instances?weeks=12`. Backend creates separate `Session` rows for each date *except* the template, with `isRecurring=false` and `recurringRule=null`. Each instance is independent (separate id, participants, edits).
4. Re-running step 3 is safe — it skips existing `(instructorId, title, scheduledAt)` matches.

### Why this design

- **Independent rows** = cancelling one occurrence does not affect the rest, no exception-date table needed.
- **No RRULE** = simpler to implement and validate, but **we cannot import/export iCalendar feeds** without translating. If we ever wire `.ics`, write a one-way converter.
- **Time-of-day** = inherited from the template's `scheduledAt`. There is no per-occurrence override (e.g., "every Friday at 18:00 except December 25").

### Limitations to design around

- **No timezone** in the rule. If an instructor moves city mid-series, DST will silently shift the times.
- **No "this and all future occurrences" edit**. Editing one row edits one row. If the FE wants "update entire series," it needs to fetch siblings by `(instructorId, title)` heuristically — fragile.
- **No "series id"** linking template ↔ instances. Once instances are generated, the template is just another row. Add a `series_id` column *before* this becomes painful.

---

## 5. Participant lifecycle

```
   (no row)
      │  joinSession()
      ▼
  REGISTERED  ──confirm()──▶  CONFIRMED
      │                          │
      │  selfCheckIn()            │ selfCheckIn()
      ├────────────────┬──────────┘
      ▼                ▼
   ATTENDED        (instructor sets via PATCH .../participants/:userId)
                       │
                       └──▶ NO_SHOW
   (any non-final state)
      │  leaveSession()  or instructor cancels
      ▼
   CANCELLED
```

- **Capacity** = `count(participants WHERE status NOT IN ('CANCELLED','NO_SHOW'))`. Enforced under FOR UPDATE so two simultaneous joins can't oversell. The cancelled/no-show seats are reclaimable.
- **No waitlist.** If capacity is full, join returns 400 "Session is full". The user has no path back. **Building waitlist is the single highest-leverage UX win** for this module.
- **No payment gate.** Anyone visible to the session can join, regardless of `price`.

---

## 6. Visibility model (load-bearing)

| visibility | Who can `GET` it? |
|------------|-------------------|
| PUBLIC     | Anyone authenticated |
| GROUP      | Members of `session.groupId` (must have a `group_member` row with `leftAt IS NULL`) |
| CLIENTS    | Users with an `instructor_client` row, status `ACTIVE`, for the session's instructor |
| PRIVATE    | The instructor only |

The check is centralised in `assertCanViewSession`. **All visibility-respecting code paths funnel through it.** When you add new endpoints (e.g., "session detail with materials") call it instead of re-implementing — drift here = privacy leak.

**Subtle: `getMySessions` lists union (own + group + clients + participant + public).** When you build the FE list, decide whether "my sessions" should be "sessions I'm registered for" vs "sessions I can see" — today it's the latter, which surprises users.

---

## 7. Calendar & conflicts

- `GET /sessions/calendar?start=&end=` returns `Record<'YYYY-MM-DD', Session[]>`. Date keys are UTC-derived (`scheduledAt.toISOString().slice(0,10)`). **If the client is in a different TZ, sessions that fall across midnight UTC will bucket on the wrong day.** Fix this when you add the TZ column.
- `checkConflicts(instructorId, scheduledAt, duration)` is exposed only via the warning on `create`. There is no public endpoint to ask "am I free?" The FE should call it before booking — *add* a `GET /sessions/availability` or surface conflicts inline on the create form.

---

## 8. Venue integration — the half-built one

- **DB:** `session.venue_id` exists since mig 027 (FK to `venue`, ON DELETE SET NULL, partial index).
- **Entity:** `Session` does NOT declare `venueId` — not in DTOs, not in entity, not in includes. So even though the column is there, the API can't read or write it.
- **FE:** No venue picker on session create/edit (confirmed in CLAUDE.md).
- **Implications:**
  - Sessions still rely on the free-text `location` field for display.
  - You can't query "all sessions at this venue."
  - When you wire venue → session, also update: `CreateSessionDto`, `UpdateSessionDto`, `Session` entity (with `@BelongsTo`), DTO validation (must own the venue), discovery filters, and the FE form. **Do all of this in one PR** — partial wiring leaks unowned venues into UI.

See [§13 Build order](#13-build-order) for the recommended sequencing.

---

## 9. Payments intersection (where the money doesn't flow)

Today: `session.price` and `session.currency` exist as columns. **No code reads them for billing.** Joining a session does not create an invoice, does not check a Stripe Customer, does not deduct from a subscription quota. There's no booking ledger.

When you wire payments:

- A "paid session" is naturally an `Invoice` with one line item, charged on join. Use the existing `InvoiceService` pattern. **Two-phase save**: insert local participant row → call Stripe → backfill PaymentIntent id (mirrors how `ProductService.create` works — see PAYMENT-FLOWS.md).
- Subscription-based sessions ("unlimited yoga membership") need a different model — quota counting against the active subscription. Don't conflate the two: classify the session offering as **per-session price** or **included in plan** at the product level, not on the session.
- Refund window: the payment module already enforces 14 days. If a session is cancelled inside that window, refund is automatic — outside it, only a partial credit. **Decide this rule before building the join-to-pay flow.**
- EU SCA: every new subscription is `payment_behavior: 'default_incomplete'`. Apply the same policy to one-off session purchases — never auto-charge a saved card without explicit confirmation for the first transaction.

---

## 10. Search

- Sessions are indexed in `search_doc` via `SearchIndexService.upsertSession` on create and `removeIfExists` on delete. Status-driven: drafts and cancelled are removed, scheduled/published are upserted.
- **Reschedule does NOT re-upsert.** A rescheduled session keeps the old indexed time in the search payload. Fix when you add the global search endpoint (the search index FE is also not wired yet, per CLAUDE.md).

---

## 11. Pitfalls & things to *not* do

These are the traps that will cost you a day each if you walk into them.

1. **Don't change the visibility default without a migration.** Entity says `'GROUP'`, migration 003 says `'PRIVATE'`. Existing rows have `'PRIVATE'`. New rows from the API default to `'GROUP'`. This is a quiet inconsistency — pin it down in one place when you next touch the entity. Audit existing data first.
2. **Don't add a TZ column without backfill logic.** Decide whether existing rows are "Europe/Bucharest" (likely, given RON default) or "UTC". Apply via migration with explicit `UPDATE` for legacy rows; don't leave them NULL.
3. **Don't store recurrence times in local strings.** Always keep `scheduledAt` UTC. The TZ column is metadata for *display* and *DST*; the underlying timestamp is UTC.
4. **Don't return 404 from session detail when access is denied** — current code throws 403 which leaks existence. Pick one policy (we recommend 404 for cross-instructor lookups to match the venue module convention).
5. **Don't bypass the FOR UPDATE lock when adding waitlist.** The current join pattern is correct. Waitlist should mirror it: select-for-update the session, count active participants, decide REGISTERED vs WAITLISTED, insert.
6. **Don't add a 5th participant status without a migration AND FE coordination.** Status values appear in the FE filter UI (when it exists), in emails, and in analytics queries.
7. **Don't call `notify()` inside a Sequelize transaction.** Per CLAUDE.md: `notify()` opens its own tx; if the outer rolls back the alert orphans. Use `NotificationOutbox` for tx-scoped sends, or call `notify()` *after* commit. Search the post/group services for `notify-after-commit` examples.
8. **Don't generate recurring instances on the request thread for large date ranges.** Today the cap is 52 weeks × up to 7 days/week = ~365 instances. Fine for now. If the FE ever asks for "2 years out," push it to a Bull job — see the pending jobs module.
9. **Don't ship a "delete series" button without a column.** Without `series_id`, deleting "all future occurrences" is a fuzzy match on `(instructorId, title, scheduledAt > now)`. Title is editable — rename one instance, the heuristic breaks. **Add `series_id` first** (CHAR(36), nullable, indexed; back-populate to the template id on generate-instances).
10. **Don't trust `reminder_sent` is wired** — it isn't. Indexed but never written. When you build reminder jobs, that's the column to use.
11. **Don't conflate `session.location` and `venue.address`.** Once venue is wired, the FE should display venue summary and treat `session.location` as a per-occurrence override (e.g., "Studio A — back room"). Don't drop the column; it's also used by sessions created before the venue rollout.
12. **Don't expose `DRAFT` sessions in discover.** Confirmed (the discover query filters status to `SCHEDULED` + `IN_PROGRESS`). Keep this guard if you refactor the query builder.
13. **Don't change pagination shape.** The FE contract is `{ items, total, page, pageSize }` via `buildPaginatedResponse`. Multiple tables already depend on it.
14. **Don't add features inside the controller.** Controllers stay thin (CLAUDE.md). Capacity logic, time-window checks, validation — all in the service.

---

## 12. Industry norms — what a "good" sessions module looks like

For reference when designing future iterations. Borrow selectively; don't over-build.

| Feature                       | Industry norm (Calendly / ClassPass / Mindbody) | Where we stand |
|-------------------------------|--------------------------------------------------|----------------|
| Timezone-aware scheduling     | Always — store UTC + IANA TZ                     | UTC only, no TZ |
| Recurring with exceptions     | RRULE + EXDATE                                   | Custom JSON, no exceptions |
| Series-level edit (this/all future) | Native                                     | None (single-row only) |
| Booking-to-payment            | One transaction                                  | Decoupled; no flow |
| Waitlist with auto-promote    | Standard                                         | Missing |
| Cancellation policy windows   | Per-instructor, per-product                      | Hardcoded 2h |
| No-show fee                   | Common                                           | None |
| iCal feed (.ics)              | Always                                           | None |
| Reminder push/email           | 24h, 1h cadence                                  | Stubbed (`reminder_sent` exists) |
| Cancel/reschedule self-serve  | Yes, with audit                                  | Yes, no audit |
| Capacity overbooking buffer   | Configurable                                     | None (hard cap) |
| Attendance + analytics        | Dashboard, churn signal                          | Field exists, no rollup |
| Rate-limited booking          | Yes                                              | `join` is throttled 10/60s |
| Group resources (handouts)    | Common                                           | None |
| Multi-resource booking (instructor + room) | Common                                | We have venue but not enforced |
| Buffer time / prep time       | Common                                           | None |
| Public booking link           | Universal (Calendly's whole product)             | None |

The realistic 12-month roadmap, in order of leverage, is: **TZ → series_id → venue wire-up → waitlist → reminders (depends on jobs module) → payment-gated booking → public booking link.** Anything past that is gravy.

---

## 13. Build order for the next iteration

If you want a single recommended path:

1. **Add the missing entity glue.** `venue_id` on `Session` entity + `@BelongsTo(Venue)`, expose in DTOs (with ownership validation), thread into `getById` / list responses. One PR.
2. **Add `series_id` migration + populate.** New nullable CHAR(36), indexed. `generate-instances` sets `series_id = template.id` on every new row (and on the template itself if null). Backfill: `UPDATE session SET series_id = id WHERE is_recurring = true AND series_id IS NULL` is good enough for now.
3. **Add `timezone` (VARCHAR(64), IANA) + backfill** to `'Europe/Bucharest'` for legacy rows. Update DTOs to require it on create.
4. **Add 404-not-403 visibility policy.** Touch `assertCanViewSession`.
5. **Build the FE service + models + a single list page** before any forms. Once `GET /sessions` works end-to-end, every other feature follows the same pattern. Don't skip this — building forms before the data layer leads to fake state.
6. **Build create form (without recurrence first).** Then add recurrence as a second step.
7. **Wire NotificationService** to replace the three direct email calls. The in-app side is free once you do.
8. **Defer:** waitlist, reminders, payments, public booking. They each deserve their own design doc.

Each of steps 1–4 is ≤200 lines of code change, including tests. Doing them up front makes everything after cheaper.

---

## 14. Open questions to resolve before next sprint

These are decisions only you can make. Write them down somewhere durable before coding:

- [ ] Timezone: per-session, or per-instructor (defaulted from user.country_code)?
- [ ] When a recurring template is deleted, do future instances delete too? Today: no.
- [ ] Should cancelling a session refund participants (when payment is wired)? Inside vs outside the 14-day window?
- [ ] Capacity: hard cap, soft cap with overbook %, or waitlist?
- [ ] Visibility default — `GROUP` or `PRIVATE`? (resolve the entity ↔ migration drift)
- [ ] Should `session.location` be deprecated once `venue_id` is mandatory, or kept as a per-occurrence override?
- [ ] Public booking link (Calendly-style) — does MotionHive want it? If yes, that's its own auth and route surface.
- [ ] Does "join" require email verification? Today: no. Spam vector if discovery is opened up.
- [ ] No-show: does it count against the client's plan? Mindbody charges them; ClassPass forgives the first.

Answering these *before* building is cheaper than retrofitting.

---

## 15. Quick reference — file map

- BE module: [src/modules/session/](../../../src/modules/session/)
- Entity: [session.entity.ts](../../../src/modules/session/entities/session.entity.ts)
- Service: [session.service.ts](../../../src/modules/session/session.service.ts)
- Controller: [session.controller.ts](../../../src/modules/session/session.controller.ts)
- Migration (original): [003_create_session_tables.sql](../../../migrations/003_create_session_tables.sql)
- Migration (venue FK): [027_location_refactor_and_venue.sql:120-123](../../../migrations/027_location_refactor_and_venue.sql)
- Search integration: `SearchIndexService.upsertSession` (search module)
- Related: [group/](../../../src/modules/group/), [client/](../../../src/modules/client/), [venue/](../../../src/modules/venue/), [payment/](../../../src/modules/payment/), [notification/](../../../src/modules/notification/)
- FE placeholder: `beeactive-ui/projects/web/src/app/main/instructor/sessions/sessions.ts`
- FE endpoint constant: `beeactive-ui/projects/core/src/lib/constants/api-endpoints.const.ts` → `SESSIONS.BASE`
- FE group display (read-only): `beeactive-ui/projects/web/src/app/main/groups/group-preview/group-preview.html` lines 99–128

---

*Last updated: 2026-05-13. Update this file when the venue wire-up, series_id, or timezone migrations land — those changes invalidate sections 8, 4, and 7 respectively.*

---

## 16. External research — decisions backed by industry data

This section was added after a web research pass. Each subsection ends with a clear **DECISION** that pins what we stick with for MotionHive — no abstract theory, just options + verdict.

### 16.1 Recurrence — RRULE vs. our custom JSON

**Industry consensus:** RFC 5545's RRULE (the iCalendar standard) is the default for serious calendar apps. Hand-rolled JSON works for simple cases but reliably hurts later when you need .ics export, Google/Apple Calendar sync, or "this and following events" edits.

| Option | Pros | Cons |
|---|---|---|
| **Our current custom JSON** | Simple, validated by class-validator, easy to debug | No iCal export, no third-party calendar import, no EXDATE for "skip Dec 25", no per-occurrence override |
| **Full RRULE + EXDATE/RDATE** | Industry standard, free .ics import/export, libraries exist (`rrule` on npm, ~9k stars) | Larger surface; full spec is overkill |
| **Hybrid: store RRULE string + materialize near-term instances** | Best of both — flexible recurrence rule + fast SQL for upcoming 30–90 days | More moving parts |

**DECISION for MotionHive:** **Stay on custom JSON for v1.** Migrate to **RRULE string** when we add iCal export OR Google Calendar sync — whichever comes first. The migration cost is bounded: write a one-way translator `customRule → RRULE`, store both columns during transition, then drop the JSON. **Do not go hybrid** — we already materialize instances via `generate-instances`, which is the simple half of hybrid. Don't add an expansion engine on top.

**Mandatory now:** when we eventually move, **don't invent extensions**. Subset RRULE — `FREQ`, `INTERVAL`, `BYDAY`, `COUNT`, `UNTIL` are enough.

### 16.2 Per-occurrence exceptions ("skip this Friday", "different time next week")

**Industry consensus:** Two competing patterns; pick one and stick to it.

| Option | How it works | Used by |
|---|---|---|
| **A. EXDATE + override events (iCalendar way)** | Series has an RRULE; exception dates listed in EXDATE; modified occurrences live as separate events with same `UID` and a `RECURRENCE-ID` linking to the original slot | Apple Calendar, Outlook |
| **B. Split-the-series ("this and following")** | Editing an occurrence ends the original series before it, starts a new series from that date | **Google Calendar** |
| **C. Pre-materialize all instances (our current approach)** | Each occurrence is an independent row from day one | Simpler hand-rolled systems |

**DECISION for MotionHive:** **Keep C (pre-materialized instances) + add `series_id` so we can act on groups.** This is already half-done by `generate-instances` — we just need the FK to make "delete all future" possible without a heuristic. **When the FE eventually offers "this and following," implement it as Google does (B-style): mass-update rows where `series_id = X AND scheduledAt >= cutoff`.** Don't try to support EXDATE — it's only useful when you also have RRULE.

**Why not iCalendar A:** it requires an event-expansion engine on every read. We'd build it once and maintain it forever for marginal benefit.

### 16.3 Timezone storage

**Industry consensus (unanimous across sources):** Store UTC timestamps **+** an IANA timezone string (`Europe/Bucharest`, `America/New_York`). Never store local times. Never store offset-only ("+02:00") — DST will silently break the series 6 months later.

**Specific recurrence rule:** For "every Wednesday 7pm in Bucharest," store `scheduled_at` as UTC of the *first* occurrence and `timezone='Europe/Bucharest'`. When expanding occurrences, **compute in the IANA zone, then convert each result to UTC** — do not just add 7 days in UTC, because the DST transition will silently shift the wall time by an hour.

**DECISION for MotionHive:** Add **one** column: `session.timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Bucharest'`, IANA format only. Validate against `Intl.supportedValuesOf('timeZone')` at the DTO layer. Backfill existing rows to `'Europe/Bucharest'` (matches our `RON` default and instructor base). Use a zone-aware library (`luxon` or `date-fns-tz`) for occurrence expansion — **not** raw `Date`.

**Ambiguity rule:** when a user picks "02:30 on the DST spring-forward day" (a time that doesn't exist), reject at the API. Don't silently roll forward — surprising and hard to debug.

### 16.4 Cancellation window & no-show policy

**Industry consensus:** 12 hours is the de facto standard cancellation window in the fitness industry. ClassPass uses 12h. Most Mindbody studios run 12–24h. Late-cancel and no-show fees are both common, with the no-show fee usually higher (because there's no chance to fill the spot).

| Window | Common use |
|---|---|
| **2 hours** (our current) | Tech bookings (Calendly-style), 1:1 personal training |
| **12 hours** | ClassPass default, group class industry baseline |
| **24 hours** | Premium / high-demand classes |

**DECISION for MotionHive:**
- **Default to 12 hours**, not 2. Our current 2h cutoff is below industry norm and reduces instructor income from no-shows.
- **Make it configurable per session** (column: `cancellation_cutoff_hours INT DEFAULT 12`). Instructors set it on create; the existing hardcoded constant goes away.
- **Defer fees** until payments are wired. The fee structure (late-cancel %, no-show %) doesn't matter if we can't charge a card.
- When fees ship: late-cancel ≈ 50% of price, no-show ≈ 100%. Industry common. Make both configurable per instructor.

### 16.5 Waitlist when sessions are full

**Industry consensus:** Two patterns dominate.

| Pattern | How it works | Pros | Cons |
|---|---|---|---|
| **Auto-add** (Mindbody default) | When a seat opens, the next person on the waitlist is automatically registered and notified | Best fill rate; no friction | Users might forget they're on a waitlist, no-show goes up |
| **First-to-claim** (ClassPass-style) | When a seat opens, all (or top N) waitlisted users get a notification with a short claim window (e.g., 2 hours); first to confirm gets it | High commitment | Lower fill rate if no one's near their phone |

**Both patterns enforce:**
- **Auto-promotion stops X hours before start** (industry: ~1–2 hours) — otherwise you fill seats 10 minutes before class with people who can't physically arrive.
- **Notification → expiry window** for first-to-claim is 2–24 hours.

**DECISION for MotionHive:** **Build auto-add, not first-to-claim.** Simpler to implement, higher fill rate, matches Mindbody default. Add a hard stop: **no auto-promotion within 2 hours of `scheduledAt`.**

**Schema sketch (when built):**
- `session_participant.status` gets one new value: `WAITLISTED`.
- Position is implied by `created_at` (FIFO).
- The existing FOR UPDATE lock pattern in `joinSession` extends cleanly: if `count(active) >= maxParticipants`, insert as `WAITLISTED` instead of rejecting.
- A new job (when the jobs module exists) runs on `participant.cancelled` / `participant.no_show` events: pull the oldest `WAITLISTED`, flip to `REGISTERED`, email them.

**Do NOT** build first-to-claim. The expiry-window logic doubles the surface area for marginal benefit.

### 16.6 SCA / PSD2 for one-off session payment

**Industry consensus:** All EU one-off card payments need 3D Secure when SCA applies. Stripe Checkout and Payment Intents API both handle this automatically — **don't try to do SCA flow yourself.** PSD3 is in draft and won't ship before late 2026, so PSD2 rules continue.

**Practical translation for session booking:**
- A "pay to join this class" flow = a one-off PaymentIntent, **not** a saved-card auto-charge.
- For first-time payment, use Stripe Checkout (hosted) or a confirmation card form — the user actively confirms.
- After the first confirmed payment, subsequent off-session charges (e.g., late-cancel fee) need either Strong Customer Authentication exemption (low-value, ≤30 EUR, max 5 times) or an explicit mandate stored at first payment.

**DECISION for MotionHive (when payments wire to sessions):**
- **One-off session purchases → Stripe Checkout.** Hosted, SCA-handled, no fee logic of our own. Mirrors how our subscription module already does first-charge confirmation.
- **Late-cancel / no-show fees → save a SetupIntent at booking with `usage='off_session'`**, then charge off-session when the cutoff is missed. Stripe will trigger SCA if the bank requires it; we surface the failure as a notification, not an error toast.
- **No surprise charges, ever.** Booking flow shows the fee policy. Saving a card requires explicit consent (a checkbox).

### 16.7 Feature parity — what to build vs. skip vs. defer

From the comparison of Mindbody / Acuity / ClassPass / Calendly, here's what an instructor-facing class platform is actually expected to have:

| Feature | Mindbody | Acuity | Calendly | **MotionHive verdict** |
|---|---|---|---|---|
| Calendar sync (Google/Outlook/Apple) | ✓ | ✓ | ✓ core | **Defer** — manual iCal export (one-way) is enough for v2 |
| Automated email/SMS reminders | ✓ | ✓ | ✓ | **Build** — needs jobs module first |
| Payment processing | ✓ | ✓ | ✓ | **Build** — partially exists (Stripe Connect); wire to sessions |
| Recurring classes | ✓ | ✓ | ✓ | ✓ Have it |
| Waitlist | ✓ | ✓ | — | **Build** (see 16.5) |
| Cancel/reschedule self-serve | ✓ | ✓ | ✓ | ✓ Have it |
| Multi-resource (instructor + room) | ✓ | partial | — | **Defer** — venue exists, not enforced |
| Class packs / bundle of N sessions | ✓ | — | — | **Defer** — model as subscription |
| Memberships (unlimited X / month) | ✓ | — | — | **Defer** — subscription module exists |
| Public booking page (no login) | partial | ✓ | ✓ core | **Defer** — auth-gated v1 is fine |
| Native mobile app | ✓ | — | partial | **Out of scope** |
| Check-in app | ✓ | — | — | **Defer** — `selfCheckIn` endpoint exists; build FE later |
| No-show fee automation | ✓ | partial | — | **Build** — see 16.4 |
| Class packages with expiry | ✓ | — | — | **Defer** |
| Customer profiles / history | ✓ | ✓ | partial | ✓ Have it (client module) |
| Reports & analytics | ✓ | ✓ | partial | Partial — analytics module exists |

**Verdict:** the "must build in next 6 months" shortlist is **timezone, series_id, venue wire-up, waitlist, reminders, payment-on-join, configurable cancellation window.** Everything else is **defer or skip**.

### 16.8 Quick reference — DOs and DON'Ts (consolidated)

**DO:**
- Store UTC + IANA timezone (one column, IANA string, validated).
- Use a zone-aware library (luxon / date-fns-tz) for occurrence expansion.
- Add `series_id` before building any recurrence-edit feature.
- Default cancellation to **12 hours**, per-session configurable.
- Build **auto-add waitlist**, with a 2-hour pre-start cutoff for auto-promotion.
- Use **Stripe Checkout** for first-time session payments.
- Use **SetupIntent with `usage='off_session'`** for cancel/no-show fees, with explicit user consent.
- Subset RRULE when migrating (FREQ + INTERVAL + BYDAY + COUNT + UNTIL only).
- Provide one-way `.ics` export before bothering with two-way calendar sync.

**DON'T:**
- Don't store offset-only timezones ("+02:00"). DST will silently break things.
- Don't build first-to-claim waitlist (more complexity, no payoff over auto-add).
- Don't roll your own SCA flow — let Stripe Checkout or Payment Intents handle 3DS.
- Don't pre-generate years of instances. Cap at 12–52 weeks; expand more on demand.
- Don't add EXDATE without RRULE — they only make sense together.
- Don't allow auto-charge of saved cards without explicit consent at the time of save.
- Don't ship "this and following" edits until `series_id` exists.
- Don't conflate per-session-price and membership-included-session at the session level — classify at product/subscription level.
- Don't keep the 2-hour cancellation default; we're below industry norm.

### 16.9 Sources

- [Calendar Recurring Events: Best Database Storage Method — codegenes.net](https://www.codegenes.net/blog/calendar-recurring-repeating-events-best-storage-method/)
- [The Complex World of Calendars: Database Design — Medium](https://medium.com/tomorrowapp/the-complex-world-of-calendars-database-design-fccb3a71a74b)
- [iCalendar RFC 5545 §3.8.5.3 Recurrence Rule](https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html)
- [The Deceptively Complex World of Calendar Events and RRULEs — Nylas](https://www.nylas.com/blog/calendar-events-rrules/)
- [iCalendar RFC 5545 §3.8.5.1 Exception Date-Times](https://icalendar.org/iCalendar-RFC-5545/3-8-5-1-exception-date-times.html)
- [Why we should use IANA Time Zones, Not Just Offsets — Medium](https://medium.com/@rongalinaidu/why-we-should-use-iana-time-zones-not-just-offsets-b3e19d005cc7)
- [Time, Timezones, and Timestamps — Caduh](https://www.caduh.com/blog/time-timezones-and-timestamps)
- [ClassPass cancellation policy](https://help.classpass.com/hc/en-us/articles/207942743-What-is-the-reservation-cancellation-policy)
- [Mindbody — How to charge no-show / late-cancel fees](https://support.mindbodyonline.com/s/article/No-Show-Late-Cancel-Fees-How-to-Charge-Fees?language=en_US)
- [Mindbody — Better Class Waitlists](https://www.mindbodyonline.com/business/education/product-waitlist-improvements)
- [Vibefam — Best Booking Window Strategy](https://vibefam.com/best-booking-window-strategy-for-high-demand-gym-studio-classes/)
- [Stripe — Strong Customer Authentication readiness](https://docs.stripe.com/strong-customer-authentication)
- [Stripe — A guide to PSD3](https://stripe.com/guides/what-platforms-and-marketplaces-can-expect-from-psd3)
- [Google Calendar — "this and following events" pattern](https://www.usecarly.com/blog/how-to-set-up-recurring-meetings-google-calendar/)
- [Acuity Scheduling vs Mindbody — Vev](https://vev.co/blog/acuity-scheduling-vs-mindbody)
- [Mindbody vs Acuity Scheduling — Capterra](https://www.capterra.com/compare/40229-191978/MINDBODY-vs-Acuity-Scheduling)
