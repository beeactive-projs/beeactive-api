# MotionHive — Project Context (BE + FE)

> **Purpose:** single onboarding document for any future Claude session working on MotionHive. Load this once and you have the map: tech stack, repo layout, every module's purpose, the API surface, the FE structure, the conventions that surprise people, and where to look for X.
>
> **Scope:** MotionHive only (the personal project — `beeactive-api` + `beeactive-ui`). **Not Clym.** Those are separate worlds; don't cross the streams.
>
> **How to use this file:** read top-to-bottom on first load; afterwards jump to the relevant section. CLAUDE.md (BE) covers conventions in more depth — this file covers *structure and inventory*. Where they overlap, CLAUDE.md wins.

---

## 0. The two repos

| Repo path | What it is | Framework | Branch |
|---|---|---|---|
| `/Users/ionutbutnaru/Documents/mystuff/beeactive-api` | REST API backend | NestJS 11 + Sequelize 6 + PostgreSQL | `develop` |
| `/Users/ionutbutnaru/Documents/mystuff/beeactive-ui` | Angular 21 frontend (multi-app workspace) | Angular 21 + PrimeNG 21 + Tailwind 4 | — |

The product is **MotionHive**. Both repo directories still say "beeactive" for historical reasons. Stripe metadata, DB column names, and email vars also say "beeactive". **Do not mass-rename** — Stripe stores that metadata on live records and a sed would desync prod. See CLAUDE.md for the full rationale.

---

## 1. Tech stack at a glance

### Backend
- **NestJS 11** (TypeScript, ES2023)
- **Sequelize 6** (sequelize-typescript) + **PostgreSQL** (Neon)
- **Auth:** Passport JWT (@nestjs/jwt 11), bcrypt, Google + Facebook OAuth
- **Queue:** **BullMQ** + @nestjs/bull — Redis-backed; gracefully no-ops without Redis
- **Email:** Resend
- **Images:** Cloudinary
- **Payments:** Stripe 22.x (Connect Express)
- **Docs:** Swagger/OpenAPI at `/api/docs`
- **Logging:** Winston
- **Validation:** Joi (env) + class-validator (DTOs)
- **Security:** Helmet, Throttler, CORS, raw body scoped to Stripe webhook
- **Testing:** Jest 30 (27 suites, ~284 tests)

### Frontend
- **Angular 21** standalone components (no NgModules)
- **PrimeNG 21** + `@primeuix/themes` + custom `MotionHiveLara` preset
- **Tailwind 4** + SCSS
- **State:** Angular **Signals** (no NgRx) with custom Signal stores
- **HTTP:** functional `HttpInterceptorFn` (auth / error / loading)
- **Forms:** Reactive Forms (FormBuilder)
- **i18n:** `@ngx-translate` (web app); `@angular/localize` xlf (website)
- **Charts:** chart.js
- **Editor:** quill (rich text)
- **Phone input:** libphonenumber-js

---

## 2. Repo layouts

### BE — `beeactive-api/src/`
```
config/         database, JWT, env (Joi)
common/         decorators, dto, guards, filters, interceptors, middleware,
                services (Cloudinary, Crypto, Email, EmailVerifier), utils,
                validators, docs/ (22 Swagger docs files), email/ (templates)
modules/        feature modules — one per domain (see §5)
main.ts         bootstrap, Swagger, CORS, Helmet, express.raw for Stripe
app.module.ts   root module, global guards/interceptors via APP_* tokens
```

Plus:
- `migrations/` — numbered SQL files, run by `node migrations/run.js`
- `docs/` — research and architecture docs (this file lives here)

### FE — `beeactive-ui/projects/`
Three Angular projects in one Nx-style workspace:

```
projects/core/      Shared library — models, services, stores, interceptors, guards
projects/web/       Main authenticated app (instructor + client features)
projects/website/   Marketing/public landing site (i18n EN + RO)
```

Build targets per `angular.json`:
- `core` → `@angular/build:ng-packagr` (library)
- `web` → `@angular/build:application`
- `website` → `@angular/build:application` + localize

---

## 3. Cross-cutting conventions

These are the patterns repeated across most modules. Following them by default keeps PRs reviewable.

### 3.1 BE module shape
`module.ts` + `controller.ts` + `service.ts` + `entities/` + `dto/`. Controllers are thin (≤10 lines per handler). Business logic lives in services.

### 3.2 Global BE pipeline (wired in `main.ts` + `app.module.ts`)
- **Global filter:** `HttpExceptionFilter`
- **Global interceptor:** `CamelCaseInterceptor` (`APP_INTERCEPTOR`)
- **Global guard:** `ThrottlerGuard` (`APP_GUARD`, default 100 req/60s)
- **Global pipe:** `ValidationPipe` (whitelist + transform)
- **Middleware:** `RequestIdMiddleware` on all routes
- **Security:** Helmet, CORS (explicit origin list), `express.raw()` scoped to `/webhooks/stripe`

### 3.3 BE pagination contract (frontend contract — do not break)
`buildPaginatedResponse(data, totalItems, page, limit)` returns:
```ts
{ items: T[], total: number, page: number, pageSize: number }
```
List DTOs that paginate **must `extends PaginationDto`**. Every limit param: `@Min(1)`, `@Max(100)`.

