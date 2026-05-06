import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationModule } from '../notification/notification.module';
import { JobsService } from './jobs.service';
import { QUEUE_DEFAULTS, QueueName } from './job-registry';
import { EmailSendWorker } from './workers/notifications/email-send.worker';

/**
 * JobsModule — the producer-facing API + workers.
 *
 * @Global because every feature module that wants to enqueue
 * something injects `JobsService`. Marking it global means we don't
 * have to add JobsModule to every feature module's imports list.
 *
 * Queue registration vs worker registration:
 *   - `BullModule.registerQueue(...)` creates the Queue (used by
 *     producers calling `JobsService.enqueue`).
 *   - The worker classes in `providers` register themselves with
 *     BullMQ when their parent module instantiates them (via
 *     @Processor decorator).
 *
 * Both run in the same Node process — see
 * docs/research/jobs-system/02-bullmq-architecture-patterns.md
 * for the rationale on in-process workers. When we eventually need
 * to scale workers to a separate dyno, we add a `WORKER_KIND` env
 * flag in main.ts and skip the worker providers when running as
 * `WORKER_KIND=api` only.
 *
 * Skip-on-no-Redis: when REDIS_HOST isn't set (typical local dev
 * without Docker), BullModule.registerQueue silently no-ops because
 * its parent BullModule.forRoot in app.module.ts is conditional.
 * JobsService falls back to "drop the job + log a warning". Workers
 * are still constructed (NestJS DI doesn't know REDIS_HOST is
 * missing) but they have no queue to listen on, so they sit idle.
 */
@Global()
@Module({
  imports: [
    // Register every queue we use. Defaults come from job-registry.
    BullModule.registerQueue({
      name: QueueName.Notifications,
      defaultJobOptions:
        QUEUE_DEFAULTS[QueueName.Notifications].defaultJobOptions,
    }),
    // We need the notification receipt service inside EmailSendWorker
    // (to record per-channel outcomes after delivery). NotificationModule
    // is @Global so the providers are available, but importing it
    // explicitly makes the dependency clear.
    NotificationModule,
  ],
  providers: [
    JobsService,
    EmailSendWorker,
    // EmailService comes in via the @Global EmailModule registered
    // in AppModule — no need to declare it locally.
  ],
  exports: [JobsService],
})
export class JobsModule {}
