# Refactored Auth Controller - Before & After

This shows EXACTLY how to refactor your current `auth.controller.ts` using the new documentation system.

---

## Before (Current - Cluttered)

```typescript
// src/modules/auth/auth.controller.ts
import { Controller, Post, Body, Get, UseGuards, Patch } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';
import { ApiStandardResponses } from '@common/docs/standard-responses';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 👎 25 lines of documentation clutter
  @ApiEndpoint({
    summary: 'Register a new user',
    description:
      'Create a new user account with email and password. Automatically assigns PARTICIPANT role.',
    body: RegisterDto,
    responses: [
      {
        status: 201,
        description: 'User successfully registered',
        example: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'user@example.com',
            first_name: 'John',
            last_name: 'Doe',
          },
        },
      },
      ApiStandardResponses.BadRequest,
      { status: 409, description: 'User with this email already exists' },
      ApiStandardResponses.TooManyRequests,
    ],
  })
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // 👎 Another 25 lines for login
  @ApiEndpoint({
    summary: 'Login user',
    description: 'Authenticate user with email and password. Returns JWT access and refresh tokens.',
    body: LoginDto,
    responses: [
      {
        status: 200,
        description: 'Successfully authenticated',
        example: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'user@example.com',
            first_name: 'John',
            last_name: 'Doe',
            roles: ['PARTICIPANT'],
          },
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.TooManyRequests,
    ],
  })
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // 👎 Another 20 lines for refresh
  @ApiEndpoint({
    summary: 'Refresh access token',
    description: 'Generate new access token using refresh token.',
    body: RefreshTokenDto,
    responses: [
      {
        status: 200,
        description: 'New access token generated',
        example: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.BadRequest,
    ],
  })
  @Post('refresh')
  async refreshToken(@Body() refreshDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshDto.refreshToken);
  }

  // ... 5 more endpoints with similar clutter
  // Total: ~400 lines of controller file 😱
}
```

---

## After (Refactored - Clean)

```typescript
// src/modules/auth/auth.controller.ts
import { Controller, Post, Body, Get, UseGuards, Patch } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';
import { AuthDocs } from '@common/docs'; // ← Single import for all docs
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { GetUser } from '@common/decorators/get-user.decorator';
import { User } from '@modules/user/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 👍 ONE line instead of 25!
  @ApiEndpoint(AuthDocs.register)
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // 👍 Clean and focused on logic
  @ApiEndpoint(AuthDocs.login)
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // 👍 Easy to read
  @ApiEndpoint(AuthDocs.refreshToken)
  @Post('refresh')
  async refreshToken(@Body() refreshDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshDto.refreshToken);
  }

  @ApiEndpoint(AuthDocs.forgotPassword)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If email exists, reset link sent' };
  }

  @ApiEndpoint(AuthDocs.resetPassword)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @ApiEndpoint(AuthDocs.logout)
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@GetUser() user: User) {
    return this.authService.logout(user.id);
  }

  @ApiEndpoint(AuthDocs.verifyEmail)
  @Get('verify-email/:token')
  async verifyEmail(@Param('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @ApiEndpoint(AuthDocs.resendVerification)
  @UseGuards(JwtAuthGuard)
  @Post('resend-verification')
  async resendVerification(@GetUser() user: User) {
    return this.authService.resendVerificationEmail(user.email);
  }

  // Total: ~120 lines (70% reduction!) 🎉
}
```

---

## Side-by-Side Comparison

| Aspect | Before | After |
|--------|--------|-------|
| **Lines per endpoint** | ~25 lines | ~1 line |
| **Total controller size** | ~400 lines | ~120 lines |
| **Readability** | Hard to find logic | Easy to scan |
| **Maintainability** | Edit in multiple places | Edit in one place |
| **Reusability** | None | High |
| **PR reviews** | Nightmare | Easy |
| **Code reduction** | - | **70%** ✅ |

---

## Step-by-Step Migration

### 1. Current State (What you have now)

Your `auth.controller.ts` probably looks like the "Before" example above.

### 2. The Files I Created For You

I already created these files in your project:

```
src/common/docs/
├── index.ts                    ← Exports everything
├── standard-responses.ts       ← Reusable error responses
├── auth.docs.ts                ← All auth endpoint docs
└── profile.docs.ts             ← All profile endpoint docs
```

### 3. How to Migrate (5 minutes)

**Step 1:** Open your current `auth.controller.ts`

**Step 2:** Add this import at the top:
```typescript
import { AuthDocs } from '@common/docs';
```

**Step 3:** Replace each endpoint's docs:

From this:
```typescript
@ApiEndpoint({
  summary: 'Register a new user',
  description: '...',
  // ... 20 more lines
})
@Post('register')
```

To this:
```typescript
@ApiEndpoint(AuthDocs.register)
@Post('register')
```

