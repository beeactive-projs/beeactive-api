# Sessions — Backend Audit & Build Plan

> **Date:** 2026-05-15
> **Author:** end-to-end audit run against the live local API + DB after applying migration 046.
> **Scope:** what is built, what is broken, what is missing, what is needed before frontend work begins.
> **Companions:** `SESSIONS_CONTEXT.md` (legacy code map), `SESSIONS_DESIGN_VS_PLAN.md` (design reconcile), `PROMPTS-for-claude-code.md` (FE/BE handoff prompts), `MotionHive - Sessions deep dive _standalone_.html` (24 artboards).

---

## 0. TL;DR

The sessions backend is at **~35% of the end state** the design implies — strong foundation (schema is sound, recurrence engine works, template CRUD is clean and tested) but **all client-facing flows are unbuilt**: clients cannot view, book, cancel, or attend a session through the API. Every endpoint that exists is instructor-only.

**Three concrete defects** found by live probing that need to be addressed before any flow is layered on top:

1. **🚨 IDOR — venue/group ownership not validated.** An instructor can create a session attached to a `venueId` or `groupId` they do not own. Verified live: instructor `2762e1d6-…` created template `64136ba5-…` referencing venue `96251b41-…` owned by `c6425454-…`. No 403, no 400 — 201 Created. Same defect applies to `groupId`.
2. **No "started in past" guard.** `firstStartAt: "2020-01-01T07:00:00Z"` is accepted. Session in the past is created with status `ACTIVE`.
3. **`POST /preview-recurrence` and other write paths return HTTP 201 instead of 200** (cosmetic, mild Swagger drift — `previewRecurrence` is a read-only dry-run; returning 201 is wrong semantically).

**The single biggest hidden gap:** Migration 046 was authored but **never applied locally** until this audit ran it. If the same is true in any non-production environment, sessions will appear "built" but the API will 500 on first call. Verify `\dt session_template` in every environment before treating the module as deployable.

---

## 1. What's working today (verified live)

### 1.1 Schema (migration 046 — applied, confirmed)
All four tables present with correct columns, CHECK constraints, indexes, and FK relationships:

| Table | Rows | Notes |
|---|---|---|
| `session_template` | 0 | Owner-scoped via `instructor_id`; CHECK on online-needs-URL + group-only-needs-group |
| `session_instance` | 0 | Per-occurrence with overrides; unique on `(template_id, occurrence_index)`; CHECK end>start |
| `session_participant` | 0 | Unique on `(instance_id, user_id)`; immutable snapshot at booking |
| `session_reminder_schedule` | 0 | Unique on `(participant_id, kind)`; partial index for `sent_at IS NULL` |

Enums created: `session_type`, `session_access`, `session_location_kind`, `session_meeting_provider`, `session_template_status`, `session_instance_status`, `session_participant_status`, `session_reminder_kind`.

### 1.2 Endpoints (7, all `/sessions/templates` and instructor-gated)

Verified end-to-end against `http://localhost:3800`:

| Endpoint | Auth | Outcome |
|---|---|---|
| `POST /sessions/templates/preview-recurrence` | INSTRUCTOR/SUPER_ADMIN | ✅ Computes occurrences with DST and timezone correctly. WEEKLY/DAILY/MONTHLY all pass. Returns 201 (should be 200). |
| `POST /sessions/templates` | INSTRUCTOR/SUPER_ADMIN | ✅ Creates template + initial instances. Slug auto-collide (`slug-test`, `slug-test-2`). Meeting provider auto-detected. |
| `GET /sessions/templates` | INSTRUCTOR/SUPER_ADMIN | ✅ Pagination + filters (`tab`, `type`, `access`, `locationKind`, `groupId`, `q`) work. `limit>100` rejected. `page<1` rejected. |
| `GET /sessions/templates/:id` | INSTRUCTOR/SUPER_ADMIN | ✅ Returns 404 for cross-instructor (no info leak). |
| `PATCH /sessions/templates/:id` | INSTRUCTOR/SUPER_ADMIN | ✅ Partial update; provider re-derived on URL change. |
| `DELETE /sessions/templates/:id` | INSTRUCTOR/SUPER_ADMIN | ✅ Soft-deletes template, cascade-cancels future scheduled instances in the same tx. |
| `POST /sessions/templates/:id/regenerate` | INSTRUCTOR/SUPER_ADMIN | ✅ Rejects non-recurring (400). count>104 rejected. |

### 1.3 Validation that's already correct

