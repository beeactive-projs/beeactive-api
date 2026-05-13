# Messaging Frontend — Implementation Plan (v1)

**Status:** Draft, awaiting approval.
**Scope:** Angular 21 frontend in `beeactive-ui/projects/web`. Backend is feature-complete (see `messaging-backend-plan.md`).
**Source of truth:** This plan. The design package in `~/Downloads/MotionHive (design)/messaging/` is **reference material we adapt**, not a contract.
**Author:** Claude + @ionut.butnaru
**Date:** 2026-05-12

---

## 0 · Reconciliation — what we keep, change, and ignore from the design

The design package (`CODING_AGENT_PROMPT.md`, the JSX files, the HTML mocks) is solid as a visual spec. We adopt the visual language, the component vocabulary, the layouts, and the copy. **We change the integration points to match what we actually built.**

### Keep verbatim from the design

- **Visual language:** hex avatars, honey/coral/navy palette, Poppins for titles + Inter for body, 16/12/999px radius scale, the message-bubble grouping logic (first/middle/last/only), `pinned strip` for group chats, the empty state, the day divider, system-event pills, session attachment cards.
- **Layouts:** desktop split view (side nav 232 / list 340 / chat flex / detail rail 280), mobile stacked screens, mobile bottom-tab "Messages" entry.
- **Component vocabulary:** `conversation-list`, `conversation-row`, `chat-header`, `chat-thread`, `message-bubble`, `chat-composer`, `pinned-strip`, `dm-detail-rail`, `group-detail-rail`, `inbox-filters`, `inbox-search-bar`, `unread-badge`, `day-divider`, `system-event`, `session-attachment-card`, `typing-indicator`.
- **Entry-point icon:** speech-bubble (Concept 1, "Bubble") with coral numeric unread badge. Live in side nav + as the topbar icon.
- **Copy:** "Pick a conversation, or start a new one", "New message", "New group", "Reconnecting…", "Read by N", etc.

### Change to match our BE (these override the prompt)

