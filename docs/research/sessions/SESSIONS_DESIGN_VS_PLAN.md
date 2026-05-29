# Sessions — Design Proposal vs. Our Research Plan

> **Source A — Design proposal:** `~/Downloads/MotionHive (3)/PROMPTS-for-claude-code.md` plus the `MotionHive - Sessions deep dive.html` canvas (24 artboards covering instructor list, calendar, dialogs, detail screens, client desktop, client mobile, public showcase).
>
> **Source B — Our research:** `docs/research/sessions/SESSIONS_CONTEXT.md` (current code state + industry research + decisions).
>
> **Purpose:** show where the design plan and our research agree, where the design adds things we didn't think of, where our research adds things the design glossed over, and where they conflict. Then a single merged build plan we can actually execute.

---

## 1. TL;DR

The two are **highly compatible**. ~80% overlap. The design proposal is **further along on UX** (24 artboards, two viewports, public showcase, day-of mobile flow) while our research is **further along on data-model rigor** (timezone storage, series_id, RRULE migration path, cancellation policy, SCA, waitlist auto-promote, industry-sourced "do/don't" list).

**The single biggest divergence** is **payments**. The design proposal *explicitly defers* payment integration ("price is display-only, instructor invoices manually for now"). Our research assumed sessions would eventually wire to Stripe and treated payment-on-join as a §7 build target. **The design wins this argument** — payments-out-of-scope is the right v1 framing because the Stripe wiring is non-trivial and unblocks nothing UX-wise (a "Request to book" + manual invoice flow already exists in payment module).

**Three places the design is missing rigor** our research has answers for:

1. **Timezone storage.** The design says `timezone: string` (IANA) — good, but no column/migration plan, no DST behavior spec. Our research nails this.
2. **Cancellation window.** The design hardcodes 24h. Our research says default 12h, configurable per session. Trivial reconcile.
3. **Waitlist semantics.** The design says "join waitlist" + "instructor approval to promote." Our research says auto-add is industry standard (Mindbody) and lower-friction. **This is a real product decision to make.**

**Two places the design adds value** our research missed:

1. **Public showcase / unauthenticated browsing.** `OPEN` and `FREE` sessions readable without login. This is a marketing wedge we didn't price in. Big.
2. **"This / this+future / series" cancellation scope.** Concrete UX for what our research called the abstract `series_id` problem.

---

## 2. Side-by-side comparison

### 2.1 Data model

