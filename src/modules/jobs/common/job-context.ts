import type { LoggerService } from '@nestjs/common';
import type { Job } from 'bullmq';

/**
 * Context passed to every worker handler. Carries:
 *
 *   - `log`: a tagged logger that auto-includes the job id, queue
 *     name, and attempt number on every entry. Saves callers from
 *     repeating the same context fields, and makes log searches
 *     trivial when something fails ("show me everything for job
 *     id=abc123").
 *
 *   - `job`: the raw BullMQ Job in case the handler needs metadata
 *     we haven't surfaced (rare; most handlers only need `payload`).
 *
 *   - `attempt`: 1-indexed attempt number. Useful for logging
 *     ("retrying after 3 failures") without reaching into job.
 */
export interface JobContext {
  log: LoggerService;
  job: Job;
  attempt: number;
}

/**
 * Build a JobContext from a BullMQ job + the parent logger. The
 * tagged logger uses NestJS's standard `(message, context)` shape so
 * Winston picks it up consistently with the rest of the app.
 */
export function buildJobContext(
  job: Job,
  parentLogger: LoggerService,
): JobContext {
  const tag = `job(${job.queueName}.${job.name}#${job.id ?? '?'} attempt=${job.attemptsMade + 1})`;

  // The `void` operator discards the return value so each lambda's
  // type is `(...) => void` rather than `(...) => any`. NestJS's
  // LoggerService method signatures return `any` (sigh), and without
  // the `void` wrapper TS would propagate that out — making every
  // call to ctx.log.* a "no-unsafe-return" lint warning.
  const log: LoggerService = {
    log: (msg: unknown): void => void parentLogger.log?.(String(msg), tag),
    error: (msg: unknown, trace?: unknown): void =>
      void parentLogger.error?.(String(msg), trace as string | undefined, tag),
    warn: (msg: unknown): void => void parentLogger.warn?.(String(msg), tag),
    debug: (msg: unknown): void => void parentLogger.debug?.(String(msg), tag),
    verbose: (msg: unknown): void =>
      void parentLogger.verbose?.(String(msg), tag),
  };

  return { log, job, attempt: job.attemptsMade + 1 };
}
