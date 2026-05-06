import { NotificationOutbox } from './notification-outbox';
import {
  NotificationService,
  NotificationType,
  NotifyParams,
} from './notification.service';

// The outbox is the load-bearing piece for "don't email a client
// about a payment that rolled back". A regression here is silent
// (no test failure elsewhere catches it) so we cover its surface
// area thoroughly here.

function makeNotifyMock() {
  return {
    notify: jest.fn().mockResolvedValue({
      notificationId: 'n_1',
      receiptId: 'r_1',
      deduped: false,
      delivered: { email: 'queued', inApp: 'sent' },
    }),
  };
}

function makeLoggerMock() {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
}

function makeParams(overrides: Partial<NotifyParams> = {}): NotifyParams {
  return {
    userId: 'user-1',
    type: NotificationType.INVOICE_CREATED,
    title: 'New invoice',
    body: '€10.00 due Friday.',
    data: { screen: 'my-invoices', entityId: 'inv-1' },
    ...overrides,
  };
}

describe('NotificationOutbox', () => {
  describe('add() / size()', () => {
    it('queues without firing — notify is NOT called on add', () => {
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      outbox.add(makeParams());
      outbox.add(makeParams({ userId: 'user-2' }));

      expect(outbox.size()).toBe(2);
      expect(notifyMock.notify).not.toHaveBeenCalled();
    });

    it('preserves insertion order so producer A always fires before producer B', async () => {
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      outbox.add(makeParams({ userId: 'user-A' }));
      outbox.add(makeParams({ userId: 'user-B' }));
      outbox.add(makeParams({ userId: 'user-C' }));

      await outbox.flush();

      expect(notifyMock.notify).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ userId: 'user-A' }),
      );
      expect(notifyMock.notify).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ userId: 'user-B' }),
      );
      expect(notifyMock.notify).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ userId: 'user-C' }),
      );
    });
  });

  describe('flush()', () => {
    it('fires all queued notifications and empties the outbox', async () => {
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      outbox.add(makeParams());
      outbox.add(makeParams({ userId: 'user-2' }));

      await outbox.flush();

      expect(notifyMock.notify).toHaveBeenCalledTimes(2);
      expect(outbox.size()).toBe(0);
    });

    it('is a no-op when nothing was queued', async () => {
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      await outbox.flush();

      expect(notifyMock.notify).not.toHaveBeenCalled();
    });

    it('drains synchronously at flush start — re-entrant adds during flush are NOT delivered in this flush', async () => {
      // Why we test this: the implementation snapshots the queue into
      // `items` and clears `pending` before iterating. If a producer's
      // notify() side-effect somehow added back to the same outbox
      // (unusual but possible), those re-entrant adds must wait for
      // the next flush, not silently get picked up by this iteration.
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      let firstCall = true;
      notifyMock.notify.mockImplementation(() => {
        if (firstCall) {
          firstCall = false;
          // Re-entrant add during flush.
          outbox.add(makeParams({ userId: 'user-late' }));
        }
        return Promise.resolve({
          notificationId: 'n',
          receiptId: 'r',
          deduped: false,
          delivered: {},
        });
      });

      outbox.add(makeParams({ userId: 'user-first' }));
      await outbox.flush();

      // First flush only fires the originally-queued item.
      expect(notifyMock.notify).toHaveBeenCalledTimes(1);
      expect(outbox.size()).toBe(1);

      // A second flush picks up the re-entrant add.
      await outbox.flush();
      expect(notifyMock.notify).toHaveBeenCalledTimes(2);
      expect(outbox.size()).toBe(0);
    });

    it('one failed notify does NOT prevent siblings from firing', async () => {
      // Webhook handlers commonly fire two notifies (instructor +
      // client). If the instructor's row was just deleted by another
      // request, the notify might fail — but the client should still
      // get their email.
      const notifyMock = makeNotifyMock();
      const logger = makeLoggerMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
        logger,
      );

      notifyMock.notify
        .mockRejectedValueOnce(new Error('user not found'))
        .mockResolvedValueOnce({
          notificationId: 'n_2',
          receiptId: 'r_2',
          deduped: false,
          delivered: {},
        });

      outbox.add(makeParams({ userId: 'user-fail' }));
      outbox.add(makeParams({ userId: 'user-ok' }));

      await expect(outbox.flush()).resolves.toBeUndefined();

      expect(notifyMock.notify).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('user not found'),
        expect.any(String),
        'NotificationOutbox',
      );
    });

    it('logs error context (type + userId) when a notify fails', async () => {
      const notifyMock = makeNotifyMock();
      const logger = makeLoggerMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
        logger,
      );

      notifyMock.notify.mockRejectedValueOnce(new Error('db down'));
      outbox.add(
        makeParams({
          userId: 'user-x',
          type: NotificationType.INVOICE_PAID,
        }),
      );

      await outbox.flush();

      const [msg] = logger.error.mock.calls[0] as [string, string, string];
      expect(msg).toContain('INVOICE_PAID');
      expect(msg).toContain('user-x');
      expect(msg).toContain('db down');
    });

    it('handles non-Error throws (string, plain object) without crashing', async () => {
      const notifyMock = makeNotifyMock();
      const logger = makeLoggerMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
        logger,
      );

      notifyMock.notify.mockRejectedValueOnce('something went sideways');
      outbox.add(makeParams());

      await expect(outbox.flush()).resolves.toBeUndefined();
      const [msg] = logger.error.mock.calls[0] as [string];
      expect(msg).toContain('something went sideways');
    });

    it('works without a logger (logger is optional)', async () => {
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      notifyMock.notify.mockRejectedValueOnce(new Error('boom'));
      outbox.add(makeParams());

      await expect(outbox.flush()).resolves.toBeUndefined();
    });

    it('flush is safe to call twice — second call is a no-op', async () => {
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      outbox.add(makeParams());
      await outbox.flush();
      await outbox.flush();

      expect(notifyMock.notify).toHaveBeenCalledTimes(1);
    });
  });

  describe('discard()', () => {
    it('drops queued notifications without calling notify', async () => {
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      outbox.add(makeParams());
      outbox.add(makeParams({ userId: 'user-2' }));

      outbox.discard();

      expect(outbox.size()).toBe(0);
      await outbox.flush();
      expect(notifyMock.notify).not.toHaveBeenCalled();
    });

    it('after discard the outbox is reusable (queue is just cleared, not poisoned)', async () => {
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      outbox.add(makeParams());
      outbox.discard();

      outbox.add(makeParams({ userId: 'user-after-discard' }));
      await outbox.flush();

      expect(notifyMock.notify).toHaveBeenCalledTimes(1);
      expect(notifyMock.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-after-discard' }),
      );
    });
  });

  describe('rollback semantics — the headline use case', () => {
    it('discard() before flush() means notify is NEVER called (simulates tx rollback)', async () => {
      // This is the canonical scenario: webhook tx throws → outer
      // catch calls outbox.discard() → outbox.flush() never runs (or
      // runs as a no-op). The user must NOT get the email.
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      outbox.add(
        makeParams({
          userId: 'should-never-be-emailed',
          type: NotificationType.INVOICE_PAID,
        }),
      );

      // Tx rolled back.
      outbox.discard();

      // Even if flush runs (defensive), it's empty.
      await outbox.flush();

      expect(notifyMock.notify).not.toHaveBeenCalled();
    });

    it('flush() after a successful tx delivers the queued notification (simulates tx commit)', async () => {
      const notifyMock = makeNotifyMock();
      const outbox = new NotificationOutbox(
        notifyMock as unknown as NotificationService,
      );

      outbox.add(
        makeParams({
          userId: 'should-be-emailed',
          type: NotificationType.INVOICE_PAID,
        }),
      );

      // Tx committed.
      await outbox.flush();

      expect(notifyMock.notify).toHaveBeenCalledTimes(1);
      expect(notifyMock.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'should-be-emailed',
          type: NotificationType.INVOICE_PAID,
        }),
      );
    });
  });
});
