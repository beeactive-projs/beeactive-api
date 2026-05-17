# Sessions — Frontend Build Plan (in depth)

> Companion to `SESSIONS_MASTER_BUILD_PLAN.md` (backend). The BE is shipped and live-tested. This plan covers the FE end-to-end for both Angular apps (`projects/web`, instructor + client) and the marketing site (`projects/website`, public showcase).
>
> **Source of truth for design** — 24 artboards in `MotionHive - Sessions deep dive _standalone_.html` (extracted into `/tmp/sessions-design/*.jsx` for reference).
>
> **Companion FE prompt** — `PROMPTS-for-claude-code.md` §1 has the binding conventions the FE must follow (PrimeNG 21 component names, `@if`/`@for`, sentence case, Honey primary, `appendTo='body'` on dialogs, etc.).

---

## 0. TL;DR

- **9 phases**, each shippable as one PR. Total ≈ 4 700 LOC including specs (+200 over the original plan because Phase A now ships reusable shells before any feature work).
- **24 artboards covered**, plus **9 net-new screens / states** the canvas didn't draw (errors, skeletons, second-empties, mobile loading, multi-step booking on desktop, follow-up audience modal, slug share copy state, public showcase calendar embed, web push permission prompt).
- **Hard rule**: no FE work that needs an endpoint not in the live BE. Anything beyond what the BE exposes is a backend deliverable first (see §11).
- **Phase ordering**: data layer → instructor list → calendar → detail → dialogs → client desktop → mobile → public showcase → notifications wiring. The data layer must land before any screen; the calendar is the hero (week view) and gets its own dedicated phase.
- **State strategy**: Signal stores in `projects/core/src/lib/stores/`. One per page-family (`sessions-instructor.store.ts`, `sessions-discover.store.ts`, `sessions-my.store.ts`). HTTP services stay Observable-based; stores convert to signals. This matches the existing `StripeOnboardingStore` shape exactly.
- **Testing**: Vitest specs alongside components. Visual review against the artboards is the acceptance gate per phase.

### 0.1 Locked decisions

These are the answers to the 7 open questions from §14. They drive the rest of this plan.

| # | Decision | Rationale |
|---|---|---|
| Q1 | **Custom calendar grid (`mh-calendar-grid`)**, not FullCalendar | Design density + 50KB+ savings; calendar is the hero feature, owning the grid math is worth it |
| Q2 | **Add BE endpoint `GET /sessions/approvals`** (~80 LOC) before FE Phase D | Avoids N+1+1 traversal `templates → instances → participants`; central instructor daily-use screen |
| Q3 | **3-week read-only mini calendar** on the public showcase | Splitting the difference between dropping the toggle and rendering a full week — right level for public browsing |
| Q4 | **Web push prompt after first booking**, dismissable, 30-day cooldown | Most committed moment; cold asks burn permission permanently |
| Q5 | **Render workouts UI as disabled "Coming soon"** card | Keeps layout matching artboards; signals roadmap; doesn't block on workouts BE module |
| Q6 | **Decline reasons**: Capacity reached / "Not the right match right now" / Conflicting time / Other | Softer wording on the second option; covers 80% without forcing custom text |
| Q7 | **No auto-resume booking intent** in v1 | One-extra-click cost is fine vs the implementation complexity (localStorage + listeners + edge cases) |

---

## 0.2 Reusability strategy (the load-bearing principle)

Every visual element this plan adds is either a **primitive** (dumb, no HTTP, lives in `projects/core/src/lib/components/`) or a **smart wrapper** (thin, store-aware, lives in `projects/web/...`). The smart wrapper composes primitives and never duplicates their markup.

### 0.2.1 Audit gate (per phase)

Before opening any phase's PR, the following must be true:

1. **No copy-paste**: no markup duplicated from a primitive that already exists. Refactor first, then merge.
2. **Inputs over store reads**: smart components take data via `@Input`; never read a store directly unless they "own" that store concept (one store ↔ one smart parent).
3. **No domain types in core primitives**: e.g. `mh-calendar-grid` must NOT import `SessionInstance`. Compile fails if it does.
4. **Variants over forks**: if a new file `mh-x-mobile.ts` appears next to `mh-x.ts`, stop — add a variant prop or use the parent layout instead.

### 0.2.2 Primitives we ship in this work (all live in `core/components/`)

These are the visual building blocks used across the sessions feature AND immediately reusable in other modules (payments / groups / clients / future workouts).

| Component | Inputs | Used in (sessions) | Reusable in |
|---|---|---|---|
| `mh-access-chip` | `access`, `approvalRequired?` | list, calendar event, detail, showcase, mobile, dialogs | n/a (session-specific concept) |
| `mh-type-chip` | `type` | same 6 surfaces | n/a |
| `mh-provider-chip` | `provider` | detail, calendar, list, showcase | future telemedicine, lessons |
| `mh-capacity-bar` | `signups`, `cap?` | list, detail, showcase | future group capacity bars |
| `mh-avatar-stack` | `users`, `total?`, `size?` | list, detail, calendar event hover | already wanted by groups + clients (extend the existing one if there is) |
| `mh-kpi-card` | `icon`, `label`, `value`, `sub`, `variant?` | sessions list KPI strip | payments, dashboard, analytics — adopt-as-follow-up |
| `mh-section-label` | `label`, `count?` | day-group headers (sessions list, my-sessions, mobile discover) | any grouped list |
| `mh-tri-state-toggle` | `value`, `options` | attendance Attended/No-show/Unmarked | any tri-state UI (e.g. invoice paid/disputed/unknown) |
| `mh-page-shell` | `title`, `breadcrumb?`, `actions` slot | every sessions page | every authed page — adopt-as-follow-up |
| `mh-dialog-shell` | wraps `p-dialog`, sets `[appendTo]='body'`, focus + ESC + footer slot | every sessions dialog (8 of them) | every dialog in the app — solves the `appendTo` audit issue once |
| `mh-calendar-grid` | `view`, `dateRange`, `events`, `timezone`, `hourRange`, `nowLine`, `readonly` | week / day / month / showcase mini | future workouts calendar, group event schedule, office hours |
| `mh-event-block` | `event`, `layout`, `ring?` | inside `mh-calendar-grid` only | wherever calendar events are rendered |

### 0.2.3 Smart wrappers we ship (live in `projects/web/...`)

These connect primitives to data. One store ↔ one smart parent.

- **`SessionsList`** — pages/instructor/sessions/sessions.ts. Owns `SessionsInstructorStore`. Composes `mh-kpi-card`, `mh-session-card`, tab strip, filter chips.
- **`SessionsCalendar`** — pages/instructor/sessions/calendar/calendar.ts. Owns `SessionsInstructorStore`. Wraps `mh-calendar-grid` + view switcher + `QuickCreatePopover`. **Maps `SessionInstance[]` → `CalendarEvent[]` via a pure function `instanceToCalendarEvent()`.**
- **`SessionDetail`** — branches on `instance.template.locationKind` (`IN_PERSON | ONLINE`). One file, two layouts via `@switch`. Composes `mh-session-card` (related sessions footer) + `ParticipantsTable` (smart sub) + `RecurrenceStrip` + `PublicShareCard`.
- **`mh-session-card`** — the only "smart-ish" primitive. Takes either `SessionInstance | PublicSessionInstance | BlockedSessionInstance` + a `variant` and renders the correct shape across 6 surfaces. **Reusability beats purity here** — splitting into 3 cards would create 80% duplicate markup.

### 0.2.4 The calendar specifically — three-layer architecture

