# API Documentation Organization Guide

> **Problem**: Controllers are cluttered with massive Swagger documentation
> **Solution**: Centralized, reusable documentation in separate files

---

## Table of Contents

1. [The Problem](#the-problem)
2. [The Solution](#the-solution)
3. [How to Use](#how-to-use)
4. [Migration Guide](#migration-guide)
5. [Creating New Documentation](#creating-new-documentation)
6. [Best Practices](#best-practices)
7. [Advanced Patterns](#advanced-patterns)

---

## The Problem

### Before (Cluttered Controller):

```typescript
@Controller('auth')
export class AuthController {
  @ApiEndpoint({
    summary: 'Register a new user',
    description: 'Create a new user account with email and password. Automatically assigns PARTICIPANT role.',
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

  // 20 more lines of docs for each endpoint... 😫
}
```

**Issues:**
- ❌ Controller file is 500+ lines
- ❌ Hard to find actual business logic
- ❌ Documentation duplicated across similar endpoints
- ❌ Hard to maintain and update
- ❌ Difficult to review in PRs

---

## The Solution

### After (Clean Controller):

```typescript
import { AuthDocs } from '@common/docs';

@Controller('auth')
export class AuthController {
  @ApiEndpoint(AuthDocs.register)
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @ApiEndpoint(AuthDocs.login)
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    console.log('loginDto', loginDto);
    return this.authService.login(loginDto);
  }

  @ApiEndpoint(AuthDocs.forgotPassword)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }
}
```

**Benefits:**
- ✅ Controller is clean and focused on logic
- ✅ Easy to read and understand
- ✅ Documentation is centralized and reusable
- ✅ Easy to maintain
- ✅ Better PR reviews

---

## How to Use

### Step 1: Import Documentation

```typescript
// At the top of your controller
import { AuthDocs } from '@common/docs';
// or
import { ProfileDocs, ApiStandardResponses } from '@common/docs';
```

### Step 2: Use in Decorators

```typescript
@ApiEndpoint(AuthDocs.register)  // ← One line instead of 25!
@Post('register')
async register(@Body() dto: RegisterDto) {
  return this.authService.register(dto);
}
```

### Step 3: That's it! 🎉

Your controller is now clean and the docs are centralized.

---

## Migration Guide

### Migrating Existing Controllers

**Step 1: Identify the module**

Your controller: `src/modules/auth/auth.controller.ts`

**Step 2: Check if docs exist**

Look in: `src/common/docs/auth.docs.ts`

If it doesn't exist, create it (see [Creating New Documentation](#creating-new-documentation))

**Step 3: Replace inline docs with imports**

```typescript
// Before
@ApiEndpoint({
  summary: 'Register a new user',
  description: '...',
  // ... 20 more lines
})
@Post('register')
async register() {}

// After
@ApiEndpoint(AuthDocs.register)
@Post('register')
async register() {}
```

**Step 4: Test**

Visit `http://localhost:3000/api` to ensure Swagger docs still work.

---

## Creating New Documentation

### Template for New Module

Let's say you want to create docs for the `Organization` module.

**Step 1: Create the file**

```bash
touch src/common/docs/organization.docs.ts
```

**Step 2: Use this template**

```typescript
/**
 * API Documentation for Organization endpoints
 */

import { ApiEndpointOptions } from '../decorators/api-endpoint.decorator';
import { ApiStandardResponses } from './standard-responses';

export const OrganizationDocs = {
  create: {
    summary: 'Create organization',
    description: 'Create a new organization. Authenticated user becomes the owner.',
    responses: [
      {
        status: 201,
        description: 'Organization created',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'My Fitness Studio',
          description: 'A place for fitness enthusiasts',
          createdAt: '2025-02-10T15:00:00.000Z',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  findAll: {
    summary: 'Get all organizations',
    description: 'Retrieve all organizations the authenticated user is a member of.',
    responses: [
      {
        status: 200,
        description: 'Organizations retrieved',
        example: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Studio 1',
            role: 'OWNER',
          },
          {
            id: '660e8400-e29b-41d4-a716-446655440001',
            name: 'Studio 2',
            role: 'MEMBER',
          },
        ],
      },
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  findOne: {
    summary: 'Get organization details',
    description: 'Retrieve detailed information about a specific organization.',
    responses: [
      {
        status: 200,
        description: 'Organization details retrieved',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'My Fitness Studio',
          description: 'A place for fitness enthusiasts',
          members: [
            { userId: 'user-1', role: 'OWNER', nickname: 'John' },
            { userId: 'user-2', role: 'MEMBER', nickname: 'Jane' },
          ],
          createdAt: '2025-02-10T15:00:00.000Z',
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  update: {
    summary: 'Update organization',
    description: 'Update organization details. Only OWNER and ADMIN can update.',
    responses: [
      {
        status: 200,
        description: 'Organization updated',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Updated Studio Name',
          description: 'Updated description',
          updatedAt: '2025-02-10T16:00:00.000Z',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  delete: {
    summary: 'Delete organization',
    description: 'Soft delete organization. Only OWNER can delete.',
    responses: [
      ApiStandardResponses.NoContent,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,
};
```

**Step 3: Export from index**

```typescript
// src/common/docs/index.ts
export * from './organization.docs';
```

**Step 4: Use in controller**

```typescript
import { OrganizationDocs } from '@common/docs';

@Controller('organizations')
export class OrganizationController {
  @ApiEndpoint(OrganizationDocs.create)
  @Post()
  async create(@Body() dto: CreateOrganizationDto) {
    return this.service.create(dto);
  }

  @ApiEndpoint(OrganizationDocs.findAll)
  @Get()
  async findAll(@GetUser() user: User) {
    return this.service.findAll(user.id);
  }
}
```

---

## Best Practices

### 1. One File Per Module

```
src/common/docs/
├── auth.docs.ts         # Auth endpoints
├── profile.docs.ts      # Profile endpoints
├── organization.docs.ts # Organization endpoints
├── session.docs.ts      # Session endpoints
├── invitation.docs.ts   # Invitation endpoints
└── user.docs.ts         # User endpoints
```

### 2. Use Descriptive Names

```typescript
// ✅ Good
export const AuthDocs = {
  register: { ... },
  login: { ... },
  forgotPassword: { ... },
};

// ❌ Bad
export const AuthDocs = {
  endpoint1: { ... },
  endpoint2: { ... },
};
```

### 3. Reuse Standard Responses

```typescript
// ✅ Good
responses: [
  { status: 200, description: 'Success', example: {...} },
  ApiStandardResponses.Unauthorized,
  ApiStandardResponses.BadRequest,
]

// ❌ Bad (duplicated)
responses: [
  { status: 200, description: 'Success', example: {...} },
  { status: 401, description: 'Unauthorized', example: {...} },
  { status: 400, description: 'Bad Request', example: {...} },
]
```

### 4. Keep Examples Realistic

```typescript
// ✅ Good - realistic data
example: {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'john.doe@example.com',
  firstName: 'John',
  lastName: 'Doe',
}

// ❌ Bad - fake data
example: {
  id: '123',
  email: 'test',
  firstName: 'string',
  lastName: 'string',
}
```

### 5. Document Edge Cases

```typescript
responses: [
  { status: 200, description: 'Success' },
  ApiStandardResponses.Unauthorized,
  ApiStandardResponses.BadRequest,
  { status: 409, description: 'User already has organizer profile' }, // ← Edge case
]
```

---

## Advanced Patterns

### Pattern 1: Shared Response Templates

For endpoints with similar responses:

```typescript
// src/common/docs/templates.ts
export const CRUDResponseTemplates = {
  created: (resourceName: string, example: any) => ({
    status: 201,
    description: `${resourceName} created successfully`,
    example,
  }),

  updated: (resourceName: string, example: any) => ({
    status: 200,
    description: `${resourceName} updated successfully`,
    example,
  }),

  deleted: (resourceName: string) => ({
    status: 204,
    description: `${resourceName} deleted successfully`,
  }),
};

// Usage
export const OrganizationDocs = {
  create: {
    summary: 'Create organization',
    responses: [
      CRUDResponseTemplates.created('Organization', {
        id: '...',
        name: '...',
      }),
      ApiStandardResponses.BadRequest,
    ],
  } as ApiEndpointOptions,
};
```

---

### Pattern 2: Dynamic Documentation

For endpoints with variable responses:

```typescript
// src/common/docs/helpers.ts
export function createPaginatedResponse(itemExample: any) {
  return {
    status: 200,
    description: 'Paginated results',
    example: {
      data: [itemExample],
      meta: {
        total: 100,
        page: 1,
        limit: 10,
        totalPages: 10,
      },
    },
  };
}

// Usage
export const SessionDocs = {
  findAll: {
    summary: 'Get all sessions',
    responses: [
      createPaginatedResponse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Morning Yoga',
        scheduledAt: '2025-02-15T09:00:00.000Z',
      }),
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,
};
```

---

### Pattern 3: Role-Based Documentation

Different docs for different roles:

```typescript
export const OrganizationDocs = {
  // Owner-only endpoint
  delete: {
    summary: 'Delete organization (Owner only)',
    description: 'Permanently delete organization. Only the owner can perform this action.',
    responses: [
      ApiStandardResponses.NoContent,
      ApiStandardResponses.Unauthorized,
      { status: 403, description: 'Only organization owner can delete' },
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  // Admin and Owner
  updateSettings: {
    summary: 'Update organization settings (Admin/Owner)',
    description: 'Modify organization settings. Requires Admin or Owner role.',
    responses: [
      { status: 200, description: 'Settings updated' },
      ApiStandardResponses.Unauthorized,
      { status: 403, description: 'Requires Admin or Owner role' },
    ],
  } as ApiEndpointOptions,
};
```

---

## File Structure

Your final structure should look like:

```
src/common/docs/
├── index.ts                    # Exports everything
├── standard-responses.ts       # Reusable responses
├── templates.ts                # (Optional) Response templates
├── helpers.ts                  # (Optional) Helper functions
├── auth.docs.ts                # Auth endpoint docs
├── profile.docs.ts             # Profile endpoint docs
├── organization.docs.ts        # Organization endpoint docs
├── session.docs.ts             # Session endpoint docs
├── invitation.docs.ts          # Invitation endpoint docs
└── user.docs.ts                # User endpoint docs
```

---

## Migration Checklist

For each controller you migrate:

- [ ] Create corresponding `.docs.ts` file
- [ ] Define all endpoint documentation
- [ ] Export from `index.ts`
- [ ] Import in controller
- [ ] Replace inline `@ApiEndpoint()` with references
- [ ] Test Swagger UI (`/api`)
- [ ] Commit and PR

---

## Example: Complete Migration

### Before

```typescript
// auth.controller.ts (500 lines)
@Controller('auth')
export class AuthController {
  @ApiEndpoint({
    summary: 'Register a new user',
    description: 'Create a new user account...',
    // 20 more lines
  })
  @Post('register')
  async register() {}

  @ApiEndpoint({
    summary: 'Login user',
    description: 'Authenticate user...',
    // 20 more lines
  })
  @Post('login')
  async login() {}

  // ... 10 more endpoints
}
```

### After

```typescript
// auth.controller.ts (150 lines - 70% reduction!)
import { AuthDocs } from '@common/docs';

@Controller('auth')
export class AuthController {
  @ApiEndpoint(AuthDocs.register)
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiEndpoint(AuthDocs.login)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ... 10 more endpoints (all clean!)
}
```

```typescript
// common/docs/auth.docs.ts (maintained separately)
export const AuthDocs = {
  register: {
    summary: 'Register a new user',
    description: 'Create a new user account...',
    // Full documentation here
  },
  login: {
    summary: 'Login user',
    description: 'Authenticate user...',
    // Full documentation here
  },
  // ... all other endpoints
};
```

---

## Troubleshooting

### Issue: Import not working

```typescript
// ❌ Wrong
import { AuthDocs } from 'src/common/docs';

// ✅ Correct (use path alias)
import { AuthDocs } from '@common/docs';
```

Make sure `tsconfig.json` has:
```json
{
  "compilerOptions": {
    "paths": {
      "@common/*": ["src/common/*"]
    }
  }
}
```

---

### Issue: Type error on ApiEndpointOptions

Make sure you're casting:
```typescript
export const AuthDocs = {
  register: {
    // ... your docs
  } as ApiEndpointOptions,  // ← Add this
};
```

---

### Issue: Swagger not showing docs

1. Check file is exported in `index.ts`
2. Restart dev server
3. Clear browser cache
4. Check for TypeScript errors

---

## Next Steps

1. ✅ **Start with Auth module** (already created for you)
2. ✅ **Migrate Profile module** (already created for you)
3. 🔲 **Create docs for Organization module**
4. 🔲 **Create docs for Session module**
5. 🔲 **Create docs for Invitation module**
6. 🔲 **Create docs for User module**

---

## Benefits Summary

**Before:**
- 500-line controllers
- Docs mixed with logic
- Hard to maintain
- Hard to review
- Duplication everywhere

**After:**
- 150-line controllers
- Docs centralized
- Easy to maintain
- Easy to review
- DRY principle applied

**Result:** 70% code reduction in controllers! 🎉

---

**Ready to get started? Migrate your first controller now!**