| Concept | Design proposal | Our research | Verdict |
|---|---|---|---|
| **Template vs. instance** | Explicit split: `SessionTemplate` + `SessionInstance` rows | Single `session` table; recurring = template + N instances of the same shape | **Adopt the design's split.** Cleaner. Templates own series-level state (status `ACTIVE/ENDED/CANCELLED`); instances own per-occurrence snapshots. Matches §16.2 of our research ("Google Calendar style — split the series"). |
| **Series link** | `instance.templateId` FK | Our research proposed adding a `series_id` column | Same idea. Use `templateId`. |
| **Recurrence rule** | Custom JSON: `{frequency, interval, daysOfWeek (1–7 Mon-first), endDate, endAfterOccurrences}` | Same custom JSON today; research said move to RRULE only when iCal export is needed | **Keep custom JSON.** Reconciliation: design uses **1=Mon..7=Sun**; current code uses **0=Sun..6=Sat**. Pick **1–7 Mon-first** (ISO 8601) and migrate the existing field. |
| **Session type** | `'GROUP' \| 'PRIVATE' \| 'OPEN'` | Current code: `'ONE_ON_ONE' \| 'GROUP' \| 'ONLINE' \| 'WORKSHOP'` | **Switch to the design's 3-value enum.** Cleaner. ONLINE/WORKSHOP collapse into location/duration metadata, not session-type. |
| **Access requirement** | `'OPEN' \| 'CLIENTS_ONLY' \| 'GROUP_ONLY' \| 'FREE'` (orthogonal `approvalRequired: boolean`) | Current code: visibility `'PUBLIC' \| 'GROUP' \| 'CLIENTS' \| 'PRIVATE'` (no separate approval flag) | **Adopt design.** Renaming: `visibility` → `access`. New column `approvalRequired BOOLEAN`. **FREE** is new (anyone can book even without auth). **PRIVATE** drops (instructor-only sessions are templates not yet generated). |
| **Location** | `locationKind: 'IN_PERSON' \| 'ONLINE'` + `venueId` + `meetingUrl` + server-derived `meetingProvider` | Current code: `location` free-text + `venue_id` FK (DB only, not in entity) | **Adopt design.** Wire the missing `venue_id` to entity; add `locationKind`, `meetingUrl`, `meetingProvider`. Keep `location` column as legacy display fallback. |
| **Timezone** | `timezone: string` (IANA) — *spec'd, no migration* | Our research has a full §16.3 with default `Europe/Bucharest`, validation, DST rules | **Take design's column, our research's migration + validation.** |
| **Capacity** | `capacity: number \| null` (null = uncapped) + `waitlistEnabled: boolean` (default true) | `maxParticipants` (null = uncapped) — no waitlist flag | **Rename + add waitlist flag.** Default `waitlistEnabled=true` (industry norm). |
| **Price** | `priceAmountCents` + `priceCurrency` (display-only) | `price` DECIMAL + `currency` (decorative) | **Switch to cents storage** (matches Stripe, matches our `Product.priceInCents`). Drop `DECIMAL`. |
| **Workouts** | `attachedWorkoutIds: string[]` | Not in our research at all | **New — note for future.** Workouts module doesn't exist yet; design hints at it but doesn't define it. Park this. |
| **Participant status** | `'PENDING_APPROVAL' \| 'CONFIRMED' \| 'WAITLISTED' \| 'CANCELLED' \| 'DECLINED'` (+ `attended: boolean \| null`, `privateNote`, `bookingNote`) | Current code: `'REGISTERED' \| 'CONFIRMED' \| 'ATTENDED' \| 'NO_SHOW' \| 'CANCELLED'` | **Reconcile.** See §3.2 below. |
| **Cancellation window** | Hardcoded 24h | Our research: default 12h, per-session configurable | **Take design's 24h default but make it configurable per template.** Both 12h and 24h are within industry norm; configurable wins. |

### 2.2 Participant status — reconciling the enums

The design has lifecycle + intent flags. Our current code has just a state machine. Merged:

```
PENDING_APPROVAL   → instructor approval pending (approvalRequired=true)
CONFIRMED          → booking accepted (formerly REGISTERED+CONFIRMED collapsed)
WAITLISTED         → on the waitlist
CANCELLED          → cancelled by client or instructor
DECLINED           → instructor declined approval
```

Plus orthogonal post-session fields:
- `attended: boolean | null` — null until session ends, then true/false
- `privateNote: string | null` — instructor-only note on this participant
- `bookingNote: string | null` — client → instructor message at booking time

**The design drops `NO_SHOW` and `ATTENDED` as statuses** in favor of `attended: boolean | null`. Our research considered NO_SHOW a load-bearing fee trigger — but since payments are out of scope, this is fine for v1.

### 2.3 Recurrence rule field shape

| Field | Design | Our research |
|---|---|---|
| `frequency` | `DAILY \| WEEKLY \| MONTHLY` | Same |
| `interval` | required | optional, default 1 |
| `daysOfWeek` | 1=Mon..7=Sun | 0=Sun..6=Sat (current code) |
| `endDate` or `endAfterOccurrences` | mutually exclusive | mutually exclusive |

