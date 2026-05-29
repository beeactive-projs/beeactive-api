# Sessions — handoff prompts for Claude Code

Two prompts you can paste into Claude Code. One drives the frontend
implementation in the Angular monorepo; the other drives the backend
data model + API surface so it stays in sync. Both reference the
**Sessions — deep dive** design canvas as the source of truth.

---

## 1) Frontend prompt — Claude Code (Angular 21 + PrimeNG 21)

> Use this in the `beeactive-ui/` repo. The design source is
> `MotionHive - Sessions deep dive.html` + the `canvas/sessions-deep/`
> JSX files in the design project.

```
You're working in the MotionHive Angular monorepo (beeactive-ui/). Read
CLAUDE.md at the root first — it's binding. Match the conventions
exactly: PrimeNG 21 components, Tailwind for layout, no hardcoded
colors, signals only, sentence case, `mh-` selector prefix, files in
`projects/web/src/app/main/instructor/sessions/` for instructor and
`projects/web/src/app/main/user/sessions/` for the client view.
Shared types and constants go in `projects/core/`.

The design source is the **Sessions — deep dive** canvas: a single HTML
file with React mocks split across `canvas/sessions-deep/*.jsx`. Treat
those as the visual contract. Component names, copy, color usage,
density and access-requirement chips all come from there.

Important framing — payments are out of scope for now. A `price`
field exists on every session, but the UI never gates booking on
payment. Paid sessions just display the price and send a "Request to
book" / "Book" intent; the instructor invoices manually for now. Leave
all data structures with room to wire a real payment flow later
(don't shortcut by deleting the price field). Same for refunds: the
client-side cancellation flow surfaces the cancellation window, not a
refund amount.

### Scope, screen by screen

Build these against the canvas artboards. Each artboard id below maps
to a section in the canvas — find it in the host HTML.

Instructor (under `/coaching/sessions`):

1.  **Sessions list** (`i-list-cards` default, `i-list-table` variant)
    - Tabs: Upcoming / Recurring templates / Past / Cancelled — use
      `MenuItem[]` typed as `TabSpec` extending `MenuItem` with
      `count: number`.
    - Filters: type, online/in-person, group, date range, search.
    - Day-grouped card variant AND `p-table` dense variant — same data
      source, view toggle via signal.
    - Bulk select with selection-toolbar pattern.
    - KPI strip on top (4 cards).
    - Empty (`i-list-empty`) + loading skeleton (`i-list-loading`).
2.  **Calendar** (`i-cal-week` is the hero — polish this hard)
    - Week / Day / Month views with a single store driving them.
    - Current-time line, half-hour dashed lines, alternating row tint.
    - Side-by-side overlap rendering with a conflict highlight ring.
    - Drag-to-create suggestion strip + quick-create popover
      (`i-cal-quick`) — Shift-drag opens the full dialog.
    - Mini-month nav, type/online filters, conflict toggle.
    - Reference Google Calendar / Cal.com cycle view for execution
      quality.
3.  **Create / edit session dialog** (`i-create-simple`, `i-create-rec`)
    - Reactive form. Stepper visual but a single form.
    - Recurrence builder reflecting the API:
      `frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'`, `interval`,
      `daysOfWeek?: number[]` (1–7, Mon-first), and *either*
      `endDate?: ISODate` *or* `endAfterOccurrences?: number`.
    - Live preview of generated dates (call the backend
      `POST /sessions/preview-recurrence` — see backend prompt).
    - Plain-English summary of the rule under the form.
    - Access-requirement block (`i-access-config`) — pick one of:
      `OPEN`, `CLIENTS_ONLY`, `GROUP_ONLY`, `FREE`. Plus an orthogonal
      `approvalRequired: boolean` toggle.
    - Conflict banner — non-blocking, shows on save when the API
      returns warning + `conflictingSessionIds`.
4.  **Session detail · instructor** (`i-detail-in`, `i-detail-on`)
    - In-person vs online split layout — don't shoehorn.
    - Participants table: status, paid (display-only), joined-call,
      booked-at. Approval pending rows get an inline approve/decline.
    - For online: provider chip + Start meeting button. Use
      `detectMeetingProvider(url)` from `core` to pick the chip.
    - For in-person: map placeholder + Directions.
    - Recurrence strip with "edit this / edit series" affordances.
    - "Public share" card with copyable URL —
      `motionhive.app/s/<instructor-slug>/<session-slug>`. This is the
      cornerstone of the showcase angle — anyone, including non-MH
      users, can open this URL.
5.  **Recurring template detail** (`i-detail-template`)
    - List all generated instances in a table.
    - "Regenerate forward" panel — adds N more occurrences without
      touching past ones.
    - Exceptions list (cancelled / skipped instances).
    - Bulk actions: update venue across remaining, shift times, end
      series after current week.
6.  **Cancel / reschedule dialog** (`i-cancel`)
    - Three modes: this occurrence only / this + future / entire
      series. Radio cards.
    - Optional message to signups + optional reschedule offer.
7.  **Conflict resolution modal** (`i-conflict`)
    - Side-by-side comparison of the two overlapping sessions.
    - Quick actions per card; pre-suggest the lower-impact resolution.
8.  **Post-session attendance + follow-up** (`i-attendance`)
    - Mark attended / no-show / unmarked per participant.
    - Private per-participant note field.
    - Follow-up message composer with quick templates ("Thank you",
      "Homework", "Next reminder") and optional workout PDF attach.

Client view (under `/discover/sessions` and `/sessions`):

9.  **Discover** (`c-discover`, `m-discover`) — public list of
    upcoming sessions across the user's instructors + community open
    sessions. **Must work logged-out for `OPEN`/`FREE` sessions** —
    the showcase use case.
10. **Session detail · client** — three variants:
    - `c-detail-open` · open / free — Book button live.
    - `c-detail-gated` · paid + clients-only/group-only **satisfied**
      — "Request to book" if approval required, otherwise straight
      Book.
    - `c-detail-blocked` · permission gate when a non-member opens a
      `GROUP_ONLY` session — show title + time + instructor publicly,
      blur description/location/spots, offer "Request to join group".
11. **My sessions** (`c-mysessions`, `m-mysessions`) — upcoming +
    awaiting-approval + past + cancelled tabs. "Up next" pinned card.
    `.ics` download per row.
12. **Booking confirmation** (`c-confirm`) — small dialog with
    reminders + .ics options + cancellation window restatement.
13. **Mobile screens** — `m-detail` (sticky bottom CTA),
    `m-booking` (request flow with note to instructor + 24h
    cancellation ack), `m-dayof` (countdown + Join now activates 5
    minutes before for online sessions), `m-cancel` (reason picker +
    optional message + cancellation-window banner).

### Behavioural rules

- **Self-book by default**, but the session has
  `approvalRequired: boolean`. When true, booking creates a
  `PENDING_APPROVAL` participant — the instructor must accept.
- **Waitlist** is opt-in. When a session hits capacity, the client
  sees a "Join waitlist" button instead of "Full". Promotion from
  waitlist requires instructor approval.
- **Day-of online** — the Join button activates 5 minutes before
  start and stays valid for 15 minutes after start.
- **Conflict** — the API still saves on conflict and returns a
  warning. Surface that as a non-blocking banner everywhere it
  matters: create dialog, calendar event ring, list row.
- **Provider chips** — `ZOOM`, `GOOGLE_MEET`, `TEAMS` only. Anything
  else renders as "Online". Use `detectMeetingProvider`.
- **Sentence case everywhere.** Honey is primary, navy is for
  headings sparingly, coral only for conflicts/cancellations, teal
  for online/community accent. Never invent new colors.
- **AXE / WCAG AA.** Focus rings, contrast, ARIA on the calendar grid
  cells (`role="gridcell"`).

### Out of scope (do NOT build yet)

- Punch cards UI.
- Subscription billing UI.
- In-app payment flow — keep `price` as display-only.
- Refund amount math.

### File layout

```
projects/web/src/app/main/instructor/sessions/
  sessions.ts/.html/.scss              # list page (variant toggle inside)
  sessions.store.ts                    # signals + lazy load
  calendar/
    calendar.ts/.html/.scss            # week/day/month container
    week-view.ts/.html/.scss
    day-view.ts/.html/.scss
    month-view.ts/.html/.scss
    quick-create-popover.ts/.html/.scss
  session-detail/
    session-detail.ts/.html/.scss
    participants-table.ts/.html/.scss
    recurrence-strip.ts/.html/.scss
    online-meeting-card.ts/.html/.scss
  recurring-template/
    recurring-template-detail.ts/.html/.scss
  _dialogs/
    session-form-dialog.ts/.html/.scss
    cancel-session-dialog.ts/.html/.scss
    conflict-resolution-dialog.ts/.html/.scss
    attendance-dialog.ts/.html/.scss

projects/web/src/app/main/user/sessions/
  discover/
  session-detail/
  my-sessions/
  day-of-online/
  cancel-booking-dialog.ts/.html/.scss

projects/core/src/lib/
  models/session/
    session.model.ts                   # Session, SessionInstance, RecurrenceRule, Participant
    session.enums.ts                   # SessionType, AccessRequirement, ParticipantStatus, MeetingProvider
  services/session.service.ts
  stores/sessions.store.ts             # for the calendar — week-range scoped cache
```

Re-export every new model/enum/service from `core/public-api.ts`.

### Don'ts (recurring failure modes)

- Don't use `*ngIf`/`*ngFor` — use `@if`/`@for`.
- Don't use `p-dropdown`/`p-calendar` — use `p-select`/`p-datepicker`.
- Don't forget `[appendTo]="'body'"` on overlay components.
- Don't hardcode `#E48913` — use `var(--p-primary-color)` / Tailwind
  tokens via the Lara preset.
- Don't render the access-requirement chip differently across screens —
  same chip component everywhere (`mh-access-chip`).
- Don't show payment UI ("Pay now", "Card on file", refund line items)
  — the only money-shaped element is a `price` display string.
```

---

## 2) Backend / data model prompt — Claude Code (NestJS, MotionHive API)

> Use this in the **backend** repo. The API base is
> `https://beeactive-api-production.up.railway.app/api`. Swagger:
> `…/api/docs`.

```
You're working on the MotionHive backend that powers the Sessions
feature. Mirror the data model and endpoints described below so the
Angular `web` app can wire up the **Sessions — deep dive** design
without re-shaping requests.

### Framing — payments out of scope (for now)

Sessions can have a `price` and `currency`. The platform does NOT
charge clients. Instructors invoice manually outside the app. Leave
room to attach Stripe / a fulfilment flow later, but do not implement
any payment intents, payment methods, or refunds on the session
itself yet.

### Domain entities

```ts
// Session (the template OR a single occurrence — split below)
type SessionType         = 'GROUP' | 'PRIVATE' | 'OPEN';
type AccessRequirement   = 'OPEN' | 'CLIENTS_ONLY' | 'GROUP_ONLY' | 'FREE';
type MeetingProvider     = 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS' | null;
type LocationKind        = 'IN_PERSON' | 'ONLINE';

interface SessionTemplate {
  id: string;
  instructorId: string;
  title: string;
  description: string;

  type: SessionType;
  access: AccessRequirement;
  approvalRequired: boolean;
  groupId: string | null;        // required iff access === 'GROUP_ONLY'

  locationKind: LocationKind;
  venueId: string | null;        // required iff locationKind === 'IN_PERSON'
  meetingUrl: string | null;     // required iff locationKind === 'ONLINE'
  meetingProvider: MeetingProvider;  // server-derived from meetingUrl on save

  capacity: number | null;       // null = no cap
  waitlistEnabled: boolean;      // default true

  durationMinutes: number;
  timezone: string;              // IANA, e.g. 'Europe/Bucharest'

  priceAmountCents: number;      // 0 for free; UI-only for now
  priceCurrency: string;         // ISO-4217; matches instructor default

  attachedWorkoutIds: string[];

  // recurrence — null for one-off
  recurrence: RecurrenceRule | null;
  startAt: ISODateTime;          // first occurrence (or only one)

  status: 'ACTIVE' | 'ENDED' | 'CANCELLED';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;                       // every N
  daysOfWeek?: number[];                  // 1=Mon..7=Sun, WEEKLY only
  // mutually exclusive
  endDate?: ISODate;
  endAfterOccurrences?: number;
}

interface SessionInstance {
  id: string;
  templateId: string;
  instructorId: string;
  occurrenceIndex: number;        // 0-based
  startAt: ISODateTime;
  endAt: ISODateTime;

  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  cancelReason: string | null;
  cancelledAt: ISODateTime | null;

  // denormalised snapshot from the template at generation time
  title: string;
  description: string;
  venueId: string | null;
  meetingUrl: string | null;
  meetingProvider: MeetingProvider;
  capacity: number | null;

  signupCount: number;            // confirmed only
  waitlistCount: number;
  approvalPendingCount: number;
  attendedCount: number | null;   // null until post-session

  conflictingInstanceIds: string[]; // recomputed on save
}

interface SessionParticipant {
  id: string;
  instanceId: string;
  userId: string;

  status: 'PENDING_APPROVAL' | 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED' | 'DECLINED';
  joinedAt: ISODateTime | null;       // when their booking landed
  approvedAt: ISODateTime | null;
  cancelledAt: ISODateTime | null;
  attended: boolean | null;           // null = unmarked
  privateNote: string | null;         // instructor-only
  bookingNote: string | null;         // client → instructor at booking time
}
```

### REST endpoints

Group under `/api/sessions`. Auth via existing Bearer interceptor.

Instructor surface:

- `GET /sessions/templates` — list (filter: tab=upcoming|recurring|past|cancelled, type, location, groupId, q, dateFrom, dateTo, page, size)
- `POST /sessions/templates` — create. Body matches `SessionTemplate`
  minus server-derived fields. Returns `{ template, generatedInstances[], warnings: [{ code: 'CONFLICT', instanceIds: string[] }] }`.
- `GET /sessions/templates/:id`
- `PATCH /sessions/templates/:id` — partial update (this template only).
- `DELETE /sessions/templates/:id?scope=series` — ends the series.
- `POST /sessions/templates/:id/regenerate?count=N` — extend by N more occurrences.
- `POST /sessions/preview-recurrence` — dry-run, returns the first 12
  generated `startAt` timestamps. Used by the create dialog live preview.
- `GET /sessions/instances` — list (filter: dateFrom, dateTo, instructorId, status, groupId, view=week|day|month). The calendar
  hits this on every navigation; should be cacheable per (instructor, dateRange).
- `GET /sessions/instances/:id`
- `PATCH /sessions/instances/:id` — only allowed when scope flag is
  set; updates the snapshot of this occurrence (exception).
- `POST /sessions/instances/:id/cancel` — body: `{ scope: 'this' | 'thisAndFuture' | 'series', reason?, message?, rescheduleTo?: ISODateTime }`.
- `POST /sessions/instances/:id/participants/:participantId/approve`
- `POST /sessions/instances/:id/participants/:participantId/decline`
- `PATCH /sessions/instances/:id/participants/:participantId` — body `{ attended?: boolean, privateNote?: string }`.
- `POST /sessions/instances/:id/follow-up` — body `{ audience: 'all' | 'attended' | 'noshow' | 'userIds', message, attachWorkoutPdf? }`.

Client surface:

- `GET /sessions/discover` — public-readable list. Returns
  `OPEN`/`FREE` sessions for unauthenticated callers. For
  authenticated callers, also includes sessions the user is eligible
  for via client/group membership.
- `GET /sessions/instances/:id/public` — public-safe view of an
  instance. For `GROUP_ONLY` to a non-member, returns the
  redacted shape: title, instructor, startAt, type, access only.
- `GET /sessions/my` — authenticated, the user's bookings
  (`upcoming` | `pendingApproval` | `past` | `cancelled`).
- `POST /sessions/instances/:id/book` — body `{ bookingNote? }`.
  Returns `{ status: 'CONFIRMED' | 'PENDING_APPROVAL' | 'WAITLISTED' }`.
  Errors: `403 ACCESS_DENIED` (group-only, not a member),
  `409 ALREADY_BOOKED`, `409 CAPACITY_HIT_NO_WAITLIST`.
- `POST /sessions/instances/:id/cancel-booking` — body
  `{ reason?, message? }`. Server enforces cancellation window
  (24h) and returns `cancellation: 'WITHIN_WINDOW' | 'OUTSIDE_WINDOW'`.
- `GET /sessions/instances/:id/ics` — returns `text/calendar`.
- `GET /sessions/instances/:id/join-info` — returns
  `{ meetingUrl, joinActiveFrom: ISODateTime, joinActiveUntil: ISODateTime, instructorJoined: boolean }`.
  `joinActiveFrom` is `startAt - 5min`. The mobile day-of screen
  polls this.

### Conflict detection

On `POST /sessions/templates` and `PATCH /sessions/instances/:id`,
recompute overlap against the same instructor's other instances
within ±2 hours of each instance's `startAt`. Save anyway. Return
`warnings: [{ code: 'CONFLICT', instanceIds }]` and stamp
`conflictingInstanceIds` on each affected instance. Conflicts never
block the write.

### Meeting provider detection

When `locationKind === 'ONLINE'`, derive `meetingProvider` from the
URL hostname (mirror the frontend `detectMeetingProvider`):

- `*.zoom.us`, `*.zoom.com` → `ZOOM`
- `meet.google.com` → `GOOGLE_MEET`
- `teams.microsoft.com`, `teams.live.com` → `TEAMS`
- anything else → `null`

### Access enforcement

- `OPEN` / `FREE` — anyone can book. Public discover and public
  instance view both expose the full shape.
- `CLIENTS_ONLY` — booker must have an active
  `InstructorClient` row with this instructor.
- `GROUP_ONLY` — booker must be an accepted member of `groupId`.
  Non-members get the redacted public view.
- `approvalRequired` is orthogonal: when true, all bookings land as
  `PENDING_APPROVAL` regardless of access kind.

Surface 403s with a stable error code (`ACCESS_DENIED_NOT_CLIENT`,
`ACCESS_DENIED_NOT_GROUP_MEMBER`) so the frontend can pick the
right gate UI.

### Don't build yet

- Payment intents, refund flow, invoice generation tied to a
  session.
- Punch-card or subscription deduction.
- iCal subscription feed (single-event `.ics` download is fine).

### Test cases to cover

1.  Create a WEEKLY template, Mon&Wed, end after 16 → 16 instances,
    correct `startAt`s across DST boundary.
2.  Save a template that overlaps an existing one — warning, both
    persisted, both stamped with each other in `conflictingInstanceIds`.
3.  Cancel `thisAndFuture` from instance #5 — instances 1–4 untouched,
    5–16 marked CANCELLED, template stays ACTIVE.
4.  `regenerate?count=8` → appends 8 instances strictly after the
    last existing one.
5.  Book a `GROUP_ONLY` session as a non-member → 403
    `ACCESS_DENIED_NOT_GROUP_MEMBER`, no participant created.
6.  Book at capacity with `waitlistEnabled` — participant created
    with status `WAITLISTED`. Approval from instructor flips them to
    `CONFIRMED`.
7.  Cancel a booking 23h before start → `OUTSIDE_WINDOW` flag (UI
    decides what to do).
8.  `GET /join-info` 6 min before start → `joinActiveFrom` in the
    past, frontend renders Join now.
```

---

## Notes for the hand-off

- Both prompts intentionally repeat the "payments out of scope" framing —
  don't drop it; it's the #1 misread risk.
- The frontend prompt references **artboard IDs** so Claude Code can
  open the canvas, focus on the right card, and lift values directly.
- Access requirements are normalised to **four mutually-exclusive
  kinds** + an **orthogonal approval flag**. Don't multiply this on
  either side.
- The "public share" surface (instructor profile + public session
  detail for OPEN/FREE) is the showcase angle — keep it
  unauthenticated-readable on the backend and don't lock-icon it on
  the frontend.
