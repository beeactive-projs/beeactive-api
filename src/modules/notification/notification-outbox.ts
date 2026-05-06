import type { LoggerService } from '@nestjs/common';
import { NotificationService, NotifyParams } from './notification.service';

/**
 * NotificationOutbox — collects pending notifications during a unit
 * of work (typically a webhook transaction) and flushes them AFTER
 * the transaction commits.
 *
 * Why we need this:
 *   `NotificationService.notify()` opens its own transaction. If we
 *   call notify() inside a webhook tx that later rolls back, the
 *   notification row + email job have already committed/enqueued —
 *   the user gets a "payment received" email for a payment that
 *   never finalized.
 *
 * Usage:
 *   const outbox = new NotificationOutbox(notificationService, log);
 *   await sequelize.transaction(async (tx) => {
 *     await someService.syncStuff(payload, tx, outbox);
 *     // service calls outbox.add({...}) instead of notify()
 *   });
 *   await outbox.flush();  // ← only fires if the tx committed
 *
 * Failures during flush are logged but never thrown — the webhook
 * has already returned 200 to Stripe at that point and we don't want
 * a flaky notification to trigger a webhook retry of work that's
 * already committed. Operators see the failure in logs and Bull
 * Board (since the email job would also fail to enqueue).
 *
 * Future evolution: this is a stepping stone toward the proper
 * outbox pattern from research file 08, where pending notifications
 * are persisted to a `notification_outbox` table inside the same
 * transaction as the domain change, then drained by a background
 * worker. That gives at-least-once durability across crashes; the
 * in-memory version here gives at-most-once-after-commit, which is
 * a strict improvement over the current "fire inside the tx" pattern.
 */
export class NotificationOutbox {
  private readonly pending: NotifyParams[] = [];

  constructor(
    private readonly notifications: NotificationService,
    private readonly logger?: LoggerService,
  ) {}

  /**
   * Queue a notification for delivery after the surrounding
   * transaction commits. Idempotent against duplicate calls in the
   * same outbox lifecycle (we don't dedupe — but multiple `add`s
   * with the same fingerprint will dedupe at the
   * NotificationService level when flushed).
   */
  add(params: NotifyParams): void {
    this.pending.push(params);
  }

  /**
   * Drop everything queued. Use when the surrounding transaction
   * has rolled back — these notifications shouldn't fire.
   */
  discard(): void {
    this.pending.length = 0;
  }

  /**
   * Fire every queued notification. Called AFTER the surrounding
   * transaction commits successfully. Each notify is wrapped in a
   * try/catch so one failure doesn't prevent the others — webhook
   * handlers usually have multiple side effects (one notify for
   * the instructor, one for the client) and we want both to fire
   * even if one user's row was just deleted.
   */
  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const items = [...this.pending];
    this.pending.length = 0;
    for (const params of items) {
      try {
        await this.notifications.notify(params);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger?.error?.(
          `[NotificationOutbox] failed to deliver ${params.type} → ${params.userId}: ${msg}`,
          err instanceof Error ? err.stack : undefined,
          'NotificationOutbox',
        );
      }
    }
  }

  /** Diagnostic helper for tests. */
  size(): number {
    return this.pending.length;
  }
}