**Step 4:** Repeat for all endpoints:
- `register` → `AuthDocs.register`
- `login` → `AuthDocs.login`
- `refresh` → `AuthDocs.refreshToken`
- `forgot-password` → `AuthDocs.forgotPassword`
- `reset-password` → `AuthDocs.resetPassword`
- `logout` → `AuthDocs.logout`
- `verify-email` → `AuthDocs.verifyEmail`
- `resend-verification` → `AuthDocs.resendVerification`

**Step 5:** Test it
```bash
npm run start:dev
```

Visit: `http://localhost:3000/api`

Your Swagger docs should look exactly the same!

---

## What if I need to customize docs for one endpoint?

You can still override inline:

```typescript
// Use centralized docs for most endpoints
@ApiEndpoint(AuthDocs.login)
@Post('login')
async login() {}

// Override for special case
@ApiEndpoint({
  summary: 'Special endpoint',
  description: 'This one is different',
  responses: [
    { status: 200, description: 'Custom response' }
  ]
})
@Post('special')
async special() {}
```

Or add to the docs file:
```typescript
// src/common/docs/auth.docs.ts
export const AuthDocs = {
  // ... existing docs

  special: {
    summary: 'Special endpoint',
    description: 'This one is different',
    responses: [
      { status: 200, description: 'Custom response' }
    ]
  } as ApiEndpointOptions,
};
```

---

## Creating Docs for Other Modules

### Template

```typescript
// src/common/docs/[module-name].docs.ts
import { ApiEndpointOptions } from '../decorators/api-endpoint.decorator';
import { ApiStandardResponses } from './standard-responses';

export const [ModuleName]Docs = {
  create: {
    summary: 'Create [resource]',
    description: 'Detailed description...',
    responses: [
      {
        status: 201,
        description: '[Resource] created',
        example: {
          // Your example here
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  // Add more endpoints...
};
```

### Example: Session Module

```typescript
// src/common/docs/session.docs.ts
import { ApiEndpointOptions } from '../decorators/api-endpoint.decorator';
import { ApiStandardResponses } from './standard-responses';

export const SessionDocs = {
  create: {
    summary: 'Create session',
    description: 'Create a new session in an organization. User must be organization member.',
    responses: [
      {
        status: 201,
        description: 'Session created',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          organizationId: '660e8400-e29b-41d4-a716-446655440001',
          title: 'Morning Yoga',
          description: 'Relaxing yoga session',
          scheduledAt: '2025-02-15T09:00:00.000Z',
          createdById: '770e8400-e29b-41d4-a716-446655440002',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  joinSession: {
    summary: 'Join session',
    description: 'Join a session as a participant. Session must not have started yet.',
    responses: [
      {
        status: 200,
        description: 'Successfully joined session',
        example: {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          userId: '770e8400-e29b-41d4-a716-446655440002',
          status: 'JOINED',
          joinedAt: '2025-02-10T15:00:00.000Z',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
      { status: 409, description: 'Already joined this session' },
    ],
  } as ApiEndpointOptions,

  leaveSession: {
    summary: 'Leave session',
    description: 'Leave a session. Can rejoin later if session hasn\'t started.',
    responses: [
      {
        status: 200,
        description: 'Successfully left session',
        example: {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          userId: '770e8400-e29b-41d4-a716-446655440002',
          status: 'LEFT',
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,
};
```

Then export and use:

```typescript
// src/common/docs/index.ts
export * from './session.docs';

// src/modules/session/session.controller.ts
import { SessionDocs } from '@common/docs';

@Controller('sessions')
export class SessionController {
  @ApiEndpoint(SessionDocs.create)
  @Post()
  async create(@Body() dto: CreateSessionDto) {
    return this.sessionService.create(dto);
  }

  @ApiEndpoint(SessionDocs.joinSession)
  @Post(':id/join')
  async join(@Param('id') id: string, @GetUser() user: User) {
    return this.sessionService.join(id, user.id);
  }
}
```

---

## Benefits You'll See Immediately

### 1. Cleaner Controllers
- Focus on business logic
- Easy to read and understand
- Better code reviews

### 2. Centralized Documentation
- One place to update docs
- Easier to maintain consistency
- Better documentation quality

### 3. Reusability
- Share response examples
- DRY principle
- Less code duplication

### 4. Better Developer Experience
- Faster to write new endpoints
- Less scrolling
- Better IDE navigation

---

## Quick Start Checklist

- [ ] Review the files I created in `src/common/docs/`
- [ ] Open `auth.controller.ts`
- [ ] Import `AuthDocs` from `@common/docs`
- [ ] Replace first endpoint's docs with `AuthDocs.register`
- [ ] Test in Swagger UI
- [ ] Migrate remaining endpoints
- [ ] Commit changes
- [ ] Create docs for next module (organization, session, etc.)

---

## Need Help?

If you get stuck:

1. Check `DOCUMENTATION-ORGANIZATION-GUIDE.md` for detailed instructions
2. Look at the examples in `src/common/docs/auth.docs.ts`
3. Compare your code with this file
4. Ask in your team chat!

---

**Start with your `auth.controller.ts` right now! 🚀**

In 5 minutes, you'll have a much cleaner controller!
