# MotionHive API — Code Standards

> This document is the source of truth for how code is written in this repo. Every PR is reviewed against it. CLAUDE.md mirrors a condensed version for AI assistants; this file is the long form for humans.
>
> Last updated: 2026-05-06

---

## How to use this document

- **Writing code**: scan the table of contents, find the section that applies, follow the rule.
- **Reviewing a PR**: if you spot a violation, link to the specific section here in your comment.
- **Disagreeing with a rule**: open a discussion, propose an edit. The doc is the contract; updating it requires a conversation, not a one-off override.
- **Adding a rule**: it must be (a) backed by a real bug or near-miss, (b) testable / detectable in review, (c) not duplicate an existing rule.

---

## Table of contents

1. [Project structure](#1-project-structure)
2. [Module layout](#2-module-layout)
3. [Controllers](#3-controllers)
4. [Services](#4-services)
5. [DTOs](#5-dtos)
6. [Entities (Sequelize models)](#6-entities-sequelize-models)
7. [Transactions](#7-transactions)
8. [Notifications](#8-notifications)
9. [Stripe / external integrations](#9-stripe--external-integrations)
10. [Authentication & authorization](#10-authentication--authorization)
11. [Logging](#11-logging)
12. [Errors](#12-errors)
13. [Pagination](#13-pagination)
14. [Naming conventions](#14-naming-conventions)
15. [Type safety](#15-type-safety)
16. [Tests](#16-tests)
17. [Forbidden patterns](#17-forbidden-patterns)

---

## 1. Project structure

```
src/
├── main.ts                    # Bootstrap: pipes, guards, CORS, raw-body for Stripe
├── app.module.ts              # Root composition: imports all feature modules
├── config/                    # Env validation (Joi), DB config, JWT config
├── common/
│   ├── decorators/            # @ApiEndpoint, @Public, @Roles, @Permissions
│   ├── docs/                  # Per-module Swagger doc objects
│   ├── dto/                   # Shared DTOs (PaginationDto)
│   ├── filters/               # HttpExceptionFilter (global)
│   ├── guards/                # RolesGuard, PermissionsGuard
│   ├── constants/             # Cross-cutting constants (countries.ts)
│   ├── email/                 # Email templates (one file per template)
│   ├── interceptors/          # CamelCaseInterceptor
│   ├── middleware/            # RequestIdMiddleware
│   ├── services/              # Cross-cutting services (Crypto, Email, Cloudinary)
│   ├── utils/                 # Pure helpers
│   └── validators/            # class-validator custom validators
└── modules/
    └── <feature>/
        ├── <feature>.module.ts        # DI wiring
        ├── <feature>.controller.ts    # HTTP layer (THIN)
        ├── <feature>.service.ts       # Business logic
        ├── notifications.ts           # If 2+ notify shapes (optional)
        ├── entities/                  # Sequelize models
        └── dto/                       # Request/response DTOs
```

### Rules

- **Feature code lives under `src/modules/<feature>/`** — never in `common/` or at the `src/` root.
- **Cross-module helpers go in `common/`** only when used by 3+ modules. Two consumers? Co-locate in the producing module.
- **One module per directory.** Do not put two unrelated `@Module()`s in the same folder.

---

## 2. Module layout

A feature module has, at minimum:

```ts
// src/modules/example/example.module.ts
@Module({
  imports: [
    SequelizeModule.forFeature([Example, ExampleChild]),
    OtherModule,                        // only if it exports providers we need
  ],
  controllers: [ExampleController],
  providers: [ExampleService],
  exports: [ExampleService],            // only if other modules need it
})
export class ExampleModule {}
```

### Rules

- **Always pass entities to `SequelizeModule.forFeature([...])`** at the module level. Never use raw Sequelize.
- **Don't list `EmailService` as a provider** — it comes from the global `EmailModule`. Same for `JobsService` (global `JobsModule`) and `NotificationService` (global `NotificationModule`).
- **Do list local helper services** (e.g. `CryptoService`) so they're scoped to the module.
- **Export only what other modules need.** If `XService` is internal to the feature, leave it out of `exports`.
- **Don't import a feature module just to inject one entity.** Use `SequelizeModule.forFeature([OtherEntity])` directly — entity-level injection doesn't require the entity's owner module.

---

## 3. Controllers

Controllers are **thin**. Their only job is: unwrap request → call service → return response.

### Allowed in a controller

- `@Get/@Post/@Patch/@Delete` decorators
- Parameter decorators (`@Body`, `@Query`, `@Param`, `@Request`)
- Pipes on params (`@Param('id', ParseUUIDPipe)`)
- Guards & roles (`@UseGuards`, `@Roles`)
- Throttling (`@Throttle`)
- One Swagger decorator (`@ApiEndpoint(Docs.routeName)`)
- A single `return this.service.method(...)` line, optionally wrapped in a thin response envelope built by the service

### Not allowed in a controller

- DB queries (`@InjectModel`, `findAll`, `update`, etc.)
- Multi-step business logic (more than one service call to coordinate)
- HTML rendering (move to a service that returns `{ html, status }`)
- Field-picking from entities (e.g. `return { id: user.id, email: user.email, ... }` — write a `ServiceClass.toDto(user)` mapper)
- Query-string parsing or clamping (e.g. `Math.min(52, parseInt(weeks))` — use a DTO with `@Min/@Max`)
- Process-local caches (move to the service)
- DTO-shape branching (e.g. `if (dto.userId) ... else if (dto.email) ...` — push to service)
- Reading `ConfigService` (the service should already have it injected)

### Example — good

```ts
// src/modules/group/group.controller.ts
@Get(':id')
@UseGuards(AuthGuard('jwt'))
@ApiEndpoint(GroupDocs.getById)
async getById(
  @Param('id', ParseUUIDPipe) id: string,
  @Request() req: AuthenticatedRequest,
) {
  return this.groupService.getById(id, req.user.id);
}
```

### Example — bad (move to service)

```ts
@Get(':id/recurrence-preview')
async getRecurrencePreview(
  @Param('id') id: string,
  @Query('weeks') weeks?: string,
) {
  // ❌ Parsing + clamping in controller
  const numWeeks = weeks
    ? Math.min(52, Math.max(1, parseInt(weeks, 10) || 12))
    : 12;
  return this.sessionService.getRecurrencePreview(id, numWeeks);
}
```

Replace with:

```ts
// dto/recurrence-preview.dto.ts
export class RecurrencePreviewQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(52)
  weeks?: number = 12;
}

// controller
@Get(':id/recurrence-preview')
async getRecurrencePreview(
  @Param('id', ParseUUIDPipe) id: string,
  @Query() query: RecurrencePreviewQueryDto,
) {
  return this.sessionService.getRecurrencePreview(id, query.weeks ?? 12);
}
```

### Param validation

- **Every UUID path param** uses `@Param('foo', ParseUUIDPipe)`. Bare `@Param('foo') foo: string` lets a malformed UUID 500 in Sequelize.
- **Token / slug params are exempt** (they're not UUIDs).

```ts
// ✅ Good
@Param('id', ParseUUIDPipe) id: string

// ✅ Token is fine without ParseUUIDPipe
@Param('token') token: string

// ❌ Bad — bare UUID param
@Param('id') id: string
```

### Request DTOs

- Every `@Body()` is a DTO class with class-validator decorators.
- Every `@Query()` with > 1 param is a DTO class. A single `?token=xxx` may be `@Query('token') token: string`.
- Never use `@Body() body: any` or `@Query() query: any`.

### Swagger docs

- Use `@ApiEndpoint(<Module>Docs.<route>)` from the module's docs file in `common/docs/`.
- Do not write inline `@ApiEndpoint({summary, description, ...})` blocks in the controller. If a docs file doesn't exist for the module, create one.
- Do not mix `@ApiOperation` / `@ApiResponse` with `@ApiEndpoint`; pick one.

---

## 4. Services

Services hold the business logic. They're testable, injectable, and own the DB.

### Constructor style

Every constructor parameter is `private readonly`. Logger goes last:

```ts
@Injectable()
export class ExampleService {
  constructor(
    @InjectModel(Example)
    private readonly exampleModel: typeof Example,
    private readonly sequelize: Sequelize,
    private readonly otherService: OtherService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}
}
```

- ❌ `private foo: Foo` — drift, fix it
- ❌ `constructor(private foo: Foo, @Inject(...) private logger, private bar: Bar)` — logger should be last
- ✅ `private readonly` for everything

### Method shape

- **Public methods** are the API for controllers and other services. They throw NestJS exceptions, accept primitive args + DTOs, return entities or DTO objects.
- **Private methods** start with a verb describing what they do (`assertOwner`, `notifyOwner`, `buildPaginationOpts`).
- Static helpers that don't need `this` are `static`.

### Service interactions

- A service may inject another service. Use the typed class directly: `private readonly otherService: OtherService`.
- A service may inject another module's entity via `@InjectModel(OtherEntity)`. This is allowed — but if you find yourself doing it for 5+ entities from another module, that's a smell that the work belongs on the other module's service.

### Examples — good

```ts
// src/modules/group/group.service.ts:1351
async transferOwnership(
  groupId: string,
  currentOwnerId: string,
  newOwnerId: string,
): Promise<{ message: string }> {
  const group = await this.assertOwnerAndGet(groupId, currentOwnerId);
  if (currentOwnerId === newOwnerId) {
    throw new BadRequestException('You are already the owner');
  }
  // ... multi-table tx ...
  return { message: 'Ownership transferred successfully' };
}
```

---

## 5. DTOs

DTOs are class-validator + class-transformer classes. One DTO per request shape.

### Rules

- **Decorate every field.** Fields without decorators are silently stripped by ValidationPipe (whitelist mode).
- **`@ApiProperty`** for required fields, `@ApiPropertyOptional` for optional ones — drives Swagger.
- **Numbers from query strings** need `@Type(() => Number)` because Express delivers them as strings.
- **Booleans from query strings** need `@Transform(({ value }) => value === 'true' || value === true)`.
- **List/pagination DTOs** must `extends PaginationDto`. Do not redeclare `page` / `limit`.

### Example

```ts
// src/modules/notification/dto/list-notifications.dto.ts
export class ListNotificationsDto extends PaginationDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  unreadOnly: boolean = false;
}
```

### Common pitfalls

- ❌ `unreadOnly?: boolean = false` without `@Transform` — query strings arrive as `'true'`, not `true`
- ❌ `limit?: number` without `@Type(() => Number)` — comes through as `'20'`
- ❌ Re-declaring `@IsInt() @Min(1) @Max(100) limit?: number` when you could `extends PaginationDto`

---

## 6. Entities (Sequelize models)

```ts
@Table({
  tableName: 'group_member',
  timestamps: true,
  underscored: true,           // snake_case columns
  paranoid: true,              // soft delete (only when needed)
})
export class GroupMember extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;
  // ...
}
```

### Rules

- **`underscored: true`** on every entity. DB columns are snake_case, TS fields are camelCase.
- **CHAR(36) UUID PKs** with `defaultValue: DataType.UUIDV4`.
- **Use `declare`** for instance fields (sequelize-typescript convention).
- **`@Column({ type: DataType.STRING(...), allowNull: false })`** — be explicit about nullability.
- **Nullable Sequelize fields need `| null` in the type**, not `?:`.
- **Paranoid mode** only on user-facing entities where soft-delete matters: `user`, `group`, `session`, `blog_post`, `venue`. Don't paranoid-ize internal join tables.
- **UNIQUE constraints** belong in the migration, not the entity decorator. Document them in a comment near the related field.

### When you need an extra `field:` override

Only when the snake_case auto-rename produces the wrong column name (e.g. legacy column has a non-standard name). Add a comment explaining why.

---

## 7. Transactions

Multi-table writes wrap in a transaction.

### Pattern A — service owns the tx

```ts
async accept(plainToken: string, userId: string): Promise<{ message: string }> {
  // ... validation ...
  const transaction = await this.sequelize.transaction();
  try {
    await this.groupService.addMember(invitation.groupId, userId, transaction);
    await this.roleService.assignRoleToUser(userId, invitation.roleId, ..., transaction);
    await invitation.update({ acceptedAt: new Date() }, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  // After commit: notify, send email, etc. NEVER inside the try block.
  // notify-after-commit: see notification rules below.
}
```

### Pattern B — accept tx from caller

```ts
async addMember(
  groupId: string,
  userId: string,
  externalTransaction?: Transaction,
): Promise<GroupMember> {
  const txOpt = externalTransaction ? { transaction: externalTransaction } : {};
  // ... use txOpt on every ORM call ...
}
```

### Rules

- **Every ORM call inside a tx callback MUST pass `{ transaction: tx }`** — otherwise it commits to the default connection and rollback is a no-op.
- **Webhook handlers receive `tx` from the dispatcher.** They never open their own. They use `outbox` for notifications (see §8).
- **Side effects (notify, email, Cloudinary) go AFTER `tx.commit()`.** A rollback shouldn't fire emails or alerts.
- **Use a single transaction signature per service.** Don't have one method opening its own tx and another accepting `tx?: Transaction` for the same logical operation.

---

## 8. Notifications

Notifications are uniformly delivered via `NotificationService`. Producers don't write object literals; they call **builders**.

### The builder rule

```ts
// ❌ Bad — inline object literal
await this.notificationService.notify({
  userId: payment.clientId,
  type: NotificationType.REFUND_ISSUED,
  title: 'Refund processed',
  body: `A refund of ${formatMoney(amount, currency)} has been issued.`,
  data: { screen: 'profile/invoices', entityId: payment.invoiceId },
});

// ✅ Good — builder co-located with the producer's module
await this.notificationService.notify(
  refundIssuedForClient(payment.clientId, amount, payment.currency, payment.invoiceId),
);
```

Builders live in `<module>/notifications.ts` (e.g. `payment/notifications.ts`, `group/notifications.ts`). They take **primitive arguments** — never Sequelize entities — to avoid partial-load bugs.

### When to add a builder

- **2+ call sites** for the same shape → extract a builder
- **1 call site** → object literal is fine, but use the formatters

### Shared formatters

`notification/format.ts`:

```ts
formatMoney(1234, 'eur')       // → '12.34 EUR'
formatDueDate(new Date(...))    // → '31 Dec 2026' or null
```

### Click targets

`data.screen` must map to a real FE route. The FE bell handler builds:

- `screen: 'groups'` + `entityId: 'abc'` → `/groups/abc`
- `screen: 'profile/invoices'` + `entityId: 'inv-1'` → `/profile/invoices/inv-1`
- `screen: 'profile'` + `queryParams: { tab: 'memberships' }` → `/profile?tab=memberships`

A producer either passes `entityId` (detail route) **OR** `queryParams` (tabbed page) — never both.

### When the recipient lost access

If the notification fires AFTER an action that revokes the recipient's access (removed from group, post deleted), drop `entityId` and route to a list page. Otherwise the click 403s/404s.

```ts
// User was just removed from group — they can't view /groups/<id>
data: { screen: 'groups' }   // lands on the list, not the detail
```

### Direct `notify()` vs Outbox

```ts
// ✅ Direct — service owns its own tx, fire AFTER commit
await this.sequelize.transaction(async (tx) => { ... });
// notify-after-commit: tx already resolved.
await this.notificationService.notify(builder(...));
```

```ts
// ✅ Outbox — webhook handler doesn't own the tx; dispatcher does
await someService.syncStuff(payload, tx, outbox);   // service calls outbox.add(builder(...))
// Dispatcher flushes after commit, discards on rollback.
```

```ts
// ❌ Forbidden — notify INSIDE a transaction callback
await this.sequelize.transaction(async (tx) => {
  await someRow.save({ transaction: tx });
  await this.notificationService.notify(builder(...)); // ← rollback can't undo this
});
```

### Adding a new NotificationType

When introducing a new event:

1. Add the enum value in `notification/notification-types.ts`
2. Map it in `notification/notification-categories.ts` `TYPE_TO_CATEGORY` (Sessions / Coaching / Groups / Payments / Account / Posts)
3. Add a default-channels entry in `notification/notification-defaults.ts` (`IN_APP_ONLY`, `IN_APP_AND_EMAIL`, etc.)
4. Add a builder in `<module>/notifications.ts`

All four steps are required. Skipping #2 or #3 means the type silently falls back to `IN_APP_ONLY`.

---

## 9. Stripe / external integrations

### Stripe

- **`StripeService.buildIdempotencyKey()`** on every Stripe write. Format: `<resource>:<localId>:<op>`.
- **`StripeService.buildFeeParams()`** for `application_fee_amount` — omits the field entirely when 0, never passes an explicit `0`.
- **Webhook raw body** is preserved by `express.raw()` middleware scoped to `/webhooks/stripe` in `main.ts`. Do not register additional body parsers on that path.
- **`webhook_event` table has UNIQUE on `stripe_event_id`** — duplicate replays are caught at insert time and stamped `duplicate: true`.
- **Two-phase save** for Stripe writes that create resources (Product, Invoice, Subscription): insert local row → call Stripe OUTSIDE the DB transaction → backfill Stripe IDs.

### OAuth (Google/Facebook)

- **Idempotency**: `social_account` has UNIQUE on `(provider, provider_user_id)`. `userService.findOrCreateFromOAuth` swallows `UniqueConstraintError` on insert.
- **Account-takeover guard**: when an account already exists for the provider's email AND has a password AND email isn't verified, OAuth link is rejected.

### Resend (email delivery)

- **Idempotent send**: emails are enqueued with `jobId = receipt.id` (BullMQ-level dedup) AND the worker checks `receiptService.isChannelDelivered(receiptId, 'email')` before sending (worker-retry dedup). Both layers are needed — Resend has no idempotency-key support.

### Cloudinary

- Currently no idempotency layer for uploads — every retry uploads again. Avoid retry loops on upload paths until this is hardened.

---

## 10. Authentication & authorization

```ts
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN')
@ApiEndpoint(Docs.foo)
async restrictedRoute(...) {}

@Public()                                           // explicit opt-out of JWT
@Get('public-thing')
async open(...) {}
```

### Rules

- **Default to authenticated.** If a route is public, mark it `@Public()` AND verify there's no PII in the response.
- **`@Roles(...)`** lists role NAMES (`'INSTRUCTOR'`, not `Role.INSTRUCTOR`). The role names must exist in the `role` table seeded by migration 017.
- **Ownership checks belong in the service**, not the guard. The guard answers "is this a valid INSTRUCTOR?" — the service answers "does this INSTRUCTOR own this group?"
- **Cross-tenant userId**: every `userId` in a notification, audit log, or response must derive from a row already keyed to that user. Never trust a userId from request body or a webhook payload's metadata directly.

---

## 11. Logging

Every service that has error paths injects Winston:

```ts
@Inject(WINSTON_MODULE_NEST_PROVIDER)
private readonly logger: LoggerService,
```

Use the two-arg form so the context shows up in the log:

```ts
this.logger.log(`User ${userId} self-joined group ${groupId}`, 'GroupService');
this.logger.warn(`MX lookup failed for ${domain}; allowing signup.`, 'EmailVerifierService');
this.logger.error(`Failed to send: ${err.message}`, 'AuthService');
```

### Rules

- **No `console.log` in business code.** The 3 hits in `app.module.ts`, `config/database.config.ts`, `common/logger/winston.config.ts` are bootstrap-only.
- **Don't log PII.** Email addresses, phone numbers, full names — exclude them. User IDs are fine.
- **Don't log Stripe payloads.** `event.data.object` may contain card last4, customer email — never log it. Log `event.id` + `event.type` only.
- **Don't log auth secrets.** Tokens, password hashes, API keys — exclude.

---

## 12. Errors

Use the NestJS built-in exceptions:

```ts
throw new BadRequestException('Specific reason in lowercase.');
throw new NotFoundException('Resource not found');
throw new ForbiddenException('You do not own this resource');
throw new UnauthorizedException('Invalid credentials');
throw new ConflictException('A pending invitation already exists');
throw new UnprocessableEntityException('Stripe account not yet onboarded');
throw new GoneException('This invitation has expired');
```

### Rules

- **No raw `throw new Error(...)` in business code.** Bootstrap-time guards (env validation, JWT config) may throw `Error`.
- **Never leak Sequelize errors to the client.** Catch `UniqueConstraintError`, translate to `ConflictException` (or treat as success if idempotent).
- **404 over 403** for ownership violations on entities that users shouldn't even know exist (e.g. another instructor's venue). Returning 403 leaks existence.

---

## 13. Pagination

```ts
return buildPaginatedResponse(items, totalItems, page, limit);
// → { items, total, page, pageSize }
```

### Rules

- **`{ items, total, page, pageSize }` is a frontend contract.** Don't change the keys.
- **DTO must `extends PaginationDto`** for `page` / `limit`. Don't re-declare them.
- **Hard-cap limit at 100.** `PaginationDto` does this for you.
- **Cursor-based pagination is allowed** for performance-critical endpoints (search), but the response shape must still be different enough that clients can branch on it (`nextCursor` instead of `page` makes that obvious).

---

## 14. Naming conventions

| Kind | Convention | Example |
|---|---|---|
| File | kebab-case | `create-user.dto.ts` |
| Class | PascalCase + suffix | `UserService`, `CreateUserDto`, `GroupController` |
| Enum type | PascalCase | `InstructorClientStatus` |
| Enum value | UPPER_SNAKE | `InstructorClientStatus.ACTIVE` |
| DB column | snake_case (auto via `underscored: true`) | `instructor_id`, `created_at` |
| TS field | camelCase | `instructorId`, `createdAt` |
| Method | camelCase, verb-first | `findOrCreateFromOAuth`, `assertOwner` |
| Constant | UPPER_SNAKE | `MAX_REFUND_WINDOW_DAYS` |
| Boolean field | starts with `is` / `has` | `isPublic`, `hasInstructorRole` |

---

## 15. Type safety

### Forbidden

- **`any` type.** Use `unknown` + narrowing, or define an interface.
- **`as any` casts.** Fix the type instead.
- **`@ts-ignore`.** Use `@ts-expect-error` with a comment explaining why, or fix it.
- **Implicit `any` in callbacks.** Type the parameters.

### When `unknown` + narrowing is right

```ts
.catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  this.logger.error(msg, 'ContextName');
});
```

### When `as` casts are acceptable

- Casting a Sequelize raw query result through a typed interface: `await sequelize.query<{ id: string }>(...)` — yes
- Casting a Stripe SDK type to bypass type-lag: `subParams as Stripe.SubscriptionCreateParams` — yes, with a comment
- Casting to a more permissive shape so test mocks work: `as unknown as User` — yes, in tests only

### When they're forbidden

- `as any` to silence a real type error you don't want to fix — ❌
- `as any[]` because the array shape is annoying — ❌

---

## 16. Tests

Every service that handles RBAC, money, or external integrations needs a spec. Specs live next to the source: `foo.service.ts` ↔ `foo.service.spec.ts`.

### Spec patterns

- **Mock at the model level** using `makeModelMock()` from `test/helpers/sequelize-mocks.ts`.
- **Mock the transaction** using `makeSequelizeMock()` — runs the callback synchronously with a fake `tx` object.
- **Use `WINSTON_MODULE_NEST_PROVIDER` with `makeSilentLogger()`** so test runs are quiet.
- **Don't test string concatenation.** Test the contract: which builder runs, which type fires, which screen the FE lands on.

### Don't

- Don't call real services that aren't being tested. Mock them.
- Don't use real timers (`setTimeout`). Use `jest.useFakeTimers()` if needed.
- Don't share mutable state between `it()` blocks. Reset in `beforeEach`.
- Don't `describe.only` / `it.only` / `it.skip` in committed code. CI should run everything.

### Coverage expectations

- Producer wiring + builders: tested via service-level specs (the call asserts on `notify` mock received the right builder output).
- Pure functions / formatters: untested. Their callers are tested.
- New service method that handles ownership / money: must come with at least 3 tests (happy path, denied path, edge case).

---

## 17. Forbidden patterns

A short list of patterns that fail review on sight.

| ❌ Bad | ✅ Good |
|---|---|
| `@Param('id') id: string` | `@Param('id', ParseUUIDPipe) id: string` |
| `notify({ userId, type, ... })` | `notify(builder(userId, ...))` |
| `notify(...)` inside `await sequelize.transaction(async tx => { ... })` | Place after the wrapper resolves |
| `private foo: Foo` in constructor | `private readonly foo: Foo` |
| Inline `@ApiEndpoint({summary, ...})` | `@ApiEndpoint(Docs.routeName)` |
| `console.log(...)` in business code | `this.logger.log(...)` |
| `throw new Error(...)` in business code | `throw new BadRequestException(...)` |
| `EmailService` listed in `providers: [...]` | Inject directly (it's `@Global`) |
| Re-declaring `page` + `limit` in a DTO | `extends PaginationDto` |
| `Math.min(52, parseInt(weeks))` in controller | DTO with `@Min(1) @Max(52)` |
| `throw new Error('any').stack` for fancy errors | NestJS exceptions only |
| `as any` to bypass a type error | Fix the type |
| `Op.like` (MySQL syntax) | `Op.iLike` (Postgres) |
| `JSON_CONTAINS(...)` (MySQL) | `?` / `@>` Postgres operators |
| `notify` from a webhook handler without outbox | `outbox.add(...)` then `flush()` post-commit |
| Returning raw entities from a controller endpoint | Return a service-built DTO |

---

## Appendix A — when in doubt

- **Bug in the rule itself** → open a discussion, propose an edit
- **Edge case the rule doesn't cover** → add a comment with `// EXCEPTION: <reason>` and link to the discussion
- **Conflicting signals from this doc and the code** → the doc wins; the code is the bug

---

## Appendix B — how this doc is enforced

- **Code review** is the primary enforcement layer. Every PR is reviewed against this doc.
- **Lint** catches: `no-console`, `no-explicit-any`, `unbound-method` (in non-test code), `@typescript-eslint/no-unused-vars`.
- **Build** catches: type errors, missing exports, broken DI wiring.
- **Tests** catch: regressions in the patterns covered by specs (notification builders, RBAC checks, idempotency).
- **No automated lint rule for**: thin controllers, builder usage, ParseUUIDPipe coverage, notify-after-commit. These are caught in review.

If you find a pattern in this doc that's repeatedly violated, open an issue to consider an ESLint custom rule.
