import { Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { EmailService } from '../../../../common/services/email.service';
import { NotificationReceiptService } from '../../../notification/services/notification-receipt.service';
import { BaseWorker } from '../../common/base.worker';
import { JobContext } from '../../common/job-context';
import { TemporaryError } from '../../common/errors';
import { JobPayload, QueueName } from '../../job-registry';

/**
 * Async email send for the notification system.
 *
 * Producers (NotificationService.deliverToUser) used to call
 * EmailService.sendNotificationEmail() directly, which blocked the
 * request path on Resend's API (~200-500ms per email). Now they
 * enqueue a job here instead and the request returns immediately.
 *
 * The worker:
 *   1. Calls EmailService.sendNotificationEmail()
 *   2. Records the result on the receipt's `delivered_channels`
 *      so the audit field stays accurate ("did the email actually
 *      go out?"). On failure it records the reason — useful when
 *      a user reports they never got the email.
 *   3. Throws TemporaryError on failure so BullMQ retries with
 *      exponential backoff (5 attempts default per
 *      QUEUE_DEFAULTS.notifications).
 *
 * Idempotency: the producer enqueues with `jobId = receipt.id`, so
 * re-enqueueing the same receipt (e.g. after a transient producer
 * failure) is a no-op at the BullMQ level.
 */
@Processor(QueueName.Notifications)
export class EmailSendWorker extends BaseWorker<'notifications.email_send'> {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    logger: LoggerService,
    private readonly emailService: EmailService,
    private readonly receiptService: NotificationReceiptService,
  ) {
    super(logger);
  }

  async handle(
    payload: JobPayload<'notifications.email_send'>,
    ctx: JobContext,
  ): Promise<void> {
    const status = await this.emailService.sendNotificationEmail({
      to: payload.to,
      title: payload.title,
      body: payload.body,
      ctaUrl: payload.ctaUrl,
      ctaLabel: payload.ctaLabel,
    });

    if (status.ok) {
      await this.receiptService.recordChannelOutcome(
        payload.receiptId,
        'email',
        'sent',
      );
      ctx.log.log(`email sent to ${payload.to}`);
      return;
    }

    // Persist the failure on the receipt before throwing — even if
    // we never recover, the audit field tells us why.
    await this.receiptService.recordChannelOutcome(
      payload.receiptId,
      'email',
      `failed:${status.reason.slice(0, 200)}`,
    );

    // Throw TemporaryError → BaseWorker bubbles it → BullMQ retries.
    // We treat all Resend failures as transient — Resend's failure
    // modes are mostly rate-limits and 5xx blips, both retryable.
    // If we ever see a class of error that's clearly permanent
    // (e.g. invalid email format), we can promote those to
    // PermanentError here.
    throw new TemporaryError(`resend send failed: ${status.reason}`);
  }
}