**One real conflict: day-of-week numbering.** ISO 8601 says 1=Mon..7=Sun; JS `Date.getDay()` says 0=Sun..6=Sat. **Pick ISO (1=Mon..7=Sun)** — it matches RRULE (which we'll migrate to eventually) and the design. Existing rows: there are likely none in production; if there are, migrate by remapping `[0,1,2,3,4,5,6]` → `[7,1,2,3,4,5,6]`.

### 2.4 Endpoints — design vs current

The design specifies its own REST surface. Mapping to current routes:

| Design endpoint | Current equivalent | Action |
|---|---|---|
| `GET /sessions/templates` | `GET /sessions` (mixed) | Split: templates list = recurring + one-off-template rows; instances list = generated rows |
| `POST /sessions/templates` | `POST /sessions` | Rename. Response shape adds `warnings[]` + `generatedInstances[]`. |
| `GET /sessions/templates/:id` | `GET /sessions/:id` | Rename. |
| `PATCH /sessions/templates/:id` | `PATCH /sessions/:id` | Rename. |
| `DELETE /sessions/templates/:id?scope=series` | `DELETE /sessions/:id` | Add `scope` query. |
| `POST /sessions/templates/:id/regenerate?count=N` | `POST /sessions/:id/generate-instances?weeks=N` | **Rename, change parameter from weeks → count.** Count is more deterministic. |
| `POST /sessions/preview-recurrence` | `GET /sessions/:id/recurrence-preview?weeks=N` | **Switch to POST without an :id** so the dialog can preview *before* creating. This is a real UX improvement — current code requires creating the template first. |
| `GET /sessions/instances` | (none) | New. Calendar uses this. |
| `GET /sessions/instances/:id` | `GET /sessions/:id` | Reuse. |
| `PATCH /sessions/instances/:id` | `PATCH /sessions/:id` | Reuse with scope flag. |
| `POST /sessions/instances/:id/cancel` | `DELETE /sessions/:id` + status update | New endpoint, body specifies scope ('this' / 'thisAndFuture' / 'series'), reason, message, rescheduleTo. |
| `POST /sessions/instances/:id/participants/:participantId/approve` | (none) | New — backs approvalRequired flow. |
| `POST /sessions/instances/:id/participants/:participantId/decline` | (none) | New. |
| `PATCH /sessions/instances/:id/participants/:participantId` | `PATCH /sessions/:id/participants/:userId` | Rename, body adds `attended` + `privateNote`. |
| `POST /sessions/instances/:id/follow-up` | (none) | New — post-session message blast. |
| `GET /sessions/discover` | `GET /sessions/discover` | Reuse. Add unauthenticated path for `OPEN`/`FREE`. |
| `GET /sessions/instances/:id/public` | (none) | New — public-safe view, redacted for `GROUP_ONLY` non-members. |
| `GET /sessions/my` | `GET /sessions` (filtered) | Rename. Drops the "all visible" union. |
| `POST /sessions/instances/:id/book` | `POST /sessions/:id/join` | Rename. Body adds `bookingNote`. |
| `POST /sessions/instances/:id/cancel-booking` | `POST /sessions/:id/leave` | Rename. Body adds reason + message. |
| `GET /sessions/instances/:id/ics` | (none) | New — .ics download (single event). |
| `GET /sessions/instances/:id/join-info` | (none) | New — mobile day-of polls this. Computes joinActiveFrom = startAt − 5min. |
| `GET /sessions/calendar?start=&end=` | `GET /sessions/calendar` | Reuse but switch to `view=week\|day\|month` shape. |
| `POST /sessions/:id/checkin` | `POST /sessions/:id/checkin` | **Design drops this.** Self-check-in becomes implicit via instructor marking `attended=true`. Or reintroduce it — minor decision. |
| `POST /sessions/:id/confirm` | `POST /sessions/:id/confirm` | **Design drops this.** With waitlist + approval flows the explicit "confirm" step is redundant. Drop it. |
| `POST /sessions/:id/clone` | `POST /sessions/:id/clone` | Design doesn't mention it. **Keep** — it's useful. |

### 2.5 Frontend scope

The design's FE is **far more concrete** than our research. Our research said "no FE exists, single placeholder." Design ships:

**Instructor (8 screens):**
1. Sessions list — day-grouped cards + table-dense variant + view toggle + bulk select + KPI strip + empty + loading skeleton
2. Calendar — week (hero, polish), day, month, mini-month nav, type/online filters, conflict toggle, drag-to-create quick-popover, current-time line
3. Create/edit dialog — reactive form, stepper-visual single-form, live recurrence preview, plain-English summary, access-requirement block, non-blocking conflict banner
4. Session detail (in-person + online split layouts) — participants table, provider chip, "Start meeting" button, recurrence strip with edit-this/edit-series, public-share card
5. Recurring template detail — all instances, "Regenerate forward N," exceptions list, bulk actions (update venue, shift times, end series)
6. Cancel/reschedule dialog — three radio modes (this / this+future / series), optional message, optional reschedule offer
7. Conflict resolution modal — side-by-side comparison, quick actions, pre-suggest lower-impact resolution
8. Post-session attendance + follow-up — mark attended/no-show/unmarked, private per-participant note, follow-up composer with quick templates ("Thank you", "Homework", "Reminder"), optional workout PDF attach
9. (bonus) Booking approvals inbox — central place for `approvalRequired` decisions

**Client desktop (5 screens) + mobile (6 screens):**
- Discover (works logged-out for OPEN/FREE)
- Session detail (3 variants: open, gated, blocked with redacted view)
- My sessions (upcoming, awaiting approval, past, cancelled tabs; up-next pinned)
- Booking confirmation dialog (ICS + reminders + cancellation window)
- Public showcase
- Mobile: discover, detail, my sessions, booking flow, day-of online (countdown + Join now at −5min), cancel flow

**Plus rules:**
- Sentence case everywhere
- Honey primary, navy headings sparingly, coral for conflicts/cancellations, teal for online
- WCAG AA / AXE compliant (focus rings, contrast, `role="gridcell"` on calendar)
- `@if`/`@for` (Angular 21 control flow) — not `*ngIf`/`*ngFor`
- `p-select` / `p-datepicker` — not `p-dropdown` / `p-calendar` (PrimeNG 21 names)
- `[appendTo]="'body'"` on overlay components
- No hardcoded `#E48913` — use `var(--p-primary-color)` / Tailwind tokens via Lara preset
- Single `mh-access-chip` component reused everywhere

**File layout** (from prompt):
```
projects/web/src/app/main/instructor/sessions/
  sessions.ts/.html/.scss
  sessions.store.ts
  calendar/{calendar, week-view, day-view, month-view, quick-create-popover}
  session-detail/{session-detail, participants-table, recurrence-strip, online-meeting-card}
  recurring-template/recurring-template-detail
  _dialogs/{session-form, cancel-session, conflict-resolution, attendance}

projects/web/src/app/main/user/sessions/
  discover/
  session-detail/
  my-sessions/
  day-of-online/
  cancel-booking-dialog

projects/core/src/lib/
  models/session/{session.model, session.enums}
  services/session.service.ts
  stores/sessions.store.ts
```

This matches our existing FE conventions (signal stores in core, services in core, pages in `projects/web`).

---

## 3. Where the design beats our research

1. **24 concrete artboards.** Our research listed "what to build"; the design says "here's exactly what each screen looks like, with copy and component names." Reduces decision cost enormously.
2. **Public showcase + unauthenticated browsing.** `OPEN`/`FREE` sessions readable without login. We never priced this in — it's a marketing wedge for the platform (every instructor's profile becomes an SEO target).
3. **Two-viewport coverage from day one.** Mobile-specific screens (day-of countdown, sticky bottom CTA, swipeable cancellation reasons). Our research assumed responsive-only.
4. **Concrete "this/this+future/series" UX.** Our research recommended `series_id`; design shows the radio-card pattern in the cancel dialog.
5. **Online meeting metadata.** `meetingProvider` chip, "Start meeting" button activated 5min before, day-of `join-info` polling — none of this was in our research.
6. **Booking note + private note.** Two-way notes per participant. Our model didn't have these.
7. **Post-session follow-up.** Bulk message composer with templates and workout PDF attach. Big retention feature we didn't think of.
8. **Approvals inbox.** A central place to triage `PENDING_APPROVAL` bookings, decoupled from each session detail page.
9. **Empty + loading + error states explicit.** Our research didn't break these out as separate artboards.
10. **Booking note → instructor at booking time.** Helps the instructor decide on `approvalRequired` flows. We missed this.