The calendar is the most reused surface in this plan. Three layers:

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3 (consumers — thin)                                      │
│ • SessionsCalendar (instructor, week/day/month, with drag)      │
│ • PublicSessionsCalendar (showcase, month, read-only)           │
│ • [future] WorkoutsCalendar, GroupEventsCalendar, OfficeHours   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ maps domain → CalendarEvent
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2 (smart wrappers — own a store + map data)               │
│ instanceToCalendarEvent(): SessionInstance → CalendarEvent      │
│ workoutToCalendarEvent():  Workout → CalendarEvent  (future)    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ generic CalendarEvent[]
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1 (`mh-calendar-grid` — pure presentation)                │
│ • No HTTP, no store, no session imports                         │
│ • Inputs: events, dateRange, view, hourRange, readonly, ...     │
│ • Outputs: cellClick, cellDrag, eventClick, rangeChange         │
└─────────────────────────────────────────────────────────────────┘
```

**Layer 1 (`mh-calendar-grid`) signature**:

```ts
@Input() view: 'week' | 'day' | 'month' = 'week';
@Input() dateRange!: { start: Date; end: Date };
@Input() events: CalendarEvent[] = [];
@Input() timezone: string = 'Europe/Bucharest';
@Input() hourRange: [number, number] = [6, 21];
@Input() rowHeightPx: number = 44;
@Input() nowLine: boolean = true;
@Input() showOverflow: boolean = true;
@Input() loading: boolean = false;
@Input() readonly: boolean = false;

@Output() cellClick   = new EventEmitter<{ date: Date; hour: number }>();
@Output() cellDrag    = new EventEmitter<{ start: Date; end: Date; shiftKey: boolean }>();
@Output() eventClick  = new EventEmitter<CalendarEvent>();
@Output() rangeChange = new EventEmitter<{ start: Date; end: Date }>();
```

**Generic `CalendarEvent` shape** (lives in `core/lib/components/calendar/calendar-event.model.ts`):

```ts
export interface CalendarEvent {
  id: string;
  start: Date;
  end: Date;
  title: string;
  subtitle?: string;
  color: string;                // hex or var(--*) — caller picks
  ring?: 'none' | 'conflict' | 'active';
  badges?: ('online' | 'recurring' | 'cancelled')[];
  payload?: unknown;            // opaque — typed by the consumer
}
```

**Result**:
- Public showcase calendar embed (§9.D) becomes ~30 LOC because it just wires `<mh-calendar-grid [readonly]="true" view="month" [events]="events()">`.
- The future workouts calendar reuses the same grid. Zero rewrite.
- The instructor's drag-to-create handler is in the smart wrapper, not the grid. The grid emits `cellDrag`; the wrapper opens `QuickCreatePopover`.

### 0.2.5 The card specifically — variant pattern

`mh-session-card` is the second-most-reused thing after chips. Internally:

```ts
@Input() instance!: SessionInstance | PublicSessionInstance | BlockedSessionInstance;
@Input() variant: 'list-card' | 'showcase' | 'mobile' | 'mine-row' | 'related' | 'calendar-popover' = 'list-card';
@Input() selectable: boolean = false;
@Input() selected: boolean = false;
@Input() showCTA: boolean = true;
@Input() ctaLabel?: string;
@Input() eligibility?: 'eligible' | 'not-eligible' | 'blocked';

@Output() open   = new EventEmitter<void>();
@Output() select = new EventEmitter<boolean>();
@Output() book   = new EventEmitter<void>();
```

The CTA is computed from `(access, eligibility, instance.template.approvalRequired)`:
- Anonymous + OPEN/FREE → `View`
- Authed eligible OPEN/FREE → `Book`
- Authed eligible CLIENTS_ONLY/GROUP_ONLY → `Request to book` (if approvalRequired) or `Book`
- Authed not-eligible CLIENTS_ONLY → `Become a client`
- Authed not-eligible GROUP_ONLY → `Members only` (disabled)
- BlockedSessionInstance → `Members only` (disabled, full opacity reduction)

**One component, six surfaces, no duplication.**

### 0.2.6 Dialogs — `mh-dialog-shell` mandatory

Every dialog created in this work uses `mh-dialog-shell` which:
- Wraps `p-dialog` with `[appendTo]="'body'"`.
- Provides header / content / footer slots.
- Standardises ESC close + auto-focus on primary CTA + "disable submit while pending" pattern via an `isSubmitting` input.

This means `SessionFormDialog`, `CancelSessionDialog`, `ConflictResolutionDialog`, `DeclineReasonDialog`, `FollowUpAudienceDialog`, `BookingFlowDialog`, `BookingConfirmationDialog`, `CancelBookingDialog` all share the same shell — **one audit point for accessibility, focus, and ESC**, not eight.

### 0.2.7 What we deliberately do NOT extract yet

To avoid premature abstractions:

- **No `mh-form-field` wrapper** — Angular reactive forms + Tailwind grid is clean enough; wrapping adds indirection.
- **No global theme service / `mh-themeable` directive** — Tailwind tokens + CSS vars cover it.
- **No generic "list page" abstraction** — sessions list has its own KPI strip + bulk-select flow distinct from clients/payments. Force-merging would create a god-component.

---

## 1. Operating principles (apply to every phase)

### 1.1 Stack conventions (binding)
- Angular 21. **No `*ngIf` / `*ngFor`** — use `@if`, `@for`, `@switch`, `@empty`.
- PrimeNG 21 component names: `p-select` (not `p-dropdown`), `p-datepicker` (not `p-calendar`), `p-popover` (not `p-overlayPanel`), `p-toggleswitch`.
- All overlays (`p-dialog`, `p-popover`, `p-select`) **must set `[appendTo]="'body'"`**. The existing codebase does NOT do this consistently — fix it as we add new dialogs (don't refactor sibling modules in this work).
- Tailwind v4 + `tailwindcss-primeui`. **Never** hardcode hex — use `var(--p-primary-color)`, Tailwind tokens, or the project's `theme-colors.ts` palette.
- Honey is primary; Navy (Tailwind only) and Teal (online accent) and Coral (`#FF6F61` for conflicts/cancellations) are the secondary palette.
- Sentence case in all UI copy. "Book my spot", not "Book My Spot".

### 1.2 Architecture
- **Services live in core** (`projects/core/src/lib/services/`) — Observable-based, depend only on `HttpClient` + endpoint constants. **No signals at the service layer.**
- **Stores live in core** (`projects/core/src/lib/stores/`) — signal-based. They consume services and expose readonly signals + computed + methods.
- **Pages live in web** (`projects/web/src/app/main/instructor/sessions/`, `projects/web/src/app/main/user/sessions/`).
- **Models + enums live in core** (`projects/core/src/lib/models/session/`). Re-export from `core/public-api.ts`.
- **Dialogs go in `_dialogs/`** sibling folder of the page that opens them. Reusable across pages.
- **Mobile views are NOT separate components** unless the mobile UX diverges so far that a single component branches via `*ngIf`-style on viewport. The `m-dayof` countdown is the only screen that earns its own dedicated component — the rest are responsive variations of the desktop ones.

### 1.3 Forms
- Reactive forms via `FormBuilder` (matches `BecomeInstructor`).
- Cross-field validators inline (no global validator service).
- Form state in the parent component; pass `formGroup` down to sub-components via `@Input`.
- All form errors → inline error messages, never just toasts.

### 1.4 Data fetching
- **Calendar view**: range-paged. The store caches by `(viewKey, dateFromMs)` key for the most recent 3 ranges and evicts the rest.
- **List view**: pagination via `PaginatedResponse<T>` (already in BE) — page + pageSize + total + items. Wire to `p-table` lazy mode.
- **Counts**: dedicated endpoint `/sessions/my/counts`. Never derive from a list.
- **No N+1 in the UI either** — never `.map(item => fetch(item.id))`. If the BE doesn't eager-load it, add it server-side; do not patch on the client.

