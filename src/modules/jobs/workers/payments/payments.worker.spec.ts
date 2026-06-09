import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UnrecoverableError } from 'bullmq';
import { PaymentsWorker } from './payments.worker';
import { PaymentRemindersService } from '../../../payment/services/payment-reminders.service';
import { BalanceCacheService } from '../../../payment/services/balance-cache.service';
import { WebhookHandlerService } from '../../../payment/services/webhook-handler.service';
import { makeSilentLogger } from '../../../../../test/helpers/sequelize-mocks';

const fakeJob = (name: string) =>
  ({
    data: {},
    queueName: 'payments',
    name,
    id: 'j',
    attemptsMade: 0,
  }) as unknown as Parameters<PaymentsWorker['process']>[0];

describe('PaymentsWorker', () => {
  let worker: PaymentsWorker;
  const reminders = {
    remindInvoicesDueSoon: jest.fn().mockResolvedValue({ sent: 0 }),
    escalateOverdueInvoices: jest.fn().mockResolvedValue({ sent: 0 }),
    remindCardsExpiring: jest.fn().mockResolvedValue({ sent: 0 }),
    sendMonthlyEarningsSummaries: jest.fn().mockResolvedValue({ sent: 0 }),
    remindRefundWindowClosing: jest.fn().mockResolvedValue({ sent: 0 }),
    runDunning: jest.fn().mockResolvedValue({ sent: 0 }),
    remindDisputeDeadlines: jest.fn().mockResolvedValue({ sent: 0 }),
  };
  const balanceCache = {
    refreshAll: jest.fn().mockResolvedValue({ refreshed: 0, failed: 0 }),
  };
  const webhooks = {
    processQueued: jest.fn().mockResolvedValue(undefined),
    reconcileOrphaned: jest
      .fn()
      .mockResolvedValue({ resolved: 0, agedOut: 0, stillOrphaned: 0 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const ref = await Test.createTestingModule({
      providers: [
        PaymentsWorker,
        { provide: PaymentRemindersService, useValue: reminders },
        { provide: BalanceCacheService, useValue: balanceCache },
        { provide: WebhookHandlerService, useValue: webhooks },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();
    worker = ref.get(PaymentsWorker);
  });

  it.each([
    ['invoice_due_soon', () => reminders.remindInvoicesDueSoon],
    ['invoice_overdue', () => reminders.escalateOverdueInvoices],
    ['card_expiring', () => reminders.remindCardsExpiring],
    ['earnings_summary', () => reminders.sendMonthlyEarningsSummaries],
    ['refund_window_closing', () => reminders.remindRefundWindowClosing],
    ['dunning', () => reminders.runDunning],
    ['dispute_deadline', () => reminders.remindDisputeDeadlines],
  ])('routes %s to the right reminder method', async (name, getFn) => {
    await worker.process(fakeJob(name));
    expect(getFn()).toHaveBeenCalledTimes(1);
  });

  it('routes balance_cache_refresh to BalanceCacheService.refreshAll', async () => {
    await worker.process(fakeJob('balance_cache_refresh'));
    expect(balanceCache.refreshAll).toHaveBeenCalledTimes(1);
  });

  it('routes process_webhook to WebhookHandlerService.processQueued with the payload', async () => {
    const job = {
      data: {
        webhookEventId: 'we-1',
        event: { id: 'evt_1', type: 'invoice.paid' },
      },
      queueName: 'payments',
      name: 'process_webhook',
      id: 'j',
      attemptsMade: 0,
    } as unknown as Parameters<PaymentsWorker['process']>[0];
    await worker.process(job);
    expect(webhooks.processQueued).toHaveBeenCalledWith(
      'we-1',
      expect.objectContaining({ id: 'evt_1' }),
    );
  });

  it('routes reconcile_webhooks to WebhookHandlerService.reconcileOrphaned', async () => {
    await worker.process(fakeJob('reconcile_webhooks'));
    expect(webhooks.reconcileOrphaned).toHaveBeenCalledTimes(1);
  });

  it('unknown job name → UnrecoverableError', async () => {
    await expect(worker.process(fakeJob('bogus'))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });
});
