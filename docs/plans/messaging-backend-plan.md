# Messaging Backend — Implementation Plan

**Status:** Draft, awaiting approval.
**Scope:** Backend only. Frontend gets its own plan after BE is locked.
**Author:** Claude + @ionut.butnaru
**Date:** 2026-05-11

---

## 1. Goals & non-goals

### Goals (v1)
- Direct messages (DMs) between two users who have an `ACTIVE` `InstructorClient` relationship.
- Conversation list (inbox) with unread counts.
- Message history with cursor pagination.
- Realtime delivery via Server-Sent Events with client acknowledgement.
- In-app notification + (throttled) email notification for new messages.
- User-facing safety: block, report, soft-delete own message, mute, leave.
- Admin moderation: view reports, view conversation in context, suspend messaging on a user. All admin reads logged.
- Abuse defenses: per-user rate limit, new-account throttle, velocity alarms, off-platform contact/payment-handle detection (warn, not block).
- Schema, services, and event bus are **group-ready from day one** (no migration needed when groups land).

### Non-goals (v1)
- Group conversations (schema supports, endpoints/UI deferred).
- Image / file attachments (defer; brings CSAM-scanning obligations).
- Typing indicators, presence, read receipts beyond `lastReadAt`.
- End-to-end encryption (skipped per security discussion).
- Application-level encryption at rest (deferred; Neon volume encryption covers v1).
- Captcha on signup (separate, post-messaging sprint).
- ML moderation, Safe Browsing link scanning (v2+).
- Message edit (skipped; soft delete only).

### Decisions locked in
- Transport: **SSE + client ack**, single instance, `EventEmitter2` as the fan-out.
- Realtime swap path: `MessagingEventsService` is the seam; WebSockets later = swap implementation.
- Per-recipient "1 message before reply" rule: **dropped** (frustrates legitimate conversations).
- New-account (<48h) → can only message users with `ACTIVE InstructorClient` link.
- Velocity alarms: log to DB, no external service.
- Email previews: include by default, user setting to disable (handled in notification preferences).
- DB at rest: plaintext, but body access goes through `getMessageBody()` / `setMessageBody()` helpers so encryption is droppable in later.

---

## 2. Architecture overview

### Module layout

```
src/modules/messaging/
├── messaging.module.ts
├── messaging.controller.ts            REST endpoints (user-facing)
├── messaging-admin.controller.ts      Admin/moderation endpoints
├── messaging-sse.controller.ts        SSE stream endpoint
├── messaging.service.ts               Core conversation/message logic
├── messaging-safety.service.ts        Blocks, suspensions, canMessage, assertParticipant
├── messaging-content.service.ts       Pure: URL/contact/payment-handle detection
├── messaging-events.service.ts        EventEmitter2 fan-out for SSE
├── messaging-rate-limit.service.ts    Redis-backed per-user/per-conv rate limits
├── entities/
│   ├── conversation.entity.ts
│   ├── conversation-participant.entity.ts
│   ├── conversation-membership-event.entity.ts
│   ├── message.entity.ts
│   ├── message-report.entity.ts
│   ├── user-block.entity.ts
│   ├── messaging-suspension.entity.ts
│   ├── admin-message-access-log.entity.ts
│   └── messaging-velocity-alarm.entity.ts
├── dto/
│   ├── send-message.dto.ts
│   ├── list-conversations.dto.ts
│   ├── list-messages.dto.ts
│   ├── mark-read.dto.ts
│   ├── report-message.dto.ts
│   ├── block-user.dto.ts
│   ├── suspend-user.dto.ts
│   └── list-reports.dto.ts
├── guards/
│   └── conversation-participant.guard.ts   (thin wrapper around assertParticipant)
└── notifications.ts                   NotifyParams builders (primitive args only)
```

Docs: `src/common/docs/messaging.docs.ts` for `@ApiEndpoint(...)` blocks.

### Service responsibilities (single-purpose seams)