- `daysOfWeek` is **1=Mon..7=Sun** (design-aligned). Out-of-range rejected.
- `cancellationCutoffHours` default = **24** (design-aligned, 0..168 enforced).
- `capacity` 1..1000 enforced.
- `priceAmountCents ≥ 0`, `priceCurrency` max 3 chars enforced.
- `durationMinutes` 5..480 enforced.
- `meetingUrl` must pass `IsUrl()` — `javascript:alert(1)` rejected.
- `timezone` validated against `Intl.supportedValuesOf('timeZone')`. Bogus zones rejected.
- `endAfterOccurrences=3` correctly caps generation at 3 even when `initialInstancesCount=10`.
- Recurrence engine handles **DST spring-forward** (Bucharest 2026-03-29) — keeps local wall-clock time and shifts UTC by 1h. Confirmed live.
- **MONTHLY anchor preserved**: Jan 31 + 1 month → Feb 28, but March returns to 31. Correct Luxon behavior.
- ParseUUIDPipe catches malformed UUIDs (400 with clear message).
- Soft-delete works: GET after DELETE returns 404; second DELETE returns 404.

### 1.4 Tests (unit only)

- `recurrence.service.spec.ts` — covers DAILY/WEEKLY/MONTHLY, DST, end conditions
- `session-template.service.spec.ts` — covers create/list/get/update/delete/regenerate/slug

No e2e tests. No controller tests. No tests for cross-instructor access. No tests for the IDOR cases below.

---

## 2. Defects found by live probing

### 2.1 🚨 IDOR — foreign venue/group attachment (security, HIGH)

**Reproducer (verified):**
```http
POST /sessions/templates
Authorization: Bearer <token for instructor@motionhive.fit, id=2762e1d6-…>
{
  "title":"IDOR foreign venue", "type":"OPEN", "access":"FREE",
  "locationKind":"IN_PERSON",
  "venueId":"96251b41-c7a6-442a-9bde-8c0df9fb1224",   // owned by c6425454-…
  "durationMinutes":30, "timezone":"Europe/Bucharest",
  "isRecurring":false, "firstStartAt":"2026-06-15T07:00:00Z"
}
→ 201 Created. Template attached to a venue belonging to another instructor.
```

