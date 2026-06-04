import { Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { SessionBookingService } from '../../../session/services/session-booking.service';
import { SessionLifecycleService } from '../../../session/services/session-lifecycle.service';
import { SessionReminderDispatchService } from '../../../session/services/session-reminder-dispatch.service';
import { SessionTemplateService } from '../../../session/services/session-template.service';
import { JobContext } from '../../common/job-context';
import { JobHandler, MultiJobWorker } from '../../common/multi-job.worker';
import { QueueName } from '../../job-registry';

/**
 * Processor for the `sessions` queue. One worker, four named jobs —
 * routed by `job.name` (see `MultiJobWorker`). Each handler is thin:
 * it delegates to the owning session service (where the transactional
 * business logic + idempotency live) and logs the outcome. The clock
 * (`new Date()`) is captured per run.
 */
@Processor(QueueName.Sessions)
export class SessionsWorker extends MultiJobWorker {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    logger: LoggerService,
    private readonly reminderDispatch: SessionReminderDispatchService,
    private readonly lifecycle: SessionLifecycleService,
    private readonly templates: SessionTemplateService,
    private readonly booking: SessionBookingService,
  ) {
    super(logger);
  }

  protected readonly handlers: Record<string, JobHandler> = {
    reminder_dispatch: (_p, ctx) => this.reminderDispatchHandler(ctx),
    status_transition: (_p, ctx) => this.statusTransitionHandler(ctx),
    generate_recurring: (_p, ctx) => this.generateRecurringHandler(ctx),
    cleanup_stale_participants: (_p, ctx) => this.cleanupStaleHandler(ctx),
  };

  private async reminderDispatchHandler(ctx: JobContext): Promise<void> {
    const r = await this.reminderDispatch.dispatchDue(new Date());
    ctx.log.log(
      `reminders sent=${r.sent} skipped=${r.skipped} failed=${r.failed}`,
    );
  }

  private async statusTransitionHandler(ctx: JobContext): Promise<void> {
    const r = await this.lifecycle.runStatusTransitions(new Date());
    ctx.log.log(`transitions started=${r.started} completed=${r.completed}`);
  }

  private async generateRecurringHandler(ctx: JobContext): Promise<void> {
    const r = await this.templates.generateDueRecurringForAll(new Date());
    ctx.log.log(
      `recurring scanned=${r.templatesScanned} toppedUp=${r.templatesToppedUp} created=${r.created}`,
    );
  }

  private async cleanupStaleHandler(ctx: JobContext): Promise<void> {
    const r = await this.booking.expireStalePendingApprovals(new Date());
    ctx.log.log(`stale pending expired=${r.expired}`);
  }
}