- **`MessagingService`** — the only thing controllers and SSE call for messaging operations. Knows nothing about safety internals; asks `MessagingSafetyService`.
- **`MessagingSafetyService`** — the single seam for *all* permission checks: blocks, suspensions, new-account rule, `assertParticipant`. Future safety rules go here only.
- **`MessagingContentService`** — pure functions, no DB: URL extraction, payment/contact detection. Returns flags to attach to send responses or log for review.
- **`MessagingEventsService`** — wraps `EventEmitter2`. `emitMessage(participants, payload)` and `subscribeForUser(userId): Observable`. SSE controller calls `subscribeForUser`. Future WebSocket swap = swap this implementation.
- **`MessagingRateLimitService`** — Redis-backed counters (Bull/Redis already configured). Throws on limit breach with a typed exception. Falls back to in-memory when Redis is absent (dev-friendly).

### Send-message flow (load-bearing)

1. `AuthGuard('jwt')` → `req.user`
2. `@Throttle(...)` → cheap NestJS rate limit (existing pattern)
3. DTO validation (length, recipientId UUID)
4. `MessagingRateLimitService.assertSendAllowed(senderId, recipientId)` → Redis counter, throws on breach
5. `MessagingSafetyService.canMessage(senderId, recipientId)`:
   - sender messaging-suspended? → 403
   - blocked by recipient? → return `silentDrop: true` (200 to sender, message *not* inserted)
   - sender <48h old and no ACTIVE `InstructorClient`? → 403
   - else → allow