### 3.4 BE error shape
NestJS built-in exceptions (`NotFoundException`, `ConflictException`, etc.). Don't throw raw `Error`. `HttpExceptionFilter` normalizes the shape.

### 3.5 BE transactions
All multi-table operations wrap in a Sequelize transaction. Inside webhook handlers, the caller passes `tx` and **every ORM call must include `{ transaction: tx }`**.

### 3.6 BE auth & RBAC
- **Roles:** `SUPER_ADMIN`, `ADMIN`, `SUPPORT`, `INSTRUCTOR`, `WRITER`, `USER`
- `@UseGuards(AuthGuard('jwt'), RolesGuard)` + `@Roles('INSTRUCTOR')`
- `@Public()` for unauthenticated routes
- `OptionalJwtAuthGuard` for routes that have different behavior for authenticated vs anonymous viewers (public profile by handle)

### 3.7 BE Swagger docs
`@ApiEndpoint()` decorator + doc objects in `src/common/docs/<module>.docs.ts` — one file per module. **Inline `@ApiEndpoint({...})` blocks are a code smell.**

### 3.8 BE notifications (the pattern, not the module)
- Producers call `notificationService.notify(builder(...))`. Builders live in `<module>/notifications.ts`. Builders take **primitives**, never Sequelize entities.
- Shared formatters: `notification/format.ts` (`formatMoney`, `formatDueDate`).
- `data.screen` maps to a real FE route; tabbed pages use `data.queryParams`.
- Call `notify()` **after** the surrounding tx commits (see `// notify-after-commit` markers).
- For webhook flows you don't own the tx of, use `NotificationOutbox` + `outbox.add(builder(...))` + `outbox.flush()` post-commit / `outbox.discard()` on rollback.

### 3.9 BE Stripe rules (load-bearing)
- `StripeService.buildFeeParams()` for `application_fee_amount` — **omits the field when 0**, never passes explicit `0`.
- `StripeService.buildIdempotencyKey()` required on all Stripe write ops.
- Webhook raw body via `express.raw()` scoped to `/webhooks/stripe`.
- `webhook_event` table has UNIQUE on `stripe_event_id` → idempotent replays.
- **Two-phase save** for Stripe writes: insert local row → call Stripe outside the DB transaction → backfill Stripe IDs.

### 3.10 BE email idempotency
BullMQ enqueues with `jobId = receipt.id`, AND the worker checks `receiptService.isChannelDelivered(receiptId, 'email')` before sending. Both layers are needed — Resend has no idempotency key.

### 3.11 FE service shape
- One service per BE module under `projects/core/src/lib/services/`.
- Uses `HttpClient`, returns `Observable<T>`, URL = `environment.apiUrl + API_ENDPOINTS.X.Y`.
- Side effects (token store, signal update) in `tap()`. Chains via `switchMap()`.

### 3.12 FE state — Signal stores
- 6 stores under `projects/core/src/lib/stores/` (see §6.3).
- Pattern: `private fooSignal = signal<T>(...)` → `readonly foo = this.fooSignal.asReadonly()` → `readonly derived = computed(...)`.
- Optimistic mutations: update signal immediately, call API in background, recover on error.
- RxJS only where needed (HTTP, polling).

### 3.13 FE HTTP interceptor stack (registered in `app.config.ts`)
1. **authInterceptor** — adds `Authorization: Bearer <token>`; on 401 triggers refresh (shared BehaviorSubject queues pending requests until refresh completes); fallback to login on refresh failure.
2. **errorInterceptor** — maps non-401 errors to friendly messages via `ErrorDialogService`; skips 400/422 (form validation handled by components).
3. **loadingInterceptor** — sets global loading state; opt-out via silent request context.

### 3.14 FE guards
Inject `AuthStore` + `Router`. Roster:
- `authGuard` — requires token; redirects to login with returnUrl
- `instructorGuard`, `superAdminGuard`, `adminGuard`, `writerGuard`, `supportGuard`, `participantGuard` — single-role checks
- `rolesGuard(...roles)` — factory; any-of
- `roleRedirectGuard` — empty-path fallback; routes user to home or login

### 3.15 Naming
- BE file names: **kebab-case**. Classes: **PascalCase + suffix** (`UserService`).
- Enums: `PascalCase` with `UPPER_SNAKE` values.
- DB columns: snake_case (auto via `underscored: true` in Sequelize).
- FE component selectors: prefix `mh` (`mh-instructor-sessions`).

---

## 4. BE — `common/` and `config/`

### `src/config/`
- **database.config.ts** — Sequelize dialect, pooling, logging
- **env.validation.ts** — Joi schema, `abortEarly: false` (see CLAUDE.md for required vars)
- **jwt.config.ts** — JWT secret + expirations

