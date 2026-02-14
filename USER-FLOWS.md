# BeeActive API - User Flows & Status

> Auto-generated flow documentation. Tracks all user flows, their current implementation status, and identified gaps/issues.

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

### Remaining Improvements (Future)
- [ ] Implement logout endpoint using refresh_token table (table already exists in DB)
- [ ] Store refresh tokens server-side for revocation support
- [ ] Add refresh token rotation on each refresh

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

## Flow 5: Email Verification

**Status:** ✅ Implemented (NEW)

```
Step 1: On Registration (automatic)
  ├─ Generate 32-byte hex verification token
  ├─ Hash token (SHA-256), store in emailVerificationToken
  ├─ Set emailVerificationExpires = now + 24 hours
  ├─ Send verification email via Resend
  │
  ▼

Step 2: User clicks link
  POST /auth/verify-email { token } [Public, Rate: 5/hour]
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

---

## Flow 6: Profile Management

**Status:** ✅ Implemented

```
GET /profile/me ─────────────────→ Full profile overview (user + participant + organizer)
GET  /profile/participant ───────→ Get participant profile
PATCH /profile/participant ──────→ Update participant health/fitness data
POST  /profile/organizer ────────→ Activate organizer profile + assign ORGANIZER role
GET  /profile/organizer ─────────→ Get organizer profile
PATCH /profile/organizer ────────→ Update organizer professional data
```

### Issues
| Issue | Severity | Status |
|-------|----------|--------|
| No endpoint to update core user fields (name, email, phone) | High | ⏳ Future |
| No avatar upload endpoint (avatarId field exists) | Medium | ⏳ Future |
| No account deletion endpoint (GDPR) | High | ⏳ Future |
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

**Status:** ✅ Implemented

```
Create Organization (requires ORGANIZER role):
  POST /organizations → Create org + add creator as owner + assign org-scoped role

Manage Organization:
  GET  /organizations ─────────────→ List my organizations
  GET  /organizations/:id ─────────→ Get org details (members only)
  PATCH /organizations/:id ────────→ Update org (owner only)

Members:
  GET  /organizations/:id/members ──────────→ Paginated member list
  PATCH /organizations/:id/members/me ──────→ Update own membership (nickname, health sharing)
  DELETE /organizations/:id/members/:userId → Remove member (owner only, can't remove owner)
```

### Issues
| Issue | Severity | Status |
|-------|----------|--------|
| No ownership transfer | Medium | ⏳ Future |
| No voluntary leave for members | High | ⏳ Future |
| No organization deletion | Medium | ⏳ Future |
| No multi-owner support | Low | ⏳ Future |
| No slug update when name changes | Low | ⏳ Future |

---

## Flow 9: Invitation Flow

**Status:** ✅ Implemented

```
Owner sends invitation:
  POST /invitations → Generate token → Send email → Return invitation link

Recipient actions:
  GET  /invitations/pending ──────────→ My pending invitations
  POST /invitations/:token/accept ───→ Join org + assign role
  POST /invitations/:token/decline ──→ Mark declined

Organization view:
  GET /invitations/organization/:id ─→ Org's sent invitations (paginated)
```

### Issues
| Issue | Severity | Status |
|-------|----------|--------|
| Token stored in plain text (inconsistent with password reset) | Low | ⏳ Future |
| No invitation cancellation/revocation by owner | Medium | ⏳ Future |
| No resend invitation endpoint | Medium | ⏳ Future |
| Acceptance doesn't verify user email matches invitation email | High | ⏳ Future |
| No notification to inviter when accepted/declined | Medium | ⏳ Future |
| No check if invited email is already a member | Medium | ⏳ Future |

---

## Flow 10: Session Management (Organizer)

**Status:** ✅ Implemented

```
Create Session (requires ORGANIZER role):
  POST /sessions → Create session with type, visibility, schedule, capacity

Manage:
  GET  /sessions ──────→ List visible sessions (paginated, visibility rules)
  GET  /sessions/:id ──→ Get session details
  PATCH /sessions/:id ─→ Update session (organizer only)
  DELETE /sessions/:id → Delete session (organizer only, soft delete)
```

| price/currency fields exist but no payment integration | Low | ⏳ Future |

### Issues
| Issue | Severity | Status |
|-------|----------|--------|
| No automated status transitions (SCHEDULED → IN_PROGRESS → COMPLETED) | Medium | ⏳ Future |
| isRecurring/recurringRule fields exist but no logic | Medium | ⏳ Future |
| reminderSent field exists but no reminder system | Medium | ⏳ Future |
| No session search/discovery for public sessions | Medium | ⏳ Future |
| No session duplication/cloning | Low | ⏳ Future |
| Participants not notified on session cancel/delete | Medium | ⏳ Future |

---

## Flow 11: Session Participation

**Status:** ✅ Implemented

```
Join Session:
  POST /sessions/:id/join → Check visibility + capacity → Create participant record

Leave Session:
  POST /sessions/:id/leave → Set status to CANCELLED

Organizer Attendance:
  PATCH /sessions/:id/participants/:userId → Update status (ATTENDED, NO_SHOW, etc.)
```
| No waitlist when session is full | Low | ⏳ Future |

### Issues
| Issue | Severity | Status |
|-------|----------|--------|
| CONFIRMED status exists but no confirmation flow | Low | ⏳ Future |
| No cancellation policy (time-based) | Low | ⏳ Future |
| No notification to organizer on join/leave | Medium | ⏳ Future |
| No notification to participant on status change | Medium | ⏳ Future |
| No participant self-check-in mechanism | Low | ⏳ Future |

---

## Global Issues Summary

| Category | Issue | Severity | Status |
|----------|-------|----------|--------|
| **Email** | Emails only logged to console | **High** | ✅ Fixed - Resend |
| **Auth** | No email verification flow | **High** | ✅ Fixed |
| **Auth** | No logout / token revocation | High | ⏳ Future |
| **Auth** | No refresh token rotation | Medium | ⏳ Future |
| **Auth** | Tokens not invalidated on password reset | High | ⏳ Future |
| **User** | No profile update (name, email, phone) | High | ⏳ Future |
| **User** | No account deletion (GDPR) | High | ⏳ Future |
| **User** | No change-password for logged-in users | Medium | ⏳ Future |
| **Org** | No voluntary leave for members | High | ⏳ Future |
| **Org** | No ownership transfer | Medium | ⏳ Future |
| **Invitation** | No email match verification on accept | High | ⏳ Future |
| **Session** | No automated status transitions | Medium | ⏳ Future |
| **Session** | No participant notifications | Medium | ⏳ Future |