### 1.5 Empty / loading / error pattern
Mirror what `MyInvoices` does (the in-house standard):
- `p-table` with `[loading]="loadingSig()"` + `#loadingbody` skeleton rows + `#emptymessage` icon+copy.
- Loading skeleton for non-table pages: PrimeNG `p-skeleton` arranged in the shape of the real layout.
- Errors: inline banner at the top of the page, never a blank page. Use `p-message severity="error"` with retry button.

### 1.6 Performance budgets
| Surface | Target initial render | Notes |
|---|---|---|
| Instructor sessions list | < 800ms TTI | 1 HTTP roundtrip |
| Calendar week | < 600ms render | 1 HTTP roundtrip for the week |
| Session detail | < 500ms | 1 HTTP roundtrip + 1 for participants (lazy) |
| Discover (anon) | < 700ms | CDN-cacheable per BE Phase E |
| My sessions counts badge | < 200ms | 1 HTTP roundtrip, parallel with list |

### 1.7 Accessibility
- WCAG AA contrast.
- `role="gridcell"` on calendar cells.
- All interactive widgets get a visible focus ring (Tailwind `focus-visible:ring-2`).
- Dialog auto-focus on the primary CTA; ESC closes.
- Mobile sticky CTAs **never overlap** content — pad the scroll container by the CTA height.

---

## 2. Module shape after all phases

```
projects/core/src/lib/
├── models/session/
│   ├── session.model.ts           # Template, Instance, Participant, RecurrenceRule, PublicInstance, BlockedInstance
│   └── session.enums.ts           # SessionType, SessionAccess, ParticipantStatus, MeetingProvider, LocationKind, ReminderKind
├── services/session/
│   ├── session.service.ts         # 24 endpoints — one method per BE endpoint
│   └── session.service.spec.ts
└── stores/
    ├── sessions-instructor.store.ts   # templates + instances for instructor's calendar
    ├── sessions-discover.store.ts     # public discover cache
    ├── sessions-my.store.ts           # client's bookings + counts
    └── sessions-detail.store.ts       # single instance + participants

projects/core/src/lib/constants/api-endpoints.const.ts
└── SESSIONS = { BASE, TEMPLATES, INSTANCES, MY, MY_COUNTS, DISCOVER, PUBLIC_BY_SLUG, ... }

projects/web/src/app/main/instructor/sessions/
├── sessions.ts/.html/.scss              # list page (cards + table toggle)
├── sessions.routes.ts                   # child routes
├── calendar/
│   ├── calendar.ts/.html/.scss          # week/day/month container + view switcher
│   ├── week-view.ts/.html/.scss
│   ├── day-view.ts/.html/.scss
│   ├── month-view.ts/.html/.scss
│   ├── quick-create-popover.ts/.html/.scss
│   └── conflict-ring.directive.ts       # adds the coral conflict halo to event blocks
├── session-detail/
│   ├── session-detail.ts/.html/.scss
│   ├── participants-table.ts/.html/.scss
│   ├── recurrence-strip.ts/.html/.scss
│   ├── online-meeting-card.ts/.html/.scss
│   └── public-share-card.ts/.html/.scss
├── recurring-template/
│   └── recurring-template-detail.ts/.html/.scss
├── attendance/
│   └── attendance-panel.ts/.html/.scss
├── approvals/
│   └── approvals-inbox.ts/.html/.scss
├── _dialogs/
│   ├── session-form-dialog.ts/.html/.scss
│   ├── cancel-session-dialog.ts/.html/.scss
│   ├── conflict-resolution-dialog.ts/.html/.scss
│   ├── attendance-followup-dialog.ts/.html/.scss   # (alt path, see below)
│   └── decline-reason-dialog.ts/.html/.scss        # NEW — fills design gap §9.B
└── _shared/
    ├── access-chip/                  # mh-access-chip — reused everywhere
    ├── type-chip/                    # mh-type-chip
    ├── provider-chip/                # mh-provider-chip
    ├── capacity-bar/                 # mh-capacity-bar
    ├── avatar-stack/                 # mh-avatar-stack (lift from existing if there is one)
    ├── session-card/                 # mh-session-card — used by list + showcase
    ├── event-block/                  # mh-event-block — used by all calendar views
    └── kpi/                          # mh-kpi (mini metric card)

projects/web/src/app/main/user/sessions/
├── discover/
│   └── discover.ts/.html/.scss
├── session-detail/
│   └── session-detail.ts/.html/.scss        # 3 variants via @switch on access
├── my-sessions/
│   └── my-sessions.ts/.html/.scss
├── day-of-online/
│   └── day-of-online.ts/.html/.scss         # mobile + desktop both render here
└── _dialogs/
    ├── booking-confirmation-dialog.ts/.html/.scss
    ├── cancel-booking-dialog.ts/.html/.scss
    └── booking-flow-dialog.ts/.html/.scss   # used by both desktop and mobile

projects/website/src/app/showcase/
└── instructor-sessions-showcase.ts/.html/.scss  # public profile sessions list
                                                  # — uses /sessions/discover?instructorId=...
                                                  # — and /sessions/public/:handle/:slug
```

---

## 3. Phase A — Data layer + reusable shells (NO feature screens)

**Goal**: typed contract between FE and BE, **plus the shared primitives every later phase depends on**. No feature visuals — just the engine.

**Estimated size**: ~800 LOC. **Time**: 1.5 working days.

### Why ship the shells with the data layer?

Per the §0.2 reusability rules, every feature phase must compose primitives — not invent markup. So the primitives must exist BEFORE Phase B starts. This phase bundles the data contract with the shell primitives that have **zero session domain knowledge** (everything in §0.2.2 except the chips/cards/event-block, which are session-flavored and land in Phase B).

### A.0 Shells + primitives shipped in this phase

| Component | Path | Notes |
|---|---|---|
| `mh-page-shell` | `core/lib/components/page-shell/` | Header + breadcrumb + actions slot. Standardises top-of-page layout. |
| `mh-dialog-shell` | `core/lib/components/dialog-shell/` | Wraps `p-dialog` with `[appendTo]='body'`, header/content/footer slots, focus + ESC + `isSubmitting` input. |
| `mh-kpi-card` | `core/lib/components/kpi-card/` | Icon + label + value + sub + `variant?` (`default | warn`). |
| `mh-section-label` | `core/lib/components/section-label/` | Day-group header (label + optional count chip). |
| `mh-tri-state-toggle` | `core/lib/components/tri-state-toggle/` | Generic 3-option segmented control. |
| `mh-calendar-grid` | `core/lib/components/calendar/calendar-grid.ts` | The grid engine — **zero domain knowledge**, takes generic `CalendarEvent[]`. |
| `mh-event-block` | `core/lib/components/calendar/event-block.ts` | One event renderer. Used only inside the grid. |
| `CalendarEvent` model | `core/lib/components/calendar/calendar-event.model.ts` | Generic shape (id, start, end, title, color, ring, badges, payload). |