### `src/common/`
| Subdir | Contents |
|---|---|
| `constants/` | `countries.ts` (Stripe Connect whitelist + currency map), `disposable-email-domains.ts` |
| `decorators/` | `api-response.decorator.ts`, `public.decorator.ts`, `roles.decorator.ts`, `permissions.decorator.ts` |
| `dto/` | `pagination.dto.ts`, `filter-settings.dto.ts` (PrimeNG server-side filter shape) |
| `enums/` | `waitlist-role.enum.ts` |
| `filters/` | `http-exception.filter.ts` |
| `guards/` | `roles.guard.ts`, `permissions.guard.ts`, `optional-jwt-auth.guard.ts` |
| `interceptors/` | `camel-case.interceptor.ts` |
| `logger/` | `winston.config.ts` |
| `middleware/` | `request-id.middleware.ts` |
| `services/` | `cloudinary.service.ts`, `crypto.service.ts`, `email.service.ts`, `email-verifier.service.ts` (all with `.spec.ts`) — `EmailService` is exported from `@Global() EmailModule` |
| `types/` | `authenticated-request.ts`, `express.d.ts` |
| `utils/` | `filter.utils.ts`, `html.utils.ts` (`escapeHtml` — mandatory for user-controlled HTML), `image.utils.ts`, `ownership.utils.ts`, `search.utils.ts` |
| `validators/` | `match.validator.ts`, `strong-password.validator.ts` |
| `docs/` | 22 Swagger docs files (one per module) |
| `email/` | One file per template under `<domain>/<name>.template.ts`; shared shell in `_layouts/base-layout.ts`; public surface re-exported from `email/index.ts` |

---

## 5. BE — every module, every endpoint

20 feature modules under `src/modules/`. Endpoints all assume the implicit prefix shown in the path. JWT means `AuthGuard('jwt')`. Throttle annotations are noted where relevant.

### 5.1 `auth` — Authentication & OAuth
Registration, login (email/password + Google/Facebook), refresh tokens, password reset, email verification, account lockout, refresh-token revocation.

