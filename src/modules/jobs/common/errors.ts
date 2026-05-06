/**
 * Worker error types — control how BullMQ retries.
 *
 * BullMQ retries by default. That's fine for transient failures (a
 * Resend 5xx, a network blip) but wrong for permanent ones (the email
 * address is malformed, the entity was deleted). For permanent errors
 * we want the job to fail-fast and land in the failed queue so we can
 * investigate, not burn the retry budget.
 *
 * The pattern: `BaseWorker.process()` catches `PermanentError` and
 * wraps it in BullMQ's `UnrecoverableError`, which tells BullMQ "skip
 * remaining attempts." Anything else (TemporaryError or random throw)
 * goes through normal retry.
 */

/**
 * Throw when the failure is retryable — the job will likely succeed
 * on a future attempt.
 *
 *   throw new TemporaryError('resend 503 service unavailable');
 *   throw new TemporaryError('postgres connection lost', { cause: err });
 */
export class TemporaryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TemporaryError';
  }
}

/**
 * Throw when the failure is permanent — retrying won't help.
 *
 *   throw new PermanentError('invalid email format');
 *   throw new PermanentError('user deleted', { cause: err });
 */
export class PermanentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentError';
  }
}
