import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { getDatabaseConfig } from './config/database.config';
import { envValidationSchema } from './config/env.validation';
import { createLogger } from './common/logger/winston.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { RoleModule } from './modules/role/role.module';
import { HealthModule } from './modules/health/health.module';
import { ProfileModule } from './modules/profile/profile.module';
import { GroupModule } from './modules/group/group.module';
import { SessionModule } from './modules/session/session.module';
import { InvitationModule } from './modules/invitation/invitation.module';
import { ClientModule } from './modules/client/client.module';
import { BlogModule } from './modules/blog/blog.module';
import { NotificationModule } from './modules/notification/notification.module';
import { EmailModule } from './common/services/email.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { PaymentModule } from './modules/payment/payment.module';
import { VenueModule } from './modules/venue/venue.module';
import { ExerciseModule } from './modules/exercise/exercise.module';
import { RoutineModule } from './modules/routine/routine.module';
import { WorkoutModule } from './modules/workout/workout.module';
import { SearchModule } from './modules/search/search.module';
import { PostModule } from './modules/post/post.module';
import { ReviewModule } from './modules/review/review.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { AdminModule } from './modules/admin/admin.module';
import { CamelCaseInterceptor } from './common/interceptors/camel-case.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),

    WinstonModule.forRootAsync({
      useFactory: () => createLogger(),
    }),

    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),

    // BullMQ only when REDIS_HOST is set — lets devs boot without
    // Redis. JobsService falls back to no-op + warn log. Production
    // env validation requires REDIS_HOST.
    ...(process.env.REDIS_HOST
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              connection: {
                host: configService.get<string>('REDIS_HOST'),
                port: configService.get<number>('REDIS_PORT'),
                password: configService.get<string>('REDIS_PASSWORD'),
                // Empty object (not `true`) keeps rejectUnauthorized
                // at its default — managed providers (Redis Cloud)
                // reject unverified certs otherwise.
                tls:
                  configService.get<string>('REDIS_TLS') === 'true'
                    ? {}
                    : undefined,
              },
            }),
          }),
        ]
      : []),

    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),

    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    EmailModule,

    HealthModule,
    UserModule,
    AuthModule,
    RoleModule,
    ProfileModule,
    GroupModule,
    SessionModule,
    InvitationModule,
    ClientModule,
    BlogModule,
    NotificationModule,
    JobsModule.register(),
    AnalyticsModule,
    FeedbackModule,
    WaitlistModule,
    PaymentModule,
    VenueModule,
    ExerciseModule,
    WorkoutModule,
    RoutineModule,
    SearchModule,
    PostModule,
    ReviewModule,
    MessagingModule,
    AdminModule,
  ],

  controllers: [],

  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: CamelCaseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