**Endpoints (all rate-limited):**
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout` (JWT)
- `DELETE /auth/logout-all` (JWT)
- `PATCH /auth/change-password` (JWT)
- `POST /auth/forgot-password` / `POST /auth/reset-password`
- `POST /auth/verify-email` / `GET /auth/verify-email?token=` (HTML) / `POST /auth/resend-verification`
- `POST /auth/google` / `POST /auth/facebook`

**Entities:** `RefreshToken` (DB-backed, hashed, tracks device/IP).
**Notable:** account lockout (5 failed → 15 min); tokens hashed before storage; OAuth `social_account` UNIQUE `(provider, provider_user_id)` — concurrent-callback race is swallowed.

### 5.2 `user` — User accounts
`GET /users/me`, `PATCH /users/me`, `POST /users/me/avatar` (Cloudinary, 5MB max), `POST /users/me/data-export` (GDPR), `DELETE /users/me` (soft), `GET /users/search?q=&role=&excludeConnected=`.

**Entities:** `User` (paranoid soft-delete, `country_code` + `city` added in mig 027), `SocialAccount`.

### 5.3 `role` — RBAC
**No controller.** Service only. `assignRole`, `getRolesByUserId`, `hasRole`, `createDefaultRoles`. Six entities for the RBAC model.

### 5.4 `profile` — User & instructor profiles
Public discovery, vanity handles, privacy settings, unified profile update.

- `GET /profile/instructors/discover` (no auth)
- `GET /profile/instructors/:id` / `:id/groups` / `:id/reviews` (no auth)
- `GET /profile/instructors/by-handle/:handle` (no auth)
- `GET /profile/users/by-handle/:handle` (OptionalJwt — anonymous sees PUBLIC, coach sees COACHES_ONLY)
- `GET /profile/me` / `PATCH /profile/me` (JWT)
- `PATCH /profile/privacy` / `PATCH /profile/handle` (JWT)
- `POST/GET/PATCH /profile/instructor` (JWT)

**Entities:** `InstructorProfile`, `UserProfile`. Location lives on `user` (not duplicated here).

### 5.5 `group` — Fitness groups
Full CRUD + member management + join requests + join links + transfer ownership + stats + discovery.

Notable routes:
- `GET /groups/discover` (OptionalJwt)
- `POST /groups/:id/join` (rate-limited 10/1min) — instant for OPEN, request for APPROVAL
- `GET /groups/:id/join-requests` / `:id/join-requests/mine` / `PATCH /groups/:id/join-requests/:requestId`
- `GET/POST /groups/:id/members/bulk` / `PATCH /groups/:id/members/:userId/role` / `DELETE /groups/:id/members/:userId`
- `POST/DELETE /groups/:id/join-link` + `POST /groups/join/:token`

**Entities:** `Group`, `GroupMember`, `GroupJoinRequest`.

### 5.6 `session` — Training sessions
**Phase 1 complete (schema only) — 26 endpoints arrive in phases 2–6.**

Hard-rewrite of the old single-table design. Old `session` and `session_participant` tables were dropped by migration 046; replaced by 4 new tables.

**Entities:** `SessionTemplate` (series definition, recurrence rule, pricing, access), `SessionInstance` (one row per occurrence with per-instance overrides + denormalised counters), `SessionParticipant` (booking snapshot — price/cutoff/location immutable post-insert; `attended: boolean|null` replaces old `NO_SHOW` status), `SessionReminderSchedule` (BullMQ job tracking).

See **`docs/research/sessions/SESSIONS_BUILD_SPEC.md`** for the full spec (26 endpoints, 7 services, 7 phases).

### 5.7 `client` — Instructor–client relationships
Two-direction request flow + PrimeNG server-side filtering tables.

- `POST /clients/filter` + `POST /clients/requests/filter` (PrimeNG)
- `GET /clients` / `GET /clients/my-instructors`
- `GET /clients/requests/pending` + `GET /clients/invites` + `GET /clients/invite/:token` (public)
- `POST /clients/invite` (INSTRUCTOR→client) + `POST /clients/request/:instructorId` (client→INSTRUCTOR)
- `POST /clients/requests/:requestId/accept` / `/decline` / `/cancel`
- `POST /clients/requests/accept-by-token` (for new-user signup flow)
- `PATCH/DELETE /clients/:clientId`

**Entities:** `InstructorClient`, `ClientRequest`. 30-day request expiry.

### 5.8 `invitation` — Group join invitations
- `POST /invitations` (rate-limited 20/1hr) + `GET /invitations/pending`
- `POST /invitations/:token/accept` / `/decline`
- `POST /invitations/:id/cancel` / `:id/resend` (3/1hr)
- `GET /invitations/group/:id`

**Entities:** `Invitation`. Tokens hashed. **Note:** acceptance requires a registered account (no auto-create on accept).

### 5.9 `payment` — Stripe Connect (largest module)
8 entities, 9 services, 4 controllers (instructor, client, public, webhook). See **`src/modules/payment/PAYMENT-FLOWS.md`** for end-to-end flows.

**Instructor-facing routes (INSTRUCTOR role):**
- Onboarding: `POST /payments/onboarding/start`, `GET /payments/onboarding/status`, `POST /payments/onboarding/refresh-status`, `POST /payments/onboarding/dashboard-link`
- Products: `POST/GET/PATCH/DELETE /payments/products`, `GET /payments/products/:id`
- Invoices: `POST/GET/PATCH/DELETE /payments/invoices`, `POST /payments/invoices/:id/send`, line-items
- Subscriptions: `POST/GET/PATCH /payments/subscriptions`, `POST /payments/subscriptions/:id/cancel`
- Refunds: `POST /payments/refunds`
- Earnings: `GET /payments/earnings`

**Client-facing routes (any JWT):**
- `GET /payments/me/invoices` + `GET /payments/me/invoices/:id` + `POST /payments/me/invoices/:id/pay`
- `GET /payments/me/subscriptions` + `PATCH /payments/me/subscriptions/:id/billing-address`
- `POST/GET/DELETE/PATCH /payments/me/cards`
- `GET /payments/my/counts` (badges)

**Webhook (public):** `POST /webhooks/stripe` (raw body, signature verified, idempotent via `webhook_event.stripe_event_id` UNIQUE)

**Entities:** `StripeAccount`, `Product`, `Invoice`, `Subscription`, `Payment`, `StripeCustomer`, `WebhookEvent`, `PaymentConsent`.

**Notable:**
- Multi-country Connect: country from `user.country_code`, validated against `common/constants/countries.ts`; locked once `stripe_account` row exists.
- Currency resolution chain: explicit → `stripe_account.default_currency` → country→currency map → `'usd'`.
- 14-day refund window; EU OUG 34/2014 waiver in `payment_consent`.
- Invoices created `DRAFT`; `POST /invoices/:id/send` finalizes (hosted URL + PDF) and emails.
- Invoice line items NOT mirrored locally; fetched on demand.
- Subscription always-confirm: `payment_behavior: 'default_incomplete'` (PSD2 + EU Consumer Rights).
- Two-phase save for all Stripe creates (insert local → Stripe call OUTSIDE tx → backfill).

### 5.10 `notification` — Push, email, in-app
3 controllers (notification, settings, devices), 8 services, 6 entities. Outbox pattern wired.

- `GET /notifications` (paginated) + `GET /notifications/unread-count`
- `PATCH /notifications/:id/read` / `DELETE /notifications/:id`
- `GET/PATCH /notifications/preferences`
- `POST/GET/DELETE /notifications/device-tokens`
- Debug (ADMIN+): `POST /notifications/debug/test-email`, `GET /notifications/debug/categories`

**Entities:** `Notification`, `DeviceToken`, `NotificationReceipt`, plus preferences/outbox tables.

**Notable:**
- Per-channel preferences (user can silence email, keep push).
- Receipts track per-channel delivery status.
- Outbox pattern for async delivery; queued via BullMQ when Redis is up.

### 5.11 `messaging` — DMs + group chat
2 controllers (HTTP + SSE), 9 services (moderation/safety/rate-limit/velocity/content), 11 entities, 15 DTOs. Most-tested module after auth — has `.integration.spec.ts`, `.idor.spec.ts`, `.service.spec.ts`.

- `POST /messaging/messages` (30/1min)
- `GET /messaging/conversations` + `:id` + `:id/messages` (cursor-paginated)
- `PATCH /messaging/conversations/:id/read` + `:id/mute` + `POST :id/leave`
- `DELETE /messaging/messages/:id` (sender soft-delete)
- `GET /messaging/unread-count` (240/1min)
- `POST /messaging/messages/:id/report` + block/unblock + `GET /messaging/blocked`
- **SSE:** `GET /messaging/stream` + `POST /messaging/stream/ack` (idempotent by messageId)
- Admin: `PATCH /messaging/messages/:id/moderate`, reports CRUD

**Entities:** `Conversation`, `ConversationParticipant`, `Message`, `Block`, `Report`, plus rate-limit + safety tables.

### 5.12 `post` — Community feed
Posts (with images), comments, emoji reactions, moderation. Scoped to groups or personal.

- `POST /posts/upload-image` (30/1hr) + `POST /posts` (60/1hr)
- `GET /posts/feed` + `GET /posts/group/:groupId` + `GET /posts/group/:groupId/pending`
- `GET/PATCH/DELETE /posts/:postId` + `PATCH /posts/:postId/moderate`
- `POST/GET /posts/:postId/comments` + `DELETE /posts/:postId/comments/:commentId`
- `POST /posts/:postId/reactions` (240/1hr — toggle)

**Entities:** `Post` (paranoid), `Comment` (paranoid), `Reaction`, `PostReport`.

### 5.13 `review` — Instructor reviews (read-only public)
Single endpoint: `GET /profile/instructors/:id/reviews?page=&limit=`. Mounted under `/profile/...` for URL consistency.

**Entity:** `Review` (rating 1–5).
**Note:** No create/edit/delete endpoints — created via session completion flow or separate admin tool (future).

### 5.14 `blog` — Content / SEO
Public: `GET /blog`, `GET /blog/categories`, `GET /blog/sitemap.xml`, `GET /blog/:slug`.
Authoring (WRITER/ADMIN): `GET /blog/admin`, `GET /blog/admin/:id`, `POST/PATCH/DELETE /blog`, `POST /blog/upload-image`.

**Entity:** `BlogPost` (paranoid, `slug` unique, status `DRAFT | PUBLISHED`).

### 5.15 `analytics`
- `GET /analytics/instructor/summary` (INSTRUCTOR+)
- `GET /analytics/me/activity`
- `GET /analytics/admin/platform` (ADMIN+)

No entities (reads from other modules' tables).

### 5.16 `search` — Global full-text
- `GET /search?q=&type=&limit=` (30/1min)
- Admin: `POST /search/reindex`, `POST /search/reindex/type/:type`

**Entity:** `SearchDoc` (denormalized doc index — created in mig 029).
Indexed types: instructors, groups, sessions (status-driven: drafts/cancelled removed).

### 5.17 `venue`
- `GET/POST /venues` + `GET/PATCH/DELETE /venues/:id` (INSTRUCTOR role, 10/1hr on writes)
- Soft-delete via paranoid + `is_active` archive flag

**Entity:** `Venue` — kinds: `GYM | STUDIO | PARK | OUTDOOR | CLIENT_HOME | ONLINE | OTHER`. Cross-field rules: ONLINE ⇔ `isOnline=true` ⇔ `meetingUrl` required; CLIENT_HOME stores no address. DB-level CHECK constraints back the rules. Ownership returns 404 (not 403) on cross-instructor access.

### 5.18 `feedback`
- `POST /feedback` (no auth, 7/15min)
- `GET /feedback` (ADMIN+)

Submitter-supplied email; userId derived from JWT if authenticated.

### 5.19 `waitlist`
Landing-page email capture (**not** session overflow waitlist — that doesn't exist yet).
- `POST /waitlist` (no auth, 7/15min)
- `GET /waitlist` (ADMIN+) + `GET /waitlist/count` (no auth)

### 5.20 `health`
- `GET /health` (DB connectivity)
- `GET /health/config` (app version, feature flags, force-update flag, maintenance mode)

Controller-only; no service-level logic for the basic ping.

### 5.21 `jobs` — BullMQ producer (special — not a feature module)
Producer-side. Workers run in separate Node processes (`workers/notifications/`).

**Registry:** queue `notifications`, job `notifications.email_send` (payload: receiptId, to, title, body, ctaUrl, ctaLabel). Retry: 5 attempts, exponential backoff (2s base).

**Setup:** only registers if `REDIS_HOST` set. Bull Board at `/admin/queues` if `BULL_BOARD_USER/PASSWORD` set. Gracefully no-ops without Redis (returns null).

**Idempotency:** `jobId` option dedupes re-enqueue.

### Summary table

| Module | Controllers | Services | Entities | DTOs | Key |
|---|---|---|---|---|---|
| auth | 1 | 1 | 1 | 12 | OAuth, JWT, lockout |
| user | 1 | 1 | 2 | 2 | Avatars, GDPR |
| role | 0 | 1 | 6 | 0 | RBAC |
| profile | 1 | 1 | 2 | 8 | Handles, privacy |
| group | 1 | 1 | 3 | 10 | Members, join links |
| **session** | 1 | 1 | 2 | 11 | Recurring, check-in |
| client | 1 | 1 | 2 | 7 | 2-way requests |
| invitation | 1 | 1 | 1 | 1 | Group email invites |
| **payment** | 4 | 9 | 8 | 14 | Stripe Connect |
| notification | 3 | 8 | 6 | 7 | Multi-channel + outbox |
| messaging | 2 | 9 | 11 | 15 | DM/group + SSE |
| post | 1 | 1 | 4 | 7 | Feed + reactions |
| review | 1 | 1 | 1 | 1 | Read-only |
| blog | 1 | 1 | 3 | 5 | SEO + drafts |
| analytics | 1 | 1 | 0 | 0 | Stats |
| search | 1 | 2 | 3 | 3 | Full-text + reindex |
| venue | 1 | 1 | 3 | 4 | Locations |
| feedback | 1 | 1 | 1 | 1 | Anonymous |
| waitlist | 1 | 1 | 1 | 1 | Landing capture |
| health | 1 | 1 | 0 | 0 | DB + config |
| jobs | 0 | 1 | 0 | 0 | BullMQ producer |

---

## 6. FE — `projects/core` shared library

The library is the single contract surface between the apps and the BE. Anything imported from `motionhive/core` (the package name) goes through `projects/core/src/public-api.ts`.

### 6.1 Library directories
```
projects/core/src/lib/
├── components/       Logo
├── constants/        api-endpoints, storage-keys, timezones, countries
├── directives/       (3 — incl. stripe-iframe)
├── enums/            (3)
├── guards/           auth, role (plus factories)
├── interceptors/     auth, error, loading, silent-request.context
├── models/           18 domain folders (52 model files)
├── pipes/            currency-ron, status-label
├── services/         29 services across 20 subfolders
├── stores/           6 Signal stores
├── styles/           CSS, SCSS vars, PrimeNG theme (MotionHiveLara)
├── types/            (1 dir)
└── utils/            url, api-error, cloudinary, group
```

### 6.2 Services (one per BE module, plus a few utilities)
- **Auth:** `auth`, `token`, `google-auth`, `facebook-auth`
- **User / Profile / Client:** `user`, `profile`, `client`
- **Groups / Posts / Blog / Feedback / Waitlist:** `group`, `groups-refresh`, `post`, `blog`, `feedback`, `waitlist`
- **Invitations / Search:** `invitation`, `search`
- **Payment (7 services):** `stripe-onboarding`, `product`, `invoice`, `subscription`, `refund`, `earnings`, `client-payment`
- **Venue / Notification / Messaging:** `venue`, `notification`, `messaging`, `messaging-realtime`
- **Utility:** `error-dialog`, `theme`, `loading`

**Pattern:**
```ts
this._http
  .post<AuthResponse>(`${environment.apiUrl}${API_ENDPOINTS.AUTH.LOGIN}`, dto)
  .pipe(tap(r => this.handleAuthResponse(r)), switchMap(() => this.fetchAndStoreProfile()))
