# Email Coverage Audit — 2026-05-11

Audit of every state-changing user action across the MotionHive API, mapped against
which actions send an email today and which don't. The goal is to close gaps where a
user reasonably expects an email but doesn't get one.

**Method.** For every controller method that mutates state, we record:
1. Which `EmailService.sendXxx(...)` it calls (the audit truth — if none, no email).
2. Which `notificationService.notify(...)` builder it calls (in-app notification — not the same as email).
3. Who would care (actor, counterparty, owner, both, group, …).
4. Whether it's safe to email today or blocked by a missing pre-req (tx scope, deferred until jobs module, etc.).

---

## TL;DR

- **18** actions send email today (auth, payments, client lifecycle, group invitation, session cancel, feedback, waitlist).
- **11** clear gaps where a user expects an email but doesn't get one — split into **P0** (security / obvious omissions) and **P1** (nice-to-haves).
- **5** deliberate silences — actions where no email is the right call.
- **1** action (session reminder) is template-ready but unwired pending the jobs module.

If we close P0 and P1, total coverage moves from 18 → 29 emails.

---

## 1. Current coverage (DOES send email)

| # | Module | Endpoint | EmailService method | Email template | Recipient | Notes |
|---|---|---|---|---|---|---|
| 1 | auth | `POST /auth/register` → triggers verification | `sendEmailVerification` | `auth/email-verification` | Actor | Sent on register and on `resend-verification` |
| 2 | auth | `POST /auth/verify-email` | `sendWelcomeEmail` | `auth/welcome` | Actor | Sent AFTER verify (not on register) |
| 3 | auth | `POST /auth/forgot-password` | `sendPasswordResetEmail` | `auth/password-reset` | Actor | Time-limited token |
| 4 | auth | `POST /auth/resend-verification` | `sendEmailVerification` | `auth/email-verification` | Actor | Same template as #1 |
| 5 | invitation | `POST /invitations` | `sendInvitationEmail` | `group/invitation` | Invitee email | URL fixed to `/join/{token}` |
| 6 | invitation | `POST /invitations/:token/accept` | `sendInvitationAcceptedEmail` | `group/invitation-accepted` | Inviter | Optional "Open MotionHive" CTA |
| 7 | client | `POST /clients/invite` (new user path) | `sendClientInvitationEmail` | `client/invitation-new-user` | Invitee email | Token-bearing signup link |
| 8 | client | `POST /clients/invite` (existing user path) | `sendExistingUserClientInvitationEmail` | `client/invitation-existing-user` | Invitee | `/profile?tab=coaches&requestId=...` |
| 9 | client | `POST /clients/request/:instructorId` | `sendClientRequestToInstructorEmail` | `client/request-to-instructor` | Instructor | URL fixed to `/coaching/pending-requests` |
| 10 | client | `POST /clients/requests/:id/accept` | `sendClientRequestAcceptedEmail` | `client/request-accepted` | Request sender | |
| 11 | client | `POST /clients/requests/:id/decline` | `sendClientRequestDeclinedEmail` | `client/request-declined` | Request sender | Soft language, no CTA |
| 12 | client | end-of-collaboration paths | `sendCollaborationEndedEmail` | `client/collaboration-ended` | **Both parties** | Branching copy based on `endedBy` |
| 13 | session | `DELETE /sessions/:id` (cancel) | `sendSessionCancelledEmail` | `session/cancelled` | All participants | One email per active participant |
| 14 | session | `PATCH /sessions/:id/participants/:userId` | `sendParticipantStatusEmail` | `session/participant-status` | Affected participant | When status flips |
| 15 | payment | `POST /payments/subscriptions` | `sendSubscriptionSetupEmail` | `subscription/setup` | Client | PSD2-compliant always-confirm |
| 16 | payment | `POST /payments/invoices/:id/send` (override path) | `sendInvoiceEmail` | `invoice/send` | Recipient email | Includes Stripe hosted URL + optional PDF |
| 17 | feedback | `POST /feedback` | `sendFeedbackConfirmation` | `feedback/confirmation` | Submitter | |
| 18 | waitlist | `POST /waitlist` | `sendWaitlistConfirmation` | `waitlist/confirmation` | Submitter | |

