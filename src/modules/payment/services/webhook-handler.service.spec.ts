import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

import { WebhookHandlerService } from './webhook-handler.service';
import { StripeService } from './stripe.service';
import { ConnectService } from './connect.service';
import { InvoiceService } from './invoice.service';
import { SubscriptionService } from './subscription.service';
import { RefundService } from './refund.service';
import { DisputeService } from './dispute.service';
import { NotificationService } from '../../notification/notification.service';
import { JobsService } from '../../jobs/jobs.service';
import {
  WebhookEvent,
  WebhookEventStatus,
} from '../entities/webhook-event.entity';
import { makeStripeEvent } from '../../../../test/helpers/stripe-event.factory';
import {
  fakeTx,
  makeModelMock,
  makeSequelizeMock,
  makeSilentLogger,
  type ModelMock,
} from '../../../../test/helpers/sequelize-mocks';

type AuditRowStub = {
  status: WebhookEventStatus;
  processedAt: Date | null;
  error: string | null;
  save: jest.Mock;
};

function makeAuditRow(): AuditRowStub {
  return {
    status: WebhookEventStatus.PROCESSING,
    processedAt: null,
    error: null,
    save: jest.fn().mockResolvedValue(undefined),
  };
}

// Stripe's handledEventTypes set has 18 entries — enumerate them here so
// the parameterized test fails loudly if the set ever shrinks.
const HANDLED_EVENT_TYPES = [
  'account.updated',
  'account.application.deauthorized',
  'capability.updated',
  'invoice.created',
  'invoice.finalized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.voided',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'payout.paid',
  'payout.failed',
] as const;

