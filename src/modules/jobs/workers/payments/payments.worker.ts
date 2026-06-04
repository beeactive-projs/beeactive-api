import { Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PaymentRemindersService } from '../../../payment/services/payment-reminders.service';
import { BalanceCacheService } from '../../../payment/services/balance-cache.service';
import { JobContext } from '../../common/job-context';
import { JobHandler, MultiJobWorker } from '../../common/multi-job.worker';
import { QueueName } from '../../job-registry';

/**
 * Processor for the `payments` queue. Reminder/cache sweeps (Bucket C);
 * the webhook-processing + reconciliation handlers are added by the
 * webhook-async refactor (Bucket E). Thin handlers delegate to the
 * payment services where the transactional logic + idempotency live.
 */
@Processor(QueueName.Payments)
export class PaymentsWorker extends MultiJobWorker {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    logger: LoggerService,
    private readonly reminders: PaymentRemindersService,
    private readonly balanceCache: BalanceCacheService,
  ) {
    super(logger);
  }

  protected readonly handlers: Record<string, JobHandler> = {
    invoice_due_soon: (_p, ctx) =>
      this.log(
        ctx,
        'due-soon',
        this.reminders.remindInvoicesDueSoon(new Date()),
      ),
    invoice_overdue: (_p, ctx) =>
      this.log(
        ctx,
        'overdue',
        this.reminders.escalateOverdueInvoices(new Date()),
      ),
    card_expiring: (_p, ctx) =>
      this.log(
        ctx,
        'card-expiring',
        this.reminders.remindCardsExpiring(new Date()),
      ),
    earnings_summary: (_p, ctx) =>
      this.log(
        ctx,
        'earnings',
        this.reminders.sendMonthlyEarningsSummaries(new Date()),
      ),
    refund_window_closing: (_p, ctx) =>
      this.log(
        ctx,
        'refund-window',
        this.reminders.remindRefundWindowClosing(new Date()),
      ),
    dunning: (_p, ctx) =>
      this.log(ctx, 'dunning', this.reminders.runDunning(new Date())),
    dispute_deadline: (_p, ctx) =>
      this.log(
        ctx,
        'dispute-deadline',
        this.reminders.remindDisputeDeadlines(new Date()),
      ),
    balance_cache_refresh: async (_p, ctx) => {
      const r = await this.balanceCache.refreshAll();
      ctx.log.log(`balance-cache refreshed=${r.refreshed} failed=${r.failed}`);
    },
  };

  private async log(
    ctx: JobContext,
    label: string,
    work: Promise<{ sent: number }>,
  ): Promise<void> {
    const r = await work;
    ctx.log.log(`${label} sent=${r.sent}`);
  }
}