---

## 4. Where our research beats the design

1. **Timezone migration spec.** Design says `timezone: string`; doesn't say how to backfill, validate, or handle DST. Our research §16.3 has the full plan.
2. **Industry data behind decisions.** Cancellation hours (12h), waitlist auto-add vs first-to-claim, RRULE migration path — sourced and decided. Design just hardcodes 24h + manual approval waitlist.
3. **SCA / PSD2 plan.** Even though payments are out-of-scope for v1, our research has the future plan ready (Stripe Checkout for one-off, SetupIntent for off-session fees). Design defers entirely.
4. **The 14 pitfalls list.** Concrete "don't do X" rules (don't store offset-only TZ, don't return 403 if it leaks existence, don't pre-generate years of instances, etc.).
5. **No-show / attendance economics.** Even if not built, our research has the model in mind (NO_SHOW vs ATTENDED is a fee signal). Design simplifies to `attended: boolean | null`.
6. **Race conditions on join.** Our research preserves the existing FOR UPDATE + pessimistic-lock pattern from current code. Design doesn't mention it — risk is the implementation forgets and oversells.
7. **The `notify()` outside-tx rule.** Critical to not orphan notifications on rollback. Design doesn't restate.
8. **Search index updates.** `search_doc` reindex on session create/update/cancel — design doesn't mention it.
9. **Existing `cancellation_policy` enum.** Our research handles this; the design just hardcodes 24h.
10. **The "FE is greenfield, don't break the existing pagination contract" guard.** Design assumes new endpoints; doesn't restate the FE response-shape contract.

---

## 5. Real conflicts to resolve (decision points)

| # | Issue | Design says | Research says | Recommendation |
|---|---|---|---|---|
| 1 | **Waitlist model** | Manual approval to promote | Auto-add is industry standard | **Auto-add** (Mindbody style). Design's approval-to-promote is more friction. If we want approval-to-promote, it's the same UX as `approvalRequired=true` — collapse them. |
| 2 | **Cancellation window** | 24h hardcoded | 12h default, configurable | **Configurable per template, default 24h.** Both are within industry norm; design's default is more conservative which is fine for v1. |
| 3 | **Day-of-week numbering** | 1=Mon..7=Sun | Currently 0=Sun..6=Sat | **1=Mon..7=Sun.** ISO 8601 + matches RRULE. |
| 4 | **Session type enum** | `GROUP \| PRIVATE \| OPEN` | Current `ONE_ON_ONE \| GROUP \| ONLINE \| WORKSHOP` | **Design's 3-value.** ONLINE moves to `locationKind`. WORKSHOP doesn't carry product weight. |
| 5 | **Status enum on participant** | `PENDING_APPROVAL \| CONFIRMED \| WAITLISTED \| CANCELLED \| DECLINED` + `attended` flag | Current 5-state machine including ATTENDED/NO_SHOW | **Design's.** Cleaner. NO_SHOW resurfaces later if we wire fees. |
| 6 | **Free-text `location`** | Drop in favor of venue + meetingUrl | Keep as legacy display fallback | **Keep `location` column.** Existing data depends on it; design's locationKind splits new sessions cleanly. |
| 7 | **Payment integration** | Out of scope, manual invoice | Eventual Stripe wiring (Checkout + SetupIntent) | **Design wins for v1.** Park the research's payment plan for v2. The current `payment` module already supports manual invoice creation — instructors use it. |
| 8 | **`confirm` and `checkin` endpoints** | Design drops both | Current code has both | **Drop `confirm`** (redundant with PENDING_APPROVAL flow). **Keep `checkin`** for self-check-in mobile — useful and harmless. |

None of these are dealbreakers — they're all 5-minute decisions.

---

## 6. Merged build plan

Synthesizing both. Phased so each phase ships value on its own.

### Phase 0 — foundation migrations (one PR, ~300 lines)
**Goal:** get the schema right *before* writing any FE code. Cheapest insurance against rework.

- [ ] Add `session.timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Bucharest'`; backfill existing rows.
- [ ] Add `session.template_id CHAR(36) NULL` (FK self-reference). Backfill recurring templates to point at themselves.
- [ ] Add `session.access ENUM('OPEN','CLIENTS_ONLY','GROUP_ONLY','FREE')`; backfill from current `visibility`.
- [ ] Add `session.approval_required BOOLEAN DEFAULT FALSE`.
- [ ] Add `session.location_kind ENUM('IN_PERSON','ONLINE')`; backfill via `meetingUrl IS NULL`.
- [ ] Add `session.meeting_url VARCHAR(500) NULL`, `session.meeting_provider ENUM('ZOOM','GOOGLE_MEET','TEAMS') NULL`.
- [ ] Add `session.waitlist_enabled BOOLEAN DEFAULT TRUE`.
- [ ] Add `session.cancellation_cutoff_hours INT DEFAULT 24`.
- [ ] Rename `max_participants` → `capacity` (keep alias for one release).
- [ ] Migrate `price` to `price_amount_cents INT` (multiply by 100, drop DECIMAL).
- [ ] Wire `venue_id` to the Sequelize entity (it already exists in DB).
- [ ] Reshape `recurring_rule.daysOfWeek` from 0–6 (Sun–Sat) to 1–7 (Mon–Sun).
- [ ] Add `WAITLISTED`, `PENDING_APPROVAL`, `DECLINED` to `session_participant.status` enum.
- [ ] Add `session_participant.attended BOOLEAN NULL`, `private_note TEXT NULL`, `booking_note TEXT NULL`.

**Tests to pass:** existing session tests (there are none — write the first few during this phase: create, list, recurrence expansion).

### Phase 1 — backend API surface (~700 lines)
**Goal:** ship the API contract the design needs. FE can stub against it.

- [ ] New endpoints (from design §2.4): templates/* + instances/* split, `preview-recurrence` (POST, no id), `regenerate?count=N`, `book`, `cancel-booking`, `participants approve/decline`, `participants PATCH attended+privateNote`, `follow-up`, `instances/:id/public`, `instances/:id/ics`, `instances/:id/join-info`, `my`.
- [ ] Keep `checkin` (drop `confirm`).
- [ ] Conflict detection returns `warnings[]` on save (non-blocking).
- [ ] `meetingProvider` derived from URL hostname on save.
- [ ] Access enforcement: stable error codes `ACCESS_DENIED_NOT_CLIENT`, `ACCESS_DENIED_NOT_GROUP_MEMBER`. **Use 404, not 403, for cross-instructor leaks** (research §11 pitfall).
- [ ] Wire `NotificationService` (replace direct `emailService.send*Email` calls). In-app notifications come free.
- [ ] Search index: reindex on instance create/update/cancel/reschedule.
- [ ] Tests: the 8 the design lists, plus the join-race test.

### Phase 2 — FE foundation (~500 lines)
**Goal:** get the data layer right before any screens.

- [ ] `projects/core/src/lib/models/session/{session.model.ts, session.enums.ts}` — full types from §2.1.
- [ ] `projects/core/src/lib/services/session.service.ts` — every endpoint from Phase 1.
- [ ] `projects/core/src/lib/stores/sessions.store.ts` — week-range cache for calendar.
- [ ] Add `SESSIONS` block to `api-endpoints.const.ts` (currently has 1 entry).
- [ ] Export everything from `public-api.ts`.
- [ ] **No screens yet.** This phase is the contract.

### Phase 3 — FE instructor list + create dialog (~800 lines)
**Goal:** instructor can list, create, and edit sessions. Covers artboards `i-list-*`, `i-create-simple`, `i-create-rec`, `i-access-config`.

- [ ] Replace the placeholder at `projects/web/src/app/main/instructor/sessions/sessions.ts`.
- [ ] Day-grouped cards + table-dense variant + view toggle.
- [ ] Filters: type, online/in-person, group, date range, search.
- [ ] KPI strip (4 cards).
- [ ] Empty + loading states.
- [ ] Create/edit dialog: reactive form, recurrence builder, live preview, plain-English summary, access-requirement block.
- [ ] Conflict banner on save (non-blocking).
- [ ] `mh-access-chip` shared component.

### Phase 4 — FE calendar (~700 lines)
**Goal:** the hero feature. Artboards `i-cal-week` (polish), `i-cal-day`, `i-cal-month`, `i-cal-quick`, `i-cal-agenda`.

- [ ] Week / day / month views, single store.
- [ ] Current-time line, half-hour dashed lines, alternating row tint.
- [ ] Side-by-side overlap rendering + conflict ring.
- [ ] Drag-to-create suggestion + quick-popover.
- [ ] Mini-month nav + filters.
- [ ] `role="gridcell"` for AXE.

### Phase 5 — FE session detail + recurring template detail + dialogs (~600 lines)
**Goal:** detail screens for instructor + the three "edit scope" dialogs. Artboards `i-detail-in`, `i-detail-on`, `i-detail-template`, `i-cancel`, `i-conflict`, `i-attendance`, `i-approvals`.

- [ ] In-person + online detail layouts.
- [ ] Participants table with inline approve/decline.
- [ ] Recurrence strip ("edit this" / "edit series").
- [ ] Public-share card (copyable URL).
- [ ] Recurring template detail with regenerate-forward panel.
- [ ] Cancel/reschedule dialog (3 modes).
- [ ] Conflict resolution modal.
- [ ] Post-session attendance + follow-up composer.
- [ ] Approvals inbox (central triage).

### Phase 6 — FE client desktop + public showcase (~500 lines)
**Goal:** the booking + showcase angle. Artboards `c-discover`, `c-detail-*`, `c-mysessions`, `c-confirm`, `c-showcase`.

- [ ] Discover page (works logged-out for `OPEN`/`FREE`).
- [ ] Session detail — three variants (open, gated, blocked-redacted).
- [ ] My sessions tabs (upcoming, awaiting approval, past, cancelled).
- [ ] Booking confirmation dialog.
- [ ] Public showcase on instructor profile (anonymous-readable).
- [ ] `.ics` download per session.

### Phase 7 — FE mobile (~500 lines)
**Goal:** mobile-specific flows. Artboards `m-*`.

- [ ] Mobile discover, detail (sticky bottom CTA), my sessions, booking flow.
- [ ] Day-of online: countdown + Join button activates at −5min, valid until +15min.
- [ ] Cancel flow with reason picker + 24h ack.

### Phase 8 — polish (~200 lines)
- [ ] Reminder cron (depends on jobs module — already exists for emails).
- [ ] `.ics` feed (multi-event subscription URL) — *deferred*, single-event download is enough for v1.

**Total estimated:** ~4,500 lines across BE + FE, 7 phases. Each phase ships value and can be reviewed independently.

---

## 7. What to defer (genuinely out of scope for v1)

These come up in the design but are correctly parked:

- **Payment integration on sessions.** `price` is display-only. Instructor invoices manually via the existing payment module. Re-evaluate after Phase 6.
- **Punch cards / class packs.** Pre-paid bundles. Model later.
- **Subscription-included sessions.** "Unlimited yoga membership" quota counting. Later.
- **Refunds tied to session cancellation.** Manual via payment module.
- **iCal subscription feed.** Single-event `.ics` download is enough.
- **Workout PDF attachments.** Workouts module doesn't exist yet.
- **No-show fees.** Needs payment + SetupIntent. Park.
- **Public booking link (Calendly-style standalone page).** Out of scope; the public showcase + instructor profile covers the marketing wedge.

---

## 8. Open questions for you to decide

These need a yes/no before Phase 0:

- [ ] **Waitlist model — auto-add or approval-to-promote?** Recommendation: **auto-add** (industry default, lower friction). Approval-to-promote is the same flow as `approvalRequired=true`.
- [ ] **Cancellation window default — 12h or 24h?** Recommendation: **24h default, configurable per template.** Matches design and is more conservative.
- [ ] **Drop `confirm` endpoint?** Recommendation: yes — redundant with PENDING_APPROVAL.
- [ ] **Drop `NO_SHOW` participant status?** Recommendation: yes for v1 — `attended: boolean | null` is enough. Reintroduce when fees ship.
- [ ] **Sessions list at `/coaching/sessions` (current route) or under a redesigned IA?** Recommendation: keep current route — the design uses it.
- [ ] **Public showcase URL pattern: `motionhive.app/s/<instructor-slug>/<session-slug>`?** Recommendation: yes, matches the existing handle-based URL pattern (`/@handle`).
- [ ] **Phase 0 timing — ship migrations before any FE work?** Recommendation: yes — saves rework.

Answer these and Phase 0 is unblocked.

---

*Last updated: 2026-05-14. Companion docs: `SESSIONS_CONTEXT.md` (current code + industry research) and `PROJECT_CONTEXT.md` (BE+FE structure).*