describe('WebhookHandlerService', () => {
  let service: WebhookHandlerService;
  let model: ModelMock;
  let sequelizeMock: ReturnType<typeof makeSequelizeMock>;
  let stripeMock: {
    verifyWebhookSignature: jest.Mock;
    stripe: { accounts: { retrieve: jest.Mock } };
  };
  let connectMock: {
    syncAccountFromWebhook: jest.Mock;
    handleDeauthorized: jest.Mock;
  };
  let invoiceMock: {
    syncFromStripeInvoice: jest.Mock;
    handlePaymentFailed: jest.Mock;
    syncPaymentFromIntent: jest.Mock;
  };
  let subscriptionMock: { syncFromWebhook: jest.Mock };
  let refundMock: { syncRefundFromWebhook: jest.Mock };
  let disputeMock: { syncFromWebhook: jest.Mock };
  let notificationMock: { notify: jest.Mock };
  let jobsMock: { enqueue: jest.Mock };
  let logger: ReturnType<typeof makeSilentLogger>;

  beforeEach(async () => {
    model = makeModelMock();
    sequelizeMock = makeSequelizeMock();
    stripeMock = {
      verifyWebhookSignature: jest.fn(),
      stripe: { accounts: { retrieve: jest.fn() } },
    };
    connectMock = {
      syncAccountFromWebhook: jest.fn().mockResolvedValue(undefined),
      handleDeauthorized: jest.fn().mockResolvedValue(undefined),
    };
    invoiceMock = {
      syncFromStripeInvoice: jest.fn().mockResolvedValue(null),
      handlePaymentFailed: jest.fn().mockResolvedValue(undefined),
      syncPaymentFromIntent: jest.fn().mockResolvedValue(undefined),
    };
    subscriptionMock = {
      syncFromWebhook: jest.fn().mockResolvedValue(undefined),
    };
    refundMock = {
      syncRefundFromWebhook: jest.fn().mockResolvedValue(undefined),
    };
    disputeMock = {
      syncFromWebhook: jest.fn().mockResolvedValue(undefined),
    };
    notificationMock = { notify: jest.fn().mockResolvedValue(undefined) };
    // Default: no queue (Redis absent) → handleIncomingEvent processes
    // inline, preserving the synchronous behaviour these tests assert.
    // The enqueue path has its own dedicated tests below.
    jobsMock = { enqueue: jest.fn().mockResolvedValue(null) };
    logger = makeSilentLogger();

    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhookHandlerService,
        { provide: getModelToken(WebhookEvent), useValue: model },
        { provide: Sequelize, useValue: sequelizeMock },
        { provide: StripeService, useValue: stripeMock },
        { provide: ConnectService, useValue: connectMock },
        { provide: InvoiceService, useValue: invoiceMock },
        { provide: SubscriptionService, useValue: subscriptionMock },
        { provide: RefundService, useValue: refundMock },
        { provide: DisputeService, useValue: disputeMock },
        { provide: NotificationService, useValue: notificationMock },
        { provide: JobsService, useValue: jobsMock },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: logger },
      ],
    }).compile();

    service = moduleRef.get(WebhookHandlerService);
  });

  it('happy path — handled event runs dispatcher inside a transaction and returns PROCESSED', async () => {
    const event = makeStripeEvent('account.updated');
    stripeMock.verifyWebhookSignature.mockReturnValue(event);

    const auditRow = makeAuditRow();
    model.create.mockResolvedValue(auditRow);

    const result = await service.handleIncomingEvent(
      Buffer.from('raw'),
      't=1,v1=sig',
    );

    expect(result).toEqual({
      eventId: event.id,
      type: 'account.updated',
      duplicate: false,
      status: WebhookEventStatus.PROCESSED,
    });
    expect(model.create).toHaveBeenCalledTimes(1);
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventId: event.id,
        type: 'account.updated',
        status: WebhookEventStatus.PROCESSING,
      }),
    );
    expect(sequelizeMock.transaction).toHaveBeenCalledTimes(1);
    expect(auditRow.save).toHaveBeenCalledTimes(1);
    expect(auditRow.save).toHaveBeenCalledWith({ transaction: fakeTx });
    expect(auditRow.status).toBe(WebhookEventStatus.PROCESSED);
    expect(model.findOne).not.toHaveBeenCalled();
  });

  it('ignored event type is marked IGNORED and does NOT open a transaction', async () => {
    const event = makeStripeEvent('customer.updated' as never);
    stripeMock.verifyWebhookSignature.mockReturnValue(event);

    const auditRow = makeAuditRow();
    model.create.mockResolvedValue(auditRow);

    const result = await service.handleIncomingEvent(
      Buffer.from('raw'),
      't=1,v1=sig',
    );

    expect(result.status).toBe(WebhookEventStatus.IGNORED);
    expect(result.duplicate).toBe(false);
    expect(sequelizeMock.transaction).not.toHaveBeenCalled();
    expect(auditRow.save).toHaveBeenCalledTimes(1);
    expect(auditRow.save).toHaveBeenCalledWith(); // no transaction arg
    expect(auditRow.status).toBe(WebhookEventStatus.IGNORED);
  });

  it('duplicate webhook — UniqueConstraintError surfaces the existing row', async () => {
    const event = makeStripeEvent('account.updated');
    stripeMock.verifyWebhookSignature.mockReturnValue(event);

    const uce = new UniqueConstraintError({ errors: [] });
    model.create.mockRejectedValue(uce);
    model.findOne.mockResolvedValue({
      status: WebhookEventStatus.PROCESSED,
    });

    const result = await service.handleIncomingEvent(
      Buffer.from('raw'),
      't=1,v1=sig',
    );

    expect(result).toEqual({
      eventId: event.id,
      type: 'account.updated',
      duplicate: true,
      status: WebhookEventStatus.PROCESSED,
    });
    expect(model.findOne).toHaveBeenCalledWith({
      where: { stripeEventId: event.id },
    });
    expect(sequelizeMock.transaction).not.toHaveBeenCalled();
  });

  it('UniqueConstraintError with no existing row rethrows (should-never-happen guard)', async () => {
    const event = makeStripeEvent('account.updated');
    stripeMock.verifyWebhookSignature.mockReturnValue(event);

    const uce = new UniqueConstraintError({ errors: [] });
    model.create.mockRejectedValue(uce);
    model.findOne.mockResolvedValue(null);

    await expect(
      service.handleIncomingEvent(Buffer.from('raw'), 't=1,v1=sig'),
    ).rejects.toBe(uce);
  });

  it('handler failure rolls back tx and persists FAILED in a new save', async () => {
    const event = makeStripeEvent('account.updated');
    stripeMock.verifyWebhookSignature.mockReturnValue(event);

    const auditRow = makeAuditRow();
    model.create.mockResolvedValue(auditRow);

    const bang = new Error('handler kaboom');
    // Make the transaction wrapper run the callback then throw.
    sequelizeMock.transaction.mockImplementation(
      async (cb: (tx: typeof fakeTx) => unknown) => {
        await cb(fakeTx);
        throw bang;
      },
    );

    await expect(
      service.handleIncomingEvent(Buffer.from('raw'), 't=1,v1=sig'),
    ).rejects.toBe(bang);

    // Two saves: one inside the (rolled-back) tx, one outside with FAILED.
    expect(auditRow.save).toHaveBeenCalledTimes(2);
    expect(auditRow.save).toHaveBeenNthCalledWith(1, { transaction: fakeTx });
    expect(auditRow.save).toHaveBeenNthCalledWith(2);
    expect(auditRow.status).toBe(WebhookEventStatus.FAILED);
    expect(auditRow.error).toBe('handler kaboom');
    expect(logger.error).toHaveBeenCalled();
  });

  it('OrphanedWebhookError marks the row ORPHANED and returns 200 (no rethrow)', async () => {
    // Use require to bypass the otherwise-circular import in tests; the
    // production handler uses a top-level import which is fine because
    // the cycle is broken at module load time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OrphanedWebhookError } = require('./webhook-errors') as {
      OrphanedWebhookError: new (
        type: 'invoice' | 'charge' | 'payment_intent' | 'subscription',
        id: string,
      ) => Error;
    };

    const event = makeStripeEvent('payment_intent.succeeded');
    stripeMock.verifyWebhookSignature.mockReturnValue(event);

    const auditRow = makeAuditRow();
    model.create.mockResolvedValue(auditRow);

    const orphan = new OrphanedWebhookError('payment_intent', 'pi_unknown');
    sequelizeMock.transaction.mockImplementation(
      async (cb: (tx: typeof fakeTx) => unknown) => {
        await cb(fakeTx);
        throw orphan;
      },
    );

    // Spec: dispatcher catches OrphanedWebhookError, stamps status, and
    // RESOLVES (does not rethrow). Stripe should see 200 and not retry.
    const result = await service.handleIncomingEvent(
      Buffer.from('raw'),
      't=1,v1=sig',
    );

    expect(result.status).toBe(WebhookEventStatus.ORPHANED);
    expect(auditRow.status).toBe(WebhookEventStatus.ORPHANED);
    expect(auditRow.error).toContain('pi_unknown');
    // FAILED-path logger.error must NOT have fired — orphans use warn.
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('signature verification failure bubbles and never touches the DB', async () => {
    const sigErr = new Error('Invalid stripe signature');
    sigErr.name = 'StripeSignatureVerificationError';
    stripeMock.verifyWebhookSignature.mockImplementation(() => {
      throw sigErr;
    });

    await expect(
      service.handleIncomingEvent(Buffer.from('raw'), 'bogus'),
    ).rejects.toBe(sigErr);

    expect(model.create).not.toHaveBeenCalled();
    expect(model.findOne).not.toHaveBeenCalled();
    expect(sequelizeMock.transaction).not.toHaveBeenCalled();
  });

  it('never logs PII fields from event.data.object', async () => {
    const event = makeStripeEvent('account.updated', {
      data: {
        object: {
          id: 'acct_test',
          object: 'account',
          email: 'victim@example.com',
          individual: { last_name: 'SensitiveSurname' },
          external_accounts: { data: [{ last4: '4242' }] },
        },
        previous_attributes: null,
      },
    } as never);
    stripeMock.verifyWebhookSignature.mockReturnValue(event);

    model.create.mockResolvedValue(makeAuditRow());

    await service.handleIncomingEvent(Buffer.from('raw'), 't=1,v1=sig');

    const allCalls: unknown[][] = [
      ...(logger.log.mock.calls as unknown[][]),
      ...(logger.error.mock.calls as unknown[][]),
      ...(logger.warn.mock.calls as unknown[][]),
      ...(logger.debug.mock.calls as unknown[][]),
    ];
    const allLogs = allCalls
      .flat()
      .map((arg) =>
        typeof arg === 'string' ? arg : JSON.stringify(arg ?? ''),
      );

    const joined = allLogs.join('\n');
    expect(joined).not.toContain('victim@example.com');
    expect(joined).not.toContain('SensitiveSurname');
    expect(joined).not.toContain('4242');
  });

  it('logs event.id and event.type on every handled event', async () => {
    const event = makeStripeEvent('account.updated');
    stripeMock.verifyWebhookSignature.mockReturnValue(event);
    model.create.mockResolvedValue(makeAuditRow());

    await service.handleIncomingEvent(Buffer.from('raw'), 't=1,v1=sig');

    const joined = logger.log.mock.calls
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg ?? '')))
      .join('\n');

    expect(joined).toContain(event.id);
    expect(joined).toContain('account.updated');
  });

  // =====================================================================
  // Phase 7 — outbox commit/rollback semantics
  //
  // The headline invariant: a notification queued by a sub-service
  // during a webhook handler MUST fire iff the surrounding tx commits.
  // We simulate this by hooking connectMock.syncAccountFromWebhook to
  // push onto the outbox the dispatcher passed in, then forcing the
  // tx to commit / rollback / orphan and asserting on notify().
  // =====================================================================
  describe('Phase 7 — outbox flush/discard semantics', () => {
    type OutboxLike = {
      add: (params: { userId: string; type: string }) => void;
    };

    function hookOutboxIntoConnectMock(): { added: number } {
      const counter = { added: 0 };
      // 3rd argument the handler passes through is the outbox.
      // Cast the mock implementation to any so we can grab the param.
      connectMock.syncAccountFromWebhook.mockImplementation(
        (_account: unknown, _tx: unknown, outbox: OutboxLike | undefined) => {
          outbox?.add({ userId: 'user-1', type: 'STRIPE_ACCOUNT_READY' });
          counter.added += 1;
          return Promise.resolve();
        },
      );
      return counter;
    }

    it('flushes the outbox when the tx commits — notify is called AFTER PROCESSED', async () => {
      const event = makeStripeEvent('account.updated');
      stripeMock.verifyWebhookSignature.mockReturnValue(event);
      model.create.mockResolvedValue(makeAuditRow());
      const counter = hookOutboxIntoConnectMock();

      const result = await service.handleIncomingEvent(
        Buffer.from('raw'),
        't=1,v1=sig',
      );

      expect(result.status).toBe(WebhookEventStatus.PROCESSED);
      expect(counter.added).toBe(1); // producer ran once
      expect(notificationMock.notify).toHaveBeenCalledTimes(1);
      expect(notificationMock.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('discards the outbox when the tx rolls back — notify is NEVER called', async () => {
      const event = makeStripeEvent('account.updated');
      stripeMock.verifyWebhookSignature.mockReturnValue(event);
      model.create.mockResolvedValue(makeAuditRow());
      hookOutboxIntoConnectMock();

      // Producer queues a notification, then the tx wrapper throws after
      // running the callback — simulating a downstream save failure.
      const bang = new Error('post-callback rollback');
      sequelizeMock.transaction.mockImplementation(
        async (cb: (tx: typeof fakeTx) => unknown) => {
          await cb(fakeTx);
          throw bang;
        },
      );

      await expect(
        service.handleIncomingEvent(Buffer.from('raw'), 't=1,v1=sig'),
      ).rejects.toBe(bang);

      // The producer's outbox.add() ran inside the tx, but discard()
      // happens in the catch — so no notify fires. This is the load-
      // bearing rollback guarantee.
      expect(notificationMock.notify).not.toHaveBeenCalled();
    });

    it('discards the outbox on OrphanedWebhookError — orphan path also suppresses notification', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OrphanedWebhookError } = require('./webhook-errors') as {
        OrphanedWebhookError: new (
          type: 'invoice' | 'charge' | 'payment_intent' | 'subscription',
          id: string,
        ) => Error;
      };

      const event = makeStripeEvent('payment_intent.succeeded');
      stripeMock.verifyWebhookSignature.mockReturnValue(event);
      model.create.mockResolvedValue(makeAuditRow());

      // Hook the invoice producer to queue + then throw orphan, since
      // payment_intent.succeeded routes to invoiceMock.syncPaymentFromIntent.
      invoiceMock.syncPaymentFromIntent.mockImplementation(
        (_intent: unknown, _tx: unknown, outbox: OutboxLike | undefined) => {
          outbox?.add({ userId: 'user-x', type: 'INVOICE_PAID' });
          throw new OrphanedWebhookError('payment_intent', 'pi_x');
        },
      );

      const result = await service.handleIncomingEvent(
        Buffer.from('raw'),
        't=1,v1=sig',
      );

      expect(result.status).toBe(WebhookEventStatus.ORPHANED);
      // Orphans should NOT fire the queued notification — the local row
      // doesn't exist yet, so notifying about it would be misleading.
      expect(notificationMock.notify).not.toHaveBeenCalled();
    });

    it('flush failure does NOT propagate — webhook still returns 200 (PROCESSED)', async () => {
      const event = makeStripeEvent('account.updated');
      stripeMock.verifyWebhookSignature.mockReturnValue(event);
      model.create.mockResolvedValue(makeAuditRow());
      hookOutboxIntoConnectMock();

      // Notification delivery fails (e.g. Bull is down).
      notificationMock.notify.mockRejectedValueOnce(new Error('redis down'));

      const result = await service.handleIncomingEvent(
        Buffer.from('raw'),
        't=1,v1=sig',
      );

      // The tx committed successfully — PROCESSED + 200, even though
      // notify itself failed. The error is logged via the outbox's
      // internal logger; we don't re-throw to Stripe.
      expect(result.status).toBe(WebhookEventStatus.PROCESSED);
      expect(notificationMock.notify).toHaveBeenCalled();
      // Outbox swallows the error and logs via this.logger.error.
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('redis down'),
        expect.any(String),
        'NotificationOutbox',
      );
    });

    it('a fresh outbox is constructed per event — no leakage across events', async () => {
      // Process two events back-to-back. Each gets its own outbox.
      // If we accidentally shared one, the second event would re-fire
      // the first event's notification.
      const event = makeStripeEvent('account.updated');
      stripeMock.verifyWebhookSignature.mockReturnValue(event);
      model.create.mockResolvedValue(makeAuditRow());
      const counter = hookOutboxIntoConnectMock();

      await service.handleIncomingEvent(Buffer.from('raw'), 't=1,v1=sig');
      // Reset the audit row for the second call.
      model.create.mockResolvedValue(makeAuditRow());
      await service.handleIncomingEvent(Buffer.from('raw'), 't=1,v1=sig');

      expect(counter.added).toBe(2);
      // Exactly two notifies — one per event. If outboxes leaked we'd
      // see 3 (the second event's outbox would still have the first
      // event's queued item).
      expect(notificationMock.notify).toHaveBeenCalledTimes(2);
    });
  });

  describe.each(HANDLED_EVENT_TYPES)('handled event type %s', (type) => {
    it('routes through dispatcher and returns PROCESSED', async () => {
      const event = makeStripeEvent(type as never);
      stripeMock.verifyWebhookSignature.mockReturnValue(event);
      model.create.mockResolvedValue(makeAuditRow());

      const result = await service.handleIncomingEvent(
        Buffer.from('raw'),
        't=1,v1=sig',
      );

      expect(result.status).toBe(WebhookEventStatus.PROCESSED);
      expect(result.status).not.toBe(WebhookEventStatus.IGNORED);
      expect(sequelizeMock.transaction).toHaveBeenCalled();
    });
  });

  // ── async processing (Bucket E) ──────────────────────────────────────
  describe('async processing', () => {
    it('enqueues process_webhook and returns PROCESSING when a queue is available', async () => {
      const event = makeStripeEvent('invoice.paid');
      stripeMock.verifyWebhookSignature.mockReturnValue(event);
      const auditRow = makeAuditRow();
      model.create.mockResolvedValue({ ...auditRow, id: 'we-1' });
      jobsMock.enqueue.mockResolvedValue({ id: 'job-1' }); // queue present

      const result = await service.handleIncomingEvent(
        Buffer.from('raw'),
        'sig',
      );

      expect(result.status).toBe(WebhookEventStatus.PROCESSING);
      expect(jobsMock.enqueue).toHaveBeenCalledWith(
        'payments.process_webhook',
        expect.objectContaining({ webhookEventId: 'we-1' }),
        expect.objectContaining({ jobId: `webhook:${event.id}`, attempts: 5 }),
      );
      // No inline dispatch when queued.
      expect(sequelizeMock.transaction).not.toHaveBeenCalled();
    });

    it('charge.dispute.created routes to DisputeService.syncFromWebhook (inline)', async () => {
      const event = makeStripeEvent('charge.dispute.created');
      stripeMock.verifyWebhookSignature.mockReturnValue(event);
      model.create.mockResolvedValue(makeAuditRow());

      await service.handleIncomingEvent(Buffer.from('raw'), 'sig');

      expect(disputeMock.syncFromWebhook).toHaveBeenCalledTimes(1);
    });

    it('processQueued runs the dispatcher and marks PROCESSED', async () => {
      const auditRow = makeAuditRow();
      model.findByPk.mockResolvedValue(auditRow);
      const event = makeStripeEvent('invoice.paid');

      await service.processQueued('we-1', event as never);

      expect(sequelizeMock.transaction).toHaveBeenCalledTimes(1);
      expect(auditRow.status).toBe(WebhookEventStatus.PROCESSED);
    });

    it('processQueued is a no-op when the row is already PROCESSED', async () => {
      const auditRow = makeAuditRow();
      auditRow.status = WebhookEventStatus.PROCESSED;
      model.findByPk.mockResolvedValue(auditRow);

      await service.processQueued(
        'we-1',
        makeStripeEvent('invoice.paid') as never,
      );

      expect(sequelizeMock.transaction).not.toHaveBeenCalled();
    });

    it('reconcileOrphaned re-processes recent rows and ages out old ones', async () => {
      const now = new Date('2026-06-15T00:00:00Z');
      const recent = {
        status: WebhookEventStatus.ORPHANED,
        receivedAt: new Date(now.getTime() - 60_000),
        type: 'invoice.paid',
        stripeEventId: 'evt_recent',
        payload: {},
        processedAt: null,
        error: null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      const old = {
        status: WebhookEventStatus.ORPHANED,
        receivedAt: new Date(now.getTime() - 8 * 24 * 60 * 60_000),
        type: 'invoice.paid',
        stripeEventId: 'evt_old',
        payload: {},
        processedAt: null,
        error: null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findAll.mockResolvedValue([recent, old]);

      const r = await service.reconcileOrphaned(now);

      expect(r).toEqual({ resolved: 1, agedOut: 1, stillOrphaned: 0 });
      expect(recent.status).toBe(WebhookEventStatus.PROCESSED);
      expect(old.status).toBe(WebhookEventStatus.FAILED);
    });
  });
});
