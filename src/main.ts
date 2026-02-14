import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Bootstrap Function
 *
 * This is the entry point of the application.
 * It:
 * 1. Creates the NestJS application
 * 2. Configures security middleware (helmet, CORS)
 * 3. Enables validation and sanitization
 * 4. Sets up Swagger documentation
 * 5. Enables API versioning
 * 6. Starts the HTTP server
 * 7. Sets up graceful shutdown handlers
 */
async function bootstrap() {
  // Create NestJS application
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs until logger is ready
  });

  // Replace default logger with Winston
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // ✅ SECURITY: Apply global exception filter
  // Catches all errors and formats them consistently
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  // ✅ SECURITY: Enable Helmet for HTTP security headers
  // Sets headers like:
  // - X-Content-Type-Options: nosniff
  // - X-Frame-Options: DENY
  // - Strict-Transport-Security (HSTS)
  // - Content-Security-Policy (CSP)
  app.use(
    helmet({
      // Disable CSP for Swagger UI to work
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production' ? undefined : false,
      // HSTS: Force HTTPS in production
      hsts: process.env.NODE_ENV === 'production',
    }),
  );

  // ✅ SECURITY: Global validation and sanitization
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error if extra properties
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Convert string to number if DTO expects number
      },
      // Note: class-sanitizer is applied automatically via class-validator
    }),
  );

  // API prefix removed — routes are /auth/login, /users/me, etc.
  // If you need versioning later, add: app.setGlobalPrefix('v1');

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('BeeActive API')
    .setDescription(
      `
# BeeActive Fitness Platform API

A comprehensive REST API for managing fitness training sessions, trainers, and clients.

---

## User Journey Flow

### 1. Registration & Login
- **POST /auth/register** — Create account (auto-assigned PARTICIPANT role)
- Verify email via link (GET /auth/verify-email in dev, frontend in prod)
- **POST /auth/login** — Get JWT access + refresh tokens

### 2. Complete Your Profile
- **GET /profile/me** — See your full profile overview
- **PATCH /profile/me** — Update user + participant + organizer in one call
- **PATCH /profile/participant** — Update health & fitness data

### 3. Become an Organizer
- **POST /profile/organizer** — Activate organizer profile (gets ORGANIZER role)
- **PATCH /profile/organizer** — Fill in professional details (bio, specializations)

### 4. Create an Organization
- **POST /organizations** — Create your fitness studio/gym (requires ORGANIZER role)
- You become the OWNER with org-scoped ORGANIZER role
- **PATCH /organizations/:id** — Update details (slug auto-regenerates on name change)

### 5. Invite Members
- **POST /invitations** — Send invitation to someone's email
- They receive an email and can accept/decline
- **POST /invitations/:token/accept** — Invitee accepts and joins the org

### 6. Create & Manage Sessions
- **POST /sessions** — Create training sessions (linked to your org). Supports recurring: set \`isRecurring\` and \`recurringRule\` (frequency, daysOfWeek, endDate). See USER-FLOWS.md § Flow 10 for the full rule format.
- **GET /sessions/:id/recurrence-preview?weeks=12** — Preview upcoming occurrence dates (for calendar UI)
- **POST /sessions/:id/generate-instances** — Create session rows for the next N weeks from a recurring template
- **GET /sessions/discover** — Browse public sessions
- **POST /sessions/:id/clone** — Duplicate a session for another date

### 7. Participate in Sessions
- **POST /sessions/:id/join** — Register for a session
- **POST /sessions/:id/confirm** — Confirm your attendance
- **POST /sessions/:id/checkin** — Self check-in (15 min before to 30 min after)
- **POST /sessions/:id/leave** — Cancel (2-hour cancellation policy)

---

## Features
- JWT-based auth with refresh tokens
- Role-based access (PARTICIPANT, ORGANIZER, ADMIN)
- Email via Resend (verification, password reset, invitations)
- Session management with visibility rules (PRIVATE, MEMBERS, PUBLIC)
- Organization management with membership & health data sharing
- Cancellation policies and self check-in
- Rate limiting on sensitive endpoints

## Documentation
- **USER-FLOWS.md** — All flows, recurrence rule format, examples, and frontend usage
- **DEPLOY.md** — Migrations on deploy and start command setup

## Security
- Passwords hashed with bcrypt (12 rounds)
- All tokens (reset, verification, invitation) hashed before storage
- HTTPS required in production
- Security headers via Helmet
- Input validation and sanitization
    `.trim(),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'User registration, login, and password management')
    .addTag('Users', 'User account management')
    .addTag('Profiles', 'Participant & organizer profiles')
    .addTag('Organizations', 'Organization management and membership')
    .addTag('Sessions', 'Training session management')
    .addTag('Invitations', 'Invitation management')
    .addTag('Health', 'Application health checks')
    .addServer('http://localhost:3000', 'Local development')
    .addServer('https://beeactive-api-production.up.railway.app', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'BeeActive API Documentation',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin: 50px 0 }
      .swagger-ui .info .title { font-size: 2.5em }
    `,
    swaggerOptions: {
      persistAuthorization: true, // Persist JWT token in Swagger UI
      docExpansion: 'none', // Collapse all by default
      filter: true, // Enable search
      tagsSorter: 'alpha', // Sort tags alphabetically
    },
  });

  // ✅ SECURITY: CORS configuration
  // In development: allow common localhost ports
  // In production: allow FRONTEND_URL + Railway/Vercel preview domains + DEV_ORIGINS
  const productionOrigins = [
    process.env.FRONTEND_URL,
    /\.vercel\.app$/,
    /\.railway\.app$/,
    /\.netlify\.app$/,
  ].filter(Boolean);

  const developmentOrigins = [
    'http://localhost:4200', // Angular default
    'http://localhost:3000', // React/Next.js default
    'http://localhost:8100', // Ionic default
    'http://localhost:5173', // Vite default
    'http://localhost:8080', // Common dev port
    'http://127.0.0.1:4200', // Angular on 127.0.0.1
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8100',
  ];

  // Allow additional dev origins in production via env var (comma-separated)
  // Example: DEV_ORIGINS=http://localhost:4200,http://192.168.1.100:4200
  const additionalDevOrigins = process.env.DEV_ORIGINS
    ? process.env.DEV_ORIGINS.split(',').map((origin) => origin.trim())
    : [];

  const allowedOrigins =
    process.env.NODE_ENV === 'production'
      ? [...productionOrigins, ...additionalDevOrigins]
      : developmentOrigins;

  app.enableCors({
    origin: allowedOrigins,
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['X-Request-ID'], // Expose request ID to client
    maxAge: 3600, // Cache preflight for 1 hour
  });

  // Start server
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  // Log startup information
  const appLogger = new Logger('Bootstrap');
  appLogger.log(`🚀 Application is running on: http://localhost:${port}`);
  appLogger.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  appLogger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  appLogger.log(`💚 Health check: http://localhost:${port}/health`);

  // ✅ IMPROVEMENT: Graceful shutdown handlers
  // Properly close database connections, finish in-flight requests, etc.
  // Railway/Docker sends SIGTERM when stopping the container
  const gracefulShutdown = async (signal: string) => {
    appLogger.warn(`${signal} signal received: closing HTTP server`);

    try {
      await app.close();
      appLogger.log('HTTP server closed successfully');
      process.exit(0);
    } catch (error) {
      appLogger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught errors (last resort)
  process.on('uncaughtException', (error) => {
    appLogger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    appLogger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
}

bootstrap();