1. **Module location.** Prompt says `projects/web/src/app/features/messaging/`. Our app uses `main/<feature>/`. → Land everything at `projects/web/src/app/main/messages/`.
2. **Routes.** Prompt says `/messages`, `/messages/:threadId`, `/messages/new`, `/messages/:threadId/info`. Keep all of these — they match our BE plan.
3. **Realtime transport.** Prompt says "websocket subscription". **We ship SSE, not WebSockets** — the BE only exposes `GET /messaging/stream` (SSE + last-event-id replay). The FE wraps `EventSource`, not `WebSocket`.
4. **API contract.** Prompt sketches `/api/messaging/threads/*`. **Our actual routes are different** — see §6 for the full mapping. The data shapes in the prompt mostly match ours; small renames noted in §7.
5. **Out-of-scope features the prompt asks for that we don't have BE for:**
   - **Typing indicators** — the BE has no `typing.start/stop` event. → Render the `<typing-indicator>` component **only if we add a synthetic local-only typing** (see §8) or hide it entirely behind a feature flag. Default: hidden in v1.
   - **Presence (online/offline)** — the BE has no presence service. → Hide the green dot indicators in v1. Schema field stays so v2 lights it up without UI churn.
   - **Pin / mute thread** — BE has `PATCH /messaging/conversations/:id/mute`. **Pinning a thread (top of inbox) is NOT supported** — only pinning a session inside a group conversation is (and that's also v2 — see below).
   - **Pinned session strip on groups** — BE supports group conversations at the schema level but does not write to `conversation_membership_event` and has no "pin a session" endpoint. **Render the strip for design completeness but only when a `conversation.pinned_session_id` is set** — for v1 this is always null, so the strip never renders. We keep the component scaffolded for v2.
   - **Group chat creation** — BE schema supports groups but there's no `POST /messaging/conversations` for groups (intentional — group features are v2). → **Disable the "New group" button** in the inbox header for v1 (kept rendered but `disabled` with a tooltip "Group chats coming soon"). DM-only `New message` flow ships.
   - **Reactions, threaded replies, file attachments, voice recording, in-conversation search, read-receipts-per-member popover** — all explicitly out of scope per the prompt §13. We follow that.
   - **Active row (mobile story-strip of presence avatars)** — depends on presence. Hide in v1.
6. **Avatar tone derivation.** Prompt says: "Assign tone deterministically from a hash of the user id so the same person is always the same color." We already have a small utility for this used by `<app-avatar>`; reuse it instead of writing a new hash.
7. **Mock service.** Prompt suggests `MessagingMockService` to use until BE lands. **BE has landed.** → Skip the mock service. Wire directly to the real `MessagingApiService` (see §6).

### Drop entirely from the design

- **WebSocket assumptions** in service files.
- **`/api/messaging/threads` endpoints** — replaced by `/messaging/conversations` etc.
- **"New group" creation flow** for v1.
- **Storybook stories** (prompt §14) — repo doesn't have Storybook; deferred until it does.

---

## 1 · Goals & non-goals

### Goals (v1)

- Inbox: paginated list of conversations with unread counts and previews.
- Open a DM, read past messages with infinite scroll up.
- Send a text message; see it appear locally immediately (optimistic), confirmed by server.
- Receive new messages live via SSE while the app is open.
- Mark conversations read when opened.
- Mute/unmute a conversation.
- Soft-delete one of my own messages.
- Block / unblock a user; the block list is reachable from settings or the DM detail rail.
- Report a message or a conversation (FE shape; BE already accepts it).
- Total-unread badge on the side nav, topbar icon, and mobile bottom-tab — updates live.
- Threat flag banner inside the sender's own thread when payment-handle / off-platform-contact / shortener URL is detected (BE returns these flags on the send response).
- Silent-drop is rendered as a successful send — FE has no special UI for `delivered: false`.

### Non-goals (v1)

- Group conversation flows (creation, pinned session, member rail, RSVP from chat).
- Typing indicators.
- Online/offline presence.
- File / image / voice attachments.
- Reactions, threaded replies, in-conversation search.
- Permalink-to-message UX (BE has `GET /messaging/messages/:id`; FE doesn't surface it).
- "Active now" story strip on mobile.
- Captcha on signup (separate sprint).

### Decisions locked in

- **Where it lives:** `projects/web/src/app/main/messages/`.
- **Transport:** SSE via `EventSource` (BE provides `GET /messaging/stream?token=`).
- **State:** signal-based store mirroring the existing `NotificationStore` pattern. No NgRx.
- **Realtime architecture:** `MessagingApi` (HTTP), `MessagingRealtime` (SSE), `MessagingStore` (signals + optimistic mutations). The store is the only thing components talk to.
- **Inbox layout pick:** Split View (Concept 2A from the design). The Hub and Sectioned-list variants are not v1.
- **Group support pick:** schema-ready, UI hidden. "New group" button rendered disabled with tooltip; DM creation works.

---

## 2 · Architecture

### Module location & naming

Match the existing pattern (`groups/`, `profile/`):

```
projects/web/src/app/main/messages/
├── messages.routes.ts                       // lazy-loaded child routes
├── pages/
│   ├── inbox/                               // /messages and /messages/:id
│   │   ├── inbox-page.ts
│   │   ├── inbox-page.html
│   │   └── inbox-page.scss
│   └── empty-state/                         // right pane content when no thread selected
│       └── ...
├── components/
│   ├── conversation-list/
│   ├── conversation-row/
│   ├── inbox-search-bar/
│   ├── inbox-filters/
│   ├── new-message-picker/                  // To: picker + first-draft composer
│   │                                        //   - Rents the chat-panel real estate on desktop.
│   │                                        //   - Stacks full-screen on mobile.
│   │                                        //   - Lives at the SAME route `/messages` —
│   │                                        //     toggled by an `inboxStore.composeMode` flag.
│   ├── chat-header/
│   ├── chat-thread/
│   ├── message-bubble/
│   ├── day-divider/
│   ├── system-event/
│   ├── chat-composer/
│   ├── dm-detail-rail/
│   ├── group-detail-rail/                   // scaffolded, only renders when conversation.type=GROUP (never in v1)
│   ├── pinned-strip/                        // scaffolded, only renders when conversation.pinned_session_id set (never in v1)
│   ├── session-attachment-card/             // scaffolded — never inserted in v1
│   ├── threat-flags-banner/                 // NEW — surface the BE's threat_flags response
│   ├── block-confirm-dialog/
│   ├── report-message-dialog/
│   └── unread-badge/
├── models/
│   ├── conversation.model.ts
│   ├── message.model.ts
│   └── participant-snapshot.model.ts
└── icons/
    └── message-bubble.svg
```

### Shared/store/api (under `projects/core/src/lib/...`)

The existing `NotificationStore` lives in `projects/core/src/lib/stores/`. We mirror exactly:

```
projects/core/src/lib/
├── services/
│   └── messaging/
│       ├── messaging.api.service.ts         // HTTP — wraps every REST endpoint
│       ├── messaging.realtime.service.ts    // SSE — wraps EventSource
│       └── index.ts
├── stores/
│   └── messaging.store.ts                   // signal-based; the only thing components depend on
└── constants/
    └── api-endpoints.const.ts               // add MESSAGING.* keys
```

### Dataflow (single source of truth)

```
   ┌─────────────────────┐
   │ Component (page or  │
   │ child component)    │
   └─────────┬───────────┘
             │  reads signals, calls actions
             ▼
   ┌─────────────────────┐
   │ MessagingStore      │  signals + computed + actions
   └────┬─────────┬──────┘
        │         │
        │HTTP     │subscribe
        ▼         ▼
  MessagingApi  MessagingRealtime
        │         │
        ▼         ▼
   REST routes  GET /messaging/stream (SSE)
```

Components NEVER call API directly. They read store signals and call store actions. The store coordinates optimistic updates, HTTP, and merging in SSE events.

### How the store integrates with our existing patterns

- **AuthStore** — read `user()` for "is this my message?", read `token()` for the SSE URL.
- **ErrorDialogService** — let the HTTP interceptor handle 5xx / network errors; the store handles known 4xx specifically (e.g. 429 → toast "Slow down, you're sending too fast"; 403 on send → toast with the BE's `reason` message).
- **NotificationStore** — independent; messaging notifications still flow through it for the bell. The total-unread for the message-bubble icon comes from `MessagingStore.unreadTotal`, NOT from the notification bell count.

---

## 3 · Visual tokens & shared atoms

All design tokens come from `hifi/styles.css` / the existing project tokens. **Do not invent colors.**

```css
--honey-500   #f59e0b   primary, my-bubble, active route
--honey-100   #fef3c7   pinned strip bg, active row bg
--honey-800   #92400e   active text on honey-100
--coral-500   #f97066   unread badge bg
--navy-900    #0f172a   ink
--navy-800    #1e293b   secondary ink
--ink-2       #475569
--ink-3       #94a3b8
--surface-50  #fcfaf6   page bg
--surface-100 #f7f1e6   composer bg, search field
--line        rgba(15,23,42,0.08)
```

Type:
- Poppins 600 — page title, thread/group name in the header.
- Inter — everything else.

Radii: 16px card · 12px row · 999px pill · 16px bubble (with the grouped-bubble inner-corner 6px reduction).

Shared atoms we reuse (don't recreate):
- `<app-avatar>` — already supports hex shape + tone-from-hash. Confirm via grep before reuse.
- `<app-error-dialog>` / `ErrorDialogService` — for 5xx and unknown failures.
- `notification-bell.ts` styling/popover patterns — reference for `<inbox-filters>` (chip rows) and the topbar icon button.

---

## 4 · Routes & navigation

### Routes (lazy-loaded under `messages.routes.ts`)

```typescript
[
  {
    path: '',                       // /messages
    component: InboxPage,
    children: [
      { path: '', component: EmptyState },                      // no thread selected
      { path: ':id', component: ConversationPane },             // /messages/:id
      { path: ':id/info', component: ConversationPane, data: { railOpen: true } }, // mobile drawer
    ],
  },
]
```

URL is the source of truth for the active thread. Clicking a row pushes `/messages/:id`. Closing returns to `/messages`.

**Compose mode is NOT a route.** The "New message" button toggles a `inboxStore.composeMode` signal. While true, the chat-panel area (or full screen on mobile) shows the `NewMessagePicker` instead of the empty state / active thread. Closing the picker clears the flag. URL stays `/messages` throughout. Rationale: it's transient UI state, not navigation — making it routable would force users back into compose mode on accidental refresh and add a back-button trap.

### Sidenav & topbar wiring

- `projects/web/src/app/layouts/sidenav-layout/sidenav-layout.component.ts` — add a "Messages" `NavSection` entry between "Explore" and "Notifications" (matches design). Icon: `<svg>` for the bubble (provided in design prompt, also baked into the icons module). Unread badge bound to `messagingStore.unreadTotal()`.
- Topbar (search bar component) — add a bubble icon button right of the search field, before the profile menu. Same badge binding.
- Mobile bottom-tab — add Messages between Explore and Activity (matches the design's bottom-tab layout).

When `unreadTotal === 0` the badge is hidden. When the route is *active*, the coral badge flips to honey on the desktop side nav (per design). FE detail: bind both background and text color to the `isActive` route signal.

---

## 5 · Components — what each does, and what it reads from the store

### Pages

| Page | Reads | Writes (actions) |
|---|---|---|
| `InboxPage` | `conversations()`, `activeId()`, `unreadTotal()`, `filter()`, `searchQuery()`, `composeMode()` | `setFilter()`, `setSearchQuery()`, `openConversation(id)`, `enterCompose()`, `exitCompose()` |
| `NewMessagePicker` (component, not page; DM-only in v1) | `recentContacts()` (derived) | `startDmWith(userId, firstMessageText)` — on success, store creates the conversation, clears composeMode, and routes to `/messages/:newId` |
| `EmptyState` | nothing | nothing |

### Containers

| Component | Reads | Behaviors |
|---|---|---|
| `ConversationPane` | `activeConversation()`, `messages(activeId)`, `pagination(activeId)`, `composerDraft(activeId)` | Auto-mark-read on open; pagination on scroll-up |
| `ChatHeader` | `activeConversation().otherUser` (DM) or `activeConversation().name` (group, never in v1) | Toggle detail rail on mobile |
| `ChatThread` | `messages(activeId)`, `latestThreatFlags(activeId)` | Maintains scroll position; "↓ N new" floating chip when not pinned to bottom |
| `MessageBubble` | inputs only | Long-press output stub (out of scope, leave hook) |
| `ChatComposer` | `composerDraft(activeId)`, `rateLimitedUntil()` | `sendMessage(activeId, text)`; Enter sends, Shift+Enter newline, Esc clears focus |
| `DmDetailRail` | `activeConversation().otherUser` | Buttons stub: schedule session / send program (out of scope, leave hooks); **block** is real and goes to `BlockConfirmDialog` |
| `ThreatFlagsBanner` | `latestThreatFlags(activeId)` | Renders only in the *sender's* view of *their own* last message (we filter this in the bubble component) |

### Inbox sub-components

| Component | Reads | Writes |
|---|---|---|
| `ConversationList` | `visibleConversations()` (filtered + searched), `activeId()` | — |
| `ConversationRow` | inputs only | — |
| `InboxFilters` | `filter()`, `counts()` | `setFilter('all' | 'unread' | 'groups' | 'coaches')` |
| `InboxSearchBar` | `searchQuery()` | `setSearchQuery()` (client-side debounced filter for v1; server search out of scope) |

### Special

| Component | Purpose |
|---|---|
| `ThreatFlagsBanner` | Renders a yellow callout under the sender's last message when `threatFlags.anyFlag === true`. Copy: "Heads up — this looks like a request to move payment off MotionHive. Always pay through the platform." (specific copy by flag, see §10). |
| `BlockConfirmDialog` | Modal: "Block {name}? They won't be able to message you. You can unblock from settings." Reason picker dropdown (matches BE enum). |
| `ReportMessageDialog` | Modal with the 6 categories the BE accepts (SPAM/SCAM/HARASSMENT/IMPERSONATION/SEXUAL/OTHER) + optional notes textarea (max 2000 chars). |
| `UnreadBadge` | Coral pill ≤9, "9+" past 9. Honey variant when on an active row. Used in side nav, topbar, mobile tab, and inside conversation rows. |
| `MessageBubbleSilentDrop` | **There isn't one.** Silent drops render exactly like a successful send. Per the BE contract: `delivered: false` is invisible to the sender. The store accepts the synthetic UUIDs and treats them like a real message in local state — it just never gets a corresponding SSE event back. |

---

## 6 · API contract — exact mapping from the BE

We talk to the BE via `MessagingApi`. Every method maps to one route on the actual backend. The prompt's sketched contract from §11 is **wrong in places** — use this table, not that one.

| Store action | HTTP | BE route | Response shape |
|---|---|---|---|
| `loadConversations(page, limit)` | GET | `/messaging/conversations?page&limit` | `PaginatedResponse<ConversationListItem>` |
| `loadConversation(id)` | GET | `/messaging/conversations/:id` | `ConversationListItem` |
| `loadMessages(id, before?, limit)` | GET | `/messaging/conversations/:id/messages?before&limit` | `{ items: MessageView[], nextBefore: string \| null }` |
| `loadMessage(id)` | GET | `/messaging/messages/:id` | `MessageView` (not used by v1 UI, keep stub) |
| `sendMessage(recipientId, body)` | POST | `/messaging/messages` | `{ message, conversation, delivered, threatFlags }` |
| `markRead(id, upToIso?)` | PATCH | `/messaging/conversations/:id/read` | `{ lastReadAt }` |
| `muteConversation(id, untilIso \| null)` | PATCH | `/messaging/conversations/:id/mute` | `{ mutedUntil }` |
| `deleteOwnMessage(id)` | DELETE | `/messaging/messages/:id` | `MessageView` (body becomes `[deleted]`) |
| `block(blockedId, reason?)` | POST | `/messaging/blocks` | `UserBlock` |
| `listBlocks()` | GET | `/messaging/blocks` | `UserBlock[]` |
| `unblock(blockedId)` | DELETE | `/messaging/blocks/:blockedId` | `{ ok: true }` |
| `report(dto)` | POST | `/messaging/reports` | `MessageReport` |
| `getUnreadCount()` | GET | `/messaging/unread-count` | `{ count: number }` |
| `ackStreamEvent(lastEventId)` | POST | `/messaging/stream/ack` | `{ ok: true }` |
| `subscribeRealtime()` | SSE | `/messaging/stream?token=<jwt>` | event stream (see §8) |

### Routes we are NOT calling in v1

- `POST /messaging/conversations/:id/leave` — groups only.
- All `/admin/messaging/*` — admin-only, separate "support tools" UI is out of scope.

### Endpoint constants

Add to `projects/core/src/lib/constants/api-endpoints.const.ts`:

```typescript
MESSAGING: {
  CONVERSATIONS: '/messaging/conversations',
  CONVERSATION: (id: string) => `/messaging/conversations/${id}`,
  CONVERSATION_MESSAGES: (id: string) => `/messaging/conversations/${id}/messages`,
  CONVERSATION_READ: (id: string) => `/messaging/conversations/${id}/read`,
  CONVERSATION_MUTE: (id: string) => `/messaging/conversations/${id}/mute`,
  MESSAGES: '/messaging/messages',
  MESSAGE: (id: string) => `/messaging/messages/${id}`,
  BLOCKS: '/messaging/blocks',
  BLOCK: (id: string) => `/messaging/blocks/${id}`,
  REPORTS: '/messaging/reports',
  UNREAD_COUNT: '/messaging/unread-count',
  STREAM: '/messaging/stream',
  STREAM_ACK: '/messaging/stream/ack',
}
```

---

## 7 · Data models — the FE shapes

Match the BE response shapes verbatim where possible. Camel-case enforced by the BE's global `CamelCaseInterceptor` — no transformation needed.

```typescript
// projects/web/src/app/main/messages/models/conversation.model.ts
export type ConversationType = 'DIRECT' | 'GROUP';

export interface ParticipantSnapshot {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

export interface ConversationListItem {
  id: string;
  type: ConversationType;
  name: string | null;
  avatarUrl: string | null;
  lastMessageAt: string | null;       // ISO
  lastMessagePreview: string | null;
  unreadCount: number;
  muted: boolean;
  otherUser: ParticipantSnapshot | null;
}

// models/message.model.ts
export type MessageKind =
  | 'TEXT'
  | 'SYSTEM_JOIN'
  | 'SYSTEM_LEAVE'
  | 'SYSTEM_RENAME'
  | 'SYSTEM_ROLE_CHANGE';

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: MessageKind;
  body: string;
  deletedAt: string | null;
  createdAt: string;
}

export interface ThreatFlags {
  urls: string[];
  hasShortenerUrl: boolean;
  hasOffPlatformContact: boolean;
  hasPaymentHandle: boolean;
  anyFlag: boolean;
}

export interface SendMessageResult {
  message: MessageView;
  conversation: ConversationListItem;
  delivered: boolean;                  // FE doesn't surface — see §1 §10
  threatFlags: ThreatFlags;
}
```

The design prompt's `Message.attachments[]` and `systemEvent` shapes are **v2**. Our v1 `MessageView` carries them via `kind` (system) and the absence of attachments.

---

## 8 · Realtime layer (SSE)

### Wrapper

`MessagingRealtimeService`:

```typescript
@Injectable({ providedIn: 'root' })
export class MessagingRealtimeService {
  private source: EventSource | null = null;
  private lastEventId: string | null = null;

  events = new Subject<MessagingStreamEvent>();
  status = signal<'idle' | 'connecting' | 'open' | 'closed'>('idle');

  connect(token: string): void { /* opens EventSource(?token=...) */ }
  disconnect(): void { /* closes + sets status closed */ }
}
```

Event types the BE emits (matches our BE `MessagingEventsService`):

```typescript
type MessagingStreamEvent =
  | { id: string; type: 'message.created';     payload: MessageCreatedPayload }
  | { id: string; type: 'message.deleted';     payload: MessageDeletedPayload }
  | { id: string; type: 'conversation.read';   payload: ConversationReadPayload }
  | { id: string; type: 'conversation.muted';  payload: ConversationMutedPayload }
  | { id: string; type: 'heartbeat';           payload: { ts: number } };
```

### Reconnect contract

`EventSource` reconnects automatically. We **let it** for transient blips. The BE handles `Last-Event-ID` (sent automatically by the browser) and replays missed events from its in-process ring buffer (10-minute TTL, 100-event cap).

When the buffer can't fill the gap (BE returns no replay events for an unknown cursor), the store **refetches the inbox + the active conversation's messages** to fill the gap manually. This is the BE's documented fallback (`messaging-backend-plan.md` §10).

### Acks

After processing any event, the FE POSTs `/messaging/stream/ack` with the event id. Stored as a stream-health beacon on the BE today, used for replay on the BE in v2.

### Auth

`EventSource` can't set headers, so the BE accepts the JWT as `?token=<jwt>` via its `SseJwtStrategy`. The FE reads `authStore.token()` and appends it. **Known trade-off documented** in the BE plan §6 — the FE doesn't need to do anything extra except keep the token short-lived (already does, refresh interceptor handles that).

When the token expires mid-stream, the BE will 401 the connection. Wrapper catches `onerror`, calls `authStore.refreshToken()` (existing service), reopens with the new token.

### Visibility / pause

Pause the stream when `document.visibilityState === 'hidden'` for ≥30s (saves connection, reduces server load). Resume on visibility change. The buffer replay handles the gap.

---

## 9 · State store

```typescript
// projects/core/src/lib/stores/messaging.store.ts

@Injectable({ providedIn: 'root' })
export class MessagingStore {
  // ── raw state ──
  private readonly _conversations  = signal<ConversationListItem[]>([]);
  private readonly _messages       = signal<Record<string, MessageView[]>>({});
  private readonly _activeId       = signal<string | null>(null);
  private readonly _filter         = signal<'all' | 'unread' | 'groups' | 'coaches'>('all');
  private readonly _search         = signal<string>('');
  private readonly _pagination     = signal<Record<string, { nextBefore: string | null; loading: boolean }>>({});
  private readonly _composerDraft  = signal<Record<string, string>>({});
  private readonly _latestThreat   = signal<Record<string, ThreatFlags>>({}); // by conversationId
  private readonly _loadingInbox   = signal<boolean>(false);
  private readonly _streamStatus   = signal<'idle' | 'connecting' | 'open' | 'closed'>('idle');
  private readonly _rateLimitedUntil = signal<number | null>(null);          // ms epoch

  // ── public read surfaces ──
  conversations         = this._conversations.asReadonly();
  activeId              = this._activeId.asReadonly();
  filter                = this._filter.asReadonly();
  searchQuery           = this._search.asReadonly();
  streamStatus          = this._streamStatus.asReadonly();
  rateLimitedUntil      = this._rateLimitedUntil.asReadonly();

  // ── computed ──
  unreadTotal           = computed(() =>
    this._conversations().reduce((sum, c) => sum + c.unreadCount, 0));

  visibleConversations  = computed(() => /* filter + search applied */ );
  activeConversation    = computed(() =>
    this._conversations().find(c => c.id === this._activeId()) ?? null);
  messagesFor           = (id: string) => this._messages()[id] ?? [];
  latestThreatFlags     = (id: string) => this._latestThreat()[id] ?? null;

  // ── actions ──
  loadConversations(): Promise<void>
  openConversation(id: string): void                           // routes + loads messages + marks read
  loadOlderMessages(id: string): Promise<void>                  // pagination upward
  sendMessage(conversationId: string | null, recipientId: string, body: string): Promise<void>
  markRead(id: string): Promise<void>
  muteConversation(id: string, untilIso: string | null): Promise<void>
  deleteOwnMessage(messageId: string): Promise<void>
  block(blockedId: string, reason?: UserBlockReason): Promise<void>
  unblock(blockedId: string): Promise<void>
  report(dto: ReportMessageDto): Promise<void>
  setFilter(f: Filter): void
  setSearchQuery(q: string): void
  saveDraft(id: string, text: string): void
  startStream(): void                                           // wires realtime + applies events
  stopStream(): void
}
```

### Critical store behaviors

- **Optimistic send.** Insert a temp message into `_messages[id]` immediately with `id = 'pending-' + crypto.randomUUID()` and `status = 'sending'`. On 201 response, replace the temp message with the real one. On error, mark the temp message as failed with a retry button.
- **Send with no existing conversation.** `sendMessage(null, recipientId, body)` — the BE creates the conversation on first send. FE waits for the response, inserts the new conversation into `_conversations`, and routes to it (`/messages/:newId`).
- **Silent drop UX.** When response `delivered === false`, **do not change behavior**. The conversation may have a synthetic UUID — that's fine, treat it like a real one. The user's UI shows the message as sent. (BE will not echo it back via SSE.)
- **Rate limit (429).** BE returns `{ statusCode: 429, message, retryAfter }`. Set `_rateLimitedUntil = Date.now() + retryAfter * 1000`. Composer reads it and disables send for that duration with a tooltip "Too many messages — slow down".
- **Forbidden (403).** Could be: suspended sender, new-account rule, sending to self. Show a toast with the BE's `reason` (already user-friendly) and revert the optimistic insert.
- **SSE `message.created` for the active conversation:** append + auto-scroll if pinned-to-bottom; otherwise increment "↓ N new" counter.
- **SSE `message.created` for a non-active conversation:** bump unread on that conversation, move it to the top of the inbox list (re-sort by `lastMessageAt desc`).
- **SSE `message.deleted`:** patch the message in place — body becomes `[deleted]`, `deletedAt` set. No removal from the list.
- **SSE `conversation.read`:** powers future "read by other" indicators. v1: parse but no-op (we don't render read receipts beyond the BE's deferred `lastReadAt` logic).
- **SSE `conversation.muted`:** patch the conversation's `muted` flag.
- **SSE `heartbeat`:** no UI update; just touch `lastSeenServerEventAt` for diagnostics.

### Errors

- 5xx and network failures bubble to the global error interceptor (existing `ErrorDialogService`).
- 4xx caught in store with specific handlers (above). No global modal for those.

---

## 10 · Threat-flag banner — concrete UX

The BE returns `threatFlags` on every send response. Render the banner inside the sender's own thread, **only on their last sent message**, only when `threatFlags.anyFlag === true`. Banner copy by flag priority:

1. `hasPaymentHandle` → **"MotionHive doesn't process payments outside the platform.** Always pay through MotionHive so you're protected by our refund policy."
2. `hasOffPlatformContact` → **"Be careful with off-platform contact requests.** Scammers ask people to move to Telegram or WhatsApp."
3. `hasShortenerUrl` → **"This link uses a URL shortener.** You can't see where it goes — open with care."

If multiple flags fire, show the highest-priority one (1 > 2 > 3). Dismiss button per banner; FE remembers dismissal per `messageId` in `sessionStorage` (no BE call).

Recipient does **not** see the banner. The flags are only attached to the sender's send response — the BE never exposes them via SSE.

---

## 11 · Mobile breakpoints

Single breakpoint at 768px:

| Surface | Desktop (≥1024px) | Tablet (768–1023px) | Mobile (<768px) |
|---|---|---|---|
| Inbox `/messages` | Split view (list + chat + rail) | List + chat; rail hidden, opened on demand via `info` | Full-screen list. No chat. |
| Conversation `/messages/:id` | List on left, chat in middle, rail on right | List + chat; rail as drawer | Full-screen chat. Back button. Rail as drawer. |
| Detail rail | Always visible on right | Drawer from the right, triggered by `info` icon → route `/messages/:id/info` | Same — drawer triggered by `info` icon |
| New message (compose) | Right panel swaps to picker (chat-panel real estate) | Right panel swaps to picker | Full-screen picker stacked over the list |
| Bottom tab | Hidden | Hidden | Visible, "Messages" tab active |

Use the existing project breakpoint utility (we have `BreakpointService` or similar — confirm by grep before reuse).

---

## 12 · Implementation stages

Each stage ends with a hard test gate. Same discipline as the BE plan. **No stage marked done while a regression exists in `npm test` for the messaging code, the build is failing, or the linter has errors in messaging files.**

### Stage F1 — Foundation: routes, store, API, realtime wrappers

- Create `main/messages/` directory + lazy-loaded `messages.routes.ts`.
- Wire route into `main.routes.ts` between `groups` and `profile`.
- Sidenav entry (no badge yet) + topbar icon button (no badge yet) + mobile bottom-tab entry (no badge yet).
- `MessagingApiService` (HTTP) — all 13 endpoint methods, typed.
- `MessagingRealtimeService` (SSE) — connect/disconnect, no event handling yet.
- `MessagingStore` skeleton — only `_conversations`, `_loadingInbox`, `loadConversations()`, `unreadTotal` computed.
- `EmptyState` page rendered at `/messages`.
- Lint passes, build passes, `ng test` passes (no new tests yet).

**F1 tests checkpoint**
- Hitting `/messages` renders empty state.
- Reload at `/messages` keeps URL.
- Service tests: `MessagingApiService` mocks of every method (existence smoke).
- 0 ESLint errors in `main/messages/` and `lib/services/messaging/` and `lib/stores/messaging.store.ts`.

### Stage F2 — Inbox list (desktop split + mobile)

- `ConversationList`, `ConversationRow`, `InboxSearchBar`, `InboxFilters`, `UnreadBadge` components.
- Wire to store: `loadConversations()` on `InboxPage` `ngOnInit`.
- Side nav + topbar + mobile tab badges bound to `unreadTotal()`.
- Active filter chip + search filter applied client-side.
- Click a row → routes to `/messages/:id` and sets `activeId`.
- Loading skeletons matching the design's row shape.

**F2 tests checkpoint**
- Component test: row renders with unread badge when `unreadCount > 0`.
- Component test: filter chip changes filter signal, derived `visibleConversations` updates.
- Component test: clicking a row navigates.
- E2E-style test (using Angular `RouterTestingModule`): URL is the source of truth.

### Stage F3 — Conversation pane: header, thread, message bubbles, pagination

- `ConversationPane`, `ChatHeader`, `ChatThread`, `MessageBubble`, `DayDivider`, `SystemEvent` components.
- On opening a conversation: store loads the first page of messages, fires `markRead`.
- Infinite scroll up: `loadOlderMessages` when scroll position is within 200px of the top.
- Auto-scroll to bottom on first load + on new own message; "↓ N new" floating chip when not pinned-to-bottom.
- Message bubble grouping (first/middle/last/only): compute in component from neighbor authorship + time gap (≤5 min same author = same group).
- Bubble metadata (timestamp, "Delivered"/"Read") rendered only on last bubble of a group.

**F3 tests checkpoint**
- Component test: opening a conversation calls `markRead`.
- Component test: bubble grouping classifies a sample stream correctly.
- Component test: scrolling to top triggers `loadOlderMessages` exactly once.
- Component test: `[deleted]` body renders the tombstone styling, not the raw text.

### Stage F4 — Composer + send flow + New Message picker

- `ChatComposer` component.
- Optimistic insert + replace on 201.
- 429 → disable composer until `_rateLimitedUntil`.
- 403 → toast + revert.
- Enter sends · Shift+Enter newline · Esc clears focus.
- Mobile: send button is icon-only (no emoji button, mic shown but disabled per design).
- `composerDraft` persisted across thread switches (in-memory only for v1).
- `NewMessagePicker` component:
  - User search field at the top (server-side `/users/search` already exists — reuse it). Limit results to users the sender has an `ACTIVE InstructorClient` link with, since the BE will 403 anyone else for new-account senders. For non-new accounts the BE allows any user but the FE picker still filters to ACTIVE links for v1 to keep UX consistent.
  - Selected user pinned at the top.
  - Same `ChatComposer` underneath, no existing thread yet.
  - On first send: store calls `sendMessage(null, recipientId, body)` → server creates conversation → store inserts it into the list, sets `activeId`, exits compose mode, routes to `/messages/:newId`.
  - Cancel button (mobile back arrow / desktop X) → clears `composeMode`, returns to empty state.

**F4 tests checkpoint**
- Component test: send inserts an optimistic message immediately.
- Component test: on success, optimistic message is replaced by the server's row.
- Component test: on 429, send button disables.
- Component test: Enter sends, Shift+Enter inserts newline.
- Component test: NewMessagePicker — selecting a user + sending a first message creates a new conversation in the store, exits compose mode, and routes to the new thread.
- Component test: Cancel clears compose mode without sending.

### Stage F5 — Threat flags banner + safety actions (block / report / mute / delete)

- `ThreatFlagsBanner` component — surfaces the BE's flags with the §10 copy.
- `BlockConfirmDialog` + `ReportMessageDialog` + delete-own confirm.
- DM detail rail's "Block this user" + "Report" entry points.
- Mute toggle on the conversation row context menu (3-dot or kebab).
- Soft-delete own message: long-press / kebab menu on the bubble → confirm → call `deleteOwnMessage`. Bubble updates in place via the store.

**F5 tests checkpoint**
- Component test: payment-handle flag renders banner #1; off-platform renders #2; shortener renders #3.
- Component test: multiple flags → only highest-priority shown.
- Component test: dismissing the banner persists to sessionStorage.
- Component test: block dialog → POST `/messaging/blocks` → conversation list refreshes.
- Component test: report dialog has all 6 categories + notes.

### Stage F6 — Realtime: SSE wiring + reconnect/replay/visibility

- `MessagingStore.startStream()` wired to the auth state — start on login, stop on logout.
- Connect on app boot when authenticated.
- Per-event handlers in the store (see §9 SSE handler list).
- `lastEventId` tracked, ack endpoint called.
- Visibility-based pause/resume.
- Token-expiry refresh + reconnect.

**F6 tests checkpoint**
- Service test: incoming `message.created` event for the active conversation appends to messages.
- Service test: incoming `message.created` for a different conversation bumps unread + re-sorts.
- Service test: `message.deleted` patches the body to `[deleted]`.
- Service test: visibility hidden ≥30s closes the stream; reopening on visible.
- Service test: reconnect after token refresh.

### Stage F7 — Polish + accessibility + edge cases

- `aria-label` on every icon-only button.
- Chat thread is `role="log" aria-live="polite"`.
- Composer textarea has `aria-label="Message {thread name}"`.
- Unread badges use the off-screen "N unread messages" + `aria-hidden` visual.
- Hit targets ≥44×44 on mobile.
- Empty/offline/error states: "You have no messages yet" / "Reconnecting…" composer / "Couldn't load messages — retry" inline.
- Topbar + mobile-tab live with the messaging icon assets imported.
- Final visual pass against the design's HTML mocks.

**F7 tests checkpoint**
- `ng test` full suite green.
- `ng lint` clean for messaging files.
- Visual pass: open `~/Downloads/MotionHive (design)/MotionHive - Messaging.html` side-by-side and compare each artboard.
- Keyboard-only walkthrough: tab from sidenav into inbox into a thread, send a message, open detail rail, block a user.

### Stage F8 — Smoke + handoff

- Run the BE `scripts/messaging-smoke.sh` against the dev server with a real JWT to confirm the BE side is healthy from a real-token perspective.
- Manual FE smoke: send to a real user, watch SSE deliver in another tab, mute/unmute, block, report.
- Update this plan doc with anything learned.

---

## 13 · Security checklist (FE side)

- [ ] Every message body rendered via `{{ }}` / `[textContent]` — never `[innerHTML]`.
- [ ] JWT in `?token=` only used on the SSE stream URL — never appended to any REST URL.
- [ ] Token never logged (verify no `console.log(token)` slipped in).
- [ ] BlockConfirmDialog requires explicit confirm — no accidental block via misclick.
- [ ] Report dialog body capped at 2000 chars client-side (matches BE).
- [ ] Composer body capped at 4000 chars client-side (matches BE CHECK + DTO).
- [ ] Optimistic message gets replaced — never permanently rendered as "pending" if the server confirmed.
- [ ] SSE wrapper closes on logout — no events leak across user sessions.
- [ ] On 401 mid-stream: refresh token → reconnect, NOT silent failure.
- [ ] Threat-flag dismissal is per-message in sessionStorage — does NOT bleed across users.

---

## 14 · Decisions (closed)

1. **"New group" button** — Rendered disabled with "Group chats coming soon" tooltip in v1. ✅ Approved 2026-05-12.
2. **Avatar tone hash** — Existing `<mh-avatar>` is circle-shaped (PrimeNG `shape="circle"`) and has no tone derivation. Decision: **build a new `<mh-hex-avatar>` under `_shared/components/hex-avatar/`** with `tone` + `size` inputs and a small `toneForUserId(id): Tone` util. The circle `<mh-avatar>` stays untouched for the rest of the app — no blast radius. The util is deterministic (sha1 of userId mod tones[]) so the same person is the same color everywhere. ✅ Decided 2026-05-12.
3. **`/messages/new`** — **Dropped as a separate route.** The "New message" button on the inbox header replaces the right-side chat panel (or the whole screen on mobile) with a **To: picker + composer** until a recipient is chosen and the first message is sent. On send, the new conversation appears in the list and the panel becomes the live thread. **No modal, no drawer, no separate page.** ✅ Decided 2026-05-12.
   - On mobile this is still a full-screen experience — same picker + composer, just stacked.
   - URL stays `/messages` while the picker is open (use a local store flag, not a route). Closing returns to the empty state. The picker is shoulder-deep state, not navigation.
4. **Threat banner copy** — §10 copy approved verbatim. ✅ Approved 2026-05-12.
5. **Detail rail on tablet (768–1024px)** — Drawer-on-demand, same as mobile. Toggled via the `info` icon in the chat header. ✅ Decided 2026-05-12.

---

## 15 · Out of scope (explicit)

- Group conversations (creation, member rail, pinned session, RSVP from chat).
- Typing indicators.
- Presence (online/offline).
- File / image / voice attachments.
- Reactions / threaded replies / in-conversation search / read-receipts popover.
- Message permalink page.
- Active-row story strip on mobile.
- Admin-side moderation UI (separate "support tools" feature).
- Captcha on signup (separate sprint).

---

## 16 · Approval

Before any code: @ionut.butnaru reviews this doc, raises objections, we revise. Only when this doc is "approved" do we start Stage F1.

**Approval status:** ☑ Approved 2026-05-12. Implementation complete through Stage F8 (see §17).

---

## 17 · F1–F8 closure (2026-05-12)

What actually shipped — summary for future devs. Numbered references are to the audit punch-list in the implementation log.

### Stores (`core`)

- **`MessagingStore`** (`projects/core/src/lib/stores/messaging.store.ts`) — single signal store. Owns: conversation list, per-conversation message cache + pagination, active id, filter/search, composer drafts, send state + rate-limit + inline error, threat-flags-by-conversation, SSE event fan-in, block/mute/report actions. Auth-transition-only effect (collapses boot's multiple `setUser()` ticks into a single load). 5-second dedup window + 429 backoff on `loadConversations`.
- **`MessagingService`** — HTTP wrapper, no state.
- **`MessagingRealtimeService`** — `EventSource` wrapper. Auto-reconnects with 3s backoff on `CLOSED` (handles stale-JWT case — re-reads token on retry).

### Components (`web/main/messages/`)

- `pages/inbox/inbox-page` — split-view shell, "New message" toggle, **"Reconnecting…" chip when SSE is closed**.
- `pages/empty-state/empty-state` — first-time-here state.
- `components/conversation-list` + `conversation-row` — filtered + searched list using `displayName`/`initialsOf` utils.
- `components/inbox-filters`, `inbox-search-bar` — filter chip row + search input.
- `components/conversation-pane` — right pane. Reads route `:id`, calls `markReadOnEntry` unconditionally (fixes cold-load race), **resets both safety dialogs on conversation switch**.
- `components/chat-header` — back/info buttons + name.
- `components/chat-thread` + `message-bubble` + `day-divider` + `system-event` — scrollable thread, grouped bubbles, pin-to-bottom on send, prepend-preserves-position on older-page load. Thinner scrollbar (6px).
- `components/chat-composer` — Enter sends / Shift+Enter newlines / Esc blurs; 429-aware disable + countdown; inline error from store; **clears `sendError` on next keystroke**.
- `components/threat-banner` — sender-only orange callout when `SendMessageResult.threatFlags.anyFlag` is true; dismissable; lists off-platform contact / payment handles / shorteners.
- `components/dm-detail-rail` — Mute (toggle), Report (opens dialog), Block (opens confirm dialog).
- `components/new-message-picker` — debounced user search + chip + composer in one screen. No separate `/messages/new` route.
- `_dialogs/block-confirm-dialog` — PrimeNG Dialog, reason chip group, calls `store.blockUser`.
- `_dialogs/report-conversation-dialog` — category chips + 1000-char notes textarea, calls `store.reportMessage` with `conversationId`.
- `utils/participant.ts` — `displayName(snapshot, fallback)` / `initialsOf(snapshot)` — single source of truth across all components.

### Realtime contract

| Event | Store action |
|---|---|
| `message.created` | De-dup against optimistic insert; append to active thread; call `markRead` if active and not mine; upsert/refresh inbox row (preview + lastMessageAt + unread bump); fetch full conversation if row is missing entirely. |
| `message.deleted` | Replace body with `[deleted]` tombstone; mirror BE soft-delete shape. |
| `conversation.read` | Clear unread (cross-device read sync — only fires for the reader's own userId). |
| `conversation.muted` | Flip the `muted` flag on the inbox row. |
| `heartbeat` | No-op (health beacon). |

Every non-heartbeat event is acked via `ackStreamEvent(id)` so the BE can prune its per-user replay buffer.

### Audit fixes folded in (post-F6)

- **C1.** Silent-drop ghost conversation eliminated — when `delivered: false` on an existing thread, keep the bubble visible to the sender and show an inline notice; do NOT upsert the synthetic conversation shell or navigate.
- **C2.** 5xx errors propagate to the global ErrorDialog interceptor again (dropped the trailing `catchError(() => EMPTY)` that was masking them).
- **C3.** Block and report dialogs are reset whenever the route `:id` changes — no more leftover dialog pointing at the previous conversation.
- **C4.** SSE auto-reconnects on `CLOSED` after a 3s backoff and re-reads the JWT from `TokenService`, so stale-token disconnects recover transparently after the next REST refresh.
- **H6.** `delivered: false` shows a calm inline notice instead of failing silently.
- **H7.** `sendError` clears on the next keystroke so retries don't show stale failure text.
- **H8.** Inbox header shows a **"Reconnecting…"** chip while `streamStatus === 'closed'`.
- **H10–12.** Removed 6× duplicated display-name/initials logic + 7× repeated `omitKey` patterns + 9× conversation-row `update` patterns via `participant.ts` utils, an `omitKey<T>` helper, and `patchConversation` / `removeConversation` / `dropConversationCaches` private store methods.
- **M13.** `previewFromBody` aligned to the BE's actual truncation (`slice(0, 200)` only — no whitespace collapse, no ellipsis).
- **M17/M20.** Stale doc comment refreshed; `exitComposeMode` now also clears `sendError`.

### Known gaps (deferred — explicit "out of scope" per §15 + 2026-05-12 audit)

- **Blocked-users settings UI.** `MessagingService` exposes `listBlocks()` / `unblock(blockedId)` but no FE surface consumes them. A blocked user has no recovery path until a profile/settings "Blocked users" section lands.
- **Per-message reporting.** BE accepts `messageId` but v1 only reports conversations. Add a kebab on `<mh-message-bubble>` when this is wanted.
- **Group conversations.** Schema-ready, no UI.
- **Typing indicators / presence / attachments.**
- **Admin moderation UI.** Reports go to a BE queue; review tooling is a separate "support tools" feature.

### Smoke + manual verification

Run order for a deploy:

1. `./scripts/messaging-smoke.sh` against the dev API with a real JWT — every route returns the expected status.
2. Open `/messages` in two browser tabs as two users. Send → receive over SSE; mute → unmute; block → conversation disappears + recipient still appears to send (silent drop). Report → success toast.
3. Force-close the API mid-session — inbox shows "Reconnecting…" within ~30s. Restart the API — the chip clears within ~3s and live events resume.

### Test gate

- BE: `npm test -- --testPathPatterns=messaging` → 12 suites / 194 tests passing.
- FE: `npm run build` → green, no warnings on messaging files (existing repo-wide warnings about `quill-delta` ESM + `flag-icons.min.css` location are unrelated and pre-date this feature).
