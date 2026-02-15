# BeeActive API – User Flows & Status

This document describes **all user flows** (registration, login, profile, organizations, invitations, sessions, discovery), the **recurring sessions** rule format and endpoints, and the **status** of known issues. Use it as the single source of truth for understanding API behaviour and for frontend integration.

- **Flows 1–5:** Auth (register, login, **Google/Facebook OAuth**, password reset, refresh, email verification).
- **Flows 6–7:** Profile (participant/organizer, unified update, organizer activation).
- **Flow 8:** Organizations (CRUD, members, leave, delete, discovery, public profile, self-join).
- **Flow 9:** Invitations (send, accept/decline, cancel, resend).
- **Flow 10:** Sessions (create, update, delete, clone, **recurring sessions** with preview and generate-instances).
- **Flow 11:** Session participation (join, leave, confirm, check-in, status updates).
- **Flow 12:** Discovery (organizations, trainers, public profiles).

For **deployment and migrations**, see [DEPLOY.md](./DEPLOY.md).

---

## Flow 1: User Registration

**Status:** ✅ Implemented | 🔧 Improvements Applied

```
User submits (email, password, firstName, lastName, phone)
  │
  ▼
POST /auth/register [Public, Rate: 3/hour]
  │
  ├─ Validate strong password (8+ chars, upper, lower, number, special)
  ├─ Check email uniqueness
  │
  ▼
Transaction:
  ├─ Create User record (password hashed, bcrypt 12 rounds)
  ├─ Assign PARTICIPANT role (global)
  ├─ Create empty ParticipantProfile
  ├─ Generate email verification token (hashed, 24h expiry)
  │
  ▼
Send Emails (via Resend):
  ├─ Email verification email (with verification link)
  ├─ Welcome email
  │
  ▼
Return { accessToken, refreshToken, user }
```

### Issues Found & Fixed
| Issue | Severity | Status |
|-------|----------|--------|
| No email verification endpoint | High | ✅ Fixed - Added POST /auth/verify-email |
| No email verification token generated on register | High | ✅ Fixed - Token generated during registration |
| Welcome email not sent on registration | Medium | ✅ Fixed - Sent via Resend |
| Emails only logged, never sent | High | ✅ Fixed - Resend integration |

### Remaining Improvements (Future)
- [ ] No duplicate registration protection beyond unique email constraint (user-friendly error message)

---

## Flow 2: User Login

**Status:** ✅ Implemented | 🔧 Improvements Applied

```
User submits (email, password)
  │
  ▼
POST /auth/login [Public, Rate: 5/15min]
  │
  ├─ Find user by email
  ├─ Check if account locked (lockedUntil > now?)
  │   └─ YES → Return "Account locked" error
  │
  ├─ Validate password (bcrypt compare)
  │   └─ FAIL → Increment failedLoginAttempts
  │            └─ ≥ 5 attempts → Lock account for 15 min
  │
  ├─ SUCCESS → Reset failedLoginAttempts
  ├─ Update lastLoginAt
  │
  ▼
Return { accessToken (2h), refreshToken (7d), user with roles }
  │
  ▼
Response includes isEmailVerified flag so frontend can prompt verification
```

