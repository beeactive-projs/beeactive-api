# Sessions — Backend Build Spec (Hard Rewrite, v1)

> **You are about to build the Sessions feature on the MotionHive backend from scratch.** The existing module is being deleted, not patched. This spec is self-contained: read it, the three context docs listed in §0, and you have everything needed to ship.
>
> **Audience:** a Claude Code session with no prior conversation history. Treat this document as binding.
>
> **Tone of this spec:** prescriptive, not exploratory. Decisions have been made. Where you see "DECISION:", that's a closed question — do not relitigate. Where you see "RULE:", that's a non-negotiable constraint.

---

## 0. Before you write any code

### 0.1 Context to load (in this order)

1. **`CLAUDE.md`** — root-level binding conventions for the backend. Read in full.
2. **`docs/PROJECT_CONTEXT.md`** — backend + frontend repo map; modules, patterns, integration contracts.
3. **`docs/research/sessions/SESSIONS_CONTEXT.md`** — current module state, industry research, decisions log.
4. **`docs/research/sessions/SESSIONS_DESIGN_VS_PLAN.md`** — comparison of designer's plan vs. our research; why we chose what we chose.
5. **The designer's brief:** `~/Downloads/MotionHive (3)/PROMPTS-for-claude-code.md` (frontend prompt half can be skimmed; backend prompt half is the visual + behavioral contract).
6. **The existing module being deleted:** `src/modules/session/` — every file. You need to know exactly what you're tearing out and what import sites elsewhere reference it.

### 0.2 Pre-work gate — DO NOT skip

Before phase 1, post a single message back containing:

- **What you read** (the 6 docs above; one-line per doc confirming you read it).
- **What you understood** in ≤200 words. Cover: the rewrite framing, the 9 decisions, the snapshot pattern, the auto-promote waitlist semantics.
- **What you plan for phase 1** (≤10 bullets).
- **Any clarifying question** that, if unanswered, would cause rework later. If none, say "no questions."

This is the only place the human stops to check you. After this gate, execute phase by phase without re-asking the high-level design.

### 0.3 Binding rules (apply across all phases)