**Root cause:** `SessionTemplateService.create` ([src/modules/session/services/session-template.service.ts:77-167](../../../src/modules/session/services/session-template.service.ts#L77-L167)) trusts `dto.venueId` and `dto.groupId` as-is. The only checks are `IsUUID()` at the DTO layer plus PostgreSQL FK existence on insert. **No ownership predicate.**

**Why this matters:**
- Cross-instructor data leakage. If FE displays the attached venue, the user is shown someone else's resource.
- Pollutes the foreign owner's analytics and search index.
- Will be a footgun for the public showcase angle (`c-showcase`): publicly visible session pointing at someone else's gym.
- Same defect for `groupId` — instructor could publish a `GROUP_ONLY` session pointing at a group they don't own, and the group's members could see it in `discover` (when that endpoint lands).

**Fix:** before inserting/updating, look up the venue/group and assert `venue.instructor_id === caller.id` (for venue) and `group.instructor_id === caller.id` OR `caller is a member with WRITE permission` (for group). Return 404, not 403, to avoid leaking existence (matches the convention used elsewhere — confirmed by cross-instructor GET behavior).

**Scope:** also touch `UpdateTemplateDto` and `venueIdOverride` on `PATCH /sessions/instances/:id` (when that endpoint lands).

### 2.2 No "starts in the past" guard

`firstStartAt: "2020-01-01T07:00:00Z"` was accepted live, status = `ACTIVE`. **Fix:** at DTO layer, require `firstStartAt > now()` with a small grace window (e.g. allow up to 5 minutes in the past to absorb client clock skew). Same guard for `regenerate` (instances dated before now).

### 2.3 Wrong HTTP method semantics on read-only writes

`POST /sessions/templates/preview-recurrence` is a **pure dry-run** — no DB writes, no side effects. NestJS defaults `POST` handlers to 201, which mis-signals "Created". **Fix:** add `@HttpCode(200)` on the controller method. (Same fix may apply to `regenerate` if it returns 200 semantics, but `regenerate` does create rows so 201 is correct.)

### 2.4 Test coverage holes (factually missing, not "yet")

- No test asserts that **cross-instructor GET/PATCH/DELETE returns 404**. The current code does this correctly because `where: { instructorId, id }`, but there's no regression test. A future refactor could quietly remove the scope.
- No test asserts that **`waitlistEnabled=true` + capacity=N stops adding past N** (because participant booking is unbuilt — flagged below).
- No test covers the **slug collision loop** beyond the 0/1 transition (n=2..99 fallback, random-suffix fallback at n=99).
- No e2e tests at all — no test runs the controller through the guard stack.

### 2.5 Missing in code despite being in schema

- `attendedCount` on `session_instance` is nullable, but no service writes it. Will stay NULL until post-session attendance lands.
- `conflicting_instance_ids` (JSONB) — column exists, never written. Conflict warnings are referenced in `CreateTemplateResult.warnings[]` but the array is always returned empty (see `session-template.service.ts:162`, `:385`). **Conflict detection is unimplemented.**
- `session_reminder_schedule` — table created, never written to. Reminder dispatch requires the jobs module (per `project_jobs_module_pending.md`).
- Search indexing not wired. `SearchIndexService.upsertSession` from the legacy module is gone. New sessions never enter the search index.

### 2.6 Notification surface — zero

`notification-types.ts:13-20` declares 7 session notification types (`SESSION_REMINDER_24H/1H`, `SESSION_CANCELLED`, `SESSION_RESCHEDULED`, `SESSION_STATUS_CHANGED`, `PARTICIPANT_JOINED`, `PARTICIPANT_LEFT`). **Zero builders exist.** No `session/notifications.ts` file. `SessionTemplateService` does not import `NotificationService` or `NotificationOutbox`.

When client-side flows land (book, cancel, approve, etc.), every state change must produce a notification. This is a NotificationOutbox case (state changes happen inside a transaction; notify after commit).

---

## 3. What's missing vs. the design

Mapped against the 24 artboards and the `PROMPTS-for-claude-code.md` API contract.

### 3.1 Instructor-facing endpoints (5 missing)

| Endpoint | Artboard need | Status |
|---|---|---|
| `GET /sessions/instances` | `i-list-*`, `i-cal-*` calendar grid | **MISSING.** Calendar cannot render. |
| `GET /sessions/instances/:id` | `i-detail-in`, `i-detail-on` | **MISSING.** Detail page has no data source. |
| `PATCH /sessions/instances/:id` | `i-detail-*` (edit-this exception) | **MISSING.** No per-occurrence override write path. |
| `POST /sessions/instances/:id/cancel` (`scope=this|thisAndFuture|series`) | `i-cancel` | **MISSING.** Currently only template DELETE exists. |
| `POST /sessions/instances/:id/reschedule` | `i-cancel` reschedule offer | **MISSING.** |

### 3.2 Participant lifecycle endpoints (5 missing — entire user-facing flow)

| Endpoint | Artboard | Status |
|---|---|---|
| `POST /sessions/instances/:id/book` | `c-detail-*`, `m-booking` | **MISSING — blocks all client UX.** |
| `POST /sessions/instances/:id/cancel-booking` | `m-cancel` | **MISSING.** |
| `POST /sessions/instances/:id/participants/:pid/approve` | `i-approvals`, `i-detail-*` | **MISSING.** Cannot approve a `PENDING_APPROVAL` row. |
| `POST /sessions/instances/:id/participants/:pid/decline` | `i-approvals` | **MISSING.** |
| `PATCH /sessions/instances/:id/participants/:pid` (attended, privateNote) | `i-attendance` | **MISSING.** |

### 3.3 Public + utility endpoints (5 missing)

| Endpoint | Artboard | Status |
|---|---|---|
| `GET /sessions/discover` | `c-discover`, `m-discover`, `c-showcase` | **MISSING.** No public browsing of OPEN/FREE sessions. Marketing wedge unblocked by this. |
| `GET /sessions/instances/:id/public` (redacted for GROUP_ONLY non-members) | `c-detail-blocked` | **MISSING.** |
| `GET /sessions/my` | `c-mysessions`, `m-mysessions` | **MISSING.** A booked client has no way to list their bookings. |
| `GET /sessions/instances/:id/ics` | `c-confirm` ICS download | **MISSING.** |
| `GET /sessions/instances/:id/join-info` | `m-dayof` countdown + Join | **MISSING.** Mobile day-of cannot poll. |
| `POST /sessions/instances/:id/follow-up` (audience: all/attended/noshow) | `i-attendance` follow-up composer | **MISSING.** |

### 3.4 Cross-cutting that's not endpoint-shaped

- **Conflict detection** on save — design says non-blocking warning with `conflictingInstanceIds` populated. Schema column exists; logic does not.
- **`meetingUrl` snapshot at booking** — schema has `snapshot_meeting_url` on participant; nothing fills it (book flow unbuilt anyway).
- **Search indexing** — new sessions need to be upserted into `search_doc` so the global search returns them. Currently zero coverage.
- **`endAt` on instances** — written by service as `start + duration`; not updated when template duration changes (correct — instances are independent snapshots) but **not updated when a per-occurrence override changes duration either** (the override schema doesn't include duration). Either add the override or document the limitation.
- **Soft-delete on instance** — column exists (paranoid), no endpoint surfaces it. Cancel uses status flag, not soft-delete. Inconsistent — pick one (recommendation: keep paranoid for hard-delete-with-recovery; use status for the cancellation flow).
- **Waitlist auto-promote** — entire feature missing. No worker, no FOR UPDATE pattern on book, no transition.

---

## 4. Missing user flows (the holistic picture)

What the user/instructor will try to do and can't yet:

### 4.1 Instructor (8 broken flows)

1. **See my upcoming sessions on a calendar** — no `/sessions/instances` list endpoint.
2. **Open a single session and see who booked** — no instance-level detail with participants payload.
3. **Approve / decline a pending booking** — no approve/decline endpoints.
4. **Cancel just one occurrence of a series** — no `scope=this` cancel path.
5. **Cancel this + all future occurrences** — no `scope=thisAndFuture`.
6. **Mark someone as attended after the session** — no `PATCH participant.attended`.
7. **Send a follow-up message ("Thanks", "Here's homework") to today's attendees** — no follow-up endpoint.
8. **Get an `.ics` link to share** — no ICS export.

### 4.2 Client (6 fully blocked flows — the entire client UX)

1. **Browse public sessions** without login (showcase). No discover endpoint.
2. **See a session detail page** (open, gated, blocked variants). No public instance fetch with redaction.
3. **Book a session** (with optional booking note). No book endpoint.
4. **See my upcoming bookings**. No `/sessions/my`.
5. **Cancel my booking** (with cancellation window enforcement). No cancel-booking endpoint.
6. **Day-of: see countdown + Join button at −5 min for online sessions**. No `join-info` endpoint.

### 4.3 Public (1 blocked, but the highest-leverage marketing flow)

1. **Open `motionhive.app/s/<instructor-slug>/<session-slug>` from a non-MotionHive user** (link sharing on social, search engines). The slug is generated and unique per instructor. The route does not exist on the BE yet, nor is the slug surfaced in any FE route or API response that an unauthenticated visitor could discover.

---

## 5. Security review

What's secure today, what isn't, what needs hardening before any of the missing endpoints land.

### 5.1 Secure-by-default (✅)

- **Auth**: every endpoint behind `AuthGuard('jwt')` + `RolesGuard`. Verified live: anonymous → 401, USER → 403, ADMIN (not in role list) → 403, SUPER_ADMIN/INSTRUCTOR → 200.
- **Ownership scoping**: `findOne({ where: { id, instructorId } })` — cross-instructor reads return 404 (no existence leak). Same pattern on update/delete/regenerate.
- **Validation**: `whitelist: true` + `transform: true` global pipe in `main.ts`. DTOs use class-validator strictly. Unknown fields stripped.
- **ParseUUIDPipe** on every `:id` param.
- **Throttling**: per-endpoint `@Throttle()` — 60/min on preview, 30/hr on create, 10/hr on delete + regenerate.
- **CHECK constraints** at DB layer: `chk_online_has_url`, `chk_group_only_has_group`, `chk_end_after_start`, capacity 1..1000, etc. Even a SQL-level malicious insert via a foreign service can't bypass these.
- **Soft-delete (paranoid)** on template + instance — accidental delete is recoverable.
- **Snapshot pattern** on participant — price/cutoff/meeting URL are captured at booking, immune to later template changes. (Good. Will protect us when payments wire in.)
- **JSONB recurrence** — Sequelize parameterises, no SQL injection vector.
- **Slug**: server-generated, stored. Not user-controlled, so no XSS via URL.

### 5.2 Vulnerable today (❌)

| # | Severity | Issue | Where |
|---|---|---|---|
| S1 | HIGH | IDOR on `venueId`/`groupId` — instructor can attach session to foreign resource | Create + Update, [session-template.service.ts:96-97](../../../src/modules/session/services/session-template.service.ts#L96-L97) |
| S2 | MED | No "starts in past" guard — sessions can be backdated | Create DTO |
| S3 | MED | No HTML/script escape on output. `<script>alert('xss')</script>` is persisted in `title` and returned **as-is**. Verified live. | Service does not sanitize; FE must escape. **Decide:** allow rich text or strip. Either is OK but document and enforce. |
| S4 | LOW | XSS-shaped slug derived from title — current slugifier strips HTML to `script-alert-xss-script`. Safe by accident, but couple it explicitly via a slug allow-list (`[a-z0-9-]+` only — already true). |
| S5 | LOW | Soft-deleted template — can it be re-listed via paranoid override? Audit `findOne(..., paranoid: false)` paths (slug-collision check does this on purpose; verify no other path does). |
| S6 | LOW | Description column is `TEXT` with no max length. A malicious instructor could insert MBs of text and inflate list responses. Cap at 4000 chars at DTO. |
| S7 | LOW | `meetingUrl` is `IsUrl()` but allows http (not just https). Consider forcing `protocols: ['https']` since meeting URLs are always TLS. |

### 5.3 To-be-built endpoints — security checklist

Every new endpoint must:

1. **Re-check ownership** of any referenced resource on every write (venue, group, participant, instance — by traversing to instructor).
2. **404, not 403** for cross-owner access — matches venue module convention; avoids existence leaks.
3. **Validate the booker can book**: access enforcement — `OPEN`/`FREE` → anyone; `CLIENTS_ONLY` → has `instructor_client` ACTIVE row; `GROUP_ONLY` → has `group_member` row.
4. **Approval orthogonal to access** — `approvalRequired=true` ⇒ all bookings land `PENDING_APPROVAL` regardless of access kind.
5. **Pessimistic lock on book**: `SELECT … FOR UPDATE` on the instance row, count active participants, decide CONFIRMED vs WAITLISTED, insert. Match the legacy `joinSession` pattern.
6. **Time-window enforcement on cancel** — server-side, never trust FE. Use the participant's snapshot `snapshot_cancel_cutoff_h`, not the current template value.
7. **Redaction on public endpoint** — for `GROUP_ONLY` non-members: return `{title, instructorName, startAt, type, access}` only. No description, no location, no participants.
8. **No PII in error messages** — current responses are clean; keep them clean.
9. **Rate limit every public endpoint** — `discover`, `instance/:id/public`, `join-info` need throttling. `book` should be 5/min/user.
10. **CSRF**: API is stateless JWT; no CSRF concern, but **never accept token in query string** — header only.
11. **Idempotency on book** — UNIQUE `(instance_id, user_id)` already prevents double-book at DB layer. Service must surface as `409 ALREADY_BOOKED`, not 500.
12. **Instructor cannot book their own session** — assert `participant.user_id !== instance.instructor_id` (sanity, prevents self-attendance gaming).

---

## 6. Design decisions to lock now (before building)

These are 5-minute decisions that block downstream work. Make them:

| # | Decision | Recommendation |
|---|---|---|
| D1 | Waitlist promotion = auto-add or instructor approval? | **Auto-add** (Mindbody pattern). 2-hour pre-start cutoff. Approval-required flow handles the "I want to vet bookings" case via `approvalRequired=true`. |
| D2 | Cancellation default | Keep current **24h, configurable per template** (already implemented). |
| D3 | Cross-owner access response | **404, never 403** (matches venue module, avoids leaks). |
| D4 | Public access pattern | Slug-based: `GET /sessions/public/:instructorSlug/:templateSlug` returns the next upcoming instance (instance-not-template). Pretty URLs without exposing UUIDs. |
| D5 | Description sanitization | **Strip HTML server-side** on save. Plain text only. Markdown is a future feature; don't open that surface now. |
| D6 | Allow self-booking? | **No** — instructor cannot be a participant on their own session. |
| D7 | Public `discover` returns OPEN+FREE only, or also CLIENTS_ONLY for logged-in eligible users? | **Two modes**: unauthed → OPEN+FREE only; authed → union of OPEN+FREE + (CLIENTS_ONLY if active client) + (GROUP_ONLY if member). |
| D8 | Soft-delete vs status-cancel for instance lifecycle | **Status `CANCELLED`** for normal flow (preserves history, allows reporting). **Soft-delete** reserved for accidental/hard-delete-with-recovery via SUPER_ADMIN tool only. |
| D9 | Notification system for sessions | Use `NotificationOutbox` (already exists, see `notification/notification-outbox.ts`). State changes happen in tx; outbox flushes post-commit. |
| D10 | "Edit series" semantics | **Edit propagates to future instances only** that are not flagged `isOverride=true`. Past + overridden instances untouched. Document this. |

---

## 7. Build plan — backend, prioritised

Each phase ships value standalone; each is reviewable in one PR (~300-700 LOC). Total: 7 phases.

### Phase A — Plug the security holes (~250 LOC)
**Goal:** make what already exists safe before extending.

1. Inject `VenueService` and `GroupService` into `SessionTemplateService`. Add `assertVenueOwnership(venueId, instructorId)` and `assertGroupOwnership(groupId, instructorId)` helpers. Call from create + update. 404 on mismatch.
2. Add `firstStartAt > now() - 5min` guard at DTO.
3. Add `@HttpCode(200)` to `previewRecurrence`.
4. Server-side strip HTML from `title` + `description` (use `sanitize-html` package, already in tree for blog).
5. Cap `description` at 4000 chars in DTO.
6. Force `meetingUrl` to https-only (`@IsUrl({ protocols: ['https'], require_tld: true })`).
7. **Tests**: 7 new spec cases — IDOR-foreign-venue (expect 404), IDOR-foreign-group, past-date rejection, XSS-stripped, oversize description rejected, http URL rejected, preview returns 200.

### Phase B — Instance read surface (~400 LOC)
**Goal:** unblock the calendar and detail pages.

1. `GET /sessions/instances` — list with filters `dateFrom`, `dateTo`, `instructorId` (defaults to caller), `status`, `templateId`, `view=week|day|month`. Default 100 rows max. Paginated. Eager-load `template` (title, type, access, etc.) and `instructor` (id, name, avatar). **Visibility-scoped**: instructor sees own; non-instructor sees only instances where they have a `session_participant` row OR the instance's template `access` is `OPEN`/`FREE`.
2. `GET /sessions/instances/:id` — full detail. Owner sees all. Non-owner: visibility check → 404 or redacted-public shape.
3. Eager-load participants (count + first 10 for preview; full list paginated separately).
4. Compute virtual `effectiveTitle`, `effectiveDescription`, `effectiveVenueId`, `effectiveMeetingUrl`, `effectiveCapacity` from override+template at the service layer; FE consumes pre-resolved values.
5. **Tests**: 8 cases — instructor sees own list, non-instructor sees nothing if no participation, OPEN instance visible to USER, GROUP_ONLY hidden from non-member, redacted detail for blocked, eager-load shape, pagination, date range bounds.

### Phase C — Participant booking flow (~600 LOC, the hardest)
**Goal:** clients can book. The product becomes real here.

1. `POST /sessions/instances/:id/book` — body `{ bookingNote? }`.
   - Pessimistic FOR UPDATE on instance.
   - Re-check access (CLIENTS_ONLY / GROUP_ONLY) against caller.
   - Re-check `approvalRequired` → PENDING_APPROVAL.
   - Count active participants; if `≥ effectiveCapacity`:
     - `waitlistEnabled=true` → insert WAITLISTED with `waitlist_position = max(position)+1`.
     - else → 409 `CAPACITY_HIT_NO_WAITLIST`.
   - Else insert CONFIRMED.
   - Snapshot fields filled from template (price, currency, cutoff, location text, meeting URL).
   - Increment denormalised counter atomically in same tx.
   - Outbox: `participant_joined_for_instructor` + `booking_confirmed_for_user`.
   - Insert 24h + 1h `session_reminder_schedule` rows (worker dispatches when jobs module lands).
2. `POST /sessions/instances/:id/cancel-booking` — body `{ reason?, message? }`.
   - Cancellation window from **participant snapshot** (immutable terms), not template.
   - Mark CANCELLED + decrement counter.
   - If waitlist non-empty: promote oldest WAITLISTED → CONFIRMED **only if** `now() < startAt - 2 hours`. Otherwise leave seat empty.
   - Outbox: `participant_left_for_instructor` + (promoted user, if any) `booking_promoted`.
   - Delete pending reminder schedule rows for this participant.
3. `POST /sessions/instances/:id/participants/:participantId/approve` and `…/decline` — instructor only. Approve: PENDING_APPROVAL → CONFIRMED (or WAITLISTED if capacity hit since). Decline: → DECLINED.
4. `PATCH /sessions/instances/:id/participants/:participantId` — body `{ attended?, privateNote? }`.
5. **Tests**: 15+ — booking happy path, race condition (two simultaneous), waitlist trigger, auto-promote happens at cancel, auto-promote DOES NOT happen inside 2h window, approval flow, decline flow, decline removes from waitlist position, snapshot immutability across template change, can't book own session, can't double-book, ACCESS_DENIED variants, capacity 0 (uncapped), waitlist position contiguity after cancellations.

### Phase D — Instance writes (cancel/reschedule, edit-this/series) (~400 LOC)

1. `POST /sessions/instances/:id/cancel` — body `{ scope: 'this'|'thisAndFuture'|'series', reason?, message?, rescheduleTo? }`.
   - `this`: set instance status CANCELLED. Notify all CONFIRMED + WAITLISTED participants.
   - `thisAndFuture`: bulk update `WHERE template_id = X AND start_at >= this.start_at`. Notify each instance's participants.
   - `series`: template status CANCELLED + all future instances CANCELLED. Notify everyone.
   - `rescheduleTo` populated → create offer record (or notify with rebook CTA — design TBD).
2. `PATCH /sessions/instances/:id` — set per-occurrence overrides (`titleOverride`, `descriptionOverride`, `venueIdOverride`, `meetingUrlOverride`, `capacityOverride`, `isOverride=true`). Same ownership rules. **Capacity-override < current confirmed count → 400**.
3. Conflict detection: on create + edit + reschedule, find overlapping instances for same instructor within ±2h, write `conflictingInstanceIds[]` on each side, return as `warnings`. Non-blocking.
4. **Tests**: 10 — scope variants, capacity-shrink rejection, conflict detection symmetry, reschedule emits notifications, edit propagates only to non-overridden future siblings.

### Phase E — Public + discover surface (~350 LOC)

1. `GET /sessions/discover` — public (`@Public()`). Query: `q`, `type`, `access`, `locationKind`, `instructorId`, `groupId`, `dateFrom`, `dateTo`, page, limit. Throttle 30/min. **Unauthenticated → OPEN+FREE only**. Authenticated → union with eligible CLIENTS_ONLY + GROUP_ONLY.
2. `GET /sessions/public/:instructorSlug/:templateSlug` — resolves to next upcoming instance. Returns the **redacted-public** shape always (no participants, no private notes). 404 if not OPEN/FREE.
3. `GET /sessions/instances/:id/public` — same redacted shape but UUID-addressable for FE share links.
4. **Tests**: 6 — unauthed sees only OPEN+FREE, slug resolution, slug→UUID consistency, throttle, GROUP_ONLY hidden from non-members, instance status filtered (no CANCELLED in discover).

### Phase F — Client utility endpoints (~250 LOC)

1. `GET /sessions/my` — caller's bookings. Tabs: `upcoming`, `pendingApproval`, `past`, `cancelled`. Paginated.
2. `GET /sessions/instances/:id/ics` — generate iCalendar payload. Single event. Headers: `Content-Type: text/calendar; charset=utf-8`. Anonymous if instance access is OPEN/FREE; auth required otherwise.
3. `GET /sessions/instances/:id/join-info` — body `{ meetingUrl, joinActiveFrom, joinActiveUntil, instructorJoined }`. Only available to confirmed participants. `joinActiveFrom = startAt - 5min`. `joinActiveUntil = startAt + 15min`.
4. **Tests**: 8 — my-sessions filtering, .ics has correct DTSTART/DTEND/SUMMARY, join-info auth-gated, join-info time math, join-info denied for non-participant.

### Phase G — Notifications + reminders (~200 LOC, needs jobs module)

1. Create `session/notifications.ts` with builders for all 7 declared types. Builders take primitives (id, name, date), not entities.
2. Wire builders into book/cancel/approve/decline/reschedule/follow-up flows via `NotificationOutbox`.
3. Reminder dispatch — **deferred until jobs module exists**. Schema is ready (`session_reminder_schedule`), service writes the rows now (Phase C); worker is a future PR keyed off `project_jobs_module_pending.md`.
4. Follow-up endpoint: `POST /sessions/instances/:id/follow-up` — body `{ audience: 'all'|'attended'|'noshow'|'userIds', message }`. Filters participants accordingly, fans out via outbox.
5. **Tests**: 8 — notification produced on each state change, outbox discards on tx rollback, follow-up audience filters correctly.

---

## 8. Tests strategy — what "robust" means

Each phase adds spec coverage to the existing 2 spec files. Target by end of Phase G:

| Layer | Today | Target |
|---|---|---|
| Recurrence engine | 1 spec | 1 spec (sufficient) |
| Template service | 1 spec | 1 spec + 5 new cases (Phase A) |
| Instance service | 0 | 1 spec, ~10 cases (Phase B + D) |
| Booking service | 0 | 1 spec, ~20 cases (Phase C — race conditions critical) |
| Public service | 0 | 1 spec, ~6 cases (Phase E) |
| Notifications wiring | 0 | 1 spec, ~8 cases (Phase G) |
| **e2e** | 0 | 1 e2e spec covering: full instructor flow (create→regenerate→cancel-series), full client flow (browse→book→cancel→rebook→attend), IDOR regression suite |
| Security regression | 0 | dedicated spec — IDOR, XSS, oversize input, throttle, cross-owner 404 |

Recommended pattern: each spec gets a **named fixture builder** (`makeInstructor`, `makeClient`, `makeTemplate`, `makeInstance`) to keep tests readable. Don't share state across tests.

---

## 9. Docs strategy — where things live

Per the project standards (every module has `common/docs/<module>.docs.ts`):

- [src/common/docs/session.docs.ts](../../../src/common/docs/session.docs.ts) — already exists with 7 entries. **Extend** as each phase adds endpoints; never inline `@ApiEndpoint({...})` in controllers.
- Update `src/modules/session/PAYMENT-FLOWS.md` — wait, that's payments. For sessions, add `src/modules/session/SESSION-FLOWS.md` once Phase C lands. Document the booking flow, waitlist promotion rules, and cancellation window math.
- Update `CLAUDE.md` "Session Module" section after every phase (currently the module isn't described there — add it).
- Keep this audit doc updated as defects close: change "🚨 IDOR" status, mark phases complete, append new findings.

---

## 10. Quick checklist — order of operations

The minimum to be safe and unblock the FE design:

- [ ] **Phase A** — IDOR fix + sanitization + past-date guard. ~1 day. Ship before any other phase.
- [ ] **Phase B** — Instance list + detail endpoints. ~2 days. **Unblocks calendar and detail FE.**
- [ ] **Phase C** — Booking flow. ~4 days (race conditions, edge cases). **Unblocks all client UX.**
- [ ] **Phase D** — Cancel/reschedule + per-occurrence edit + conflict detection. ~2 days.
- [ ] **Phase E** — Public/discover. ~2 days. **Unblocks marketing wedge + showcase.**
- [ ] **Phase F** — `my` + `.ics` + `join-info`. ~1 day.
- [ ] **Phase G** — Notifications + follow-up. ~1 day. (Reminders deferred until jobs module.)

**Total BE: ~13 working days** to a robust v1 that fully satisfies the design's 24 artboards.

The FE work (also ~13 working days per `SESSIONS_DESIGN_VS_PLAN.md` Phases 2-7) can begin in parallel after Phase B lands — that's when the API has enough surface to mock against. Don't start FE before Phase B; the calendar shape would be guesswork.

---

## 11. Open questions (only you can answer)

- [ ] **D1** Waitlist auto-add or approval-to-promote? Recommendation: auto-add.
- [ ] **D4** Public URL pattern: `motionhive.app/s/<instructor>/<session>`? Or different?
- [ ] **D7** Does "discover" for logged-in users include their eligible CLIENTS_ONLY/GROUP_ONLY sessions, or only OPEN/FREE everywhere?
- [ ] **D9** Notification channels per type — do reminders go email+inapp+push? Today only email+inapp exist.
- [ ] After Phase G, is the **jobs module** the next thing we build (so reminders actually fire), or do we ship sessions without reminders and let instructors do it manually?

Answer these and Phase A unblocks immediately.

---

## 12. Live evidence — exact reproducers

For traceability, the precise live curl reproducers that backed the findings above:

```bash
# IDOR confirmation (S1)
TOK=$(node -e "console.log(require('jsonwebtoken').sign({sub:'2762e1d6-8a6d-4fc4-9aa0-2ff24106018c',email:'instructor@motionhive.fit'}, process.env.JWT_SECRET, {expiresIn:'1h'}))")
curl -s -X POST http://localhost:3800/sessions/templates \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"title":"IDOR","type":"OPEN","access":"FREE","locationKind":"IN_PERSON","venueId":"96251b41-c7a6-442a-9bde-8c0df9fb1224","durationMinutes":30,"timezone":"Europe/Bucharest","isRecurring":false,"firstStartAt":"2026-06-15T07:00:00Z"}'
# → 201 Created. Venue belongs to instructor c6425454-960a-41c7-b387-2159f50ece5b, not the caller.

# Past-date (S2)
curl ... -d '{"title":"Past","...,"firstStartAt":"2020-01-01T07:00:00Z"}'
# → 201, status=ACTIVE.

# XSS persistence (S3)
curl ... -d '{"title":"<script>alert(1)</script>",...}'
# → 201, title stored verbatim, slug correctly sanitized to "script-alert-1-script".

# Cross-instructor scoping (correct, no fix needed)
curl -H "Authorization: Bearer <SUPER_ADMIN token>" http://localhost:3800/sessions/templates/<my-template-id>
# → 404. Good.
```

---

*Last verified live: 2026-05-15 against branch `develop` @ `fc2b6a8`, migration 046 applied, local Postgres on port 5432, API on port 3800.*
