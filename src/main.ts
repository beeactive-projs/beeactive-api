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

## Features
- 🔐 JWT-based authentication with refresh tokens
- 👥 Role-based access control (RBAC)
- 🏋️ Session management for trainers and clients
- 📧 Password reset via email
- 🔒 Account lockout after failed login attempts
- ⚡ Rate limiting on sensitive endpoints

## Security
- All passwords hashed with bcrypt (12 rounds)
- Tokens hashed before storage
- HTTPS required in production
- Security headers via Helmet
- Input validation and sanitization

## Support
For issues or questions, contact: support@beeactive.com
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
  // In production: allow FRONTEND_URL + Railway/Vercel preview domains
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? [
            process.env.FRONTEND_URL,
            /\.vercel\.app$/,
            /\.railway\.app$/,
            /\.netlify\.app$/,
          ].filter(Boolean)
        : [
            'http://localhost:4200', // Angular default
            'http://localhost:3000', // React/Next.js default
            'http://localhost:8100', // Ionic default
            'http://localhost:5173', // Vite default
            'http://localhost:8080', // Common dev port
            'http://127.0.0.1:4200', // Angular on 127.0.0.1
            'http://127.0.0.1:3000',
            'http://127.0.0.1:8100',
          ],
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
