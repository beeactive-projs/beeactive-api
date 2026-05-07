import type { LoggerService } from '@nestjs/common';
import { NotificationService, NotifyParams } from './notification.service';

/**
 * Collects pending notifications inside a transaction and flushes
 * them AFTER commit. Use this in webhook handlers that receive `tx`
 * from a dispatcher — you can't call notify() directly because
 * `notify()` opens its own transaction and a rollback would orphan
 * the alert.
 *
 * For service methods that own their own tx, place `notify()` AFTER
 * the transaction wrapper resolves instead. See CODE_STANDARDS.md §8.
 */
export class NotificationOutbox {
  private readonly pending: NotifyParams[] = [];

  constructor(
    private readonly notifications: NotificationService,
    private readonly logger?: LoggerService,
  ) {}

  /** Queue a notification; deduped at flush time via fingerprint. */
  add(params: NotifyParams): void {
    this.pending.push(params);
  }

  /** Drop the queue; call when the surrounding tx rolled back. */
  discard(): void {
    this.pending.length = 0;
  }

  /**
   * Fire all queued notifications. Per-item failures are logged and
   * swallowed so one bad recipient doesn't block siblings.
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

  /** Test-only diagnostic. */
  size(): number {
    return this.pending.length;
  }
}