**Reusability check**: every component above MUST be import-clean of `Session*` types. The Vitest spec for each one asserts `import.meta` doesn't reference any `'../models/session/*'` path (regex check).

### A.1 Files to create
- `core/src/lib/models/session/session.enums.ts` — mirror the BE enums byte-for-byte:
  - `SessionType: 'GROUP' | 'PRIVATE' | 'OPEN'`
  - `SessionAccess: 'OPEN' | 'CLIENTS_ONLY' | 'GROUP_ONLY' | 'FREE'`
  - `SessionLocationKind: 'IN_PERSON' | 'ONLINE'`
  - `SessionMeetingProvider: 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS'`
  - `SessionInstanceStatus: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'`
  - `SessionTemplateStatus: 'ACTIVE' | 'ENDED' | 'CANCELLED'`
  - `ParticipantStatus: 'PENDING_APPROVAL' | 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED' | 'DECLINED'`
  - `ReminderKind: 'REMINDER_24H' | 'REMINDER_1H'`
- `core/src/lib/models/session/session.model.ts`:
  - `RecurrenceRule { frequency, interval, daysOfWeek?, endDate?, endAfterOccurrences? }`
  - `SessionTemplate { id, instructorId, groupId, venueId, slug, title, description, type, access, approvalRequired, locationKind, meetingUrl, meetingProvider, durationMinutes, timezone, capacity, waitlistEnabled, cancellationCutoffHours, priceAmountCents, priceCurrency, isRecurring, recurrenceRule, firstStartAt, status, createdAt, updatedAt }`
  - `SessionInstance { id, templateId, instructorId, occurrenceIndex, startAt, endAt, titleOverride, descriptionOverride, venueIdOverride, meetingUrlOverride, capacityOverride, isOverride, status, confirmedCount, pendingApprovalCount, waitlistedCount, attendedCount, conflictingInstanceIds, cancelReason, cancelledAt, createdAt, updatedAt, template?, instructor?, venue? }`
  - `SessionParticipant { id, instanceId, userId, status, attended, checkedInAt, bookingNote, snapshotPriceCents, snapshotCurrency, snapshotCancelCutoffH, bookedAt, approvedAt, declinedAt, cancelledAt, waitlistPosition, user? }`
  - `PublicSessionInstance` — same as `SessionInstance` minus `meetingUrl` / `meetingUrlOverride` / `conflictingInstanceIds`
  - `BlockedSessionInstance { id, templateId, instructorId, startAt, endAt, status, template: { id, slug, title, type, access, durationMinutes, instructorId, groupId }, instructor: { id, firstName, lastName, avatarUrl, handle }, isBlocked: true }`
  - `BookResult { status, participantId }`
  - `CancelBookingResult { status, cancellation: 'WITHIN_WINDOW' | 'OUTSIDE_WINDOW', promotedUserId }`
  - `JoinInfo { meetingUrl, joinActiveFrom, joinActiveUntil, instructorJoined }`
  - `MyCounts { upcoming, pendingApproval, waitlisted, past, cancelled }`
  - `Warning { code: 'CONFLICT'; instanceIds: string[] }`

### A.2 Endpoint constants
Replace the stub `SESSIONS: { BASE: '/sessions' }` with the full surface:
```ts
SESSIONS: {
  BASE: '/sessions',
  TEMPLATES: '/sessions/templates',
  TEMPLATE_BY_ID: (id: string) => `/sessions/templates/${id}`,
  PREVIEW_RECURRENCE: '/sessions/templates/preview-recurrence',
  REGENERATE: (id: string) => `/sessions/templates/${id}/regenerate`,
  INSTANCES: '/sessions/instances',
  INSTANCE_BY_ID: (id: string) => `/sessions/instances/${id}`,
  INSTANCE_PARTICIPANTS: (id: string) => `/sessions/instances/${id}/participants`,
  PARTICIPANT_BY_ID: (instanceId: string, participantId: string) =>
    `/sessions/instances/${instanceId}/participants/${participantId}`,
  BOOK: (id: string) => `/sessions/instances/${id}/book`,
  CANCEL_BOOKING: (id: string) => `/sessions/instances/${id}/cancel-booking`,
  APPROVE_PARTICIPANT: (instanceId: string, participantId: string) =>
    `/sessions/instances/${instanceId}/participants/${participantId}/approve`,
  DECLINE_PARTICIPANT: (instanceId: string, participantId: string) =>
    `/sessions/instances/${instanceId}/participants/${participantId}/decline`,
  CANCEL_INSTANCE: (id: string) => `/sessions/instances/${id}/cancel`,
  RESCHEDULE_INSTANCE: (id: string) => `/sessions/instances/${id}/reschedule`,
  FOLLOW_UP: (id: string) => `/sessions/instances/${id}/follow-up`,
  DISCOVER: '/sessions/discover',
  PUBLIC_BY_SLUG: (handle: string, slug: string) => `/sessions/public/${handle}/${slug}`,
  PUBLIC_INSTANCE: (id: string) => `/sessions/instances/${id}/public`,
  MY: '/sessions/my',
  MY_COUNTS: '/sessions/my/counts',
  ICS: (id: string) => `/sessions/instances/${id}/ics`,
  JOIN_INFO: (id: string) => `/sessions/instances/${id}/join-info`,
},
```

### A.3 `SessionService` — one method per BE endpoint
Observable-based, matches the existing `GroupService` pattern. Each method takes plain JS args, builds `HttpParams` for queries, returns `Observable<T>`. Strict types — no `any`.

### A.4 Tests

**Service spec** (`session.service.spec.ts`):
- Stub `HttpClient`, assert URL + method + params + body shape for each of the 24 methods.

**Primitive specs** (one per component):
- `page-shell.spec.ts` — renders title + breadcrumb + actions slot.
- `dialog-shell.spec.ts` — `[appendTo]='body'` is set, focuses primary CTA on open, ESC closes, disables submit while `isSubmitting`.
- `kpi-card.spec.ts` — renders both variants, accessible name from `label`.
- `section-label.spec.ts` — renders label + count chip.
- `tri-state-toggle.spec.ts` — emits each option, indicates `null` state.
- `calendar-grid.spec.ts` — renders correct hour-row count, positions events via `top/height` math, emits `cellClick`/`cellDrag`/`eventClick`/`rangeChange`, switches view via `@Input`.
- `event-block.spec.ts` — renders title + conflict ring when `ring='conflict'`, applies `color` to left border.

**Reusability check spec** (`reusability.spec.ts` — one file, runs in CI):
- For each primitive, assert its source file does NOT import from `core/lib/models/session/` (greps the source string). Compile-time guarantee that primitives stay domain-agnostic.

### A.5 Acceptance gate
- TS compile clean, lint clean.
- `core/public-api.ts` re-exports `Session*` models, enums, `SessionService`, AND all 8 primitives + `CalendarEvent`.
- `npm run build:core` succeeds.
- All specs green, including the reusability check.
- **Storybook-style preview page** (no library — just a one-off `dev/preview.ts` route) shows each primitive in isolation so we can eyeball them before Phase B starts.

---

## 4. Phase B — Instructor sessions list

**Goal**: replace the `<p>Sessions works</p>` placeholder with the real list. Default view = day-grouped cards; toggleable to dense table.

**Estimated size**: ~700 LOC. **Time**: 2 working days.

### B.1 Routes
Update `instructor.routes.ts`:
```ts
{ path: 'sessions', children: [
  { path: '', loadComponent: () => import('./sessions/sessions').then(m => m.SessionsList) },
  { path: 'calendar', loadComponent: () => import('./sessions/calendar/calendar').then(m => m.SessionsCalendar) },
  { path: ':id', loadComponent: () => import('./sessions/session-detail/session-detail').then(m => m.SessionDetail) },
  { path: 'templates/:id', loadComponent: () => import('./sessions/recurring-template/recurring-template-detail').then(m => m.RecurringTemplateDetail) },
  { path: 'attendance/:id', loadComponent: () => import('./sessions/attendance/attendance-panel').then(m => m.AttendancePanel) },
  { path: 'approvals', loadComponent: () => import('./sessions/approvals/approvals-inbox').then(m => m.ApprovalsInbox) },
]},
```

### B.2 Components built (Phase B only)

**Session-flavored primitives** (live in `core/lib/components/`, depend on `session.enums.ts` only — never on the full models):
- `mh-access-chip` — input: `access`, `approvalRequired?`. Used on 6+ surfaces.
- `mh-type-chip` — input: `type`. Used on 6+ surfaces.
- `mh-provider-chip` — input: `provider`. Used on detail, calendar, list, showcase.
- `mh-capacity-bar` — input: `signups`, `cap?`. Used on list, detail, showcase, mobile.
- `mh-avatar-stack` — input: `users`, `total?`, `size?`. Used on list cards, detail. **If an existing component exists in the project (groups uses something similar), extend it instead of forking.**

**Session-flavored smart-ish primitive**:
- `mh-session-card` — input: `instance`, `variant`, `selectable`, `selected`, `showCTA`, `ctaLabel?`, `eligibility?`. Six visual variants in one file (per §0.2.5). Used by list cards, showcase, mobile discover, my-sessions, related-sessions footer, calendar quick-popover.

**Smart page**:
- `SessionsList` — owns `SessionsInstructorStore`. Composes `mh-page-shell` (from Phase A) + `mh-kpi-card` × 4 + tab strip + filter chips + bulk-select bar + `mh-session-card` × N (or `p-table` in table variant).

**Store**:
- `sessions-instructor.store.ts` — signal store with `templates`, `nextInstancesByTemplateId`, `loading`, `error`, `tab`, `filters`, `selection: Set<string>`.

### B.3 Layout (artboards `i-list-cards`, `i-list-table`, `i-list-empty`, `i-list-loading`)
- `PageShell` with header actions: `[List/Calendar]` segmented (List active) + `[Public profile]` outline + `[New session]` primary.
- KPI strip: 4 cards (This week / Total signups / Recurring templates / Needs attention with coral border on the last).
- Tabs row: Upcoming / Recurring templates / Past / Cancelled with counts (drive from `/sessions/templates?tab=...` counts; preload counts via a small dedicated call).
- Filters bar: search input, chip filters (All types / Group / 1-on-1 / Open · Online / In-person · Any group). Bulk-select pill appears when ≥1 card checked.
- Body: day-grouped cards (default) OR dense table (toggle).

### B.4 Data wiring
Store method `loadTemplates(query)` → `sessionService.listTemplates(query)`. The "list" endpoint returns templates; instances come from `/sessions/instances` (Phase B + C of FE). The list page is **templates-first** — it shows the "class concept" with its next-instance summary. To get the next-instance per template the store also calls `sessionService.listInstances({ instructorId: me, dateFrom: now, dateTo: now + 14d, limit: 200 })` and indexes by `templateId`.

That's 2 HTTP roundtrips on page load — acceptable. If perf becomes an issue, add a future BE endpoint that returns templates+next-instance in one shot.

### B.5 Empty + loading + error
- **Empty** (`i-list-empty`): hex tile + "No sessions yet" + 2 CTAs (Create / Use a template — the latter opens a dialog with 3 quick-start templates: Group classes / 1-on-1 / Open & free).
- **Loading** (`i-list-loading`): KPI skeletons + tabs (real) + 3 day-group skeleton cards.
- **Error**: NEW — see §9.A. Inline `p-message severity="error"` + Retry button.

### B.6 Tests
8 Vitest specs: tab switch updates filter, search debounces (200ms), KPI loads from `/sessions/templates`, table↔cards toggle persists in store, bulk-select chip appears with selection, empty renders when total=0, error renders on HTTP error, skeleton renders during loading.

### B.7 Acceptance gate
- Visual match to `i-list-cards`, `i-list-table`, `i-list-empty`, `i-list-loading`.
- KPI numbers come from real BE data (not hardcoded).
- All chips are `mh-access-chip` / `mh-type-chip` (consistent everywhere — that's the audit rule).

---

## 5. Phase C — Calendar smart wrapper (week / day / month / quick-create)

**Goal**: wire `mh-calendar-grid` (already shipped in Phase A) to sessions data. The grid engine + `mh-event-block` already exist — this phase is the **smart wrapper layer** and the small accessories (mini-month, popover, view switcher) that aren't grid-internal.

**Estimated size**: ~700 LOC. **Time**: 2.5 working days. *Less than original estimate because grid is already in place.*

### C.1 Components built
- `SessionsCalendar` (smart wrapper — owns `SessionsInstructorStore`, composes `mh-calendar-grid` + view switcher + toolbar)
- `QuickCreatePopover` (drag-result inline form — opens on `mh-calendar-grid`'s `(cellDrag)` event)
- `MiniMonth` (left-rail navigation, reused on all three views) — **lives in `core/lib/components/` because it's generic (a small date picker)**
- `instanceToCalendarEvent()` pure function (maps `SessionInstance` → `CalendarEvent`) — lives next to the smart wrapper in `pages/instructor/sessions/calendar/mappers.ts`
- `WeekFiltersPanel` (left-rail filter card — checkbox list for Group / 1-on-1 / Open / Online / In-person / Conflicts only)

### C.2 Mapper (the bridge between domain and grid)

```ts
// pages/instructor/sessions/calendar/mappers.ts
export function instanceToCalendarEvent(
  instance: SessionInstance,
  filters: CalendarFilters,
): CalendarEvent {
  const t = instance.template;
  return {
    id: instance.id,
    start: instance.startAt,
    end: instance.endAt,
    title: instance.titleOverride ?? t.title,
    subtitle: t.locationKind === 'ONLINE' ? `${t.meetingProvider ?? 'Online'}` : (instance.venue?.name ?? ''),
    color: colorForType(t.type),
    ring: (instance.conflictingInstanceIds?.length ?? 0) > 0 ? 'conflict' : 'none',
    badges: [
      t.locationKind === 'ONLINE' ? 'online' : null,
      t.isRecurring ? 'recurring' : null,
      instance.status === 'CANCELLED' ? 'cancelled' : null,
    ].filter(Boolean) as CalendarEvent['badges'],
    payload: instance,   // smart wrapper uses this on (eventClick) to navigate
  };
}
```

**Why a pure function**: testable in isolation, reusable in the public showcase calendar, no Angular Injector dependency.

### C.3 Layout (artboards `i-cal-week`, `i-cal-day`, `i-cal-month`, `i-cal-quick`, `i-cal-agenda`)

`SessionsCalendar` template:
```html
<mh-page-shell title="Sessions">
  <ng-container actions>
    <p-segmented [(ngModel)]="viewMode" ...>...</p-segmented>
    <p-button label="New session" (click)="openCreateDialog()"></p-button>
  </ng-container>

  <div class="grid grid-cols-[240px_1fr] gap-4">
    <aside>
      <mh-mini-month [(selectedDate)]="anchor"></mh-mini-month>
      <mh-week-filters-panel [(filters)]="filters"></mh-week-filters-panel>
    </aside>

    <mh-calendar-grid
      [view]="viewMode()"
      [dateRange]="dateRange()"
      [events]="events()"
      [loading]="store.loading()"
      timezone="Europe/Bucharest"
      (cellDrag)="onCellDrag($event)"
      (eventClick)="onEventClick($event)"
      (rangeChange)="store.loadRange($event)" />
  </div>

  @if (popover.visible()) {
    <mh-quick-create-popover ... />
  }
</mh-page-shell>
```

The grid does the rendering. The wrapper does only:
1. Data fetching via store (range changes → store call).
2. Domain → CalendarEvent mapping via `instanceToCalendarEvent`.
3. Event handlers (eventClick navigates; cellDrag opens popover).

### C.4 Agenda variant (`i-agenda`)
Same data, different render. **Adds a new prop to the grid** (`@Input() variant: 'standard' | 'agenda' = 'standard'`) — agenda variant flips the layout (days as rows, hours as columns) but reuses the same `CalendarEvent` input. Hidden behind a feature flag (`environment.featureFlags.agendaCalendar`).

### C.5 Data wiring
`sessions-instructor.store.ts.loadRange(range)` → `sessionService.listInstances({ dateFrom, dateTo })`. Store caches per `(rangeStartMs)` for the most-recent 3 ranges; LRU evicts the rest.

### C.6 Quick-create flow
`mh-calendar-grid` emits `cellDrag({ start, end, shiftKey })`. The wrapper:
- `shiftKey: true` → opens full `SessionFormDialog` with prefilled times.
- `shiftKey: false` → opens `QuickCreatePopover` near drag-end coordinates.

On popover submit → `sessionService.createTemplate(...)`. Optimistic update: store inserts the new instance into the cache for the current range BEFORE server returns; rollback on error.

### C.7 Errors not in the design
The canvas doesn't show calendar errors. Solutions in §9.A.

### C.8 Tests
10 specs (the grid-internal ones already passed in Phase A):
- `mapper.spec.ts`: `instanceToCalendarEvent` maps types correctly, sets conflict ring when `conflictingInstanceIds` is non-empty, sets badges per condition.
- `sessions-calendar.spec.ts`: store loads on range change, quick-create popover opens on `cellDrag` (no shift), full dialog opens on shift+drag, navigation fires on eventClick, mini-month change updates anchor signal.

### C.9 Acceptance gate
- Pixel-match to `i-cal-week`.
- 200-event week renders < 300ms on M1 (perf budget).
- Conflict ring visible on the artboard's Wed conflict.
- Drag-to-create → quick-popover → submit → new event appears in grid without page reload.
- **Reusability check**: `instanceToCalendarEvent` is the ONLY file in the smart wrapper that imports `SessionInstance`. The grid itself stays domain-clean.

---

## 6. Phase D — Session detail (instructor side)

**Goal**: detail pages for in-person, online, and recurring template. Plus attendance + approvals inbox.

**Estimated size**: ~900 LOC. **Time**: 3 working days.

### D.1 Components built
- `SessionDetail` (`session-detail.ts`) — branches on `instance.template.locationKind` to render in-person vs online layout.
- `participants-table` — uses `p-table` with the same pagination pattern as `MyInvoices`.
- `recurrence-strip` — the next-N-dates pill row from `i-detail-in`.
- `online-meeting-card` — teal-tinted block with Start meeting button (triggers `window.open(meetingUrl)`).
- `public-share-card` — mono URL row with copy icon. Uses `navigator.clipboard.writeText`. Copy state shown for 2s.
- `RecurringTemplateDetail` — instances table, regenerate-forward stepper, exceptions, bulk actions.
- `AttendancePanel` — tri-state attendance per row + private note + follow-up composer.
- `ApprovalsInbox` — central triage list.

### D.2 Layout (artboards `i-detail-in`, `i-detail-on`, `i-detail-template`, `i-attendance`, `i-approvals`)
- Detail: 1.5fr / 1fr two-col. Left = hero + pre-session banner + participants + description + workouts. Right = recurrence + location + public-share.
- Online variant swaps "Location" card for "Meeting link" card + "Reminders" card.
- Attendance: 1.6fr / 1fr. Left = attendance table with `mh-segment` tri-state per row. Right = follow-up composer + private session notes.
- Approvals inbox: header strip ("5 requests waiting"), filter chips, sort select, request rows with avatar + history + nested session bar + 3-button action stack.

### D.3 Tri-state attendance segmented control (`mh-segment`)
NEW shared component, since none exists. Three slots: Attended (✓ green) / No-show (✗ coral) / Unmarked (—). State `attended: true | false | null`. Click cycles or click-to-select directly.

### D.4 Workouts card
**OUT OF SCOPE in V1** because the BE has no workouts module yet (per `CLAUDE.md`). Render the card as **disabled with "Coming soon" copy** so the layout matches the artboard without breaking. Don't ship the FE behind the workouts BE.

### D.5 Data wiring
- `SessionDetail`: `sessionService.getInstance(id)` + lazy `getInstanceParticipants(id, page)` on first scroll of the participants table.
- `RecurringTemplateDetail`: `getTemplate(id)` + `listInstances({ templateId: id })`.
- `AttendancePanel`: `getInstance(id)` + `listParticipants(id, all)` (capped at 100, fits one page).
- `ApprovalsInbox`: `sessionService.listPendingApprovals(instructorId)` — **WAIT**, this endpoint doesn't exist on the BE. See §11 for the resolution.

### D.6 Decline reason dialog
NEW component `DeclineReasonDialog` — the design's "Decline" button is single-click but our BE accepts an optional `reason`. Quick-pick reasons: "Capacity reached" / "Not a fit yet" / "Conflicting time" / "Other (write a note)". See §9.B.

### D.7 Tests
14 specs: in-person vs online branch, recurrence strip clicks navigate to template detail, participants table lazy-loads, copy public URL shows "Copied!" state, attendance tri-state cycles, follow-up composer posts to `/follow-up`, approve calls correct endpoint, decline opens reason dialog, bulk approve loops with progress, regenerate-forward stepper bounds (1–104), end-series confirmation.

### D.8 Acceptance gate
- Detail page matches `i-detail-in` AND `i-detail-on` (run the URL with both online/in-person fixtures).
- Attendance panel matches `i-attendance` including tri-state visuals.
- Approvals inbox matches `i-approvals`.

---

## 7. Phase E — Instructor dialogs

**Goal**: create / cancel / conflict-resolution dialogs.

**Estimated size**: ~750 LOC. **Time**: 2.5 working days.

### E.1 Components built
- `SessionFormDialog` (simple + recurring in one component, recurrence builder expands when toggle = on)
- `CancelSessionDialog` (3 scope cards + optional message + optional reschedule offer)
- `ConflictResolutionDialog` (side-by-side comparison + 3 actions per side)
- `AccessConfigPanel` (reusable — both standalone screen AND embedded in the form dialog)

### E.2 SessionFormDialog (artboards `i-create-simple`, `i-create-rec`, `i-access-config`)
- Reactive form: title, type x3, group (when GROUP), description, date, start, duration, timezone, repeat toggle, recurrence builder (only when repeat=on), location (In-person + venue OR Online + provider+URL), access (4 radio cards), capacity, price.
- Recurrence builder: frequency chips, interval stepper, day-of-week buttons (Mon=1 ISO), ends-with segmented (Never / On date / After N).
- Live preview: calls `POST /sessions/templates/preview-recurrence` on every recurrence form change (debounced 300ms). Shows 6 dates + "+ N more". Conflict-warning chip per date that overlaps existing.
- Conflict banner: inline `p-message` if the create response returns `warnings: [{ code: 'CONFLICT', ... }]`. **Non-blocking** — save still succeeded.

### E.3 CancelSessionDialog (artboard `i-cancel`)
- Three radio cards (`this` / `thisAndFuture` / `series`) with dynamic copy ("Wed 20 May · just this one" → "15 occurrences from Wed 20 May onwards…" → "All 16 occurrences").
- Affected signups card (uses denormalised counter from the instance).
- Optional message (textarea, 500 chars, sanitized server-side).
- Optional reschedule offer (checkbox + date+time picker — opens new dialog or inline pickers).
- Calls `POST /sessions/instances/:id/cancel` with `{ scope, reason, message, rescheduleTo? }`.

### E.4 ConflictResolutionDialog (artboard `i-conflict`)
- Side-by-side comparison of two overlapping sessions.
- Per side: 3 actions — Reschedule / Move 30min later (auto-suggested, highlighted) / Cancel this session.
- "Keep both" footer button — closes dialog without changes; the warning stays on the calendar.

### E.5 Data wiring
- All dialogs are presentational; the parent page handles HTTP.
- Optimistic UI on cancel — the affected instance(s) get an immediate visual "cancelled" state.

### E.6 Tests
10 specs: form validation (title required, end-after between 1 and 104), recurrence preview debounces, recurrence end-conditions are mutually exclusive (segmented control enforces it), cancel scope updates copy, scope=series confirms again before submit, decline-on-reschedule banner shows when conflict warning returns, conflict modal calls correct action per side, no double-submit (button disabled during request).

### E.7 Acceptance gate
- All 4 dialogs visually match their artboards.
- Recurrence preview matches `POST /preview-recurrence` output.
- Backend audit IDs (D2, D3, D4) verified end-to-end via the cancel flow (live test from BE plan).

---

## 8. Phase F — Client side (desktop + mobile + public showcase)

**Goal**: discover, session detail (3 variants), my-sessions, booking flow, public showcase. Mobile shares 90% of the components with desktop.

**Estimated size**: ~1 200 LOC. **Time**: 4 working days.

### F.1 Components built
- `Discover` (client, desktop AND mobile via responsive container)
- `ClientSessionDetail` — branches on access (open/gated/blocked) via `@switch`
- `MySessions` (desktop)
- `BookingFlowDialog` (multi-step on desktop, full-screen on mobile)
- `BookingConfirmationDialog` (success state)
- `CancelBookingDialog`
- `DayOfOnline` (dedicated full-screen route for the countdown — only screen that's mobile-first)
- `InstructorSessionsShowcase` (in `projects/website` — the public profile)

### F.2 Discover (`c-discover`, `m-discover`)
- Filter chips horizontally scrollable on mobile.
- Featured-this-week honey-gradient card.
- Day-grouped card grid (3-col desktop, 1-col mobile).
- Anonymous → calls `GET /sessions/discover` without auth header. Authed → with auth (BE Phase E filters automatically).
- "Bookmark" icon is a placeholder for now (no bookmark BE endpoint yet — render the icon but `(click)` shows a toast "Saved! (coming soon)").

### F.3 ClientSessionDetail (`c-detail-open`, `c-detail-gated`, `c-detail-blocked`)
- Uses `/sessions/instances/:id/public` (anon-OK).
- BE returns either full `PublicSessionInstance` OR `BlockedSessionInstance` (with `isBlocked: true`).
- FE branches:
  - `isBlocked: true` → render `c-detail-blocked` (centered hero, lock icon, "Members only" CTA).
  - `access ∈ { OPEN, FREE }` → render `c-detail-open`.
  - `access ∈ { CLIENTS_ONLY, GROUP_ONLY }` (visible because eligible) → render `c-detail-gated` with green "You're in" banner.
- Right panel: price (Free in green / amount in primary), reminders summary, cancellation window, capacity bar.

### F.4 MySessions (`c-mine`, `m-mine`)
- Calls `GET /sessions/my?tab=upcoming|pendingApproval|waitlisted|past|cancelled`.
- Calls `GET /sessions/my/counts` for the badge counts.
- "Up next" pinned card.
- Per-row: time, title, status tag, venue/provider chip, .ics button, open button, cancel-booking icon.
- Mobile: 1-col, sticky tab strip on top.

### F.5 BookingFlowDialog (`m-book`)
- 3 steps: Review → Note → Confirm.
- Step 1: session summary card.
- Step 2: optional booking note (textarea).
- Step 3: cancellation-window agreement checkbox + final confirm.
- Calls `POST /sessions/instances/:id/book`.
- On success: closes flow, opens `BookingConfirmationDialog`.

### F.6 BookingConfirmationDialog (`c-confirm`)
- "You're in 🎉" hero.
- 3 next-step rows: reminders summary, calendar (.ics + Google + Outlook), cancellation window.
- `.ics` button → `window.open(/sessions/instances/:id/ics)` (BE serves Content-Disposition).
- Google → opens `https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&details=...&location=...` URL with prefilled data (no API call).
- Outlook → similar deep link.

### F.7 CancelBookingDialog (`m-cancel`)
- Reason radio list + optional message.
- "Within cancellation window" green banner when snapshot cutoff not yet hit.
- "Outside window" coral banner with copy "Your instructor will be notified, but they may keep the spot reserved".
- Calls `POST /sessions/instances/:id/cancel-booking`.

### F.8 DayOfOnline (`m-dayof`)
- Polls `GET /sessions/instances/:id/join-info` every 30s.
- Big countdown timer (min:sec).
- Join button activates inside `joinActiveFrom`..`joinActiveUntil` window.
- "Instructor has joined" indicator — **BE doesn't currently populate `instructorJoined`** (always returns false). FE renders the field but greys it out until BE wires it. See §11.
- Mobile + desktop share the same component — width adapts.

### F.9 InstructorSessionsShowcase (`c-showcase`)
- Lives in `projects/website` (the marketing site, publicly indexable).
- Route: `/i/:handle/sessions` (or stays inside the existing instructor public profile).
- Calls `GET /sessions/discover?instructorId=...` (anonymous OK).
- For each session card: access-aware CTA (View / Become a client / Members only).
- Inline conversion banner: "Join free to follow Andrei".
- Calendar embed: NEW — see §9.D for the solution.

### F.10 Tests
18 specs: discover unauthed renders OPEN/FREE only, authed includes eligible CLIENTS_ONLY, booking flow steps advance only on validation pass, double-submit disabled, blocked variant renders correct CTA, my-sessions counts come from `/my/counts` not from list length, day-of countdown ticks every second, join active window computed correctly, .ics opens new tab, cancel-booking with within/outside window shows correct copy, showcase respects access kind in CTA selection.

### F.11 Acceptance gate
- All 11 client artboards visually match.
- Showcase loads anonymous (no JWT).
- Day-of countdown works in real time.

---

## 9. Net-new designs (gaps in the canvas)

These nine screens / states are NOT drawn in the design canvas. I'm proposing solutions for each, sized to ship as part of the relevant phase.

### A. Error states (every page)
**Gap**: the canvas only shows happy paths and a list-empty state. No error UI exists.

**Solution** — uniform pattern:
- For full-page errors (initial load fails): show a centered card with `pi pi-exclamation-triangle` (coral), "Couldn't load sessions" heading, error code (small grey), and a `[Retry]` primary button + `[Go to home]` outline.
- For inline errors (an action failed on a populated page): use `p-message severity="error"` at the top of the page content. Auto-dismiss after 8s OR persistent if it blocks further interaction.
- Toast notifications for transient success ("Booked!", "Cancelled.") — use `MessageService` (already in the project).

Two empty-state variants the canvas missed:
- **No upcoming bookings**: hex tile + "Nothing booked yet" + `[Browse sessions]` primary.
- **No past bookings**: just a muted line "Your past sessions will show here."

### B. Decline-reason dialog (instructor)
**Gap**: `i-approvals` shows a single "Decline" button but the BE accepts a `reason`. Currently the FE would either skip the reason or block the flow on a textarea.

**Solution** — `DeclineReasonDialog`:
- Small dialog (~440px). Title "Why are you declining?".
- 4 radio options: "Capacity reached" / "Not a fit yet" / "Conflicting time" / "Other".
- "Other" reveals a textarea (200 chars).
- Footer: `[Cancel]` + `[Decline booking]` (coral primary).
- Sends the chosen-or-typed reason to `POST .../decline`.

### C. Follow-up audience picker (instructor)
**Gap**: `i-attendance` shows 3 chips (All attendees / No-shows / Specific people…). The third opens "something" that's not drawn.

**Solution** — `FollowUpAudienceDialog`:
- Triggered by clicking "Specific people…".
- Lists all non-terminal participants with checkboxes.
- Search filter on top.
- Counter at the bottom ("3 selected").
- `[Use selection]` button sets the audience to `userIds: [...]` and the message composer reflects "Sending to 3 people".

### D. Public showcase calendar embed (`c-showcase`)
**Gap**: The artboard's "Calendar" segment toggle is drawn but the calendar render itself isn't designed.

**Solution** — read-only mini calendar:
- 3 weeks at a time (current + 2 ahead).
- Each session is a small chip with title + time + access pill.
- Click → opens public detail (no auth needed if OPEN/FREE, else opens login).
- No drag/no event details — pure browse.

### E. Multi-device login required for booking (anonymous flow)
**Gap**: An unauthed user on a public showcase clicks "Book" — no design for the login-required state.

**Solution**:
- Intercept in `Discover`/`ClientSessionDetail` on book click when `!authStore.user()`.
- Open a small dialog: "Sign in to book this session" with `[Sign in]` (primary, navigates to `/auth/login?next=/sessions/instances/:id`) + `[Create account]` (outline).
- On successful auth, return URL routes back to the session detail. The user clicks Book again.
- Alternative: pass-through the booking intent into local storage and auto-trigger book on auth return. Defer to v2 unless requested.

### F. Web push permission prompt (post-book)
**Gap**: Booking confirmation says "Email + push reminders 24h and 1h before" but the FE never asks for push permission.

**Solution**:
- After first successful `book`, check `Notification.permission`. If `default`, show a soft prompt **after** the BookingConfirmationDialog closes — small banner at the top of MySessions with "Get push reminders for your sessions? [Allow]" + dismiss.
- On allow → request browser permission → register service worker → POST device token to existing `/notifications/devices` endpoint (already in the FE/BE).
- Dismiss → set `localStorage.flag = 'push-dismissed'` for 30 days.

### G. Conflict warnings in the list (not just the calendar)
**Gap**: `i-list-cards` shows conflict warnings inline ("Conflict with another session"). The data comes from `instance.conflictingInstanceIds` which BE Phase D writes. But the list endpoint returns templates, not instances. So the list card's conflict signal needs the next-instance per template.

**Solution**:
- The store's batched `listInstances({ instructorId: me, dateFrom: now, dateTo: now+14d })` returns each instance's `conflictingInstanceIds`.
- The card renders a conflict pill if that array is non-empty AND the conflicting instance is in the near horizon (else stale).
- Click the pill → opens `ConflictResolutionDialog` with that pair pre-loaded.

### H. Slug share state (copy success / failure)
**Gap**: `public-share-card` has a copy icon but no state design.

**Solution**:
- Click copy → `navigator.clipboard.writeText(url)`.
- Icon swaps to `pi pi-check` (green) + tooltip "Copied!" for 2s.
- Fallback for HTTP (Clipboard API requires HTTPS): show a small dialog with a textarea pre-selected so the user can ⌘+C.

### I. Bulk cancel from approvals inbox
**Gap**: The artboard shows "Approve all eligible" bulk action but no bulk decline.

**Solution**:
- Keep the bulk-approve button.
- Add a checkbox-mode toggle: clicking any checkbox switches the page into bulk-select mode (same pattern as the list page).
- Bulk-select bar at top: `N selected` + `[Approve N]` + `[Decline N]` (opens `DeclineReasonDialog` with a single reason applied to all).
- This is consistent with the list page's bulk pattern; no new UX paradigm.

---

## 10. Phase G — Notifications wiring (FE)

**Goal**: in-app notifications, web push, and email/push opt-in surfaces.

**Estimated size**: ~300 LOC. **Time**: 1.5 working days.

### G.1 In-app notifications (already exists)
The project has a notifications system (per `notification.service.ts` etc.). For sessions, just verify the existing list renders the 7 session-related types:
- `SESSION_REMINDER_24H` — opens session detail
- `SESSION_REMINDER_1H` — opens day-of screen (or detail if not online)
- `SESSION_CANCELLED` — opens "My sessions / cancelled" tab
- `SESSION_RESCHEDULED` — opens session detail
- `SESSION_STATUS_CHANGED` — opens session detail (for booking outcomes)
- `SESSION_FOLLOW_UP` — opens session detail
- `PARTICIPANT_JOINED` / `PARTICIPANT_LEFT` — opens session detail (instructor side)

### G.2 Web push (per §9.F)
Register service worker, request permission, store device token. The BE `notification/device.controller.ts` accepts tokens already.

### G.3 Settings page
Users already have a notification preferences page (existing). Confirm session types render with default channels. No FE work beyond regression test.

### G.4 Tests
4 specs: notification click navigates to the right screen per type, push permission flow, dismiss flag survives 30 days, settings page renders session toggles.

---

## 11. Out of scope / blocked on BE

Items that need BE work before the FE can ship:

| Item | Why blocked | Resolution |
|---|---|---|
| Approvals inbox list (`/sessions/approvals`) | No BE endpoint that returns "all PENDING_APPROVAL across my templates". Currently the FE would need to call `/sessions/templates` then `/sessions/instances?templateId=...` then `/sessions/instances/:id/participants?status=PENDING_APPROVAL` per instance — that's N+1+ and unacceptable. | **Add BE endpoint** `GET /sessions/approvals?instructorId=...` that returns flat list of pending participants with their instance + template eager-loaded. ~80 LOC backend. Sits in Phase H (small) of the BE master plan. |
| `instructorJoined` flag on `/join-info` | BE always returns `false`. Currently no mechanism to know the instructor has joined the meeting URL. | Defer to v2. Render the field but grey-out the "Andrei has joined" line until BE wires it (via a separate "I'm here" instructor click endpoint). |
| Workouts attached to sessions | No workouts BE module. | Render UI placeholder "Coming soon" — explicitly disabled. |
| Bookmark / save sessions | No BE bookmark surface. | Render the bookmark icon, on click show toast "Saved! (coming soon)". |
| Public booking link standalone page | The slug URL works (`/sessions/public/:handle/:slug`) but there's no dedicated Calendly-style standalone — public showcase covers the wedge. | Defer to v2. |
| Reminder dispatch (24h/1h push) | Schedule rows are written; worker doesn't exist yet (jobs module pending). | Reminders won't actually fire until the jobs module ships. The FE renders the reminder summary in the booking confirmation regardless. |
| Payment-gated booking | Out of scope per BE plan §11. Price is display-only. | "Request to book" path is the workaround. Instructor invoices manually. |
| Auto-promotion notification body wording | BE only sends `SESSION_STATUS_CHANGED` for promotion. | Defer naming — current copy is fine ("You're in! A seat opened up for…"). |

**Recommendation**: file the **approvals endpoint** as the only must-have BE add. Everything else is a v2 enhancement.

---

## 12. Phase order + dependencies

```
A (data layer)
└── B (instructor list)
    └── C (calendar)            ← depends on shared session-card from B
        └── D (instructor detail) ← depends on calendar event-block for the conflict ring
            └── E (instructor dialogs) ← depends on detail's recurrence-strip
F (client + showcase)             ← depends only on A; can run in parallel with B–E
G (notifications)                 ← depends on everything (touches all screens)
```

Solo developer cadence: A → B → C → D → E → F → G — about 17 working days.
With two devs in parallel: A → (B & F) → (C & F) → (D & F finishes) → (E) → G — about 11 working days.

---

## 13. Definition of done (per phase)

Every phase ships when:
1. All artboard screens it owns render pixel-close to the design.
2. All net-new states from §9 that fall under this phase are implemented.
3. Vitest specs pass.
4. TS compile + lint clean.
5. Manual smoke test with the live BE on `localhost:3800` covers happy path + at least one error path + one empty state.
6. The phase's "Acceptance gate" subsection above is satisfied.

---

## 14. Phase A kickoff checklist

All 7 open questions have been answered and locked in §0.1. Phase A is unblocked. Before opening the Phase A PR:

- [x] Decisions Q1–Q7 locked (see §0.1)
- [ ] BE Phase H (approvals endpoint) filed as a separate ticket — it doesn't block FE Phase A or B, only Phase D
- [ ] Verify `npm run start:dev` on the BE works on `localhost:3800` (so Phase A can wire endpoint URLs against a real server)
- [ ] Confirm `projects/core` build pipeline is green pre-touch
- [ ] Read the design source files in `/tmp/sessions-design/` once more before writing code (visual reference for the primitives)

Once those boxes are checked, Phase A is implementation-ready.

---

*Last updated: 2026-05-15. Update after each phase.*