```

### 6.3 Signal stores (6)
- `auth.store` — user identity, roles, computed `isInstructor` / `isAuthenticated`
- `notification.store` — bell list, unread count, polling every 60s (visibility-aware), optimistic mutations
- `messaging.store` — conversation state
- `public-profile.store` — cached public instructor profile
- `recent-searches.store` — search history
- `stripe-onboarding.store` — Stripe Connect onboarding state machine

### 6.4 `constants/api-endpoints.const.ts` — the typed endpoint map
Organized by domain:
- **AUTH** (9): login, register, logout, refresh, google, facebook, forgot/reset-password, resend/verify-email
- **USERS** (4): base, me, me/avatar, search
- **PROFILE** (9): base, instructors (discover, by-handle, :id/groups, :id/reviews), users/by-handle, privacy, handle
- **VENUES** (3): base, :id, :id/archive
- **CLIENTS** (12): base, my-instructors, requests (pending, count, filter), invite (+invites + :token), request, accept-by-token
- **GROUPS** (6): base + discover + bulk members + member role + join requests
- **POSTS** (6): feed, group feed, pending, moderation, comments, reactions
- **SESSIONS** (1): only `/sessions` — **the FE has no per-route session constants yet** (and no session service)
- **BLOG** (4): admin list/detail, public list/detail, image upload
- **FEEDBACK** (1)
- **WAITLIST** (1)
- **INVITATIONS** (2): friend, instructor (stubs — awaiting notifications module wire-up)
- **PAYMENTS** (~20): onboarding, products, invoices (CRUD + send/void/mark-paid + line-items), subscriptions (CRUD + setup-link + cancel), refunds, earnings, client self-service (setup-intent, portal-link, my invoices/subs, counts, public instructor products)
- **NOTIFICATIONS** (6): bell list, unread, read-all, mark-read/clicked/dismissed, detail
- **NOTIFICATION_SETTINGS** (2)
- **DEVICES** (4)
- **MESSAGING** (11): conversations CRUD, messages, blocks, reports, unread-count, stream, stream-ack

### 6.5 `public-api.ts` exports
- All models from 18 domain folders (auth, user, profile, review, venue, client, group, post, common, blog, feedback, search, waitlist, payment, notification, messaging)
- Constants: `api-endpoints`, `storage-keys`, `timezones`, `countries`
- Utils: `url`, `api-error`, `cloudinary`, `group`
- All services
- All stores
- Pipes: `currency-ron`, `status-label`
- Directives: `stripe-iframe`
- Interceptors: `auth`, `error`, `loading`, `silent-request.context`
- Guards: `auth.guard`, `role.guard` (plus role factories)
- Components: `logo`

---

## 7. FE — `projects/web` main app

### 7.1 Top-level routing (`app.routes.ts`)
```
/auth              auth.routes (lazy)
/error             error.routes (lazy)
/photo/:postId     PhotoViewer
/                  main.routes (lazy, authGuard)
```

### 7.2 `main.routes.ts` (the authenticated app)
```
shared (any JWT):
  /home, /explore, /messages, /join/:token,
  /profile, /profile/invoices/:id,
  /groups, /@<handle> (custom matcher — public-profile)

