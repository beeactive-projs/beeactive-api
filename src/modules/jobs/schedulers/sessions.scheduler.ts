import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { JobsService } from '../jobs.service';

/**
 * Cron triggers for the `sessions` queue.
 *
 * Schedulers do ONE thing: enqueue. No DB work, no `setTimeout` — the
 * `@Cron` decorator (from `@nestjs/schedule`, wired via
 * `ScheduleModule.forRoot()` in app.module) is the only timer. The
 * worker does the actual querying + fan-out.
 *
 * When Redis isn't configured (local dev), `JobsService.enqueue`
 * no-ops + logs a warning instead of throwing, so the cron firing is
 * harmless and the app still boots.
 *
 * Each enqueue uses a deterministic `jobId` derived from a coarse time
 * bucket: if the cron somehow fires twice (or two app instances run
 * it), BullMQ collapses the duplicates into one job.
 */
@Injectable()
export class SessionsScheduler {
  constructor(
    private readonly jobs: JobsService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // Hourly: frequent crons keep the Postgres compute (Neon) from
  // scaling to zero and burn the free CU-hour allowance. An hour is
  // plenty for 24h/1h reminders (the worker sweeps a window, not an
  // exact tick, and dedups via the notification fingerprint).
  @Cron(CronExpression.EVERY_HOUR)
  async dispatchReminders(): Promise<void> {
    const runKey = bucketKey(60 * 60_000);
    await this.jobs.enqueue(
      'sessions.reminder_dispatch',
      { runKey },
      { jobId: `sessions.reminder_dispatch-${runKey}` },
    );
  }

  // Hourly (was 30m): keeps the wake cadence to one burst/hour so the
  // Neon compute can scale to zero in between. Status is cosmetic —
  // upcoming/past filtering uses `endAt` directly, not this field — so
  // up-to-an-hour staleness on the transition is harmless.
  @Cron(CronExpression.EVERY_HOUR)
  async runStatusTransitions(): Promise<void> {
    const runKey = bucketKey(60 * 60_000);
    await this.jobs.enqueue(
      'sessions.status_transition',
      { runKey },
      { jobId: `sessions.status_transition-${runKey}` },
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async generateRecurring(): Promise<void> {
    const runKey = bucketKey(24 * 60 * 60_000);
    await this.jobs.enqueue(
      'sessions.generate_recurring',
      { runKey },
      { jobId: `sessions.generate_recurring-${runKey}` },
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupStaleParticipants(): Promise<void> {
    const runKey = bucketKey(60 * 60_000);
    await this.jobs.enqueue(
      'sessions.cleanup_stale_participants',
      { runKey },
      { jobId: `sessions.cleanup_stale_participants-${runKey}` },
    );
  }
}

/**
 * Stable per-tick dedup token: the current time floored to its
 * `intervalMs` window, as a plain integer string. Must stay free of
 * `:` (and other reserved chars) because it's embedded in BullMQ job
 * ids, which reject `:`.
 */
export function bucketKey(intervalMs: number): string {
  return String(Math.floor(Date.now() / intervalMs));
}
