import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { JobsService } from '../jobs.service';
import { bucketKey } from './sessions.scheduler';

/**
 * Cron triggers for the `payments` queue reminder/cache sweeps. Enqueue
 * only — no DB work, no `setTimeout`. Skip-on-no-Redis preserved
 * (`enqueue` no-ops + logs). Daily reminders are staggered through the
 * early-morning hours; earnings is monthly; the balance cache is hourly.
 */
@Injectable()
export class PaymentsScheduler {
  constructor(
    private readonly jobs: JobsService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  private daily(name: Parameters<JobsService['enqueue']>[0]): Promise<unknown> {
    const runKey = bucketKey(24 * 60 * 60_000);
    return this.jobs.enqueue(name, { runKey }, { jobId: `${name}:${runKey}` });
  }

  @Cron('0 0 6 * * *') // 06:00
  async invoiceDueSoon(): Promise<void> {
    await this.daily('payments.invoice_due_soon');
  }

  @Cron('0 15 6 * * *') // 06:15
  async invoiceOverdue(): Promise<void> {
    await this.daily('payments.invoice_overdue');
  }

  @Cron('0 30 6 * * *') // 06:30
  async dunning(): Promise<void> {
    await this.daily('payments.dunning');
  }

  @Cron('0 0 7 * * *') // 07:00
  async cardExpiring(): Promise<void> {
    await this.daily('payments.card_expiring');
  }

  @Cron('0 30 7 * * *') // 07:30
  async refundWindowClosing(): Promise<void> {
    await this.daily('payments.refund_window_closing');
  }

  @Cron('0 0 8 * * *') // 08:00
  async disputeDeadline(): Promise<void> {
    await this.daily('payments.dispute_deadline');
  }

  @Cron('0 0 8 1 * *') // 08:00 on the 1st
  async earningsSummary(): Promise<void> {
    const runKey = bucketKey(31 * 24 * 60 * 60_000);
    await this.jobs.enqueue(
      'payments.earnings_summary',
      { runKey },
      { jobId: `payments.earnings_summary:${runKey}` },
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async balanceCacheRefresh(): Promise<void> {
    const runKey = bucketKey(60 * 60_000);
    await this.jobs.enqueue(
      'payments.balance_cache_refresh',
      { runKey },
      { jobId: `payments.balance_cache_refresh:${runKey}` },
    );
  }

  // Safety net for webhooks orphaned by an arrival-before-commit race.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcileWebhooks(): Promise<void> {
    const runKey = bucketKey(30 * 60_000);
    await this.jobs.enqueue(
      'payments.reconcile_webhooks',
      { runKey },
      { jobId: `payments.reconcile_webhooks:${runKey}` },
    );
  }
}