instructor only (instructorGuard):
  /coaching
    overview, clients (+ :id), pending-requests,
    sessions (PLACEHOLDER), payments (lazy), groups (redirect)

user-only:
  /user
    dashboard, instructors (legacy redirect)

activity (any JWT):
  /activity (lazy)

writer/admin (rolesGuard):
  /writer/posts (+ /new, /:id)

super-admin:
  /super-admin (lazy)

fallback:
  ""   roleRedirectGuard → /home or /auth/login
  **   → /error/not-found
```

### 7.3 `projects/web/src/app/` layout
```
_shared/components/   19 reusable: avatar, error-dialog, feedback-dialog,
                       hex-avatar, list-card, loader, location-picker,
                       notification-bell, phone-input, privacy-chooser,
                       profile-fact-row, profile-menu, request-to-be-client-dialog,
                       search-modal, theme-toggle, user-search-autocomplete,
                       waitlist-dialog
layouts/sidenav-layout/  main authenticated shell (sidebar nav)
main/
├── home/             real implementation
├── explore/          real implementation
├── groups/           full CRUD + dialogs (create, edit, invite, join)
├── messages/         pages, components, dialogs (block, report)
├── profile/          tabs (personal info, coaches, groups, settings)
├── public-profile/   read-only instructor profile (reviews, classes)
├── instructor/
│   ├── dashboard/    real (stats, recent activity, charts)
│   ├── clients/      list + detail
│   ├── sessions/     PLACEHOLDER — <p>Sessions works</p>
│   ├── payments/     14 subdirs — full Stripe UI
│   ├── venues/       basic CRUD
│   └── _dialogs/
├── user/
│   ├── dashboard/    client dashboard
│   └── payments/     client invoice/subscription view
├── writer/posts/     blog CRUD (real)
├── super-admin/      routes exist, UI TBD
├── join-group/       token-based join flow
└── main.ts           layout host
pages/
├── auth/             login, sign-up, reset-password, new-password,
                      verify-email, facebook-callback