Plus `sendNotificationEmail` (generic) — fired by `NotificationService` when an in-app
notification has the email channel enabled per user prefs. Uses
`notification/generic.template.ts`.

---

## 2. Gaps — actions that SHOULD email but don't

Each gap lists the existing in-app notification (if any), the missing email, and how
to wire it without breaking transactional safety.

### P0 — security / obvious omissions

#### Gap 1 — **Password changed (in-app)**
- **Action:** `PATCH /auth/change-password` ([auth.controller.ts:85](src/modules/auth/auth.controller.ts#L85))
- **Today:** No email, no notification. Silent password change is a security incident risk — if an attacker steals a session, the legitimate user has no way to know their password rotated.
- **Recipient:** Actor.
- **Template:** `auth/password-changed.template.ts`, category `update`. Copy: "Your password was changed at <time>. If this wasn't you, reset it now." with a `secondaryButton` to `/auth/forgot-password`.
- **EmailService method:** `sendPasswordChangedEmail(email, changedAt)`.
- **Tx note:** safe — `auth.service.changePassword` is a single-row update, no tx needed; send after the save resolves.
- **Priority:** **P0** — security.

#### Gap 2 — **Group join request received (owner side)**
- **Action:** `POST /groups/:id/join` when `joinPolicy = APPROVAL` ([group.service.ts:894](src/modules/group/group.service.ts#L894))
- **Today:** In-app notification only via `groupJoinRequestReceived(...)` builder (already exists in [notifications.ts:38](src/modules/group/notifications.ts#L38)).
- **Recipient:** Group owner.
- **Template:** `group/join-request-received.template.ts`, category `request`. Use `personCard` for the requester + `buttonRow([approve, decline])`.
- **EmailService method:** `sendGroupJoinRequestReceivedEmail(...)`.
- **Tx note:** owner notify already runs after the join-request insert; pattern in place, just add the email send.
- **Priority:** **P0** — owner needs to act.

#### Gap 3 — **Group member removed (kicked)**
- **Action:** `DELETE /groups/:id/members/:userId` ([group.service.ts:510-538](src/modules/group/group.service.ts#L510))
- **Today:** In-app notification only via `groupMemberRemoved(...)` builder (already exists in [notifications.ts:21](src/modules/group/notifications.ts#L21)).
- **Recipient:** Removed member.
- **Template:** `group/member-removed.template.ts`, category `update`. Soft tone — they might not have expected it.
- **EmailService method:** `sendGroupMemberRemovedEmail(...)`.
- **Tx note:** simple — `removeMember` does a single `member.update({ leftAt })` outside any caller tx.
- **Priority:** **P0** — recipient needs to know they lost access.

#### Gap 4 — **Group member left (silent today!)**
- **Action:** `POST /groups/:id/leave` ([group.service.ts:377](src/modules/group/group.service.ts#L377))
- **Today:** Nothing. No notification, no email. Owner has no idea someone left.
- **Recipient:** Group owner (the member knows what they did, no self-email needed).
- **Builder needed:** `groupMemberLeft(ownerId, group, memberName)` — does NOT exist yet, must be added to [notifications.ts](src/modules/group/notifications.ts).
- **Template:** `group/member-left.template.ts`, category `update`. Tone: matter-of-fact, no guilt-tripping.
- **EmailService method:** `sendGroupMemberLeftEmail(...)`.
- **Tx note:** safe.
- **Priority:** **P0** — this is the gap the user explicitly raised.

#### Gap 5 — **Group ownership transferred**
- **Action:** `POST /groups/:id/transfer-ownership` ([group.service.ts:1421-1433](src/modules/group/group.service.ts#L1421))
- **Today:** In-app notification only via `groupOwnershipTransferredToNewOwner` and `groupOwnershipTransferredFromOldOwner` (both exist in [notifications.ts:87](src/modules/group/notifications.ts#L87)).
- **Recipient:** Both old owner AND new owner — two emails, distinct copy.
- **Templates:** `group/ownership-received.template.ts` (to new owner, category `confirmation`) AND `group/ownership-transferred.template.ts` (to old owner, category `update`). Could be one template with a branching `direction: 'received' | 'given'` param, like `collaboration-ended` does.
- **EmailService method:** `sendGroupOwnershipTransferredEmail({ to, direction, ... })`.
- **Priority:** **P0** — significant authority change, both sides need a record.

#### Gap 6 — **Session rescheduled**
- **Action:** `PATCH /sessions/:id/reschedule` ([session.service.ts:468-525](src/modules/session/session.service.ts#L468))
- **Today:** The code at [line 511](src/modules/session/session.service.ts#L511) has an explicit `// No reschedule template exists yet — log only.` TODO. Participants get only a log line.
- **Recipient:** All active participants (status not CANCELLED/NO_SHOW).
- **Template:** `session/rescheduled.template.ts`, category `time`. Use `dateTimeBlock` with old vs. new time. Mention optional `reason`.
- **EmailService method:** `sendSessionRescheduledEmail({ email, sessionTitle, oldAt, newAt, reason, instructorName })`.
- **Tx note:** runs after `session.update`, fire-and-forget per participant.
- **Priority:** **P0** — explicit TODO in code, schedule changes are time-sensitive.

### P1 — nice-to-haves

#### Gap 7 — **Group join request approved/declined (requester side)**
- **Action:** `PATCH /groups/:id/join-requests/:requestId` ([group.service.ts:1038-1044](src/modules/group/group.service.ts#L1038))
- **Today:** In-app notification via `groupJoinRequestApproved` / `groupJoinRequestRejected` (both exist).
- **Recipient:** Requester.
- **Templates:** `group/join-approved.template.ts` (category `confirmation`) + `group/join-declined.template.ts` (category `update`).
- **Priority:** **P1** — the requester checks back; nice to push the result.

#### Gap 8 — **Group invitation declined (inviter side)**
- **Action:** Whatever endpoint flips an invitation to declined.
- **Today:** In-app via `groupInvitationDeclined(...)` ([notifications.ts:152](src/modules/group/notifications.ts#L152)).
- **Recipient:** Inviter.
- **Template:** Symmetric to existing `group/invitation-accepted` — call it `group/invitation-declined.template.ts`, category `update`.
- **Priority:** **P1**.

#### Gap 9 — **Group member role changed**
- **Action:** Some PATCH on group members.
- **Today:** In-app via `groupMemberRoleChanged(...)` ([notifications.ts:175](src/modules/group/notifications.ts#L175)).
- **Recipient:** Affected member.
- **Template:** `group/role-changed.template.ts`, category `update`. Use `chip` for old/new role.
- **Priority:** **P1** — moderator promotions matter more than member→member shuffles.

#### Gap 10 — **Account deleted**
- **Action:** `DELETE /users/me` ([user.controller.ts:158](src/modules/user/user.controller.ts#L158) → [user.service.ts:566](src/modules/user/user.service.ts#L566))
- **Today:** Nothing.
- **Recipient:** Deleted user (send BEFORE the soft-delete commits, since post-delete the email is on a paranoid row).
- **Template:** `auth/account-deleted.template.ts`, category `confirmation`.
- **Tx note:** **important** — must send before user row is soft-deleted, or capture email first then soft-delete then send. Coordinate with the existing GDPR rework that's pending (see `project_gdpr_erasure_pending.md` memory). Don't ship until the GDPR flow is decided.
- **Priority:** **P1** — GDPR-adjacent, ties into the pending GDPR rework.

#### Gap 11 — **Email changed**
- **Action:** Currently no endpoint exists for changing email. Skip until the FE adds one.
- **Today:** N/A.
- **Future template:** `auth/email-changed.template.ts`, sent to BOTH old and new addresses. Old gets "your email is being changed away from this address", new gets a verification link.
- **Priority:** **P1** but blocked on FE feature.

---

## 3. Deliberate silences (do NOT email)

| Action | Reason |
|---|---|
| `PATCH /users/me` (profile edits) | User did it themselves; no audience. |
| `POST /users/me/avatar` | Same — high frequency, low importance. |
| `PATCH /groups/:id/members/me` (own membership preferences) | Self-directed pref change. |
| Login events (regular sign-in) | Too noisy; only flag *new device / suspicious* login (future feature, not today). |
| Auth refresh / logout | Background plumbing. |

---

## 4. Implementation notes — order, transactions, outbox

**Recommended build order** (each is one PR, self-contained, low coupling):

1. **Auth — password changed.** Smallest, security-flavored, no tx concerns, lays the pattern for `update`-category security emails. Single-recipient.
2. **Group leave → owner email.** Closes the user's explicit ask. Adds the missing `groupMemberLeft` builder alongside the email.
3. **Group member removed.** Builder already exists; just add the email send.
4. **Group join request received.** Builder exists. Owner-facing action email.
5. **Group ownership transferred.** Builder exists for both sides. Two emails per transfer.
6. **Session rescheduled.** Has explicit TODO at [session.service.ts:511](src/modules/session/session.service.ts#L511). Replaces the log with a real email.
7. **Group join approved/declined to requester.** Symmetric to #4.
8. **Group invitation declined → inviter.** Symmetric to existing accepted email.
9. **Group role changed.** Builder exists.
10. **Account deleted.** Wait until GDPR rework lands (see memory `project_gdpr_erasure_pending.md`).

**Transaction safety.** Every email send must be **outside** the Sequelize tx that
mutated the row. The codebase already has the `// notify-after-commit` pattern — grep
for it for examples. For webhook-driven paths use `NotificationOutbox` (
[notification-outbox.ts](src/modules/notification/notification-outbox.ts)).

**Every new EmailService method:**
- Wraps in `try/catch` and never throws — email failures must not turn a 200 into a 500.
- Logs failure via Winston with the recipient and reason.
- Adds a sibling `<name>TemplateText` plain-text export to the template file (we standardized on this in the phase-2 redesign — see [base-layout.ts:782](src/common/email/_layouts/base-layout.ts#L782) `plainTextLayout`).

**Every new template:**
- Lives at `src/common/email/<domain>/<name>.template.ts`.
- Declares a `category` via `baseLayout(content, { category })`.
- Renders an `eyebrow(label, category)` chip at the top of `content`.
- Uses only helpers from `_layouts/base-layout.ts` — no inline `<table>` / `<div>` HTML.
- Escapes every user-controlled string with `escapeHtml`.
- Exports both `<name>Template(...)` and `<name>TemplateText(...)`.
- Adds both exports to [src/common/email/index.ts](src/common/email/index.ts).

---

## 5. After fixes — projected coverage

| Phase | Emails | Coverage delta |
|---|---|---|
| Today | 18 | baseline |
| After P0 (gaps 1-6) | 24 | +6, including critical security + the user's explicit ask |
| After P1 (gaps 7-10) | 28 | +4, polishing |
| After session reminder jobs module ships | 29 | +1 (template already exists, see [session/reminder.template.ts](src/common/email/session/reminder.template.ts)) |

---

## 6. Files referenced

- Email transport: [src/common/services/email.service.ts](src/common/services/email.service.ts)
- Email templates: [src/common/email/](src/common/email/)
- Group notifications: [src/modules/group/notifications.ts](src/modules/group/notifications.ts)
- Group service: [src/modules/group/group.service.ts](src/modules/group/group.service.ts)
- Session reschedule TODO: [src/modules/session/session.service.ts:511](src/modules/session/session.service.ts#L511)
- Auth password change: [src/modules/auth/auth.controller.ts:85](src/modules/auth/auth.controller.ts#L85)
- Account delete: [src/modules/user/user.controller.ts:158](src/modules/user/user.controller.ts#L158)
- Notification outbox: [src/modules/notification/notification-outbox.ts](src/modules/notification/notification-outbox.ts)
- GDPR memory: `project_gdpr_erasure_pending.md` (don't touch account-delete until rework lands)
