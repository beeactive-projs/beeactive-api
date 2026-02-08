# 📘 NestJS for Beginners

A practical guide for developers new to NestJS (especially coming from Next.js/Thorin.js).

## 🤔 What is NestJS?

NestJS is a Node.js framework for building scalable server-side applications.

Think of it as:
- **Express.js** (HTTP server) + **Angular** (architecture) = **NestJS**
- Similar to Next.js, but for APIs instead of websites
- More structured than Express, less magic than Rails

## 🏗️ Core Concepts

### 1. Modules

Modules organize your code into logical groups (like packages).

```typescript
@Module({
  imports: [DatabaseModule],      // Use other modules
  controllers: [UserController],  // HTTP endpoints
  providers: [UserService],       // Business logic
  exports: [UserService]          // Share with other modules
})
export class UserModule {}
```

**Analogy**: Like Next.js folders, but explicit:
- `pages/` in Next.js → `@Controller()` in NestJS
- `lib/` in Next.js → `@Injectable()` services in NestJS

### 2. Controllers

Handle HTTP requests (like Next.js API routes).

```typescript
@Controller('users')  // Base path: /users
export class UserController {

  @Get('me')  // GET /users/me
  getProfile() {
    return { name: 'John' };
  }

  @Post('create')  // POST /users/create
  createUser(@Body() data: CreateUserDto) {
    return this.userService.create(data);
  }
}
```

**Next.js equivalent**:
```typescript
// pages/api/users/me.ts
export default function handler(req, res) {
  res.json({ name: 'John' });
}
```

### 3. Services

Business logic (separate from HTTP concerns).

```typescript
@Injectable()  // Can be injected into other classes
export class UserService {
  async findByEmail(email: string) {
    return this.db.user.findOne({ email });
  }

  async createUser(data) {
    return this.db.user.create(data);
  }
}
```

**Why separate?**
- Controller: "What to do" (handle HTTP)
- Service: "How to do it" (business logic)
- Easy to test services without HTTP

### 4. Dependency Injection (DI)

NestJS automatically creates and injects dependencies.

```typescript
@Controller('users')
export class UserController {
  constructor(
    private userService: UserService,  // Auto-injected!
  ) {}

  @Get('me')
  getProfile() {
    return this.userService.findMe();  // Use injected service
  }
}
```

**You don't write**:
```typescript
const userService = new UserService();  // ❌ Don't do this!
```

**NestJS does it for you** based on `@Injectable()` and module `providers`.

**Benefits**:
- Easy testing (inject mock services)
- Singleton pattern (one instance shared everywhere)
- Loose coupling

### 5. DTOs (Data Transfer Objects)

Define the shape of request/response data.

```typescript
export class CreateUserDto {
  @IsEmail()        // Validates email format
  @IsNotEmpty()     // Cannot be empty
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

Use in controller:
```typescript
@Post('register')
register(@Body() dto: CreateUserDto) {
  // dto is validated automatically!
  return this.authService.register(dto);
}
```

**Next.js equivalent**:
```typescript
// You'd manually validate:
export default function handler(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  // ... more validation
}
```

**NestJS**: Validation is automatic via `@ValidationPipe`.

### 6. Guards

Protect routes (like middleware, but more structured).

```typescript
@UseGuards(AuthGuard('jwt'))  // Require JWT token
@Get('profile')
getProfile(@Request() req) {
  // req.user is populated by guard
  return req.user;
}
```

**How it works**:
1. Guard checks if JWT token is valid
2. If valid, extracts user and attaches to `req.user`
3. If invalid, throws 401 Unauthorized

**Next.js equivalent**:
```typescript
export default async function handler(req, res) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyToken(token);
  // ... continue
}
```

### 7. Middleware

Runs before route handlers (like Express middleware).

```typescript
export class LoggerMiddleware implements NestMiddleware {
  use(req, res, next) {
    console.log(`${req.method} ${req.url}`);
    next();  // Continue to next middleware/handler
  }
}
```

Apply globally:
```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
```

### 8. Pipes

Transform or validate data.

```typescript
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) {
  // id is automatically converted to number!
  return this.service.findOne(id);
}
```

**Built-in pipes**:
- `ValidationPipe` - Validates DTOs
- `ParseIntPipe` - Converts string to number
- `ParseBoolPipe` - Converts string to boolean

### 9. Decorators

Add metadata to classes/methods (like annotations in Java).

**Common decorators**:
- `@Module()` - Define a module
- `@Controller()` - Define a controller
- `@Injectable()` - Mark as injectable service
- `@Get()`, `@Post()`, etc. - HTTP method
- `@Body()` - Get request body
- `@Param()` - Get URL parameter
- `@Query()` - Get query string
- `@Headers()` - Get headers
- `@Request()` / `@Req()` - Get full request object

### 10. Async/Await

NestJS is async-first.

```typescript
@Get('users')
async getUsers() {
  // Can use await
  const users = await this.userService.findAll();
  return users;
}
```

Or return Promise:
```typescript
@Get('users')
getUsers(): Promise<User[]> {
  return this.userService.findAll();
}
```

NestJS handles both!

## 🔄 Request Lifecycle

What happens when a request comes in:

```
1. HTTP Request arrives
       ↓