└── error/            404, 500
photo-viewer/         fullscreen photo modal
app.config.ts         providers + interceptors + PrimeNG theme
app.routes.ts
app.ts                root component
```

### 7.4 Feature maturity (FE)
- **Real:** home, explore, groups (full), messages, profile, instructor dashboard, payments (instructor + client), blog (writer)
- **Placeholder:** sessions (single `<p>` component), super-admin
- **Partial:** venues, writer-admin areas

---

## 8. FE — `projects/website` marketing site

Public, unauthenticated landing site. EN base, RO via `@angular/localize` (`projects/website/src/locale/messages.ro.xlf`).

Routes:
- `/` home
- `/about`
- `/blog` (+ `/:slug`)
- `/tools/calorie-calculator` (free TDEE / macro calculator)
- `/legal` (lazy — privacy, terms, etc.)

---

## 9. BE ↔ FE integration contracts

The "if either side breaks this, things silently rot" list:

1. **Pagination shape:** BE returns `{ items, total, page, pageSize }`. FE tables (PrimeNG) and infinite scrollers expect exactly this.
2. **PrimeNG server-side filter shape:** BE `FilterSettingsDto` matches PrimeNG `LazyLoadEvent` (first, rows, sortField, sortOrder, filters). Used by `/clients/filter`, `/clients/requests/filter`, and any future PrimeNG table.
3. **Auth tokens:** Access token in `Authorization: Bearer`. Refresh token sent in body to `/auth/refresh`. Both have configurable expirations via env. FE refreshes 60s before access-token expiry; on 401 the interceptor pauses pending requests via a shared BehaviorSubject.
4. **OAuth callbacks:** FE pages at `/auth/facebook-callback` (Google uses the Google-issued popup → token-to-BE). BE accepts the id_token / access_token via `POST /auth/google` or `/auth/facebook`.
5. **Camelcase responses:** BE converts snake_case DB columns to camelCase via the global `CamelCaseInterceptor`. FE models assume camelCase.
6. **Stripe Checkout / setup links:** BE returns short-lived URLs; FE redirects via `window.location.href`. Do not embed in iframe.
7. **Notification `data.screen` / `data.queryParams`:** Maps to FE routes. Tabbed pages use `queryParams` (e.g. `screen: 'profile', queryParams: { tab: 'memberships' }`), not entityId in URL.
8. **Notification bell polling:** FE polls `GET /notifications/unread-count` every 60s when tab visible. Don't change cadence on either side without coordination.
9. **SSE stream:** `GET /messaging/stream` is a persistent SSE connection. FE ACKs received messages via `POST /messaging/stream/ack` (idempotent by messageId).
10. **Avatar URL:** Cloudinary URL stored in `user.avatarUrl`. FE shows hex-avatar fallback when null. Image upload via `POST /users/me/avatar` (multipart, 5MB max).

---

## 10. Migrations

Numbered SQL files in `beeactive-api/migrations/`. Run with `npm run migrate` (`node migrations/run.js`). Notable milestones:
- 001–009 — core schema (auth, groups, sessions, profiles, RBAC, blog)
- 011 — auth hardening
- 019 — payment tables (Stripe Connect + invoices)
- 022 — `product.showOnProfile`
- 024 — `invoice.stripe_id` nullable
- 025 — `user.avatarUrl`
- 027 — **location refactor** (drop `user_profile`, add `user.country_code` + `user.city`, drop `instructor_profile.location_*`, create `venue` table, add `session.venue_id` FK)
- 029 — `search_doc` index table
- 032 — pre-ship payment schema cleanup
- 034 — posts
- 035 — notifications foundation
- 036 — posts per group
- 037 — group join requests
- 038 — reviews + user handle + privacy
- 042 — messaging foundation

To get the current list: `ls beeactive-api/migrations/`.

---

## 11. Commands

### BE
```
npm run start:dev        # watch
npm run build
npm run start:prod
npm run lint
npm run migrate          # node migrations/run.js
npm run migrate:fresh    # drop + recreate
npm run railway:start    # build + safe migrate + start (prod)
npm test
npm run test:cov
```

Swagger: `http://localhost:<PORT>/api/docs`.