1. **Rewrite, do not patch.** Phase 1 deletes the existing `src/modules/session/` and its tables. We are not preserving any current behavior or data. The FE has nothing live against sessions except a placeholder component and a read-only block — those tolerate downtime.
2. **CLAUDE.md wins.** Every rule there applies here too. Notable: no `any`, no `console.log` (Winston only), kebab-case file names, PascalCase classes with suffix, `@ApiEndpoint` docs in `src/common/docs/<module>.docs.ts`, `Op.iLike` not `Op.like`, PG JSON operators not MySQL functions, pagination shape is `{ items, total, page, pageSize }`, `ParseUUIDPipe` on every UUID `@Param`, transactions on every multi-table operation, `private readonly` for all service constructor params with logger last.
3. **Notifications:** use `notificationService.notify(builder(...))`. Builders live in `<module>/notifications.ts`. Never object literals at call sites. Never inside a tx — call after commit (search the `post` and `group` modules for `// notify-after-commit` markers for examples). For tx-scoped sends, use `NotificationOutbox`.
4. **Security:** every endpoint has a DTO with class-validator rules. Ownership checks in services, never controllers. Rate-limit every write endpoint (`@Throttle`). UUID params via `ParseUUIDPipe`. No PII in log lines (user IDs OK, email/phone not). Visibility checks via `assertCanViewInstance` (you'll write this) — funnel every read through it.
5. **Reusable code goes in `common/`.** If you find yourself writing a utility, ask "would another module want this?" If yes, place it in `src/common/utils/` or `src/common/services/`. The recurrence expansion engine specifically is its own service (`RecurrenceService`) injectable elsewhere later.
6. **Per-phase gate (mandatory):** after every phase, run lint + typecheck + tests. Write tests for new code (target: service ≥70% lines, every endpoint touched by ≥1 integration test). Update relevant `docs/` files. Post a phase-completion report (see §8.3). No phase advances without this.
7. **No scope creep.** The "Out of scope" list in §1.2 is binding. If you find yourself building something not in this spec, stop and ask.
8. **Clean code.** Functions ≤40 lines where reasonable, controllers ≤10 lines per handler, services own all business logic, no premature abstraction. Comments only when WHY is non-obvious.

### 0.4 Tools you'll use

- Sequelize 6 + sequelize-typescript (existing entity pattern)
- class-validator + class-transformer (DTOs)
- BullMQ via the existing `JobsService` (for reminder + waitlist-promote jobs)
- NestJS Throttler (`@Throttle`)
- Winston (logger)
- Jest 30 (tests)
- ESLint (lint)

Standard NestJS module shape. Reference any existing module (`group`, `post`, `payment`) for patterns when in doubt.

### 0.5 Local environment setup (do this before phase 1 code)

You need a working local environment with a real Postgres database. **Do not mock the database.** The booking concurrency tests (FOR UPDATE) only work against real Postgres; SQLite has no `SELECT ... FOR UPDATE` and silently passes.

**Setup steps:**

1. **Repo:** `git clone` + `npm install` from the project root.
2. **Postgres:** either
   - Use the existing dev Neon DB via `DATABASE_URL` in `.env` (ask the human for credentials), OR
   - Spin up a local Postgres (`docker run -d --name mh-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`) and set `DB_HOST/PORT/USERNAME/PASSWORD/NAME` in `.env`.
3. **Two databases** required:
   - `motionhive_dev` — for `npm run start:dev` and manual curl testing
   - `motionhive_test` — for Jest integration tests (separate DB so test runs don't trash dev data)
   - Set `TEST_DATABASE_URL` (or equivalent `TEST_DB_*` vars) for Jest if not already configured. If the project doesn't currently support a separate test DB, add it in phase 1 — see §0.6 below.
4. **Redis (for BullMQ):** required for phase 6.
   - `docker run -d --name mh-redis -p 6379:6379 redis:7`
   - Set `REDIS_HOST=localhost`, `REDIS_PORT=6379` in `.env`.
   - Phases 1–5 do not need Redis. The `JobsService` no-ops gracefully without it (per CLAUDE.md).
5. **Migrate dev DB:** `npm run migrate`. Migrate test DB via the same mechanism pointed at the test DB.
6. **Boot the server once:** `npm run start:dev`. Confirm `/api/docs` (Swagger UI) loads. Hit `GET /health` — should return 200.
7. **Auth setup for manual testing:** create a test instructor and a test client via the existing auth flow (register + verify email manually in DB or use existing seed data). Save two JWT access tokens — you'll use them for curl tests in §8.4.

**Verification command:**
```bash
psql $DATABASE_URL -c "\dt"   # should list existing tables
npm run start:dev             # should boot without errors
curl http://localhost:3000/health   # should return 200
```

If any of the above fails, stop and ask the human before proceeding to phase 1.

### 0.6 Test database isolation rule

Integration tests MUST run against `motionhive_test`, not the dev DB. Configure Jest to:

- Load `.env.test` (separate from `.env`).
- Truncate all session tables (`session_template`, `session_instance`, `session_participant`, `session_reminder_schedule`) before each test file, OR wrap each test in a transaction that rolls back. Pick one strategy and use it consistently.
- Never run integration tests against `motionhive_dev`. If `process.env.NODE_ENV !== 'test'` at the entry of any integration test, fail loudly.

If the project doesn't have a test DB setup yet, add it as the first task of phase 1. The pattern: copy `database.config.ts`, parameterize it on `NODE_ENV`, point at `TEST_DATABASE_URL` when `NODE_ENV=test`. Reference existing test files in `auth.service.spec.ts` if they already handle this.

---

## 1. What we're building (in one screen)

### 1.1 Domain summary

MotionHive sessions = the atomic "instructor delivers service at a specific time" entity. Two layers:

- **`session_template`** — the rule. One row per "class concept." Holds defaults (title, recurrence, capacity, price, access).
- **`session_instance`** — one row per actual occurrence. Inherits defaults from its template; can override per-occurrence (different venue this week, etc.). Participants book instances.

Every session has both: one-off = 1 template + 1 instance; recurring = 1 template + N instances. Always two rows minimum.

Participants are clients booking specific instances. Lifecycle: `PENDING_APPROVAL → CONFIRMED` (or → `WAITLISTED` if full) with `→ CANCELLED / DECLINED` exits. Attendance is a separate boolean.

Recurrence is a custom JSON rule (subset of RRULE): `{ frequency: DAILY|WEEKLY|MONTHLY, interval, daysOfWeek: 1–7 Mon=1, endDate | endAfterOccurrences }`. The instructor generates N instances on demand; can regenerate forward later.

Public surface: `OPEN` and `FREE` access sessions readable without authentication for the marketing/showcase wedge.

### 1.2 In scope (v1)

- Two-table model with template + instance + participant + reminder schedule.
- 26 endpoints across template management, instance management, participant lifecycle, calendar, public discovery.
- Auto-add waitlist with 2-hour pre-start cutoff.
- Approval-required booking flow.
- Per-occurrence overrides (title, description, venue, meeting URL, capacity).
- Cancellation at three scopes: this / this+future / series.
- Conflict detection (non-blocking warnings).
- 24h + 1h reminders via BullMQ jobs.
- Per-participant snapshot fields (price, cancellation cutoff, location, meeting URL) at booking time — dispute defense.
- Public unauthenticated read of `OPEN` and `FREE` instances; redacted view for access-denied.
- Single-event `.ics` download per instance.
- Day-of `join-info` endpoint (mobile polls this).
- Self-check-in (−15min / +30min window).
- Notifications via existing `NotificationService` + email via existing `EmailService`.
- Cross-instructor approval inbox query.
- ~70% service test coverage; integration test per endpoint.

### 1.3 Out of scope — DO NOT BUILD

- **Payments wired to sessions.** Price is display-only. Instructor invoices manually via the existing `payment` module. No PaymentIntent, no SetupIntent, no refund logic tied to session cancellation. The `price_amount_cents` field is for display only.
- **Punch cards / class packs / subscription quota deduction.**
- **iCalendar subscription feed** (live URL refreshing). Single-event `.ics` download only.
- **Workout PDF attachments** (workouts module doesn't exist yet).
- **NO_SHOW participant status.** Use `attended: boolean | null` instead.
- **`confirm` endpoint.** Booking is either `PENDING_APPROVAL` or `CONFIRMED` from the start. No explicit confirm step.
- **Buffer / padding time between sessions.** Defer to v2.
- **RRULE format.** Custom JSON rule is fine for v1.
- **First-to-claim waitlist.** Auto-add only.
- **SMS notifications.** Email + in-app + push only (push uses existing `device-token` infra).
- **Public booking page (Calendly-style standalone).** Public showcase is on the instructor profile, not a standalone surface.
- **Series-level participant subscription** ("auto-rebook every Monday"). v2.

### 1.4 The 9 closed decisions (do not relitigate)

| # | Decision | Value |
|---|---|---|
| 1 | Schema shape | **Two physical tables: `session_template` + `session_instance`** |
| 2 | Day-of-week numbering | **1=Mon..7=Sun (ISO 8601)** |
| 3 | Session type enum | **`GROUP \| PRIVATE \| OPEN`** |
| 4 | Access requirement enum | **`OPEN \| CLIENTS_ONLY \| GROUP_ONLY \| FREE`** + orthogonal `approval_required: boolean` |
| 5 | Waitlist | **Auto-add (FIFO), with 2-hour pre-start cutoff** |
| 6 | Cancellation window | **Per-template `cancellation_cutoff_hours`, default 24** |
| 7 | Drop `confirm` endpoint | **Dropped** |
| 8 | Drop `NO_SHOW` status | **Dropped; use `attended: boolean \| null`** |
| 9 | Payments on sessions | **Display-only `price_amount_cents`. No Stripe wiring.** |

---

## 2. Database schema (binding)

Create one migration file: `migrations/043_sessions_rewrite.sql` (or next available number — check `ls migrations/` first). The migration is **destructive**: drops the existing tables, creates the new ones.

### 2.1 Demolition (top of migration)

```sql
-- Phase 1 demolition: existing session tables go.
DROP TABLE IF EXISTS session_participant CASCADE;
DROP TABLE IF EXISTS session CASCADE;
DROP TYPE IF EXISTS enum_session_type;
DROP TYPE IF EXISTS enum_session_visibility;
DROP TYPE IF EXISTS enum_session_status;
DROP TYPE IF EXISTS enum_participant_status;
```

### 2.2 New enum types

```sql
CREATE TYPE session_type AS ENUM ('GROUP', 'PRIVATE', 'OPEN');
CREATE TYPE session_access AS ENUM ('OPEN', 'CLIENTS_ONLY', 'GROUP_ONLY', 'FREE');
CREATE TYPE session_location_kind AS ENUM ('IN_PERSON', 'ONLINE');
CREATE TYPE session_meeting_provider AS ENUM ('ZOOM', 'GOOGLE_MEET', 'TEAMS');
CREATE TYPE session_template_status AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE session_instance_status AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE session_participant_status AS ENUM ('PENDING_APPROVAL', 'CONFIRMED', 'WAITLISTED', 'CANCELLED', 'DECLINED');
CREATE TYPE session_reminder_kind AS ENUM ('REMINDER_24H', 'REMINDER_1H');
```

### 2.3 `session_template`

```sql
CREATE TABLE session_template (
  id                          CHAR(36) PRIMARY KEY,
  instructor_id               CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  group_id                    CHAR(36) NULL REFERENCES "group"(id) ON DELETE SET NULL,
  venue_id                    CHAR(36) NULL REFERENCES venue(id) ON DELETE SET NULL,

  slug                        VARCHAR(80) NOT NULL,

  title                       VARCHAR(255) NOT NULL,
  description                 TEXT NULL,

  type                        session_type NOT NULL,
  access                      session_access NOT NULL,
  approval_required           BOOLEAN NOT NULL DEFAULT FALSE,

  location_kind               session_location_kind NOT NULL,
  meeting_url                 VARCHAR(500) NULL,
  meeting_provider            session_meeting_provider NULL,

  duration_minutes            INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  timezone                    VARCHAR(64) NOT NULL DEFAULT 'Europe/Bucharest',

  capacity                    INTEGER NULL CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 1000),
  waitlist_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  cancellation_cutoff_hours   INTEGER NOT NULL DEFAULT 24 CHECK (cancellation_cutoff_hours BETWEEN 0 AND 168),

  price_amount_cents          INTEGER NOT NULL DEFAULT 0 CHECK (price_amount_cents >= 0),
  price_currency              VARCHAR(3) NOT NULL DEFAULT 'RON',

  is_recurring                BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule             JSONB NULL,
  first_start_at              TIMESTAMP NOT NULL,

  status                      session_template_status NOT NULL DEFAULT 'ACTIVE',
  ended_at                    TIMESTAMP NULL,

  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at                  TIMESTAMP NULL,

  CONSTRAINT uk_session_template_slug UNIQUE (instructor_id, slug),
  CONSTRAINT chk_online_has_url CHECK (
    (location_kind = 'ONLINE' AND meeting_url IS NOT NULL)
    OR (location_kind = 'IN_PERSON')
  ),
  CONSTRAINT chk_group_only_has_group CHECK (
    (access = 'GROUP_ONLY' AND group_id IS NOT NULL)
    OR (access <> 'GROUP_ONLY')
  )
);

CREATE INDEX idx_st_instructor_status ON session_template(instructor_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_st_group ON session_template(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_st_access_recurring ON session_template(access, is_recurring) WHERE deleted_at IS NULL;
CREATE INDEX idx_st_deleted_at ON session_template(deleted_at);
```

**`recurrence_rule` JSONB shape (validated at DTO layer, not in DB):**
```json
{
  "frequency": "DAILY" | "WEEKLY" | "MONTHLY",
  "interval": 1,
  "daysOfWeek": [1, 3, 5],
  "endDate": "2026-12-31",
  "endAfterOccurrences": 24
}
```
- `interval` ≥ 1, ≤ 99.
- `daysOfWeek` only for `WEEKLY`; values 1..7, Mon=1, Sun=7.
- Exactly one of `endDate` OR `endAfterOccurrences` (or neither for unbounded — generation capped by API param).

### 2.4 `session_instance`

```sql
CREATE TABLE session_instance (
  id                          CHAR(36) PRIMARY KEY,
  template_id                 CHAR(36) NOT NULL REFERENCES session_template(id) ON DELETE CASCADE,
  instructor_id               CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  occurrence_index            INTEGER NOT NULL,
  start_at                    TIMESTAMP NOT NULL,
  end_at                      TIMESTAMP NOT NULL,

  title_override              VARCHAR(255) NULL,
  description_override        TEXT NULL,
  venue_id_override           CHAR(36) NULL REFERENCES venue(id) ON DELETE SET NULL,
  meeting_url_override        VARCHAR(500) NULL,
  capacity_override           INTEGER NULL CHECK (capacity_override IS NULL OR capacity_override BETWEEN 1 AND 1000),
  is_override                 BOOLEAN NOT NULL DEFAULT FALSE,

  status                      session_instance_status NOT NULL DEFAULT 'SCHEDULED',
  cancel_reason               TEXT NULL,
  cancelled_at                TIMESTAMP NULL,

  confirmed_count             INTEGER NOT NULL DEFAULT 0,
  pending_approval_count      INTEGER NOT NULL DEFAULT 0,
  waitlisted_count            INTEGER NOT NULL DEFAULT 0,
  attended_count              INTEGER NULL,

  conflicting_instance_ids    JSONB NULL,

  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at                  TIMESTAMP NULL,

  CONSTRAINT uk_si_template_occurrence UNIQUE (template_id, occurrence_index),
  CONSTRAINT chk_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX idx_si_instructor_start ON session_instance(instructor_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_si_template_start ON session_instance(template_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_si_start_scheduled ON session_instance(start_at) WHERE status = 'SCHEDULED' AND deleted_at IS NULL;
CREATE INDEX idx_si_status_start ON session_instance(status, start_at);
CREATE INDEX idx_si_deleted_at ON session_instance(deleted_at);
```

**Counter columns** (`confirmed_count`, etc.) are maintained by the service in the same tx as participant changes. Do NOT use database triggers — explicit code is testable, triggers are not.

### 2.5 `session_participant`

```sql
CREATE TABLE session_participant (
  id                          CHAR(36) PRIMARY KEY,
  instance_id                 CHAR(36) NOT NULL REFERENCES session_instance(id) ON DELETE CASCADE,
  user_id                     CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  status                      session_participant_status NOT NULL,
  attended                    BOOLEAN NULL,
  checked_in_at               TIMESTAMP NULL,

  booking_note                TEXT NULL,
  private_note                TEXT NULL,

  -- Snapshot at booking time; immutable after creation
  snapshot_price_cents        INTEGER NOT NULL,
  snapshot_currency           VARCHAR(3) NOT NULL,
  snapshot_cancel_cutoff_h    INTEGER NOT NULL,
  snapshot_location_text      VARCHAR(255) NULL,
  snapshot_meeting_url        VARCHAR(500) NULL,

  booked_at                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at                 TIMESTAMP NULL,
  declined_at                 TIMESTAMP NULL,
  cancelled_at                TIMESTAMP NULL,
  cancel_reason               TEXT NULL,

  waitlist_position           INTEGER NULL,

  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uk_sp_instance_user UNIQUE (instance_id, user_id)
);

CREATE INDEX idx_sp_instance_status ON session_participant(instance_id, status);
CREATE INDEX idx_sp_user_status ON session_participant(user_id, status);
CREATE INDEX idx_sp_pending_or_waitlist ON session_participant(status) WHERE status IN ('PENDING_APPROVAL', 'WAITLISTED');
```

**Rule (enforced in service code):** the snapshot columns are written exactly once, at insert. Subsequent updates MUST NOT touch them. Cancelling, declining, marking attended — none of those change the snapshot. Add a service-layer guard.

**Rule:** when a previously-cancelled participant rebooks the same instance, do NOT reuse the row. The UNIQUE constraint means the rebook re-uses the row by `UPDATE` resetting status + snapshot? No — re-snapshot. The snapshot fields must reflect the booking-time terms of the *current* booking. So: re-snapshot at rebook time. Document this in code.

### 2.6 `session_reminder_schedule`

```sql
CREATE TABLE session_reminder_schedule (
  id                CHAR(36) PRIMARY KEY,
  instance_id       CHAR(36) NOT NULL REFERENCES session_instance(id) ON DELETE CASCADE,
  participant_id    CHAR(36) NOT NULL REFERENCES session_participant(id) ON DELETE CASCADE,
  kind              session_reminder_kind NOT NULL,
  fire_at           TIMESTAMP NOT NULL,
  sent_at           TIMESTAMP NULL,
  job_id            VARCHAR(255) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uk_srs_participant_kind UNIQUE (participant_id, kind)
);

CREATE INDEX idx_srs_fire_at_unsent ON session_reminder_schedule(fire_at) WHERE sent_at IS NULL;
```

---

## 3. Module structure (file layout)

```
src/modules/session/
├── session.module.ts
├── session-template.controller.ts          (instructor template ops)
├── session-instance.controller.ts          (instructor instance ops + participants)
├── session-public.controller.ts            (unauthenticated/discover/public detail/ics/join-info)
├── session-client.controller.ts            (authenticated client booking ops)
├── services/
│   ├── session-template.service.ts         (template CRUD)
│   ├── session-instance.service.ts         (instance generation, edit, cancel scopes)
│   ├── session-booking.service.ts          (book / cancel-booking / approve / decline / waitlist promote)
│   ├── session-access.service.ts           (assertCanViewInstance; redaction logic)
│   ├── session-conflict.service.ts         (conflict detection)
│   ├── session-reminder.service.ts         (schedule + cancel reminders)
│   ├── session-ics.service.ts              (build .ics text)
│   └── recurrence.service.ts               (computeOccurrences pure function; injectable)
├── dto/
│   ├── create-template.dto.ts
│   ├── update-template.dto.ts
│   ├── preview-recurrence.dto.ts
│   ├── regenerate-instances.dto.ts
│   ├── list-templates.query.dto.ts
│   ├── update-instance.dto.ts              (per-occurrence overrides)
│   ├── cancel-instance.dto.ts              (scope + reason + message)
│   ├── reschedule-instance.dto.ts
│   ├── list-instances.query.dto.ts
│   ├── book-instance.dto.ts                (bookingNote?)
│   ├── cancel-booking.dto.ts
│   ├── decline-participant.dto.ts          (optional message)
│   ├── update-participant.dto.ts           (attended, privateNote)
│   ├── follow-up.dto.ts                    (audience + message)
│   ├── discover-sessions.query.dto.ts
│   ├── calendar.query.dto.ts
│   ├── recurrence-rule.dto.ts              (nested in create/update template)
│   └── my-sessions.query.dto.ts
├── entities/
│   ├── session-template.entity.ts
│   ├── session-instance.entity.ts
│   ├── session-participant.entity.ts
│   └── session-reminder-schedule.entity.ts
├── notifications.ts                        (notification builders — primitives only)
└── workers/
    └── session-reminder.worker.ts          (BullMQ worker; registered with jobs module)

src/common/docs/session.docs.ts             (Swagger doc objects per endpoint)
migrations/043_sessions_rewrite.sql
```

**RULE:** controllers do request unwrap → service call → response. No business logic. No field-picking beyond `@Body()`/`@Query()`/`@Param()`. ≤10 lines per handler. If a controller grows, push into a service.

**RULE:** services have one purpose each (see filenames). Cross-service calls are fine (e.g., `BookingService` calls `AccessService.assertCanViewInstance()`). Circular deps = wrong split — rethink.

---

## 4. API surface (26 endpoints)

All paths under `/sessions`. JWT required unless marked `@Public()`. Throttle annotations are minimum requirements; tune up if research suggests.

### 4.1 Template endpoints (instructor)

| Method | Path | Guards | DTO | Throttle |
|---|---|---|---|---|
| POST | `/sessions/templates` | JWT + `INSTRUCTOR` | `CreateTemplateDto` | 30/1h |
| GET | `/sessions/templates` | JWT + `INSTRUCTOR` | `ListTemplatesQueryDto` | — |
| GET | `/sessions/templates/:id` | JWT + `INSTRUCTOR` | — | — |
| PATCH | `/sessions/templates/:id` | JWT + `INSTRUCTOR` | `UpdateTemplateDto` | 60/1h |
| DELETE | `/sessions/templates/:id` | JWT + `INSTRUCTOR` | — | 10/1h |
| POST | `/sessions/templates/preview-recurrence` | JWT + `INSTRUCTOR` | `PreviewRecurrenceDto` | 60/1min |
| POST | `/sessions/templates/:id/regenerate` | JWT + `INSTRUCTOR` | `RegenerateInstancesDto` | 10/1h |

### 4.2 Instance endpoints (instructor)

| Method | Path | Guards | DTO | Throttle |
|---|---|---|---|---|
| GET | `/sessions/instances` | JWT | `ListInstancesQueryDto` | — |
| GET | `/sessions/instances/:id` | JWT | — | — |
| PATCH | `/sessions/instances/:id` | JWT + `INSTRUCTOR` | `UpdateInstanceDto` | 60/1h |
| POST | `/sessions/instances/:id/cancel` | JWT + `INSTRUCTOR` | `CancelInstanceDto` | 30/1h |
| POST | `/sessions/instances/:id/reschedule` | JWT + `INSTRUCTOR` | `RescheduleInstanceDto` | 30/1h |
| POST | `/sessions/instances/:id/follow-up` | JWT + `INSTRUCTOR` | `FollowUpDto` | 20/1h |

### 4.3 Participant endpoints (instructor)

| Method | Path | Guards | DTO | Throttle |
|---|---|---|---|---|
| POST | `/sessions/instances/:id/participants/:participantId/approve` | JWT + `INSTRUCTOR` | — | 120/1h |
| POST | `/sessions/instances/:id/participants/:participantId/decline` | JWT + `INSTRUCTOR` | `DeclineParticipantDto` | 120/1h |
| PATCH | `/sessions/instances/:id/participants/:participantId` | JWT + `INSTRUCTOR` | `UpdateParticipantDto` | 120/1h |
| GET | `/sessions/approvals` | JWT + `INSTRUCTOR` | (pagination) | — |

### 4.4 Calendar (instructor or client)

| Method | Path | Guards | DTO | Throttle |
|---|---|---|---|---|
| GET | `/sessions/calendar` | JWT | `CalendarQueryDto` (start, end, view) | — |

### 4.5 Public surface (unauthenticated allowed)

| Method | Path | Guards | DTO | Throttle |
|---|---|---|---|---|
| GET | `/sessions/discover` | `OptionalJwtAuthGuard` | `DiscoverSessionsQueryDto` | 60/1min |
| GET | `/sessions/instances/:id/public` | `OptionalJwtAuthGuard` | — | 60/1min |
| GET | `/sessions/instances/:id/ics` | `OptionalJwtAuthGuard` | — | 30/1min |

### 4.6 Client surface (authenticated)

| Method | Path | Guards | DTO | Throttle |
|---|---|---|---|---|
| GET | `/sessions/my` | JWT | `MySessionsQueryDto` | — |
| POST | `/sessions/instances/:id/book` | JWT | `BookInstanceDto` | 10/1min |
| POST | `/sessions/instances/:id/cancel-booking` | JWT | `CancelBookingDto` | 10/1min |
| POST | `/sessions/instances/:id/checkin` | JWT | — | 10/1min |
| GET | `/sessions/instances/:id/join-info` | JWT | — | 60/1min |

**Total: 26 endpoints.** Route ordering matters — static paths before parameterized ones. `/sessions/templates/preview-recurrence` MUST be registered before `/sessions/templates/:id`. `/sessions/approvals` before `/sessions/instances/:id`. etc.

---

## 5. Request/response shapes

Common rules:

- All responses go through the global `CamelCaseInterceptor`. Service code can use snake_case for DB-aligned variables, but DTOs and response shapes are camelCase.
- All UUID params use `ParseUUIDPipe`.
- All errors use NestJS exceptions (`NotFoundException`, `ForbiddenException`, `ConflictException`, `BadRequestException`).
- Error response shape is standardized by the existing `HttpExceptionFilter` — don't reinvent.
- Pagination: list endpoints return `{ items, total, page, pageSize }`. DTOs extend `PaginationDto`.

### 5.1 `CreateTemplateDto`

```ts
{
  title: string;             // 1..255
  description?: string;
  type: 'GROUP' | 'PRIVATE' | 'OPEN';
  access: 'OPEN' | 'CLIENTS_ONLY' | 'GROUP_ONLY' | 'FREE';
  approvalRequired?: boolean;        // default false
  groupId?: string;                  // required iff access === 'GROUP_ONLY'

  locationKind: 'IN_PERSON' | 'ONLINE';
  venueId?: string;                  // required iff locationKind === 'IN_PERSON'
  meetingUrl?: string;               // required iff locationKind === 'ONLINE'

  durationMinutes: number;           // 5..480
  timezone: string;                  // IANA; validated against Intl.supportedValuesOf('timeZone')

  capacity?: number;                 // 1..1000; null = uncapped
  waitlistEnabled?: boolean;         // default true
  cancellationCutoffHours?: number;  // 0..168; default 24

  priceAmountCents?: number;         // ≥ 0; default 0
  priceCurrency?: string;            // 3-letter; default 'RON'

  isRecurring: boolean;
  recurrenceRule?: RecurrenceRuleDto;  // required iff isRecurring=true
  firstStartAt: string;              // ISO 8601 datetime; the first occurrence

  // Optional in create: instances are generated separately via regenerate.
  // But a one-off creates BOTH template + 1 instance atomically.
  generateInitialInstances?: boolean;     // default true for non-recurring; default false for recurring
  initialInstancesCount?: number;         // for recurring, optional (capped 1..104; default 12)
}
```

**Service behavior on create:**
- One-off (`isRecurring=false`): create template + 1 instance in a tx.
- Recurring: create template only; instances generated via `regenerate` endpoint OR via `initialInstancesCount` param if supplied.
- Auto-derive `meetingProvider` from `meetingUrl` hostname:
  - `*.zoom.us` / `*.zoom.com` → `ZOOM`
  - `meet.google.com` → `GOOGLE_MEET`
  - `teams.microsoft.com` / `teams.live.com` → `TEAMS`
  - else → null
- Generate `slug` from title: lowercase, alphanum + hyphens, dedupe within instructor by appending `-2`, `-3`, etc.
- Validate `timezone` against `Intl.supportedValuesOf('timeZone')` at DTO layer.
- Conflict check: warning-only, attach to response as `warnings: [{ code: 'CONFLICT', instanceIds: string[] }]`.

**Response shape (POST `/sessions/templates`):**
```ts
{
  template: SessionTemplateDto,
  generatedInstances: SessionInstanceDto[],
  warnings: Array<{ code: 'CONFLICT', instanceIds: string[] }>
}
```

### 5.2 `RecurrenceRuleDto` (nested)

```ts
{
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;                   // 1..99
  daysOfWeek?: number[];              // each 1..7 (Mon=1, Sun=7); only for WEEKLY
  endDate?: string;                   // ISO date
  endAfterOccurrences?: number;       // 1..365
}
```

Validation:
- Exactly one of `endDate` OR `endAfterOccurrences` (XOR) — but both may be absent (unbounded; capped by generation API).
- `daysOfWeek` required when `frequency === 'WEEKLY'`, forbidden otherwise.
- `daysOfWeek` values unique, sorted asc.

### 5.3 `PreviewRecurrenceDto`

```ts
{
  rule: RecurrenceRuleDto;
  firstStartAt: string;              // ISO 8601
  timezone: string;                  // IANA
  weeksHorizon?: number;             // 1..52; default 12; cap for unbounded
}
```

**Response:**
```ts
{
  occurrences: string[];             // ISO 8601 datetimes (UTC)
  truncated: boolean;                // true if hit cap before rule's natural end
}
```

### 5.4 `BookInstanceDto`

```ts
{
  bookingNote?: string;              // ≤ 500 chars
}
```

**Response:**
```ts
{
  participant: SessionParticipantDto,
  status: 'CONFIRMED' | 'PENDING_APPROVAL' | 'WAITLISTED',
  cancellationDeadline: string;      // ISO 8601 — when the snapshot cutoff hits
}
```

Errors:
- 403 `ACCESS_DENIED_NOT_CLIENT` (CLIENTS_ONLY, not a client)
- 403 `ACCESS_DENIED_NOT_GROUP_MEMBER` (GROUP_ONLY, not a member)
- 409 `ALREADY_BOOKED`
- 409 `CAPACITY_HIT_NO_WAITLIST` (full and `waitlistEnabled=false`)
- 410 `INSTANCE_CANCELLED`
- 410 `BOOKING_WINDOW_CLOSED` (start_at already passed or too close)
- 400 `OWN_SESSION` (instructor trying to book their own)

### 5.5 `CancelInstanceDto`

```ts
{
  scope: 'this' | 'thisAndFuture' | 'series';
  reason?: string;                   // ≤ 500
  message?: string;                  // ≤ 1000; sent to participants
  rescheduleTo?: string;             // optional ISO 8601; if set, reschedule offer included in notif
}
```

### 5.6 `CancelBookingDto`

```ts
{
  reason?: string;                   // ≤ 500
}
```

**Response:**
```ts
{
  participant: SessionParticipantDto,
  cancellation: 'WITHIN_WINDOW' | 'OUTSIDE_WINDOW',
  promotedFromWaitlist?: SessionParticipantDto   // present iff promotion happened
}
```

### 5.7 `UpdateInstanceDto` (per-occurrence override)

```ts
{
  titleOverride?: string | null;          // null = clear override
  descriptionOverride?: string | null;
  venueIdOverride?: string | null;
  meetingUrlOverride?: string | null;
  capacityOverride?: number | null;
}
```

After save, `is_override` is true iff any override field is non-null. Clearing all overrides sets `is_override = false`.

### 5.8 `DiscoverSessionsQueryDto`

```ts
{
  q?: string;                        // search title/description
  type?: 'GROUP' | 'PRIVATE' | 'OPEN';
  locationKind?: 'IN_PERSON' | 'ONLINE';
  groupId?: string;
  dateFrom?: string;                 // ISO date
  dateTo?: string;                   // ISO date; max 180 days from dateFrom
  page: number;                      // default 1
  limit: number;                     // 1..100, default 20
  sortBy?: 'startAt' | 'title';
  sortDir?: 'ASC' | 'DESC';
}
```

**Behavior:**
- Unauthenticated → only `access IN ('OPEN', 'FREE')` instances, status='SCHEDULED', future-only.
- Authenticated → above + instances where user is eligible (active client of instructor for CLIENTS_ONLY; group member for GROUP_ONLY).

### 5.9 Other DTOs

Follow the same conventions. Document everything in `src/common/docs/session.docs.ts` using `@ApiEndpoint()`.

### 5.10 Response DTO shapes (use these consistently)

```ts
SessionTemplateDto {
  id, instructorId, groupId, venueId, slug,
  title, description, type, access, approvalRequired,
  locationKind, meetingUrl, meetingProvider,
  durationMinutes, timezone,
  capacity, waitlistEnabled, cancellationCutoffHours,
  priceAmountCents, priceCurrency,
  isRecurring, recurrenceRule, firstStartAt,
  status, endedAt, createdAt, updatedAt
}

SessionInstanceDto {
  id, templateId, instructorId,
  occurrenceIndex, startAt, endAt,
  // Effective values (override ?? template):
  title, description, venueId, meetingUrl, capacity,
  // Override flags (so FE can show "edited" badges):
  titleOverride, descriptionOverride, venueIdOverride,
  meetingUrlOverride, capacityOverride, isOverride,
  status, cancelReason, cancelledAt,
  confirmedCount, pendingApprovalCount, waitlistedCount, attendedCount,
  conflictingInstanceIds,
  // Convenience joins:
  template: SessionTemplateDto,    // omitted on list endpoints
  participants?: SessionParticipantDto[],  // only on detail endpoint
  createdAt, updatedAt
}

SessionParticipantDto {
  id, instanceId, userId,
  status, attended, checkedInAt,
  bookingNote, privateNote,                // privateNote only returned to instructor
  snapshotPriceCents, snapshotCurrency, snapshotCancelCutoffH,
  snapshotLocationText, snapshotMeetingUrl,
  bookedAt, approvedAt, declinedAt, cancelledAt, cancelReason,
  waitlistPosition,
  user?: { id, firstName, lastName, avatarUrl }   // included where useful
}
```

**Redacted public view** (for `GROUP_ONLY` to non-member, or unauth → CLIENTS_ONLY):
```ts
{
  id, templateId, startAt, endAt,
  title, type, access,
  instructor: { id, firstName, lastName, avatarUrl, handle },
  redacted: true,
  reason: 'NOT_GROUP_MEMBER' | 'NOT_CLIENT' | 'AUTH_REQUIRED'
}
```

### 5.11 Remaining DTOs (not yet specified above)

**`ListTemplatesQueryDto` extends `PaginationDto`**
```ts
{
  tab?: 'active' | 'recurring' | 'ended' | 'cancelled';   // server filters status accordingly
  type?: 'GROUP' | 'PRIVATE' | 'OPEN';
  access?: 'OPEN' | 'CLIENTS_ONLY' | 'GROUP_ONLY' | 'FREE';
  locationKind?: 'IN_PERSON' | 'ONLINE';
  groupId?: string;
  q?: string;                            // search title/description, iLike
  sortBy?: 'firstStartAt' | 'createdAt' | 'title';
  sortDir?: 'ASC' | 'DESC';              // default 'DESC' on firstStartAt
  // page, limit inherited
}
```

**`ListInstancesQueryDto` extends `PaginationDto`**
```ts
{
  templateId?: string;
  groupId?: string;
  instructorId?: string;                 // only honored if requester is ADMIN or self
  status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  dateFrom?: string;                     // ISO datetime
  dateTo?: string;                       // ISO datetime; cap 180 days from dateFrom
  view?: 'week' | 'day' | 'month';       // hint for FE caching
  sortDir?: 'ASC' | 'DESC';              // default 'ASC'
}
```

**`RescheduleInstanceDto`**
```ts
{
  newStartAt: string;                    // ISO datetime
  reason?: string;                       // ≤ 500
  notifyParticipants?: boolean;          // default true
}
```
Service behavior: updates `start_at` + recomputes `end_at` (= `start_at + duration_minutes`). Refreshes conflict detection. Re-schedules existing reminders (deletes old `session_reminder_schedule` rows, creates new ones based on new `start_at` for participants in `CONFIRMED` status). If `notifyParticipants !== false`, queues an `instanceRescheduled` outbox notification per active participant.

**`MySessionsQueryDto` extends `PaginationDto`**
```ts
{
  tab: 'upcoming' | 'pending' | 'past' | 'cancelled';
  // Mapping:
  // upcoming  → participant.status IN ('CONFIRMED','WAITLISTED') AND instance.startAt > now
  // pending   → participant.status = 'PENDING_APPROVAL'
  // past      → participant.status IN ('CONFIRMED','WAITLISTED') AND instance.startAt <= now
  //             (or status IN ('CONFIRMED') AND instance.status='COMPLETED' — either works; pick one)
  // cancelled → participant.status IN ('CANCELLED','DECLINED')
}
```

**`FollowUpDto`**
```ts
{
  audience: 'all' | 'attended' | 'noshow' | 'userIds';
  userIds?: string[];                    // required iff audience === 'userIds'
  message: string;                       // 1..2000
  // attachWorkoutPdf?: string;          // OUT OF SCOPE v1; do not implement
}
```
Audience mapping:
- `all` → every participant with `status = 'CONFIRMED' OR attended = true`
- `attended` → participants where `attended = true`
- `noshow` → participants where `attended = false` (explicit false, not null)
- `userIds` → exact list (validate every user is a participant of the instance)

Sends in-app notification to all; email only to `attended` and `userIds` audiences (broader audiences = in-app only to avoid spam).

**`DeclineParticipantDto`**
```ts
{
  message?: string;                      // ≤ 1000; surfaced in client notification
}
```

**`UpdateParticipantDto`** (instructor edits participant post-session)
```ts
{
  attended?: boolean | null;             // null = clear
  privateNote?: string | null;
}
```
Does NOT change `status`. The instructor cannot move someone from `CONFIRMED` to `CANCELLED` via this endpoint — they must use a dedicated cancel endpoint (or the participant cancels themselves). Keep this endpoint narrow.

**`PreviewRecurrenceDto`** (already specified §5.3 — confirming complete)

**`RegenerateInstancesDto`**
```ts
{
  count: number;                         // 1..104 (cap 2 years of weekly)
}
```
Service generates the next N occurrences AFTER the latest existing instance for this template. Idempotent: if N more occurrences would exceed the rule's `endAfterOccurrences` or `endDate`, generate only up to that cap and return what was created.

### 5.12 List + collection response shapes

**`GET /sessions/templates` response** → `{ items: SessionTemplateDto[], total, page, pageSize }`.

**`GET /sessions/instances` response** → `{ items: SessionInstanceDto[], total, page, pageSize }`. Template included as nested object on each item (controlled join, single query — use Sequelize `include`).

**`GET /sessions/calendar` response**:
```ts
{
  range: { start: ISO, end: ISO },
  view: 'week' | 'day' | 'month',
  groupedByDate: Record<string /* YYYY-MM-DD */, SessionInstanceDto[]>,
  total: number
}
```
Date keys use the **caller's timezone** if `?tz=Europe/Bucharest` query param is provided, otherwise UTC. Default to caller's `user.timezone` from JWT claim if present.

**`GET /sessions/approvals` response** → `{ items: ApprovalRowDto[], total, page, pageSize }` where `ApprovalRowDto`:
```ts
{
  participant: SessionParticipantDto,
  instance: SessionInstanceDto,   // minimal — id, startAt, title, capacity, confirmedCount
  bookedAt: ISO,
  waitingHours: number,           // (now - bookedAt) in hours, for sort/urgency badges
}
```
Default sort: `bookedAt ASC` (oldest first). Filterable by `templateId` query param. Pagination via `PaginationDto`.

**`GET /sessions/my` response** → `{ items: MyBookingDto[], total, page, pageSize }` where `MyBookingDto`:
```ts
{
  participant: SessionParticipantDto,
  instance: SessionInstanceDto,
  template: { id, title, type, access, cancellationCutoffHours }
}
```

**`GET /sessions/instances/:id/join-info` response**:
```ts
{
  meetingUrl: string,
  meetingProvider: 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS' | null,
  joinActiveFrom: ISO,                // = startAt - 5min
  joinActiveUntil: ISO,               // = startAt + 15min
  isActive: boolean,                  // computed server-side at request time
  startsInSeconds: number             // helpful for FE countdown UI
}
```

**`POST /sessions/instances/:id/follow-up` response** → `{ deliveredCount: number, channelCounts: { inApp: number, email: number } }`.

**`POST /sessions/templates/:id/regenerate` response** → `{ generatedInstances: SessionInstanceDto[], warnings: Array<{ code: 'CONFLICT', instanceIds: string[] }> }`.

**`GET /sessions/instances/:id/ics` response** → raw `text/calendar` body (not JSON). `Content-Disposition: attachment; filename="session-<id>.ics"`.

---

## 6. Algorithms (the load-bearing logic)

### 6.1 Recurrence expansion (`RecurrenceService.computeOccurrences`)

Input: `firstStartAt` (ISO UTC), `rule: RecurrenceRule`, `timezone: string`, `cap: number`.

Output: `Date[]` (UTC instants), length ≤ cap.

Algorithm (pseudocode):

```
const luxonDt = DateTime.fromISO(firstStartAt, { zone: 'utc' }).setZone(timezone);
const results: DateTime[] = [];
let cursor = luxonDt;
let generated = 0;

const limit = rule.endAfterOccurrences ?? Infinity;
const stopDate = rule.endDate ? DateTime.fromISO(rule.endDate, { zone: timezone }).endOf('day') : null;

if (rule.frequency === 'WEEKLY') {
  // Walk forward week by week (interval), emit for each day-of-week in rule.daysOfWeek.
  // Be careful: daysOfWeek is 1=Mon..7=Sun (ISO); Luxon also uses 1..7. Map directly.
  // Within a week, emit days in ascending order. Emit only if >= firstStartAt.
  while (generated < limit && generated < cap) {
    const weekStart = cursor.startOf('week');  // Luxon week starts Monday (ISO)
    for (const dow of rule.daysOfWeek.sorted()) {
      const candidate = weekStart.plus({ days: dow - 1 }).set({
        hour: luxonDt.hour, minute: luxonDt.minute, second: 0, millisecond: 0
      });
      if (candidate < luxonDt) continue;
      if (stopDate && candidate > stopDate) return results.toUtc();
      results.push(candidate);
      generated++;
      if (generated >= limit || generated >= cap) return results.toUtc();
    }
    cursor = cursor.plus({ weeks: rule.interval });
  }
}

if (rule.frequency === 'DAILY') {
  // Walk forward N days at a time. Each step emits one occurrence.
  while (generated < limit && generated < cap) {
    if (stopDate && cursor > stopDate) break;
    results.push(cursor);
    generated++;
    cursor = cursor.plus({ days: rule.interval });
  }
}

if (rule.frequency === 'MONTHLY') {
  // Walk forward N months. Same day-of-month as firstStartAt.
  // If day-of-month doesn't exist in target month (e.g., 31 in Feb), clamp to last day.
  while (generated < limit && generated < cap) {
    if (stopDate && cursor > stopDate) break;
    results.push(cursor);
    generated++;
    cursor = cursor.plus({ months: rule.interval });
  }
}

return results.map(dt => dt.toUTC().toJSDate());
```

**RULE:** use Luxon (`luxon` npm). Install it if not already present (check `package.json`). DO NOT use raw `Date` arithmetic for week/month math — DST will silently break it.

**Test cases (mandatory):**
1. Weekly Mon/Wed for 24 occurrences → 24 dates, alternating Mon/Wed.
2. Weekly with DST transition (e.g. `Europe/Bucharest` last Sunday March, last Sunday October) → wall-clock time preserved.
3. Monthly on the 31st starting Jan 31 → emits Jan 31, Feb 28/29, Mar 31, Apr 30, May 31… (clamp logic).
4. Daily interval=2, endDate=10 days out → 5 occurrences.
5. Empty result if `endDate < firstStartAt`.

### 6.2 Conflict detection (`SessionConflictService.findConflicts`)

For an instructor and a proposed time window `[start, end]`, find existing `session_instance` rows where:

- `instructor_id = X`
- `status = 'SCHEDULED'`
- `deleted_at IS NULL`
- time overlap: `start_at < proposedEnd AND end_at > proposedStart`
- exclude `excludeInstanceIds` (for the case where you're rescheduling and want to ignore self)

Returns array of conflicting instance IDs. Warning-only — never blocks the write.

When called from instance creation/edit, also store the result in `session_instance.conflicting_instance_ids` on both sides (this instance + each existing one). Refresh on edit.

### 6.3 Booking (`SessionBookingService.book`)

This is the most concurrency-sensitive operation. Get it right.

```
async book(instanceId, userId, dto, tx):
  // Acquire instance with FOR UPDATE
  const instance = await SessionInstance.findOne({
    where: { id: instanceId, deletedAt: null },
    transaction: tx,
    lock: tx.LOCK.UPDATE
  });
  if (!instance) throw NotFoundException;
  if (instance.status !== 'SCHEDULED') throw GoneException('INSTANCE_CANCELLED');

  const template = await SessionTemplate.findOne({
    where: { id: instance.templateId },
    transaction: tx
  });

  // Booking window
  if (instance.startAt <= new Date()) throw GoneException('BOOKING_WINDOW_CLOSED');

  // Self-book guard
  if (template.instructorId === userId) throw BadRequestException('OWN_SESSION');

  // Access check (no lock needed)
  await accessService.assertCanBook(template, instance, userId, tx);

  // Existing booking check
  const existing = await SessionParticipant.findOne({
    where: { instanceId, userId },
    transaction: tx
  });
  if (existing && existing.status !== 'CANCELLED' && existing.status !== 'DECLINED') {
    throw ConflictException('ALREADY_BOOKED');
  }

  const effectiveCapacity = instance.capacityOverride ?? template.capacity;
  const occupiedCount = instance.confirmedCount + instance.pendingApprovalCount;

  let newStatus: SessionParticipantStatus;
  let waitlistPosition: number | null = null;

  if (effectiveCapacity !== null && occupiedCount >= effectiveCapacity) {
    if (!template.waitlistEnabled) throw ConflictException('CAPACITY_HIT_NO_WAITLIST');
    newStatus = 'WAITLISTED';
    waitlistPosition = instance.waitlistedCount + 1;
  } else if (template.approvalRequired) {
    newStatus = 'PENDING_APPROVAL';
  } else {
    newStatus = 'CONFIRMED';
  }

  // Build snapshot
  const snapshot = {
    snapshotPriceCents: template.priceAmountCents,
    snapshotCurrency: template.priceCurrency,
    snapshotCancelCutoffH: template.cancellationCutoffHours,
    snapshotLocationText: effectiveLocationText(template, instance),  // venue address or 'Online'
    snapshotMeetingUrl: instance.meetingUrlOverride ?? template.meetingUrl,
  };

  // Insert OR update existing (cancelled) row
  let participant;
  if (existing) {
    // Reactivate: reset status + RE-SNAPSHOT (snapshot reflects current booking terms)
    participant = await existing.update({
      status: newStatus,
      ...snapshot,
      bookingNote: dto.bookingNote ?? null,
      approvedAt: null, declinedAt: null, cancelledAt: null, cancelReason: null,
      waitlistPosition,
      bookedAt: new Date(),
    }, { transaction: tx });
  } else {
    participant = await SessionParticipant.create({
      instanceId, userId,
      status: newStatus,
      ...snapshot,
      bookingNote: dto.bookingNote ?? null,
      waitlistPosition,
      bookedAt: new Date(),
    }, { transaction: tx });
  }

  // Update instance counters
  await updateInstanceCounters(instance, tx);

  // Schedule reminders only if CONFIRMED (not PENDING/WAITLISTED)
  if (newStatus === 'CONFIRMED') {
    await reminderService.schedule(instance, participant, tx);
  }

  // Outbox notification (post-commit delivery)
  outbox.add(notificationBuilders.bookingCreated(participant, template, instance));

  return { participant, newStatus };
```

**RULE:** `FOR UPDATE` is mandatory. Without it, two simultaneous bookings to the last seat both pass the capacity check.

**RULE:** counter updates (`confirmedCount`, etc.) happen inside the same tx, atomically. Use `Sequelize.literal('confirmed_count + 1')` etc. to avoid stale reads.

### 6.4 Cancel booking + waitlist auto-promote

```
async cancelBooking(instanceId, userId, dto, tx):
  const participant = await SessionParticipant.findOne({
    where: { instanceId, userId },
    transaction: tx
  });
  if (!participant) throw NotFoundException;
  if (['CANCELLED','DECLINED'].includes(participant.status)) throw ConflictException;

  const instance = await SessionInstance.findOne({
    where: { id: instanceId },
    transaction: tx,
    lock: tx.LOCK.UPDATE
  });
  const template = await SessionTemplate.findOne({
    where: { id: instance.templateId },
    transaction: tx
  });

  // Cancellation window check (against snapshot, not current template)
  const cutoffMs = participant.snapshotCancelCutoffH * 3600 * 1000;
  const withinWindow = (instance.startAt.getTime() - Date.now()) > cutoffMs;

  const wasConfirmed = participant.status === 'CONFIRMED';

  await participant.update({
    status: 'CANCELLED',
    cancelledAt: new Date(),
    cancelReason: dto.reason ?? null,
  }, { transaction: tx });

  // Cancel pending reminders
  await reminderService.cancelForParticipant(participant.id, tx);

  // Auto-promote from waitlist if seat opened and we're > 2h before start
  let promoted: SessionParticipant | null = null;
  const twoHoursMs = 2 * 3600 * 1000;
  const moreThanTwoHoursOut = (instance.startAt.getTime() - Date.now()) > twoHoursMs;

  if (wasConfirmed && moreThanTwoHoursOut) {
    promoted = await SessionParticipant.findOne({
      where: { instanceId, status: 'WAITLISTED' },
      order: [['createdAt', 'ASC']],
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (promoted) {
      const promotedStatus = template.approvalRequired ? 'PENDING_APPROVAL' : 'CONFIRMED';
      await promoted.update({
        status: promotedStatus,
        waitlistPosition: null,
        approvedAt: promotedStatus === 'CONFIRMED' ? new Date() : null,
      }, { transaction: tx });
      if (promotedStatus === 'CONFIRMED') {
        await reminderService.schedule(instance, promoted, tx);
      }
      outbox.add(notificationBuilders.waitlistPromoted(promoted, template, instance, promotedStatus));
    }
  }

  await updateInstanceCounters(instance, tx);

  outbox.add(notificationBuilders.bookingCancelled(participant, template, instance, withinWindow));

  return {
    participant,
    cancellation: withinWindow ? 'WITHIN_WINDOW' : 'OUTSIDE_WINDOW',
    promoted,
  };
```

**RULE:** the waitlist promotion happens **synchronously in the same tx** as the cancellation. Not via a separate cron job. This prevents race conditions and ensures consistency.

### 6.5 Cancel instance (scope-aware)

```
async cancelInstance(instanceId, instructorId, dto, tx):
  const instance = await loadOwnedInstance(instanceId, instructorId, tx);

  if (dto.scope === 'this') {
    await cancelOneInstance(instance, dto, tx);
  } else if (dto.scope === 'thisAndFuture') {
    const siblings = await SessionInstance.findAll({
      where: {
        templateId: instance.templateId,
        startAt: { [Op.gte]: instance.startAt },
        status: 'SCHEDULED',
      },
      transaction: tx,
    });
    for (const sib of siblings) await cancelOneInstance(sib, dto, tx);
    // Template stays ACTIVE so it can be regenerated.
  } else if (dto.scope === 'series') {
    const allFuture = await SessionInstance.findAll({
      where: {
        templateId: instance.templateId,
        status: 'SCHEDULED',
      },
      transaction: tx,
    });
    for (const sib of allFuture) await cancelOneInstance(sib, dto, tx);
    await SessionTemplate.update(
      { status: 'CANCELLED', endedAt: new Date() },
      { where: { id: instance.templateId }, transaction: tx }
    );
  }
```

`cancelOneInstance` flips status, cancels reminders for all participants, queues outbox notifications, decrements/zeros counters.

### 6.6 Reminder scheduling

When a participant becomes `CONFIRMED`:

```
async schedule(instance, participant, tx):
  const reminders = [
    { kind: 'REMINDER_24H', fireAt: new Date(instance.startAt - 24h) },
    { kind: 'REMINDER_1H',  fireAt: new Date(instance.startAt - 1h) },
  ];
  for (const r of reminders) {
    if (r.fireAt > now) {
      await SessionReminderSchedule.create({
        instanceId: instance.id,
        participantId: participant.id,
        ...r,
      }, { transaction: tx });
    }
  }
```

A cron-like job runs every minute (BullMQ repeating job) and:
- Pulls rows where `fire_at <= now AND sent_at IS NULL`.
- For each: dispatch notification (24h → email + in-app; 1h → in-app + push).
- Mark `sent_at = now`, store `job_id`.

**Idempotency:** the worker checks `sent_at IS NULL` and does an atomic `UPDATE ... WHERE sent_at IS NULL` to claim the row before sending.

**Cancellation:** when a participant cancels or instance is cancelled, delete the rows from `session_reminder_schedule` (or set `sent_at = now` if we want an audit trail — your choice; deleting is simpler).

### 6.7 Public access enforcement (redaction)

`SessionAccessService.assertCanViewInstance(instance, template, viewer | null)`:

```
// Resolves to one of: 'FULL', 'REDACTED', 'DENIED'.
// 'DENIED' = throws 404 (NOT 403 — see CLAUDE.md, don't leak existence beyond what redaction allows)

if (viewer && viewer.id === template.instructorId) return 'FULL';

if (template.access === 'OPEN' || template.access === 'FREE') return 'FULL';

if (template.access === 'CLIENTS_ONLY') {
  if (!viewer) return 'REDACTED';  // unauth gets redacted view
  if (await isActiveClient(viewer.id, template.instructorId)) return 'FULL';
  return 'REDACTED';
}

if (template.access === 'GROUP_ONLY') {
  if (!viewer) return 'REDACTED';
  if (await isGroupMember(viewer.id, template.groupId)) return 'FULL';
  return 'REDACTED';
}

// Anything else: denied
return 'DENIED';
```

The `/public` endpoint returns redacted shape when access is REDACTED. The instructor-only endpoints throw 404 on DENIED.

### 6.8 `.ics` generation

Output single VEVENT per instance. Plain string concatenation; no library needed. Required fields: `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//MotionHive//Sessions//EN`, `BEGIN:VEVENT`, `UID:<instance_id>@motionhive.app`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `LOCATION` or `URL` (for online), `END:VEVENT`, `END:VCALENDAR`. Use UTC times with `Z` suffix.

Set `Content-Type: text/calendar; charset=utf-8` and `Content-Disposition: attachment; filename="session-<id>.ics"`.

### 6.9 Day-of `join-info`

```
GET /sessions/instances/:id/join-info → {
  meetingUrl: string,
  joinActiveFrom: ISO datetime,    // = startAt - 5min
  joinActiveUntil: ISO datetime,   // = startAt + 15min
  isActive: boolean,                // computed server-side
}
```

Only the booked participant (or instructor) can fetch. Returns 404 for everyone else. Returns 404 if the instance isn't `locationKind === 'ONLINE'`.

### 6.10 Service method signatures (binding)

These are the public methods on each service. Use these signatures exactly. Private/helper methods are at the builder's discretion.

```ts
// SessionTemplateService
class SessionTemplateService {
  create(instructorId: string, dto: CreateTemplateDto):
    Promise<{ template: SessionTemplateDto, generatedInstances: SessionInstanceDto[], warnings: ConflictWarning[] }>;
  list(instructorId: string, query: ListTemplatesQueryDto):
    Promise<Paginated<SessionTemplateDto>>;
  getById(instructorId: string, templateId: string):
    Promise<SessionTemplateDto>;            // throws 404 if not found or not owner
  update(instructorId: string, templateId: string, dto: UpdateTemplateDto):
    Promise<SessionTemplateDto>;
  delete(instructorId: string, templateId: string):
    Promise<void>;                           // sets status=ENDED on template + status=CANCELLED on future SCHEDULED instances
  previewRecurrence(dto: PreviewRecurrenceDto):
    Promise<{ occurrences: string[], truncated: boolean }>;
  regenerate(instructorId: string, templateId: string, dto: RegenerateInstancesDto):
    Promise<{ generatedInstances: SessionInstanceDto[], warnings: ConflictWarning[] }>;
}

// SessionInstanceService
class SessionInstanceService {
  list(viewerUserId: string | null, query: ListInstancesQueryDto):
    Promise<Paginated<SessionInstanceDto>>;  // viewer-aware (instructor sees own; client sees ones they have access to)
  getById(viewerUserId: string | null, instanceId: string):
    Promise<SessionInstanceDto>;             // applies assertCanViewInstance
  update(instructorId: string, instanceId: string, dto: UpdateInstanceDto):
    Promise<SessionInstanceDto>;             // per-occurrence override
  cancel(instructorId: string, instanceId: string, dto: CancelInstanceDto):
    Promise<{ cancelledInstanceIds: string[] }>;
  reschedule(instructorId: string, instanceId: string, dto: RescheduleInstanceDto):
    Promise<SessionInstanceDto>;
  followUp(instructorId: string, instanceId: string, dto: FollowUpDto):
    Promise<{ deliveredCount: number, channelCounts: { inApp: number, email: number } }>;
  getCalendar(viewerUserId: string, query: CalendarQueryDto):
    Promise<CalendarResponse>;
}

// SessionBookingService
class SessionBookingService {
  book(userId: string, instanceId: string, dto: BookInstanceDto):
    Promise<{ participant: SessionParticipantDto, status: 'CONFIRMED'|'PENDING_APPROVAL'|'WAITLISTED', cancellationDeadline: string }>;
  cancelBooking(userId: string, instanceId: string, dto: CancelBookingDto):
    Promise<{ participant: SessionParticipantDto, cancellation: 'WITHIN_WINDOW'|'OUTSIDE_WINDOW', promoted: SessionParticipantDto | null }>;
  approveParticipant(instructorId: string, instanceId: string, participantId: string):
    Promise<SessionParticipantDto>;
  declineParticipant(instructorId: string, instanceId: string, participantId: string, dto: DeclineParticipantDto):
    Promise<SessionParticipantDto>;
  updateParticipant(instructorId: string, instanceId: string, participantId: string, dto: UpdateParticipantDto):
    Promise<SessionParticipantDto>;
  selfCheckIn(userId: string, instanceId: string):
    Promise<SessionParticipantDto>;          // throws 400 outside -15min/+30min window
  listMy(userId: string, query: MySessionsQueryDto):
    Promise<Paginated<MyBookingDto>>;
  listApprovalsInbox(instructorId: string, query: PaginationDto):
    Promise<Paginated<ApprovalRowDto>>;
}

// SessionAccessService
class SessionAccessService {
  assertCanViewInstance(instance: SessionInstance, template: SessionTemplate, viewerUserId: string | null):
    Promise<'FULL' | 'REDACTED' | 'DENIED'>;
  assertCanBook(template: SessionTemplate, instance: SessionInstance, userId: string, tx?: Transaction):
    Promise<void>;                            // throws ForbiddenException with stable error code
  redact(instance: SessionInstance, template: SessionTemplate, reason: 'NOT_GROUP_MEMBER'|'NOT_CLIENT'|'AUTH_REQUIRED'):
    RedactedInstanceDto;
}

// SessionConflictService
class SessionConflictService {
  findConflicts(instructorId: string, startAt: Date, endAt: Date, excludeInstanceIds?: string[], tx?: Transaction):
    Promise<string[]>;                        // returns conflicting instance ids
  refreshConflictsForInstance(instanceId: string, tx?: Transaction):
    Promise<void>;                            // recomputes and persists conflicting_instance_ids on this instance + each affected sibling
}

// SessionReminderService
class SessionReminderService {
  schedule(instance: SessionInstance, participant: SessionParticipant, tx: Transaction):
    Promise<void>;                            // inserts 24h + 1h rows if fireAt > now
  cancelForParticipant(participantId: string, tx?: Transaction):
    Promise<void>;                            // deletes pending rows
  cancelForInstance(instanceId: string, tx?: Transaction):
    Promise<void>;                            // deletes all pending rows for the instance
  reschedule(instanceId: string, newStartAt: Date, tx: Transaction):
    Promise<void>;                            // for reschedule flow: deletes existing + recreates from new startAt
  // Worker entrypoint:
  dispatchDueReminders():
    Promise<{ dispatched: number, errors: number }>;  // called by BullMQ repeating job
}

// SessionIcsService
class SessionIcsService {
  build(instance: SessionInstance, template: SessionTemplate): string;   // returns full .ics text
}

// RecurrenceService (pure, no DB access)
class RecurrenceService {
  computeOccurrences(firstStartAt: Date, rule: RecurrenceRule, timezone: string, cap: number):
    { dates: Date[], truncated: boolean };
}
```

**Shared types:**
```ts
type ConflictWarning = { code: 'CONFLICT', instanceIds: string[] };
type Paginated<T> = { items: T[], total: number, page: number, pageSize: number };
```

**Constructor pattern (per CLAUDE.md):** all services use `private readonly` for every injected dep, with `WinstonLogger` last:

```ts
@Injectable()
export class SessionBookingService {
  constructor(
    private readonly accessService: SessionAccessService,
    private readonly reminderService: SessionReminderService,
    private readonly outbox: NotificationOutbox,
    @InjectModel(SessionInstance) private readonly instanceModel: typeof SessionInstance,
    @InjectModel(SessionParticipant) private readonly participantModel: typeof SessionParticipant,
    @InjectModel(SessionTemplate) private readonly templateModel: typeof SessionTemplate,
    @Inject(Sequelize) private readonly sequelize: Sequelize,
    private readonly logger: WinstonLogger,
  ) {}
}
```

### 6.11 Helpers (specified)

**`effectiveValue<T>(override: T | null, base: T): T`** — `override ?? base`. Trivial but used everywhere; put in `src/common/utils/effective-value.util.ts`.

**`effectiveLocationText(template: SessionTemplate, instance: SessionInstance, venue?: Venue): string`** — returns:
- if `locationKind === 'ONLINE'`: returns `'Online'`
- if `locationKind === 'IN_PERSON'`: returns the venue's display string (`venue.name + ', ' + venue.city`), or `'Location TBD'` if no venue resolved.
- Note: the **effective venue** is `instance.venueIdOverride ?? template.venueId`. Pass the resolved venue in. If null, the venue was deleted (ON DELETE SET NULL) — return `'Location TBD'`.

**`updateInstanceCounters(instanceId: string, tx: Transaction): Promise<void>`** — atomic recompute. Single UPDATE:
```sql
UPDATE session_instance SET
  confirmed_count         = (SELECT COUNT(*) FROM session_participant WHERE instance_id = $1 AND status = 'CONFIRMED'),
  pending_approval_count  = (SELECT COUNT(*) FROM session_participant WHERE instance_id = $1 AND status = 'PENDING_APPROVAL'),
  waitlisted_count        = (SELECT COUNT(*) FROM session_participant WHERE instance_id = $1 AND status = 'WAITLISTED'),
  updated_at = NOW()
WHERE id = $1
```
Called inside booking, cancel, approve, decline, and waitlist-promote operations — after the participant row is written, before the tx commits. Subqueries within UPDATE are atomic in Postgres at REPEATABLE READ.

**`detectMeetingProvider(url: string): 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS' | null`** — pure function, no I/O:
```ts
const u = new URL(url);
const host = u.hostname.toLowerCase();
if (host.endsWith('.zoom.us') || host.endsWith('.zoom.com') || host === 'zoom.us') return 'ZOOM';
if (host === 'meet.google.com') return 'GOOGLE_MEET';
if (host === 'teams.microsoft.com' || host === 'teams.live.com') return 'TEAMS';
return null;
```
Put in `src/common/utils/meeting-provider.util.ts`. **Unknown URLs are accepted** (provider just stays null); the design proposal explicitly allows "anything else renders as 'Online'."

**`assertOwnedTemplate(instructorId: string, templateId: string, tx?: Transaction): Promise<SessionTemplate>`** — load template + assert `template.instructorId === instructorId`; throw 404 if not found OR cross-instructor (don't leak existence). Used by every instructor-action service method.

**`assertOwnedInstance(instructorId: string, instanceId: string, tx?: Transaction): Promise<SessionInstance>`** — same shape for instances.

### 6.12 Slug generation

`generateUniqueSlug(instructorId: string, title: string, tx?: Transaction): Promise<string>`:

```
1. base = slugify(title):
   - NFKD normalize (strips diacritics: "Yoga á la plage" → "Yoga a la plage")
   - lowercase
   - replace non-[a-z0-9] with '-'
   - collapse consecutive '-' into one
   - trim leading/trailing '-'
   - truncate to 60 chars
   - if empty after all that: 'session'
2. candidate = base
3. for n in 2..99:
     existing = await SessionTemplate.findOne({
       where: { instructorId, slug: candidate, deletedAt: null },
       transaction: tx,
     });
     if (!existing) return candidate;
     candidate = `${base}-${n}`;
4. fallback: append 6-char random suffix; retry once; if still collides, throw 500 (shouldn't happen).
```

Slug is set at template creation and immutable thereafter. (If we ever want to rename, that's a v2 endpoint.)

### 6.13 Counter reconciliation (one-time admin tool)

Counters can drift in theory (bug, partial failure). Build `SessionInstanceService.reconcileCounters(instanceId: string): Promise<void>` as a service method (no endpoint in v1 — can be called from a Nest CLI script if ever needed). Same SQL as `updateInstanceCounters` but ad-hoc. Document its existence in `SESSIONS.md` so future maintenance knows it exists.

**Do not** schedule this as a periodic job in v1. YAGNI.

---

## 7. Notifications (binding mapping)

Builders in `src/modules/session/notifications.ts`. Each takes primitives. Each `data.screen` maps to a real FE route — coordinate with the frontend developer; for now use placeholders.

| Event | Recipients | Channels | Builder name |
|---|---|---|---|
| Booking created (CONFIRMED) | client | email + in-app | `bookingConfirmed` |
| Booking created (PENDING_APPROVAL) | client + instructor | in-app (instructor: also email) | `bookingPending`, `bookingPendingForInstructor` |
| Booking created (WAITLISTED) | client | in-app | `bookingWaitlisted` |
| Booking approved | client | email + in-app | `bookingApproved` |
| Booking declined | client | email + in-app (with optional instructor message) | `bookingDeclined` |
| Booking cancelled by client | instructor | in-app | `bookingCancelledByClient` |
| Instance cancelled by instructor | all active participants | email + in-app (with optional message) | `instanceCancelled` |
| Instance rescheduled | all active participants | email + in-app | `instanceRescheduled` |
| Reminder 24h | client | email + in-app | `reminder24h` |
| Reminder 1h | client | in-app + push | `reminder1h` |
| Waitlist promoted | client | email + in-app | `waitlistPromoted` |
| Follow-up message | selected participants | in-app + email (audience-dependent) | `followUpMessage` |

All builders take primitives (id, name, datetime, currency, etc.) — never Sequelize entities.

All `notify(...)` calls happen **after the surrounding tx commits**. Use `NotificationOutbox` inside service methods that own a tx:

```
// Inside the service method, after the tx commits:
await tx.commit();
await outbox.flush();   // sends all queued notifications

// On rollback:
await tx.rollback();
outbox.discard();
```

Alternatively, accumulate primitives and call `notify()` after the wrapping `.then()`. Outbox is cleaner.

### 7.1 Email templates to author (Phase 5)

Email templates live under `src/common/email/session/` and follow the existing pattern (see `src/common/email/auth/` and `src/common/email/group/` for reference). Each template:

- Is a `.template.ts` file exporting a function: `export function buildXEmail(input: XInput): { subject: string; html: string; text: string; }`.
- Imports `baseLayout`, `heading`, `paragraph`, `primaryButton`, etc. from `_layouts/base-layout`.
- **MUST escape every user-controlled string with `escapeHtml` from `src/common/utils/html.utils.ts`.**
- Re-exported from `src/common/email/index.ts`.

**Templates to create (8 files):**

| File | Builder fn | Subject (locale: en) | Body summary |
|---|---|---|---|
| `session/booking-confirmed.template.ts` | `buildBookingConfirmedEmail` | "You're booked: {sessionTitle}" | Confirmation + date/time/location/meeting URL + cancellation deadline + .ics link |
| `session/booking-pending.template.ts` | `buildBookingPendingEmail` | "Booking request sent: {sessionTitle}" | "Awaiting instructor approval. You'll get an email when they respond." |
| `session/booking-approved.template.ts` | `buildBookingApprovedEmail` | "You're in! {sessionTitle}" | Approved + date/time/location/meeting URL + cancellation deadline + .ics link |
| `session/booking-declined.template.ts` | `buildBookingDeclinedEmail` | "Booking declined: {sessionTitle}" | Decline + optional instructor message (escape!) + suggestion to find similar sessions |
| `session/instance-cancelled.template.ts` | `buildInstanceCancelledEmail` | "Session cancelled: {sessionTitle} on {date}" | Cancellation + optional instructor message + reschedule offer (if `rescheduleTo` was set) |
| `session/instance-rescheduled.template.ts` | `buildInstanceRescheduledEmail` | "Time change: {sessionTitle}" | Old time → new time + optional reason + updated .ics link |
| `session/reminder-24h.template.ts` | `buildReminder24hEmail` | "Tomorrow: {sessionTitle} at {time}" | Reminder + date/time/location/meeting URL + how to cancel + cancellation deadline |
| `session/waitlist-promoted.template.ts` | `buildWaitlistPromotedEmail` | "A spot opened up: {sessionTitle}" | Promotion + date/time/location/meeting URL + cancellation deadline |

Note: `reminder1h`, `booking-cancelled-by-client` (to instructor), and `booking-pending-for-instructor` are **in-app only** (no email). Don't create email templates for them.

The `followUpMessage` template is special: the message body is provided by the instructor, so the template wraps `escapeHtml(message)` in a styled card with the instructor's name and session context. File: `session/follow-up.template.ts`, builder `buildFollowUpEmail`.

**Input types for builders:** every builder takes a single typed input object with primitives only. Example:

```ts
export interface BookingConfirmedInput {
  recipientName: string;
  sessionTitle: string;
  instructorName: string;
  startAtIso: string;       // pre-formatted for the recipient's locale outside the builder
  formattedStartAt: string; // e.g., "Wed, 18 May 2026 at 7:00 PM"
  durationMinutes: number;
  locationLine: string;     // "Studio A, Bucharest" or "Online (Zoom)"
  meetingUrl?: string;
  cancellationDeadlineIso: string;
  cancelUrl: string;        // FE deep link
  icsUrl: string;           // backend .ics endpoint URL
}
```

Pre-formatting dates outside the builder = template doesn't import Luxon, stays simple.

### 7.2 `EmailService` methods to add

Add one wrapper method per template to `src/common/services/email.service.ts`. Each method:
1. Calls the builder to produce `{ subject, html, text }`.
2. Enqueues a `notifications.email_send` BullMQ job with `jobId = receipt.id` (per CLAUDE.md email idempotency rule).
3. Worker reads the job, checks `receiptService.isChannelDelivered(receiptId, 'email')`, sends via Resend if not delivered.

Methods to add (mirror builder names):
```
sendBookingConfirmedEmail(input)
sendBookingPendingEmail(input)
sendBookingApprovedEmail(input)
sendBookingDeclinedEmail(input)
sendInstanceCancelledEmail(input)
sendInstanceRescheduledEmail(input)
sendReminder24hEmail(input)
sendWaitlistPromotedEmail(input)
sendFollowUpEmail(input)
```

These are called by the notification builders (`src/modules/session/notifications.ts`) via the `NotificationService`'s email-channel handler — you do not call `EmailService` directly from session services.

---

## 8. Phase plan

6 phases. Each phase ships independently, has its own PR, passes its own gate.

### Phase 1 — Demolition + new schema (skeleton entities, no logic)

**Scope:**
- Delete `src/modules/session/` entirely.
- Add `migrations/043_sessions_rewrite.sql` (drops old tables, creates new ones per §2).
- Add 4 entities (`session-template.entity.ts`, `session-instance.entity.ts`, `session-participant.entity.ts`, `session-reminder-schedule.entity.ts`).
- Add empty `session.module.ts` (no controllers yet, just registers entities + future services).
- Wire module into `AppModule`.
- Update `docs/PROJECT_CONTEXT.md` §5.6 — list new endpoints as "phase 1: schema only."
- Run migration on dev DB, confirm tables exist with correct shape.

**Tests:**
- Run existing test suite — must still pass (we just deleted unused code).
- No new tests yet — no logic to test.

**Gate:**
- `npm run lint` clean
- `npm run build` succeeds
- `npm test` green
- Migration runs cleanly from a fresh DB
- Phase report posted (§8.3)

### Phase 2 — Recurrence engine + template CRUD

**Scope:**
- `RecurrenceService.computeOccurrences` (pure, fully tested — §6.1).
- `SessionTemplateService` (create, list, get, update, delete).
- `SessionTemplateController` (5 endpoints from §4.1).
- DTOs for template ops + recurrence preview.
- Slug generation + uniqueness within instructor.
- Timezone validation against `Intl.supportedValuesOf('timeZone')`.
- `meetingProvider` auto-derivation from URL.
- Swagger docs in `src/common/docs/session.docs.ts`.

**Tests:**
- Recurrence: 5 test cases from §6.1.
- Service: create / list / get / update / delete happy path + ownership 404.
- Controller: 1 integration test per endpoint.

**Gate:**
- Lint + typecheck + tests green.
- 70%+ line coverage on `recurrence.service.ts` and `session-template.service.ts`.
- Phase report posted.

### Phase 3 — Instance generation + edit/cancel scopes

**Scope:**
- `SessionInstanceService` (regenerate from template, list, get, update overrides, reschedule, cancel with 3 scopes).
- `SessionConflictService.findConflicts` (§6.2).
- `SessionInstanceController` (instance endpoints minus participants).
- DTOs for instance ops.
- Counter update helpers.
- Conflict warnings on create + reschedule.

**Tests:**
- Generation: idempotent regenerate, cap respected, DST boundary.
- Edit override: setting and clearing per-field overrides; `is_override` flag.
- Cancel scopes: `this` only, `thisAndFuture` only future, `series` cancels template + all instances.
- Conflict: overlapping instances on save; non-blocking.
- Integration test per endpoint.

**Gate:** as above.

### Phase 4 — Booking + access + snapshot

**Scope:**
- `SessionAccessService.assertCanViewInstance` + `assertCanBook` + redaction helper (§6.7).
- `SessionBookingService.book` (§6.3) — with FOR UPDATE.
- `SessionBookingService.cancelBooking` (§6.4) — without yet the waitlist promotion (added in Phase 5).
- `SessionPublicController` (discover, public instance, ics).
- `SessionClientController` (my, book, cancel-booking, checkin, join-info).
- `SessionIcsService.build`.
- DTOs for booking + discover + my-sessions + calendar.
- Snapshot fields written exactly once at booking; service guard prevents update.

**Tests:**
- Booking happy paths: confirmed, pending-approval, full → fail (waitlist disabled).
- Concurrency: parallel bookings to last seat — only one succeeds (use Jest + Promise.all).
- Access: OPEN/FREE pass unauth; CLIENTS_ONLY denies non-client; GROUP_ONLY redacts.
- Self-book guard.
- Snapshot immutability (attempt to update via service → guarded).
- `.ics` output validates against a basic parser (e.g., regex check for required lines).
- Discover unauth returns only OPEN/FREE.
- Integration tests for all client + public endpoints.

**Gate:** as above.

### Phase 5 — Waitlist auto-promote + approval flow

**Scope:**
- Wire waitlist promotion into `cancelBooking` (§6.4 second half).
- Add `approve` / `decline` endpoints.
- `SessionApprovalService` (cross-instance pending list for `/sessions/approvals`).
- Notification builders (`notifications.ts`) — all 12 events from §7.
- `NotificationOutbox` integration in booking + cancel flows.
- Follow-up endpoint.

**Tests:**
- Cancellation triggers promotion (in same tx) when seat opens > 2h before start.
- Cancellation does NOT promote when ≤ 2h before start.
- Promotion follows FIFO (oldest waitlisted first).
- Approval-required: promoted user lands as PENDING_APPROVAL not CONFIRMED.
- Approve flips PENDING → CONFIRMED, schedules reminders.
- Decline flips PENDING → DECLINED, sends message if provided.
- Approval inbox lists across all instructor's sessions.
- Notification builders return correct shapes (snapshot test).
- Outbox flush only on commit, discard on rollback.

**Gate:** as above.

### Phase 6 — Reminders + final docs

**Scope:**
- `SessionReminderService.schedule` / `cancelForParticipant` (§6.6).
- BullMQ worker: poll `session_reminder_schedule`, claim with atomic update, dispatch notification.
- Register repeating BullMQ job (1-minute interval) in jobs module.
- Final pass: ensure all docs are updated.
- Write `docs/modules/sessions/SESSIONS.md` — the final "how it works" doc (see §9 for required outline).
- Verify all 26 endpoints have Swagger docs and are reachable.

**Tests:**
- Reminder rows created when participant CONFIRMED.
- Rows NOT created for PENDING / WAITLISTED.
- Cancellation deletes pending reminders.
- Worker idempotency: 2 simultaneous worker invocations only send once.
- Reminder firing dispatches to correct channels (email at 24h, push at 1h).

**Gate:** as above + final SESSIONS.md written.

### 8.3 Phase completion report — format

After every phase, post a single message containing:

```markdown
## Phase N Complete

### Changed files
- src/modules/session/...
- migrations/043_...
- docs/...
(brief, just paths)

### What works now
- ≤5 bullets, user-visible capability

### Tests
- npm run lint: PASS
- npm run build: PASS
- npm test: PASS (N suites, M tests)
- Coverage on new files: X% lines (target 70%)

### Open items / known gaps
- ≤5 bullets, what's not done yet (deferred to later phase or v2)

### Next phase preview
- ≤3 bullets

### Risks / questions for the human
- Anything that surfaced and needs a decision before next phase, OR "no questions."
```

Don't advance to the next phase until the human gives an OK on the report.

### 8.4 Per-phase live verification (mandatory, before phase report)

Jest tests run in-process. They prove your code is internally consistent but not that the wired-up server actually serves requests. Before posting each phase report, do this verification pass against a **running dev server with the real Postgres dev DB**.

**Steps (every phase):**

1. **Boot the server:** `npm run start:dev`. Confirm zero errors on startup.
2. **Swagger sanity:** open `http://localhost:3000/api/docs`. Confirm:
   - Every endpoint introduced in this phase is listed.
   - Each shows its DTO + response shape.
   - No "untyped any" red flags in the generated docs.
3. **Curl walk-through** for every new endpoint this phase. Use two JWTs from §0.5: `$INSTRUCTOR_JWT` and `$CLIENT_JWT`. Verify both the happy path AND one error path per endpoint.

   Example for phase 4 booking:
   ```bash
   # Discover a public session (no auth)
   curl -s http://localhost:3000/sessions/discover | jq

   # Book a session (client)
   curl -s -X POST http://localhost:3000/sessions/instances/$INSTANCE_ID/book \
     -H "Authorization: Bearer $CLIENT_JWT" \
     -H "Content-Type: application/json" \
     -d '{"bookingNote":"first time"}' | jq

   # Inspect the DB row directly
   psql $DATABASE_URL -c "SELECT id, status, snapshot_price_cents FROM session_participant WHERE user_id = '...' ORDER BY created_at DESC LIMIT 1;"

   # Book again (should 409 ALREADY_BOOKED)
   curl -s -X POST http://localhost:3000/sessions/instances/$INSTANCE_ID/book \
     -H "Authorization: Bearer $CLIENT_JWT" \
     -H "Content-Type: application/json" \
     -d '{}' | jq

   # Cancel booking
   curl -s -X POST http://localhost:3000/sessions/instances/$INSTANCE_ID/cancel-booking \
     -H "Authorization: Bearer $CLIENT_JWT" \
     -H "Content-Type: application/json" \
     -d '{"reason":"Conflict"}' | jq
   ```

4. **DB inspection** after each operation. Query the affected tables, confirm row state matches expectations (status flags, counters, snapshot values, timestamps).

5. **Notification verification** (phases 4–6): after a notify-triggering operation, check:
   - `SELECT * FROM notification WHERE user_id = '...' ORDER BY created_at DESC LIMIT 5;` — in-app row created.
   - If email expected: check Resend dashboard / test inbox / `notification_receipt` table for `status = 'SENT'`.
   - If push expected (phase 6): check `device_token` rows + `notification_receipt` for push channel.

6. **Performance smoke** (phase 6 only): seed ~100 instances for one instructor, hit `/sessions/calendar` with a 1-month range, verify response time < 500ms and check Sequelize logs (`logging: console.log` temporarily) for N+1 queries. Fix any.

**Document the curl session in the phase report.** Include the curl invocations + the JSON responses (truncated if long) + any DB query results that confirm correctness. The human will spot-check this.

**If anything fails:** fix it before posting the phase report. The phase isn't done if the live server returns errors.

### 8.5 Phase 7 — Final audit (mandatory)

After Phase 6 completes, do not announce "done." There is one more phase: a dedicated audit pass that checks the whole feature end-to-end and fixes anything found. Estimate: 1–2 hours of work.

**Audit checklist** (run through every item, mark PASS / FAIL / N/A):

**Schema & migrations**
- [ ] On a freshly dropped DB, `npm run migrate:fresh` runs cleanly with no errors.
- [ ] All 4 session tables exist with the columns specified in §2 (compare with `\d session_template` etc.).
- [ ] All 8 enums exist with the values specified in §2.2.
- [ ] All indexes exist (compare with `\di` for `idx_st_*`, `idx_si_*`, `idx_sp_*`, `idx_srs_*`).
- [ ] All CHECK constraints fire (try inserting an invalid row, confirm rejection).
- [ ] All FKs cascade correctly (delete a user → templates cascade; delete a venue → venue_id set to null).

**Endpoints**
- [ ] All 26 endpoints reachable. Use the script in `scripts/verify-all-endpoints.sh` (build it if needed): one curl per endpoint, asserts 2xx or expected 4xx.
- [ ] Every endpoint returns the response shape specified in §5.
- [ ] Every endpoint with a DTO rejects malformed input with 400 + field-level error message.
- [ ] Every UUID `@Param` rejects non-UUIDs with 400 (via `ParseUUIDPipe`).
- [ ] Every write endpoint has `@Throttle` — verify by hitting one in a loop and getting 429.

**Concurrency**
- [ ] Parallel booking test against real Postgres: spawn 10 concurrent bookings for a capacity-1 instance. Exactly 1 succeeds with CONFIRMED, the other 9 either get WAITLISTED (if enabled) or 409. No oversells.
- [ ] Waitlist promotion happens synchronously: cancel a CONFIRMED booking with someone WAITLISTED, then immediately query DB — the waitlisted user is already CONFIRMED in the same tx.

**Notifications end-to-end**
- [ ] Book a session as a client → confirmation email arrives (Resend), in-app bell shows new row.
- [ ] Instructor cancels an instance → all active participants get notif (email + in-app).
- [ ] 24h reminder: backdate an instance to `now + 23h`, wait for the BullMQ cron to fire, verify email + in-app delivered. (Or manually invoke `dispatchDueReminders`.)
- [ ] No notifications for PENDING_APPROVAL or WAITLISTED on booking (only in-app, no email).

**Access enforcement**
- [ ] OPEN/FREE instances readable unauthenticated.
- [ ] CLIENTS_ONLY: non-client gets REDACTED view; active client gets FULL.
- [ ] GROUP_ONLY: non-member gets REDACTED; member gets FULL.
- [ ] Cross-instructor template access: instructor A cannot read/edit instructor B's template — gets 404.

**Security grep audit**
Run these checks and post the results:
```bash
# No `any` in session module
grep -rn ": any\b" src/modules/session/ src/common/email/session/ src/common/utils/ | grep -v ".spec.ts"
# Must return zero hits (or hits with justification in code comments).

# No console.log
grep -rn "console\.\(log\|info\|warn\|error\|debug\)" src/modules/session/ src/common/email/session/
# Must return zero hits.

# Every UUID param uses ParseUUIDPipe
grep -rn "@Param(" src/modules/session/*.controller.ts | grep -v "ParseUUIDPipe"
# Every result must be a non-UUID param (e.g., 'token', 'slug') — review each.

# Every write endpoint has @Throttle
grep -B 2 "@Post\|@Patch\|@Put\|@Delete" src/modules/session/*.controller.ts | grep -A 2 "Post\|Patch\|Put\|Delete"
# Manually check each handler — every one should have @Throttle above it.
```

**Code quality**
- [ ] `npm run lint` clean (zero warnings, zero errors).
- [ ] `npm run build` clean.
- [ ] `npm run test:cov` → ≥70% line coverage on `src/modules/session/services/*.ts`.
- [ ] Every endpoint has ≥1 integration test (count: 26 minimum integration tests).
- [ ] No `TODO`, `FIXME`, `HACK`, `XXX` comments in shipped code (move them to GitHub issues if anything is genuinely deferred).
- [ ] No commented-out code blocks.
- [ ] Service constructors follow the `private readonly` + logger-last pattern.

**Documentation**
- [ ] `docs/modules/sessions/SESSIONS.md` written per §9 outline.
- [ ] `docs/PROJECT_CONTEXT.md` §5.6 updated with the new endpoint surface.
- [ ] `CLAUDE.md` updated only if a new convention emerged (otherwise leave alone).
- [ ] Swagger has every endpoint documented via `@ApiEndpoint`; `src/common/docs/session.docs.ts` exists with one doc object per endpoint.

**Performance**
- [ ] Calendar query with 100 instances: < 500ms p95.
- [ ] No N+1 queries (Sequelize `logging: console.log` shows ≤ N+2 queries for a calendar fetch — one for instances, one for templates if included, one for venues if joined).
- [ ] Instance list with default pagination: < 200ms p95.

**Final cleanup**
- [ ] Verify no dead code left from the deleted old module (grep for old service/controller names — must return zero hits).
- [ ] Verify no orphan migrations or duplicated migration numbers.
- [ ] `git status` clean except for tracked changes.

**Bugs found during audit:** fix them. The audit is not a static report — it's a fix-loop. If a check fails, fix the underlying issue, re-run the check, then mark PASS. If a bug can't be fixed within the audit phase (rare), document it in `SESSIONS.md` §13 "Known limitations" with a clear "follow-up" tag.

**Audit deliverable:** post a single message containing:

```markdown
## Phase 7 Audit Complete

### Audit checklist results
(paste the checklist with PASS/FAIL/N/A on each item)

### Bugs found and fixed during audit
- Bug 1: <description>. Fix: <commit summary>.
- Bug 2: …

### Known limitations carried into v1
- <description>, deferred because <reason>, tracked in SESSIONS.md §13.

### Final coverage report
(paste `npm run test:cov` summary for src/modules/session/)

### Final endpoint count
N integration tests, M unit tests, 26 endpoints reachable, all DTOs documented in Swagger.

### Files changed
(brief — paths only, grouped by phase)
```

Only after this audit report is posted and accepted does the feature ship.

---

## 9. Final deliverable — `docs/modules/sessions/SESSIONS.md`

After Phase 6, write this doc. It is the input the FE team will use to plan the frontend. Required outline:

1. **What sessions are** — the domain in ≤200 words.
2. **Data model** — template / instance / participant / reminder schedule, each as a table with columns + type + nullable + notes.
3. **Lifecycle diagrams** — template status flow, instance status flow, participant status flow. ASCII is fine.
4. **API surface** — list of all 26 endpoints with method, path, guard, request/response shape.
5. **Access model** — the 4 access enums, the orthogonal `approval_required` flag, the assertCanViewInstance decision tree, the redacted shape.
6. **Recurrence model** — rule shape, supported frequencies, how generation works, how to regenerate forward, edge cases (DST, monthly clamp).
7. **Booking lifecycle** — book → confirmed/pending/waitlisted; cancel → window check; approve/decline; waitlist auto-promote rules.
8. **Cancellation scopes** — this / this+future / series; what each does to template + sibling instances.
9. **Snapshot fields** — what's snapshotted, when, why immutable.
10. **Notifications** — the 12 events + recipients + channels (table from §7).
11. **Reminders** — cadence, channels, job mechanics, idempotency.
12. **Out of scope (v1)** — copy from §1.3.
13. **Known limitations + future work** — anything Phase 6 left open.
14. **How to use this from the FE** — for each major flow (book a session, browse public, instructor cancels a series), which endpoints to call in which order.

This doc is the contract between BE and FE. Treat it as a deliverable, not a side-effect.

---

## 10. Things you will be tempted to do that are wrong

A non-exhaustive list. If you find yourself doing any of these, stop and re-read this spec.

1. **"Let me just preserve the old `Session` entity for backwards compat."** No. Hard rewrite. Delete it.
2. **"I'll add a NO_SHOW status — it's useful for analytics."** Not in v1. `attended: boolean | null` is the model.
3. **"Let me add a payment intent when status flips to CONFIRMED."** No payments in v1. Price is display-only.
4. **"I'll use raw `Date` for recurrence math — Luxon's overkill."** No. DST will break it. Use Luxon.
5. **"The snapshot fields are redundant — I can just join the template at read time."** No. The snapshot is the booking contract. Template fields can change after booking; the snapshot can't.
6. **"Waitlist promotion can be a cron job — simpler."** No. It's synchronous, in the cancel tx. Cron would re-introduce the race condition we're locking against.
7. **"I'll skip the `FOR UPDATE` lock since bookings are rare."** No. Capacity overselling is the canonical failure mode of booking systems.
8. **"I'll inline the recurrence rule validator in the DTO."** Use a `RecurrenceRuleDto` with `@ValidateNested` so other endpoints (preview, regenerate) can reuse it.
9. **"I'll write the reminder dispatch as a one-shot setTimeout inside the booking service."** No. Use BullMQ + the `session_reminder_schedule` table. CLAUDE.md is explicit.
10. **"This phase is mostly done; I'll skip the integration tests and add them next phase."** Each phase has its own gate. No drift.
11. **"I'll use ENUM(..) directly in the entity instead of importing from a TS enum."** Define a TS enum, use it on the entity AND in the DTO. One source of truth.
12. **"I'll throw a 403 on access denied."** Use 404 to avoid leaking existence — unless the redaction path is taken instead, in which case 200 with the redacted shape.
13. **"I'll add a `cancelled_by_user_id` column for audit."** Out of scope. Audit log is a v2 concern.
14. **"I notice the existing `payment` module has invoice line items — let me wire sessions as line items."** No. Out of scope.
15. **"Let me write a generic `RecurringEntity` base class for future reuse."** No. YAGNI. Recurrence belongs to sessions; if another domain ever wants it, extract then.

---

## 11. Quick reference cheat sheet

```
Tables:       session_template, session_instance, session_participant, session_reminder_schedule
Endpoints:    26 total (7 template, 6 instance, 4 participant, 1 calendar, 3 public, 5 client)
Enums:        type (3), access (4), location_kind (2), meeting_provider (3),
              template_status (3), instance_status (4), participant_status (5), reminder_kind (2)
Decisions:    1=Mon..7=Sun, two tables, snapshot at booking, auto-add waitlist,
              configurable cancellation default 24h, no payments, no NO_SHOW
Tools:        Sequelize 6, class-validator, Luxon (date math), BullMQ (reminders + waitlist),
              NotificationService + NotificationOutbox (notifications)
Test target:  70%+ service line coverage, ≥1 integration test per endpoint,
              real Postgres for tests (NOT SQLite, NOT mocks for FOR UPDATE paths)
Phases:       6 build phases + 1 audit phase. Gate after each. Phase report mandatory.
              Live curl verification (§8.4) per phase. Final audit (§8.5) before ship.
Final doc:    docs/modules/sessions/SESSIONS.md after Phase 7
```

---

**End of spec.** If anything here conflicts with anything in another doc, this spec wins for sessions specifically. If a CLAUDE.md rule conflicts, CLAUDE.md wins. If the designer's prompt conflicts, ask the human.
