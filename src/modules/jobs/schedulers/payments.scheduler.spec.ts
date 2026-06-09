import { PaymentsScheduler } from './payments.scheduler';
import { JobsService } from '../jobs.service';
import { makeSilentLogger } from '../../../../test/helpers/sequelize-mocks';

describe('PaymentsScheduler', () => {
  let scheduler: PaymentsScheduler;
  let enqueue: jest.Mock;

  beforeEach(() => {
    enqueue = jest.fn().mockResolvedValue({ id: 'j' });
    scheduler = new PaymentsScheduler(
      { enqueue } as unknown as JobsService,
      makeSilentLogger(),
    );
  });

  it.each([
    ['invoiceDueSoon', 'payments.invoice_due_soon'],
    ['invoiceOverdue', 'payments.invoice_overdue'],
    ['dunning', 'payments.dunning'],
    ['cardExpiring', 'payments.card_expiring'],
    ['refundWindowClosing', 'payments.refund_window_closing'],
    ['disputeDeadline', 'payments.dispute_deadline'],
    ['earningsSummary', 'payments.earnings_summary'],
    ['balanceCacheRefresh', 'payments.balance_cache_refresh'],
    ['reconcileWebhooks', 'payments.reconcile_webhooks'],
  ])('%s enqueues %s with a deterministic jobId', async (method, jobName) => {
    await (scheduler as unknown as Record<string, () => Promise<void>>)[
      method
    ]();
    expect(enqueue).toHaveBeenCalledWith(
      jobName,
      expect.objectContaining({ runKey: expect.any(String) }),
      expect.objectContaining({
        jobId: expect.stringContaining(`${jobName}-`) as string,
      }),
    );
  });
});
