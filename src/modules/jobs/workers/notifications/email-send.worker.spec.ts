import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UnrecoverableError } from 'bullmq';
import { EmailSendWorker } from './email-send.worker';
import { EmailService } from '../../../../common/services/email.service';
import { NotificationReceiptService } from '../../../notification/services/notification-receipt.service';
import { PermanentError, TemporaryError } from '../../common/errors';
import { makeSilentLogger } from '../../../../../test/helpers/sequelize-mocks';

interface EmailMock {
  sendNotificationEmail: jest.Mock;
}
interface ReceiptMock {
  recordChannelOutcome: jest.Mock;
}

const fakeJob = (data: unknown, attempts = 0) =>
  ({
    data,
    queueName: 'notifications',
    name: 'email_send',
    id: 'job-test',
    attemptsMade: attempts,
  }) as unknown as Parameters<EmailSendWorker['process']>[0];

describe('EmailSendWorker', () => {
  let worker: EmailSendWorker;
  let email: EmailMock;
  let receipts: ReceiptMock;

  beforeEach(async () => {
    email = { sendNotificationEmail: jest.fn() };
    receipts = { recordChannelOutcome: jest.fn().mockResolvedValue(undefined) };

    const ref = await Test.createTestingModule({
      providers: [
        EmailSendWorker,
        { provide: EmailService, useValue: email },
        { provide: NotificationReceiptService, useValue: receipts },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    worker = ref.get(EmailSendWorker);
  });

  it('on success: sends the email and records "sent" on the receipt', async () => {
    email.sendNotificationEmail.mockResolvedValue({ ok: true });

    await worker.process(
      fakeJob({
        receiptId: 'r-1',
        to: 'u@example.com',
        title: 'Hi',
        body: 'World',
      }),
    );

    expect(email.sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'u@example.com', title: 'Hi' }),
    );
    expect(receipts.recordChannelOutcome).toHaveBeenCalledWith(
      'r-1',
      'email',
      'sent',
    );
  });

  it('on failure: records "failed:<reason>" then throws TemporaryError so BullMQ retries', async () => {
    email.sendNotificationEmail.mockResolvedValue({
      ok: false,
      reason: 'resend 503 service unavailable',
    });

    await expect(
      worker.process(
        fakeJob({
          receiptId: 'r-1',
          to: 'u@example.com',
          title: 'Hi',
          body: 'World',
        }),
      ),
    ).rejects.toThrow(/resend 503/);

    // Receipt recorded the failure even though the worker is going
    // to retry — the audit field reflects the latest attempt.
    expect(receipts.recordChannelOutcome).toHaveBeenCalledWith(
      'r-1',
      'email',
      expect.stringMatching(/^failed:resend 503/) as string,
    );
  });

  it('TemporaryError bubbles up unchanged (BullMQ default retry)', async () => {
    // Force the email service to throw a transient error directly.
    email.sendNotificationEmail.mockRejectedValue(
      new TemporaryError('network blip'),
    );

    await expect(
      worker.process(
        fakeJob({
          receiptId: 'r-1',
          to: 'u@example.com',
          title: 'Hi',
          body: 'World',
        }),
      ),
    ).rejects.toBeInstanceOf(TemporaryError);
  });

  it('PermanentError gets wrapped in UnrecoverableError so BullMQ stops retrying', async () => {
    // Some jobs may upgrade specific failures to PermanentError —
    // we verify BaseWorker's translation works as intended.
    email.sendNotificationEmail.mockRejectedValue(
      new PermanentError('invalid email format'),
    );

    await expect(
      worker.process(
        fakeJob({
          receiptId: 'r-1',
          to: 'u@example.com',
          title: 'Hi',
          body: 'World',
        }),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
