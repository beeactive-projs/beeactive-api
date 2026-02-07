import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // CRITICAL DEBUG - Check environment variables BEFORE creating app
  console.log('========================================');
  console.log('ENVIRONMENT VARIABLES DEBUG');
  console.log('========================================');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('DB_HOST:', process.env.DB_HOST);
  console.log('DB_PORT:', process.env.DB_PORT);
  console.log('DB_USERNAME:', process.env.DB_USERNAME);
  console.log(
    'DB_PASSWORD:',
    process.env.DB_PASSWORD ? '***SET***' : 'NOT SET',
  );
  console.log('DB_DATABASE:', process.env.DB_DATABASE);
  console.log('PORT:', process.env.PORT);
  console.log('JWT_SECRET:', process.env.JWT_SECRET ? '***SET***' : 'NOT SET');
  console.log('========================================');

  const app = await NestFactory.create(AppModule);

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS configuration
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? [
            process.env.FRONTEND_URL, // Friend's Vercel URL
            /\.vercel\.app$/, // Allow all Vercel preview URLs
            /\.railway\.app$/, // Allow Railway URLs for testing
          ].filter(Boolean) // Remove undefined values
        : [
            'http://localhost:4200',
            'http://localhost:3000',
            'http://localhost:8100',
          ], // Local dev
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // CRITICAL: Listen on 0.0.0.0 for Railway (not just localhost)
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(
    `🌍 CORS enabled for: ${process.env.NODE_ENV === 'production' ? 'Production URLs' : 'Local development'}`,
  );
}

bootstrap();