2. Middleware runs (RequestIdMiddleware)
       ↓
3. Guards check (AuthGuard, RolesGuard)
       ↓
4. Interceptors (before) - modify request
       ↓
5. Pipes - validate/transform data (ValidationPipe)
       ↓
6. Route Handler - your controller method
       ↓
7. Interceptors (after) - modify response
       ↓
8. Filters - catch exceptions (HttpExceptionFilter)
       ↓
9. HTTP Response sent
```

## 📂 Project Structure

```
src/
├── common/                 # Shared code
│   ├── decorators/         # Custom decorators
│   ├── filters/            # Exception filters
│   ├── guards/             # Auth guards
│   ├── middleware/         # Middleware
│   └── pipes/              # Custom pipes
│
├── config/                 # Configuration files
│   ├── database.config.ts
│   └── jwt.config.ts
│
├── modules/                # Feature modules
│   ├── auth/
│   │   ├── dto/            # DTOs
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   │
│   └── user/
│       ├── dto/
│       ├── entities/       # Database models
│       ├── user.controller.ts
│       ├── user.service.ts
│       └── user.module.ts
│
├── app.module.ts           # Root module
└── main.ts                 # Entry point
```

## 🆚 Next.js vs NestJS

| Aspect | Next.js | NestJS |
|--------|---------|--------|
| **Purpose** | Full-stack React apps | Backend APIs |
| **Routing** | File-based (`pages/`) | Decorator-based (`@Get()`) |
| **API Routes** | `pages/api/` | `@Controller()` |
| **Rendering** | SSR, SSG, CSR | N/A (API only) |
| **Database** | You choose | You choose (Sequelize, Prisma, etc.) |
| **Structure** | Loose (flexible) | Strict (opinionated) |
| **DI** | No | Yes (built-in) |

## 🎯 Common Patterns

### Pattern 1: CRUD Resource

```typescript
// user.controller.ts
@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
```

### Pattern 2: Protected Routes

```typescript
@Controller('users')
export class UserController {
  // Public route
  @Get('public')
  getPublicData() {
    return { message: 'This is public' };
  }

  // Protected route (requires JWT)
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getProfile(@Request() req) {
    return req.user;
  }

  // Role-based route
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Get('admin')
  getAdminData() {
    return { message: 'Admin only' };
  }
}
```

### Pattern 3: Error Handling

```typescript
@Injectable()
export class UserService {
  async findOne(id: string) {
    const user = await this.userModel.findByPk(id);

    if (!user) {
      // Throw HTTP exception
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }
}
```

## 🧪 Testing

NestJS has built-in testing support.

```typescript
describe('UserController', () => {
  let controller: UserController;
  let service: UserService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ id: 1, name: 'Test' }),
          },
        },
      ],
    }).compile();

    controller = module.get(UserController);
    service = module.get(UserService);
  });

  it('should return user', async () => {
    expect(await controller.findOne('1')).toEqual({ id: 1, name: 'Test' });
  });
});
```

## 📚 Learn More

- [Official Docs](https://docs.nestjs.com)
- [NestJS Fundamentals Course](https://courses.nestjs.com)
- [Awesome NestJS](https://github.com/juliandavidmr/awesome-nestjs)

## 💡 Tips

1. **Use CLI**: `nest g controller users`, `nest g service users`
2. **Enable auto-import** in VS Code (saves time!)
3. **Use TypeScript strictly** (don't use `any`)
4. **Follow naming conventions**: `*.controller.ts`, `*.service.ts`, `*.module.ts`
5. **Keep controllers thin**: Move logic to services
6. **Use DTOs**: Always validate inputs
7. **Use Guards**: For authentication/authorization
8. **Use Pipes**: For validation/transformation
9. **Use Filters**: For error handling
10. **Read the docs**: NestJS docs are excellent!

## 🎓 Next Steps

1. Build a simple CRUD API
2. Add authentication (JWT)
3. Add database (Sequelize/Prisma)
4. Add validation (class-validator)
5. Add testing (Jest)
6. Add documentation (Swagger)
7. Deploy to Railway/Heroku/AWS

---

**Welcome to NestJS!** 🎉

You'll love its structure and TypeScript support!