### Issues Found & Status
| Issue | Severity | Status |
|-------|----------|--------|
| No logout endpoint (token can't be revoked) | High | ⏳ Future - requires refresh_token table usage |
| Refresh tokens not stored server-side | Medium | ⏳ Future - refresh_token table exists in DB |
| No "remember me" functionality | Low | ⏳ Future |
| No refresh token rotation | Medium | ⏳ Future |

---

## Flow 3: Password Reset

**Status:** ✅ Implemented | 🔧 Improvements Applied

```
Step 1: Request Reset
  User submits { email }
    │
    ▼
  POST /auth/forgot-password [Public, Rate: 3/hour]
    │
    ├─ Find user by email (returns success even if not found)
    ├─ Generate 32-byte hex token
    ├─ Hash token (SHA-256), store in passwordResetToken
    ├─ Set passwordResetExpires = now + 1 hour
    │
    ▼
  Send email via Resend with link: ${FRONTEND_URL}/reset-password?token=${plainToken}
  Return { message: "If email exists, reset link sent" }

Step 2: Reset Password
  User submits { token, newPassword }
    │
    ▼
  POST /auth/reset-password [Public, Rate: 5/hour]
    │
    ├─ Hash submitted token (SHA-256)
    ├─ Find user by hashed token + check expiration
    ├─ Validate new password strength
    ├─ Update password (bcrypt hash)
    ├─ Clear passwordResetToken & passwordResetExpires
    │
    ▼
  Return { message: "Password reset successful" }
```

### Issues Found & Status
| Issue | Severity | Status |
|-------|----------|--------|
| Emails only logged, never sent | High | ✅ Fixed - Resend integration |
| After reset, existing JWT tokens not invalidated | High | ⏳ Future - needs token blacklist |
| No notification email confirming password change | Low | ⏳ Future |
| No "change password" endpoint for logged-in users | Medium | ⏳ Future |

---

## Flow 4: Token Refresh

**Status:** ✅ Implemented

```
User submits { refreshToken }
  │
  ▼
POST /auth/refresh [Public, Rate: 10/15min]
  │
  ├─ Verify refresh token signature (JWT_REFRESH_SECRET)
  ├─ Extract userId
  ├─ Find user, verify active
  │
  ▼
Return { new accessToken }
```

### Issues
| Issue | Severity | Status |
|-------|----------|--------|
| No refresh token rotation | Medium | ⏳ Future |
| No token family tracking (theft detection) | Medium | ⏳ Future |

---

## Flow 2b: Sign in with Google (OAuth)

**Status:** ✅ Implemented

Token-based flow: frontend obtains Google ID token (e.g. Google Sign-In / One Tap), sends it to the API. No redirect to the backend.

```
Frontend (e.g. Angular at http://localhost:4200):
  ├─ User clicks "Sign in with Google"
  ├─ Google Sign-In / One Tap returns ID token (JWT)
  │
  ▼
POST /auth/google [Public, Rate: 10/15min]
  Body: { "idToken": "<Google ID token>" }
  │
  ├─ Verify ID token with GOOGLE_CLIENT_ID (google-auth-library)
  ├─ Extract sub (provider user id), email, given_name, family_name
  ├─ Find or create user:
  │   ├─ If social_account exists for (GOOGLE, provider_user_id) → return that user
  │   ├─ If user exists by email → link new social_account, return user
  │   └─ Else → create user (no password, isEmailVerified=true), create social_account, assign PARTICIPANT, create ParticipantProfile
  │
  ▼
Return { accessToken, refreshToken, user } (same shape as login/register)
```

**Requirements:** `GOOGLE_CLIENT_ID` in env. Frontend must use the same Client ID and run on an authorized JavaScript origin (e.g. http://localhost:4200).

---

## Flow 2c: Sign in with Facebook (OAuth)

**Status:** ✅ Implemented (requires `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` in env)

Same token-based pattern as Google: frontend sends Facebook access token; API verifies it and finds or creates user.

```
POST /auth/facebook [Public, Rate: 10/15min]
  Body: { "accessToken": "<Facebook access token>" }
  │
  ├─ Verify token via Graph API debug_token
  ├─ Fetch profile (id, email, first_name, last_name)
  ├─ Find or create user (same logic as Google)
  │
  ▼
Return { accessToken, refreshToken, user }
```

---

## Flow 5: Email Verification

**Status:** ✅ Implemented | 🔧 Improvements Applied

```
Step 1: On Registration (automatic)
  ├─ Generate 32-byte hex verification token
  ├─ Hash token (SHA-256), store in emailVerificationToken
  ├─ Set emailVerificationExpires = now + 24 hours
  ├─ Send verification email via Resend
  │
  ▼

Step 2: User clicks link
  DEV:  GET /auth/verify-email?token=xxx (API directly, returns HTML page)
  PROD: Frontend page calls POST /auth/verify-email { token }
    │
    ├─ Hash submitted token (SHA-256)
    ├─ Find user by hashed token
    ├─ Check expiration (24h)
    ├─ Set isEmailVerified = true
    ├─ Clear verification token & expiry
    │
    ▼
  Return { message: "Email verified successfully" }

Step 3: Resend verification (if needed)
  POST /auth/resend-verification { email } [Public, Rate: 2/hour]
    │
    ├─ Find user by email
    ├─ Check if already verified
    ├─ Generate new token
    ├─ Send new verification email
    │
    ▼
  Return { message: "If email exists and is not verified, a new link was sent" }
```

### Issues Fixed
| Issue | Severity | Status |
|-------|----------|--------|
| Dev/prod email link handling | Medium | ✅ Fixed - Dev links to API, prod to frontend |
| GET endpoint for browser verification | Medium | ✅ Fixed - Returns styled HTML page |

---

## Flow 6: Profile Management

**Status:** ✅ Implemented | 🔧 Improvements Applied

```
User Profile:
  GET    /users/me ─────────────→ Get user data (core fields + roles)
  PATCH  /users/me ─────────────→ Update core fields (name, phone, avatar, language, timezone)
  DELETE /users/me ─────────────→ Delete account (GDPR soft-delete)

Unified Profile Update:
  PATCH  /profile/me ───────────→ Update user + participant + organizer in ONE call

Individual Profiles:
  GET    /profile/me ───────────→ Full profile overview (user + participant + organizer)
  GET    /profile/participant ──→ Get participant profile
  PATCH  /profile/participant ──→ Update participant health/fitness data
  POST   /profile/organizer ───→ Activate organizer profile + assign ORGANIZER role
  GET    /profile/organizer ───→ Get organizer profile
  PATCH  /profile/organizer ───→ Update organizer professional data
```

### Issues Fixed
| Issue | Severity | Status |
|-------|----------|--------|
| No endpoint to update core user fields | High | ✅ Fixed - PATCH /users/me |
| No avatar update endpoint | Medium | ✅ Fixed - avatarId in PATCH /users/me |
| No account deletion endpoint (GDPR) | High | ✅ Fixed - DELETE /users/me |
| No unified profile update | Medium | ✅ Fixed - PATCH /profile/me |

### Remaining (Future)
| Issue | Severity | Status |
|-------|----------|--------|
| No email change flow with re-verification | Medium | ⏳ Future |

---

## Flow 7: Organizer Activation

**Status:** ✅ Implemented

```
Participant wants to become an organizer
  │
  ▼
POST /profile/organizer [Authenticated]
  │
  ├─ Check if organizer profile already exists
  ├─ Create OrganizerProfile record
  ├─ Assign ORGANIZER role (global scope)
  │
  ▼
User can now: create organizations, create sessions
```

### Issues
| Issue | Severity | Status |
|-------|----------|--------|
| No approval process (anyone can self-promote) | Medium | ⏳ Future |
| No way to deactivate organizer status | Low | ⏳ Future |
| Role assigned globally, not org-scoped | Low | By design |

---

## Flow 8: Organization Management

**Status:** ✅ Implemented | 🔧 Improvements Applied

```
Create Organization (requires ORGANIZER role):
  POST /organizations → Create org + add creator as owner + assign org-scoped role
                        Supports: type, isPublic, joinPolicy, contact/location fields

Manage Organization:
  GET    /organizations ──────────→ List my organizations
  GET    /organizations/:id ──────→ Get org details (members only)
  PATCH  /organizations/:id ──────→ Update org (owner only, slug auto-regenerates on name change)
  DELETE /organizations/:id ──────→ Delete org (owner only, soft delete)

Members:
  GET    /organizations/:id/members ─────────→ Paginated member list
  PATCH  /organizations/:id/members/me ──────→ Update own membership (nickname, health sharing)
  DELETE /organizations/:id/members/me ──────→ Leave organization voluntarily
  DELETE /organizations/:id/members/:userId → Remove member (owner only, can't remove owner)

Organization Types: FITNESS, YOGA, DANCE, CROSSFIT, MARTIAL_ARTS, SWIMMING,
                    RUNNING, CYCLING, PILATES, SPORTS_TEAM, PERSONAL_TRAINING, OTHER

Join Policies: OPEN (anyone can join), REQUEST (future: needs approval), INVITE_ONLY (invitation required)
```

### Issues Fixed
| Issue | Severity | Status |
|-------|----------|--------|
| No voluntary leave for members | High | ✅ Fixed - DELETE /organizations/:id/members/me |
| No organization deletion | Medium | ✅ Fixed - DELETE /organizations/:id |
| No slug update when name changes | Low | ✅ Fixed - Auto-regenerates on PATCH |
| No organization types/categories | Medium | ✅ Fixed - `type` field with 12 categories |
| No public/private toggle | High | ✅ Fixed - `isPublic` field |
| No join policy configuration | High | ✅ Fixed - `joinPolicy` (OPEN/REQUEST/INVITE_ONLY) |
| No contact/location info | Medium | ✅ Fixed - contactEmail, contactPhone, address, city, country |

### Remaining (Future)
| Issue | Severity | Status |
|-------|----------|--------|
| No ownership transfer | Medium | ⏳ Future |
| No multi-owner support | Low | ⏳ Future |
| REQUEST join policy (approval workflow) | Medium | ⏳ Future |

---

## Flow 9: Invitation Flow

**Status:** ✅ Implemented | 🔧 Improvements Applied

```
Owner sends invitation:
  POST /invitations → Generate hashed token → Send email via Resend → Return invitation link

Recipient actions:
  GET  /invitations/pending ──────────→ My pending invitations
  POST /invitations/:token/accept ───→ Verify email match → Join org + assign role + notify inviter
  POST /invitations/:token/decline ──→ Mark declined

Owner management:
  POST /invitations/:id/cancel ──────→ Cancel pending invitation (owner only)
  POST /invitations/:id/resend ──────→ Resend with new token (owner only)

Organization view:
  GET /invitations/organization/:id ─→ Org's sent invitations (paginated)
```

### Issues Fixed
| Issue | Severity | Status |
|-------|----------|--------|
| Token stored in plain text | Low | ✅ Fixed - Tokens now hashed (SHA-256) |
| No invitation cancellation/revocation | Medium | ✅ Fixed - POST /invitations/:id/cancel |
| No resend invitation endpoint | Medium | ✅ Fixed - POST /invitations/:id/resend |
| Acceptance doesn't verify email match | High | ✅ Fixed - Email must match invitation |
| No notification to inviter on accept/decline | Medium | ✅ Fixed - Email notification sent |
| No check if invited email is already a member | Medium | ✅ Fixed - Checked before creating invitation |

---

## Flow 10: Session Management (Organizer)

**Status:** ✅ Implemented | 🔧 Improvements Applied

```
Create Session (requires ORGANIZER role):
  POST /sessions → Create session with type, visibility, schedule, capacity
    Optional: isRecurring + recurringRule (see Recurring Sessions below)

Recurring sessions (organizer only):
  GET  /sessions/:id/recurrence-preview?weeks=12 → Upcoming occurrence dates (for calendar)
  POST /sessions/:id/generate-instances { weeks?: 12 } → Create Session rows for next N weeks

Manage:
  GET    /sessions ──────────→ List visible sessions (paginated, visibility rules)
  GET    /sessions/discover ─→ Browse public sessions (search by title/description/location)
  GET    /sessions/:id ──────→ Get session details
  PATCH  /sessions/:id ──────→ Update session (organizer only, notify on cancel)
  DELETE /sessions/:id ──────→ Delete session (organizer only, soft delete, notify participants)
  POST   /sessions/:id/clone → Duplicate session with new date (organizer only)
```

---

### Recurring sessions (detailed)

Recurring sessions let organizers define a **rule** (e.g. “every Monday, Wednesday, Friday at 9:00”) and then **generate** concrete session rows for the next N weeks. The first session created is the **template** (it is a real session with `scheduledAt` = first occurrence). Further occurrences are created by calling **generate-instances** so participants can join each date.

#### Step-by-step flow

| Step | Action | Endpoint | Purpose |
|------|--------|----------|---------|
| 1 | Create template session | `POST /sessions` with `isRecurring: true` and `recurringRule` | Creates the **first** session. `scheduledAt` is the first occurrence time. |
| 2 | (Optional) Preview dates | `GET /sessions/:id/recurrence-preview?weeks=12` | Returns `{ dates: string[] }` (ISO) for the next N weeks. Use in the UI to show a calendar. |
| 3 | Generate future instances | `POST /sessions/:id/generate-instances` body `{ weeks?: 12 }` | Creates one **Session** row per occurrence in the next N weeks. Skips dates that already have a session. Participants can then join each generated session. |

- You can call **generate-instances** right after create, or later (e.g. “Generate more” when the user extends the series).
- **Preview** does not create sessions; it only returns dates. **Generate-instances** creates the actual session records.

#### Recurrence rule format (`recurringRule`)

Sent in the body of `POST /sessions` (and optionally `PATCH /sessions/:id`) when `isRecurring` is true.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `frequency` | `"WEEKLY"` \| `"DAILY"` \| `"MONTHLY"` | Yes | When to repeat. |
| `interval` | number (1–99) | No (default 1) | Every N periods (e.g. `2` = every 2 weeks for WEEKLY). |
| `daysOfWeek` | number[] (0–6) | For WEEKLY only | 0 = Sunday, 1 = Monday, … 6 = Saturday. E.g. `[1, 3, 5]` = Mon, Wed, Fri. If omitted for WEEKLY, the first occurrence’s weekday is used. |
| `endDate` | string (ISO date) | No | Do not generate occurrences after this date. |
| `endAfterOccurrences` | number (1–365) | No | Stop after this many occurrences. Use **either** `endDate` or `endAfterOccurrences`, or neither (then generation is limited by the `weeks` parameter when calling generate-instances). |

**Examples**

- **Every Mon, Wed, Fri at 9:00 until end of June**
  - `scheduledAt`: `"2026-02-17T09:00:00.000Z"` (first Monday)
  - `recurringRule`: `{ "frequency": "WEEKLY", "interval": 1, "daysOfWeek": [1, 3, 5], "endDate": "2026-06-30" }`
- **Every 2 weeks on Tuesday**
  - `recurringRule`: `{ "frequency": "WEEKLY", "interval": 2, "daysOfWeek": [2] }`
- **Every 3 days**
  - `recurringRule`: `{ "frequency": "DAILY", "interval": 3 }`
- **15th of each month**
  - `recurringRule`: `{ "frequency": "MONTHLY", "interval": 1 }` (day comes from `scheduledAt`)

#### Frontend usage

- **Create form:** Let the user pick frequency (WEEKLY/DAILY/MONTHLY), for WEEKLY the days of the week, optional end date or “after N times”, and the first session date/time. Send `isRecurring: true` and `recurringRule` in `POST /sessions`.
- **Calendar view:** Call `GET /sessions/:id/recurrence-preview?weeks=12` and plot the returned `dates` on the calendar (read-only preview).
- **After save:** Call `POST /sessions/:id/generate-instances` with `{ weeks: 12 }` (or your desired range) so future sessions exist for joining. Optionally offer a “Generate more” button that calls the same endpoint again.

---

### Issues Fixed
| Issue | Severity | Status |
|-------|----------|--------|
| No session search/discovery | Medium | ✅ Fixed - GET /sessions/discover |
| No session duplication/cloning | Low | ✅ Fixed - POST /sessions/:id/clone |
| Participants not notified on cancel/delete | Medium | ✅ Fixed - Email notifications sent |
| isRecurring/recurringRule no logic | Medium | ✅ Fixed - create with rule, preview, generate-instances |

### Remaining (Future - JOB SYSTEM)
| Issue | Severity | Status |
|-------|----------|--------|
| No automated status transitions (SCHEDULED → IN_PROGRESS → COMPLETED) | Medium | ⏳ Needs Redis/Bull job system |
| reminderSent field exists but no reminder system | Medium | ⏳ Needs Redis/Bull job system |
| price/currency fields exist but no payment integration | Low | ⏳ Future |

> **NOTE:** TODO comments have been placed in SessionService and SessionModule indicating exactly where job system integration is needed.

---

## Flow 11: Session Participation

**Status:** ✅ Implemented | 🔧 Improvements Applied

```
Join Session:
  POST /sessions/:id/join → Check visibility + capacity → Register → Notify organizer

Confirm Attendance:
  POST /sessions/:id/confirm → REGISTERED → CONFIRMED

Self Check-In:
  POST /sessions/:id/checkin → Available 15 min before to 30 min after session start → ATTENDED

Leave Session:
  POST /sessions/:id/leave → 2-hour cancellation policy → CANCELLED → Notify organizer

Organizer Attendance:
  PATCH /sessions/:id/participants/:userId → Update status (ATTENDED, NO_SHOW, etc.) → Notify participant

Status Flow:
  REGISTERED → CONFIRMED → ATTENDED (showed up)
                          → NO_SHOW (didn't show)
             → CANCELLED (user cancelled within policy)
```

### Issues Fixed
| Issue | Severity | Status |
|-------|----------|--------|
| CONFIRMED status exists but no flow | Low | ✅ Fixed - POST /sessions/:id/confirm |
| No cancellation policy (time-based) | Low | ✅ Fixed - 2-hour cutoff before session |
| No notification to organizer on join/leave | Medium | ✅ Fixed - Email notifications |
| No notification to participant on status change | Medium | ✅ Fixed - Email on status update |
| No participant self-check-in | Low | ✅ Fixed - POST /sessions/:id/checkin |

### Remaining (Future)
| Issue | Severity | Status |
|-------|----------|--------|
| No waitlist when session is full | Low | ⏳ Future |

---

## Flow 12: Discovery & Public Browsing

**Status:** ✅ Implemented | NEW

```
ORGANIZATION DISCOVERY (no auth required):
  GET /organizations/discover → Browse/search public organizations
    │ Filters: ?search=yoga&type=YOGA&city=Bucharest&country=RO&page=1&limit=20
    │ Sorted by: member count (most popular first)
    │
    ▼
  Returns: { data: [{ id, name, slug, description, type, joinPolicy, city, country, memberCount }], meta }

ORGANIZATION PUBLIC PROFILE (no auth required):
  GET /organizations/:id/public → Full public profile page
    │
    ├─ Organization info (name, description, type, location, contact)
    ├─ Trainer info (name, bio, specializations, experience)
    └─ Upcoming sessions (next 10 PUBLIC/MEMBERS sessions)

SELF-JOIN (auth required):
  POST /organizations/:id/join
    │
    ├─ Check: isPublic = true?
    ├─ Check: joinPolicy = OPEN?
    ├─ Check: not already a member?
    │
    ▼
  User becomes a member → can see MEMBERS-visibility sessions

TRAINER DISCOVERY (no auth required):
  GET /profile/trainers/discover → Browse/search public trainers
    │ Filters: ?search=hiit&city=Bucharest&country=RO&page=1&limit=20
    │ Sorted by: years of experience (most experienced first)
    │
    ▼
  Returns: { data: [{ firstName, lastName, displayName, bio, specializations,
                       yearsOfExperience, isAcceptingClients, city, country }], meta }
```

### Frontend Pages This Enables

| Page | Endpoint(s) | Description |
|------|-------------|-------------|
| **Explore page** | `GET /organizations/discover` | Grid/list of public orgs with filters |
| **Organization profile** | `GET /organizations/:id/public` | Landing page for a studio/gym |
| **Join button** | `POST /organizations/:id/join` | One-click join for OPEN orgs |
| **Find a trainer** | `GET /profile/trainers/discover` | Search trainers by specialization |
| **Session marketplace** | `GET /sessions/discover` | Browse public sessions (already existed) |

### User Journey: Participant Finding a Fitness Class

```
1. User opens app (logged in or not)
       │
2. Browse explore page → GET /organizations/discover?type=YOGA&city=Bucharest
       │
3. Click on "Zen Yoga Studio" → GET /organizations/zen-yoga-studio-id/public
       │   Shows: trainer bio, schedule, upcoming classes
       │
4a. If joinPolicy=OPEN → Click "Join" → POST /organizations/:id/join
       │   Now a member! Can see all MEMBERS sessions
       │
4b. If joinPolicy=INVITE_ONLY → "Contact trainer" or get an invitation link
       │
5. Browse sessions → GET /sessions (now sees org sessions too)
       │
6. Join a session → POST /sessions/:id/join
       │
7. Before session → POST /sessions/:id/confirm (optional)
       │
8. At session → POST /sessions/:id/checkin (15 min before to 30 min after)
```

### User Journey: Trainer Setting Up

```
1. Register → POST /auth/register
       │
2. Verify email → click link in email
       │
3. Become organizer → POST /profile/organizer { displayName: "Coach Maria" }
       │
4. Complete profile → PATCH /profile/organizer {
       │     bio, specializations, yearsOfExperience,
       │     isPublic: true,  ← makes discoverable
       │     locationCity, locationCountry, isAcceptingClients
       │   }
       │
5. Create organization → POST /organizations {
       │     name: "Maria's Yoga & Pilates",
       │     type: "YOGA",
       │     isPublic: true,   ← makes discoverable
       │     joinPolicy: "OPEN",  ← anyone can join
       │     city: "Bucharest", country: "RO",
       │     contactEmail, address
       │   }
       │
6. Create sessions → POST /sessions {
       │     visibility: "PUBLIC",  ← shows in session discovery too
       │     ...schedule, capacity, pricing
       │   }
       │
7. Members join automatically or via invitation
       │
8. Manage attendance → PATCH /sessions/:id/participants/:userId { status: "ATTENDED" }
```

---

## Global Issues Summary

| Category | Issue | Severity | Status |
|----------|-------|----------|--------|
| **Email** | Emails only logged to console | **High** | ✅ Fixed - Resend integration |
| **Auth** | No email verification flow | **High** | ✅ Fixed |
| **Auth** | Dev/prod email link handling | Medium | ✅ Fixed |
| **User** | No profile update (name, phone, avatar) | High | ✅ Fixed |
| **User** | No account deletion (GDPR) | High | ✅ Fixed |
| **User** | No unified profile update | Medium | ✅ Fixed |
| **Org** | No voluntary leave for members | High | ✅ Fixed |
| **Org** | No organization deletion | Medium | ✅ Fixed |
| **Org** | No slug update on name change | Low | ✅ Fixed |
| **Invitation** | Tokens stored plain text | Low | ✅ Fixed - Hashed |
| **Invitation** | No cancel/resend/email match | High | ✅ Fixed |
| **Session** | No discovery/search/clone | Medium | ✅ Fixed |
| **Session** | No participant notifications | Medium | ✅ Fixed |
| **Session** | No confirmed/checkin/policy | Medium | ✅ Fixed |
| **Discovery** | No organization discovery/search | High | ✅ Fixed - GET /organizations/discover |
| **Discovery** | No public organization profile | High | ✅ Fixed - GET /organizations/:id/public |
| **Discovery** | No self-join for public orgs | High | ✅ Fixed - POST /organizations/:id/join |
| **Discovery** | No trainer discovery | Medium | ✅ Fixed - GET /profile/trainers/discover |
| **Org** | No organization types/categories | Medium | ✅ Fixed - 12 types |
| **Org** | No public/private toggle | High | ✅ Fixed - isPublic field |
| **Org** | No join policy configuration | High | ✅ Fixed - OPEN/REQUEST/INVITE_ONLY |
| **Auth** | No logout / token revocation | High | ⏳ Future |
| **Auth** | No refresh token rotation | Medium | ⏳ Future |
| **Auth** | Tokens not invalidated on password reset | High | ⏳ Future |
| **User** | No email change flow | Medium | ⏳ Future |
| **Org** | No ownership transfer | Medium | ⏳ Future |
| **Session** | No automated status transitions | Medium | ⏳ Needs job system (Redis/Bull) |
| **Session** | No recurring session logic | Medium | ⏳ Needs job system (Redis/Bull) |
| **Session** | No reminder system | Medium | ⏳ Needs job system (Redis/Bull) |

---

## Job System Requirements (Future)

> The following features require a background job system (Redis + Bull). TODO comments have been placed in the codebase at every location where jobs are needed.

| Feature | Description | Location |
|---------|-------------|----------|
| Session status transitions | SCHEDULED → IN_PROGRESS → COMPLETED based on time | `SessionService.create()` |
| Session reminders | Email/push X hours before scheduledAt | `SessionService.create()` |
| Recurring sessions | Generate instances from recurringRule | `SessionService.create()` |
| Auto NO_SHOW | Mark participants who don't check in | `SessionService` |
| Email notifications | Move all email sending to job queue for reliability | `SessionService`, `InvitationService` |