6. `MessagingService.sendMessage` in a transaction:
   - find or create `conversation` (DIRECT, sorted-pair lookup so we don't duplicate)
   - find or create `conversation_participant` for both
   - insert `message`
   - update `conversation.last_message_at` + `last_message_preview`
7. After commit:
   - `MessagingContentService.detectThreats(body)` — attach flags to response (FE renders warning banner)
   - `MessagingEventsService.emitMessage(participantIds, payload)` — fans out to SSE subscribers
   - `NotificationOutbox.add(messageReceived(...))` then `outbox.flush()` — in-app + email (email throttled per-conversation-per-hour by `NotificationPreferenceService`)
   - `MessagingService.recordVelocityIfNeeded(senderId)` — if >100 in last hour, insert `messaging_velocity_alarm`

If `silentDrop: true`: return 200 with `{ delivered: false }`. UI shows "sent" (sender doesn't know they're blocked). Nothing is inserted.

---

## 3. Database schema — migration `038_messaging_foundation.sql`

All snake_case columns, CHAR(36) UUIDs, `created_at`/`updated_at` TIMESTAMPTZ defaults consistent with existing migrations.

```sql
-- conversation: container for DM or group
CREATE TABLE conversation (
  id CHAR(36) PRIMARY KEY,
  type VARCHAR(16) NOT NULL,                       -- 'DIRECT' | 'GROUP'
  name VARCHAR(120),                               -- group only
  avatar_url TEXT,                                 -- group only
  created_by CHAR(36) REFERENCES "user"(id),       -- group only
  last_message_at TIMESTAMPTZ,
  last_message_preview VARCHAR(200),               -- truncated, plaintext, for inbox sort
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_conversation_last_message ON conversation(last_message_at DESC);

-- conversation_participant: membership + per-conversation state
CREATE TABLE conversation_participant (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  user_id CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL DEFAULT 'MEMBER',      -- MEMBER | ADMIN | OWNER (groups)
  last_read_at TIMESTAMPTZ,
  muted_until TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_participant_active
  ON conversation_participant(conversation_id, user_id)
  WHERE left_at IS NULL;
CREATE INDEX idx_participant_user_active
  ON conversation_participant(user_id) WHERE left_at IS NULL;

-- conversation_membership_event: audit trail (group v2 leans on this)
CREATE TABLE conversation_membership_event (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  user_id CHAR(36) NOT NULL REFERENCES "user"(id),
  actor_id CHAR(36) REFERENCES "user"(id),
  event_type VARCHAR(24) NOT NULL,                  -- JOINED | LEFT | ADDED | REMOVED | ROLE_CHANGED
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_membership_event_conv ON conversation_membership_event(conversation_id, created_at DESC);

-- message
CREATE TABLE message (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  sender_id CHAR(36) REFERENCES "user"(id),         -- nullable for system messages
  kind VARCHAR(24) NOT NULL DEFAULT 'TEXT',         -- TEXT | SYSTEM_JOIN | SYSTEM_LEAVE | SYSTEM_RENAME
  body TEXT NOT NULL,
  metadata JSONB,                                   -- system-message payload, or threat flags
  deleted_at TIMESTAMPTZ,
  deleted_by CHAR(36) REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_message_conv_created
  ON message(conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;
CHECK (char_length(body) <= 4000);                  -- belt-and-braces with DTO

-- user_block (A blocks B)
CREATE TABLE user_block (
  id CHAR(36) PRIMARY KEY,
  blocker_id CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  blocked_id CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  reason VARCHAR(64),                                -- SPAM | HARASSMENT | SCAM | OTHER
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id)
);
CREATE INDEX idx_block_blocker ON user_block(blocker_id);
CREATE INDEX idx_block_blocked ON user_block(blocked_id);

-- message_report
CREATE TABLE message_report (
  id CHAR(36) PRIMARY KEY,
  reporter_id CHAR(36) NOT NULL REFERENCES "user"(id),
  reported_user_id CHAR(36) NOT NULL REFERENCES "user"(id),
  message_id CHAR(36) REFERENCES message(id) ON DELETE SET NULL,
  conversation_id CHAR(36) REFERENCES conversation(id) ON DELETE SET NULL,
  category VARCHAR(32) NOT NULL,                     -- SPAM | SCAM | HARASSMENT | IMPERSONATION | SEXUAL | OTHER
  notes TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN',        -- OPEN | REVIEWING | RESOLVED | DISMISSED
  resolved_by CHAR(36) REFERENCES "user"(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_report_open ON message_report(status) WHERE status IN ('OPEN', 'REVIEWING');
CREATE INDEX idx_report_reported_user ON message_report(reported_user_id);

-- messaging_suspension
CREATE TABLE messaging_suspension (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  applied_by CHAR(36) NOT NULL REFERENCES "user"(id),
  reason VARCHAR(255) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  lifted_at TIMESTAMPTZ,
  lifted_by CHAR(36) REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_suspension_active ON messaging_suspension(user_id) WHERE lifted_at IS NULL;

-- admin_message_access_log (audit trail for any staff read of user messages)
CREATE TABLE admin_message_access_log (
  id CHAR(36) PRIMARY KEY,
  admin_user_id CHAR(36) NOT NULL REFERENCES "user"(id),
  conversation_id CHAR(36) NOT NULL REFERENCES conversation(id),
  related_report_id CHAR(36) REFERENCES message_report(id),
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_access ON admin_message_access_log(admin_user_id, created_at DESC);

-- messaging_velocity_alarm (informational; admin reviews, no auto-block)
CREATE TABLE messaging_velocity_alarm (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  message_count INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by CHAR(36) REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_alarm_unreviewed ON messaging_velocity_alarm(created_at DESC) WHERE reviewed_at IS NULL;
```

Notification type: extend `NotificationType` enum with `MESSAGE_RECEIVED`. No new email template — generic template + category `'request'` (orange eyebrow). Migration `038` does NOT touch the notification module; that's a code-level enum change covered in Stage 6.

---

## 4. REST endpoints (user-facing)

All under `/messaging`, all `AuthGuard('jwt')`, all return camelCase via the global interceptor. Pagination DTOs `extends PaginationDto`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/messaging/conversations` | Paginated inbox. Returns `{items, total, page, pageSize}`. Item = `{id, type, name?, otherUser?, lastMessagePreview, lastMessageAt, unreadCount, muted, role}` |
| GET | `/messaging/conversations/:id` | Conversation detail (no messages). 404 if not participant. |
| GET | `/messaging/conversations/:id/messages` | Paginated messages, newest first, cursor-based (`before=<messageId>`) |
| POST | `/messaging/messages` | Send. Body: `{recipientId, body}`. Creates conversation if missing. Response: `{message, conversation, threatFlags, delivered}`. |
| PATCH | `/messaging/conversations/:id/read` | Mark as read up to `messageId` or `now`. |
| PATCH | `/messaging/conversations/:id/mute` | Body: `{untilIso?}`. Null = unmute. |
| POST | `/messaging/conversations/:id/leave` | Soft-leave. DMs reject (use block instead). |
| DELETE | `/messaging/messages/:id` | Sender soft-deletes own message. |
| POST | `/messaging/blocks` | Body: `{blockedId, reason?}`. |
| DELETE | `/messaging/blocks/:blockedId` | Unblock. |
| GET | `/messaging/blocks` | List my blocks. |
| POST | `/messaging/reports` | Body: `{messageId?, conversationId?, category, notes?}`. Either id required. |
| GET | `/messaging/unread-count` | Aggregate count across all conversations. Cheap, indexed. |

### Admin endpoints (`@Roles('SUPER_ADMIN', 'SUPPORT')`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/messaging/reports` | Paginated, filterable by status/category. |
| PATCH | `/admin/messaging/reports/:id` | Body: `{status, resolutionNotes?}`. |
| GET | `/admin/messaging/conversations/:id/messages` | Read messages in moderation context. **Writes `admin_message_access_log`.** Requires `reason` query param. |
| POST | `/admin/messaging/suspensions` | Body: `{userId, reason, expiresAtIso?}`. |
| PATCH | `/admin/messaging/suspensions/:id/lift` | Body: `{notes?}`. |
| GET | `/admin/messaging/velocity-alarms` | Paginated, unreviewed first. |
| PATCH | `/admin/messaging/velocity-alarms/:id/review` | Mark reviewed. |

### SSE endpoint

`GET /messaging/stream?token=<jwt>` — `@Sse()`, returns `Observable<MessageEvent>`.
- Token in query because `EventSource` can't set custom headers.
- Custom `SseJwtGuard` validates the query-param token using the same secret/strategy as `AuthGuard('jwt')`.
- Subscribes via `MessagingEventsService.subscribeForUser(userId)`.
- Emits a `: heartbeat\n\n` comment every 25s (via `merge(events$, interval(25_000).pipe(map(() => ({ type: 'heartbeat' }))))`).
- Event types: `message.created`, `message.deleted`, `conversation.read`, `conversation.muted`, `heartbeat`.
- Client sends ACKs via `POST /messaging/stream/ack` with `{lastEventId}`. Server uses to detect dropped/proxy-buffered streams. Worst case: client falls back to a one-shot REST refresh.

---

## 5. Implementation stages

Each stage ends with a tests checkpoint. **No stage marked done while a test is red.**

### Stage 1 — Foundation (no behavior yet)
- Migration `038_messaging_foundation.sql` written and runs locally against a fresh DB.
- All 9 entity files: `Conversation`, `ConversationParticipant`, `ConversationMembershipEvent`, `Message`, `MessageReport`, `UserBlock`, `MessagingSuspension`, `AdminMessageAccessLog`, `MessagingVelocityAlarm`.
- `MessagingModule` skeleton: imports entities, exports nothing yet.
- Wire `MessagingModule` into `app.module.ts`.
- `getMessageBody()` / `setMessageBody()` helpers on `MessagingService` (pass-through for now; encryption swap point).

**Tests checkpoint 1**
- `npm run build` — must compile.
- `npm test` — full existing suite green; no messaging tests yet.
- Manual: `npm run migrate:fresh` + `npm run start:dev` boots clean.

### Stage 2 — Core service (DMs send / list / read)
- `MessagingService` with: `sendMessage`, `listConversations`, `getConversation`, `listMessages`, `markRead`, `deleteOwnMessage`, `leave`, `mute`.
- DM-pair lookup helper (avoids duplicate conversations between same two users).
- Transactions: every multi-table write wrapped; `last_message_at` + `last_message_preview` updated in the same tx.
- `MessagingController` with the user-facing endpoints listed above (without safety integration — bare functional flow).
- DTOs with `class-validator` (max 4000 chars on body, UUID validators).
- Cursor pagination for messages.
- `ParseUUIDPipe` on every UUID param.

**Tests checkpoint 2 — unit + integration**
- Service unit tests:
  - sending creates conversation + 2 participants + message + updates `last_message_at`
  - second message to same person doesn't duplicate conversation
  - listConversations returns own conversations, sorted by `last_message_at desc`, with correct unread count
  - markRead updates `last_read_at`, unread count recomputes to 0
  - listMessages cursor pagination returns expected slice
  - deleteOwnMessage sets `deleted_at` + `deleted_by`; non-sender gets 403
- Controller integration tests (existing test-utils pattern):
  - happy path send → list → read
  - listConversations excludes conversations user is not participant in
  - `getConversation` with non-participant userId → 404 (not 403; don't leak existence)
  - validation: empty body 400, >4000 chars 400, non-UUID recipient 400
- `npm test` full suite green.

### Stage 3 — Safety service (blocks, suspensions, can-message gate)
- `MessagingSafetyService` with: `canMessage`, `assertParticipant`, `block`, `unblock`, `listBlocks`, `isMessagingSuspended`.
- Integrate `canMessage` and `assertParticipant` into every relevant `MessagingService` method.
- Implement silent-drop behavior in `sendMessage` when recipient has blocked sender (response: `delivered: false`, no DB write).
- New-account rule: sender created <48h ago + no `ACTIVE InstructorClient` either direction → 403.
- Block/unblock endpoints on `MessagingController`.

**Tests checkpoint 3 — IDOR + permission boundaries (this is the critical security checkpoint)**
- For *every* endpoint, write a test where User C (non-participant) tries to access User A↔B data. Expect 404 (read) or 403 (write). No data leakage.
- Block tests: B blocks A → A sees `delivered: false`, B's inbox unaffected, no DB row inserted.
- Unblock tests: messages flow again, no replay of dropped messages.
- New-account rule: sender 1h old + no `ACTIVE` link → 403. Sender 1h old + `ACTIVE` link → 200. Sender 49h old + no link → 200.
- Suspension: suspended sender → 403 with clear message; suspension expired → 200.
- `npm test` full suite green.

### Stage 4 — Reports + admin moderation + access audit
- `MessagingAdminController` with the admin endpoints listed above.
- All admin reads of `/admin/messaging/conversations/:id/messages` write an `admin_message_access_log` row (in same tx as the read).
- Report creation + status updates.
- Suspension create + lift (writes a clean record, not a flag on user).
- Tie suspensions back into `canMessage` (already done in Stage 3, just verify integration).

**Tests checkpoint 4 — admin RBAC**
- Non-admin → 403 on every `/admin/messaging/*` endpoint.
- Admin reading a conversation writes exactly one `admin_message_access_log` row per request, with the `reason` field populated.
- Reports: USER can create, ADMIN can list, status transitions valid (`OPEN → REVIEWING → RESOLVED/DISMISSED`).
- Suspension: applied → user can't send; lifted → can send again. History preserved.
- `npm test` full suite green.

### Stage 5 — Rate limit + content threat detection + velocity alarms
- `MessagingRateLimitService` (Redis-backed via `ioredis`, in-memory fallback for dev without Redis).
- 30 messages/min/user limit, throws `MessagingRateLimitException` → 429.
- `MessagingContentService` with `detectThreats(body)`:
  - URL extraction (no library; small regex + URL constructor).
  - Off-platform contact regex: `(t|telegram)\.me/...`, `wa\.me/...`, `signal\.me/...`, `@<handle>` on common platforms.
  - Payment handle regex: IBAN, card-number-ish (Luhn-validated), `paypal.me/...`, `revolut.me/...`, basic crypto address shapes (BTC/ETH).
  - Returns `{urls, hasOffPlatformContact, hasPaymentHandle}`. Pure, no DB.
- `MessagingService.sendMessage` calls `detectThreats` after insert, attaches result to response as `threatFlags`. Also persists flags on `message.metadata` for moderation queries.
- Velocity tracker: after each send, check Redis counter; if >100 in 60min → insert `messaging_velocity_alarm` row. Async/idempotent.
- Per-conversation soft throttle (10/sec same conversation) to defang flood-typing accidents.

**Tests checkpoint 5**
- Rate limit: 31st message in a minute → 429. Window rolls over after 60s.
- New-account rule: still works (Stage 3 regression).
- Threat detection unit tests for each pattern (positive and negative cases each).
- Velocity alarm: simulate 101 messages in an hour → exactly one row inserted, threshold + window populated.
- `npm test` full suite green.

### Stage 6 — Notifications (in-app + throttled email)
- Add `NotificationType.MESSAGE_RECEIVED` to the enum.
- `messaging/notifications.ts` with `messageReceived(recipientId, senderName, conversationId, previewText)` builder. **Primitive args only.** Body uses `preview` (truncated to 80 chars, escaped) — respects the existing `data.screen` + `data.queryParams` convention (`screen: 'messages', queryParams: { conversationId }`).
- Wire `NotificationOutbox` in `MessagingService.sendMessage`:
  - `outbox.add(messageReceived(...))` inside the tx
  - `outbox.flush()` after commit
  - `outbox.discard()` in catch
- Email throttle: extend `NotificationPreferenceService` (or add a small dedup helper) — at most one email per `(recipientUserId, conversationId)` per hour. Throttle key in Redis with TTL.
- Email preview toggle: respect existing user preference for "include message previews in emails"; if off, generic body ("You have a new message — open MotionHive to read it").

**Tests checkpoint 6**
- In-app notification inserted for recipient, not for sender.
- Outbox `discard()` on rollback → no notification leak (use a forced-fail send test).
- Email throttle: send 5 messages in 5 minutes → exactly 1 email job enqueued for that conversation.
- Preview toggle: setting off → preview not present in email body.
- `npm test` full suite green.

### Stage 7 — Events + SSE stream
- `MessagingEventsService`:
  - `emitMessage(participantIds, payload)` → `EventEmitter2.emit('messaging.event', { recipientIds, payload })`
  - `subscribeForUser(userId): Observable<MessageEvent>` — `fromEvent(events, 'messaging.event').pipe(filter(...), map(...))` and merge with heartbeat interval
- `MessagingSseController` with `@Sse('stream')` + `SseJwtGuard` (JWT from query param).
- `POST /messaging/stream/ack` to record `lastEventId` per user (in Redis, TTL 1h). Used as a "stream healthy" beacon; if missing, FE can fall back to REST refresh.
- All sendMessage / deleteMessage / markRead / mute call `emitMessage` after commit.

**Tests checkpoint 7**
- SSE unit tests for the subscribe filter (only matches events whose `recipientIds` include `userId`).
- Integration: simulated send → SSE subscriber for recipient receives `message.created` event with full payload. Sender does NOT receive their own send event (avoids double-render; they get the REST response).
- Heartbeat fires every 25s (use Jest fake timers).
- SSE auth: missing/invalid token → 401. Valid token but wrong user → only that user's events.
- `npm test` full suite green.

### Stage 8 — Docs + security review checklist
- Swagger via `@ApiEndpoint` + `src/common/docs/messaging.docs.ts`.
- README addition: "How to test SSE locally with curl".
- Security review checklist (below) — run through each, tick or fix.
- Lint, build, full test suite green.

**Tests checkpoint 8 — full gate**
- `npm run lint`
- `npm run build`
- `npm test`
- Manual smoke via curl/Postman: full happy path + each safety boundary.

---

## 6. Security checklist (gate before declaring v1 done)

Every box must be checked and verified by a test or manual proof.

- [x] All UUID params guarded by `ParseUUIDPipe` — every controller method that takes an `:id` uses it.
- [x] Every read/write through `MessagingService` calls `assertParticipant` or `canMessage` first — guarded by the dedicated IDOR spec (`messaging.idor.spec.ts`).
- [x] Non-participant access returns 404 (not 403); does not leak conversation existence.
- [x] Cross-user IDOR tests cover every endpoint.
- [x] **Recipient-not-found returns silent-drop, not 404** — prevents user-enumeration via send.
- [x] **Silent-drop synthetic ids are real UUIDs** — sender cannot infer block status by id shape.
- [x] DMs cap at 4000 chars (DTO + DB CHECK).
- [x] `body` rendered as plain text on FE (contract documented in FE plan; BE escapes preview in notifications via `escapeHtml`).
- [x] All notification email links use `escapeHtml`.
- [x] Rate limit on `POST /messaging/messages` at 30/min/user.
- [x] Per-conversation rate limit at 10/sec/(user, conversation), checked OUTSIDE the message tx so a 429 doesn't leave a stale counter slot on rollback.
- [x] Rate limit on read endpoints (120 req/min for inbox, 240 for unread-count / get-conversation / list-messages / get-message).
- [x] Tight throttle on report endpoint (5/hour/user) — reports are themselves a harassment vector.
- [x] New-account rule active (sender <48h old + no ACTIVE InstructorClient link → 403).
- [x] Block produces silent drop, not an error response.
- [x] Suspension blocks send with a clear (but minimal) message.
- [x] Admin reads of conversations always write `admin_message_access_log` — verified in the same Sequelize transaction as the read.
- [x] No DB connection held per SSE stream (`subscribeForUser` only uses `EventEmitter2`).
- [x] SSE heartbeat every 25s; client ack endpoint exists.
- [x] SSE JWT guard validates token; rejects expired/missing — strategy uses `ignoreExpiration: false`.
- [x] SSE events carry `id:` so browser `Last-Event-ID` flows; server replay deferred to v2.
- [x] `getMessageBody` / `setMessageBody` are the only access paths to `body` (encryption seam).
- [x] No `any` types in messaging code.
- [x] No `console.log` — Winston only.
- [x] All multi-table writes in transactions.
- [x] All notifications dispatched post-commit (direct `notify()` call, NOT the outbox — single-recipient, no orphan risk).
- [x] Email throttle: max 1 email per conversation per recipient per hour (via `channelOverride: { email: false }`).
- [x] `DELETED_MESSAGE_BODY` constant lives in `messaging/constants.ts` — single source of truth.
- [x] All endpoints (controller + admin + SSE) have `@ApiEndpoint(...)` decorators backed by `common/docs/messaging.docs.ts`.

---

## 7. Open questions

1. **DM creation policy:** auto-create on first send (current plan), or require an explicit "start conversation" step? Current plan = auto-create. Trade-off: simpler UX, but means a blocked user *almost* learns they're blocked (no, they don't — silent drop returns the *fake* conversation only on subsequent fetches if we leak it).
   - **Resolution candidate:** if `silentDrop`, return a synthetic conversation object so the sender's UI behaves identically to a successful send (no inconsistency to read off). Add to test plan.
2. **Whether to mirror messages into the global search index** (`search_doc`, migration 029). Likely no for v1 — messages are private. Confirmed.
3. **Soft-delete vs hard-delete on `leave` for DMs.** Current plan: DMs reject `leave` (use block). Confirm.

---

## 8. Out of scope (explicit)

- Group conversation endpoints — separate plan when we land them.
- Image attachments.
- Typing indicators, presence, read receipts beyond `lastReadAt`.
- E2E or app-level encryption.
- Captcha on signup (separate sprint).
- Safe Browsing / ML moderation.
- Migration to WebSockets (deferred; design supports it).
- Frontend — separate plan.

---

## 9. Approval

Before any code: @ionut.butnaru reviews this doc, raises objections, we revise. Only when this doc is "approved" do we start Stage 1.

**Approval status:** ☐ Pending review.

---

## 10. Known v1 edge cases (documented, not bugs)

1. ~~**Concurrent first-send race.**~~ **Closed by migration 039.** `conversation.direct_key` (sha256(sorted-pair)) is now backed by a partial UNIQUE index. Two concurrent first-sends collide on the index; the loser catches `UniqueConstraintError` and adopts the winner's row. Backfill in the migration computes the same key for all existing DIRECT conversations, and `directKeyFor` in `messaging/constants.ts` is the single source of truth used by both the migration and the service.

2. **System-message kinds and `conversation_membership_event` table.** Defined in the schema and entities but not written to in v1. Reserved for group support (v2). No dead-code concern; explicit placeholders.

3. ~~**SSE event replay-on-reconnect.**~~ **Closed in-process by the replay buffer.** `MessagingEventsService` keeps a per-user ring buffer (last 100 events, 10-minute TTL). On reconnect, the FE's `Last-Event-ID` header drives a server-side replay before the live stream resumes. Caveats locked in via tests + service docstring: in-process only (events emitted while the API was down are gone), bounded capacity (the FE falls back to a REST refresh when the buffer can't fill the gap). Durable cross-restart replay requires an event log and is a v2 feature.

4. **Suspended users can still READ.** Intentional — suspension restricts the *send* action only. Standard product behavior (Twitter/Reddit/Discord). Documented in `MessagingSafetyService.isMessagingSuspended`.

5. **Per-user contacts/search endpoint.** Out of scope — the existing `/users/search` covers user discovery; the messaging module assumes the FE already has the recipient's user id.
