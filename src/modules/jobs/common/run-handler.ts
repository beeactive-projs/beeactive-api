import { UnrecoverableError } from 'bullmq';
import { JobContext } from './job-context';
import { PermanentError, TemporaryError } from './errors';

/**
 * Run a worker handler with the shared retry-translation semantics.
 *
 * Both `BaseWorker` (single-job queues) and `MultiJobWorker`
 * (multi-job queues) route through here so the error→retry mapping
 * lives in exactly one place:
 *
 *   - `PermanentError` → `UnrecoverableError` (skip remaining attempts,
 *     land in the failed queue immediately).
 *   - `TemporaryError` or any unclassified throw → bubble up so BullMQ
 *     retries per the queue's `attempts` config.
 *
 * Emits one info line on entry + exit (Bull Board picks these up).
 */
export async function runHandler(
  ctx: JobContext,
  fn: () => Promise<void>,
): Promise<void> {
  ctx.log.log('starting');

  try {
    await fn();
    ctx.log.log('done');
  } catch (err) {
    if (err instanceof PermanentError) {
      ctx.log.error(`permanent: ${err.message}`);
      throw new UnrecoverableError(err.message);
    }

    if (err instanceof TemporaryError) {
      ctx.log.warn(`transient: ${err.message} — will retry`);
      throw err;
    }

    // Unknown error — treat as transient. Permanent failures must be
    // explicitly classified by handlers, never assumed.
    const message = err instanceof Error ? err.message : String(err);
    ctx.log.error(`unclassified error: ${message} — will retry`);
    throw err;
  }
}