### FE
The Angular workspace has `web`, `website`, `core`. Typical:
```
ng serve web                  # main app
ng serve website              # marketing
ng build core                 # library
```
(Verify the exact npm scripts in `beeactive-ui/package.json`.)

---

## 12. Known issues & technical debt (BE-side, from CLAUDE.md)

- **Jobs:** BullMQ producer is wired (notifications.email_send), but other producers/workers (session reminders, auto status, recurring generation, expiry cleanup, dunning) are missing.
- **Notifications:** Phase 1 stub for some channels — in-app + email live, push/SMS not.
- **Session overflow waitlist:** not implemented.
- **APPROVAL join policy:** enum exists, not implemented (dead code path).
- **OAuth account linking:** rejects unverified email/password but auto-links to verified accounts without explicit consent.
- **Cascade deletes:** no cascade logic when a user soft-deletes (orphan groups/sessions/relationships). Venues do cascade.
- **Group invitations:** acceptance requires registered account.
- **No batch invite endpoint.**
- **Sessions ↔ venues:** `session.venue_id` exists in DB but not in entity; FE has no venue picker.
- **Incomplete modules:** `role` (service-only, no controller), notification push/SMS.
- **Test coverage:** missing for session, blog, profile, venue, analytics, feedback, waitlist, search.

---

## 13. "Where do I look for X?"

| If you're working on… | Look at… |
|---|---|
| A new BE endpoint | `src/modules/<module>/` + add to `src/common/docs/<module>.docs.ts` |
| A new FE feature page | `projects/web/src/app/main/<area>/` + add route to `main.routes.ts` |
| A new FE shared model | `projects/core/src/lib/models/<domain>/` + export from `public-api.ts` |
| A new FE HTTP service | `projects/core/src/lib/services/<domain>/<name>.service.ts` + export from `public-api.ts` + add endpoint constant to `api-endpoints.const.ts` |
| A new FE signal store | `projects/core/src/lib/stores/<name>.store.ts` + export from `public-api.ts` |
| Adding a notification | `<module>/notifications.ts` builder + call `notificationService.notify(builder(...))` after tx commit |
| Stripe write | `StripeService.buildIdempotencyKey()` + `buildFeeParams()` + two-phase save |
| Email template | `src/common/email/<domain>/<name>.template.ts` + re-export from `src/common/email/index.ts` |
| Migration | `migrations/NNN_<snake>.sql` |
| Sessions deep context | `docs/research/sessions/SESSIONS_CONTEXT.md` |
| Stripe flows deep context | `src/modules/payment/PAYMENT-FLOWS.md` |
| BE conventions (the source of truth) | `CLAUDE.md` (root) |

---

## 14. Things to never do

The minefield. Most of these are in CLAUDE.md too, but worth restating:

- **Don't mass-rename "beeactive" to "motionhive"** — Stripe metadata is keyed off `platform: 'beeactive'` on live records.
- **Don't use `any` in TypeScript.** Prefer `unknown` + narrowing, or define an explicit interface.
- **Don't commit `console.log`.** Use Winston logger.
- **Don't use `Op.like` on PostgreSQL.** Use `Op.iLike` (case-insensitive).
- **Don't use MySQL JSON functions** like `JSON_CONTAINS`. Use PG operators `@>`, `?`, `->`.
- **Don't add features inside controllers.** Push logic into services.
- **Don't list `EmailService` as a provider in feature modules.** It's `@Global()` already.
- **Don't pass explicit `0` to `application_fee_amount`.** Use `StripeService.buildFeeParams()`.
- **Don't call `notify()` inside a Sequelize transaction.** `notify()` opens its own tx; rollback would orphan the alert.
- **Don't change the pagination response shape** (`{ items, total, page, pageSize }`). It's a FE contract.
- **Don't bypass `ParseUUIDPipe`** on UUID params. Bare `@Param('id') id: string` lets a malformed UUID hit Sequelize and 500.
- **Don't add backwards-compat shims** for code you can simply delete.
- **Don't write multi-paragraph docstrings or comment blocks.** One short line max, and only when WHY is non-obvious.
- **Don't add `--no-verify` or `--no-gpg-sign`** to git commits.

---

*Last updated: 2026-05-13. Update this file when adding/renaming a module, when introducing a new cross-cutting pattern, or when the FE/BE integration contract changes. Other research and module-deep-dive docs live next to this file under `docs/`.*
