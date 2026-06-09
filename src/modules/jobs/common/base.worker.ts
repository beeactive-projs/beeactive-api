import { Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { type Job } from 'bullmq';
import { JobPayload, JobPayloads } from '../job-registry';
import { buildJobContext, JobContext } from './job-context';
import { runHandler } from './run-handler';

/**
 * Shared base class for every BullMQ worker.
 *
 * Subclasses extend this and implement `handle(payload, ctx)`. They
 * don't override `process()` — that's the BullMQ entry point and is
 * already wired here to:
 *
 *   1. Type-narrow `job.data` to the correct payload shape (via the
 *      `K extends keyof JobPayloads` generic — picks the right entry
 *      out of the registry).
 *
 *   2. Build a JobContext (tagged logger + job ref + attempt count)
 *      so handlers don't have to do logger boilerplate.
 *
 *   3. Translate our error types into BullMQ's retry semantics:
 *      - `PermanentError` → `UnrecoverableError` (skip remaining
 *        attempts, land in failed queue)
 *      - `TemporaryError` or any random throw → bubble up (BullMQ
 *        will retry per the queue's `attempts` config)
 *
 *   4. Emit a single info-level log line per attempt, which Bull
 *      Board picks up automatically.
 *
 * Subclasses are kept tiny — the boring bits live here.
 */
export abstract class BaseWorker<
  K extends keyof JobPayloads,
> extends WorkerHost {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    protected readonly logger: LoggerService,
  ) {
    super();
  }

  /**
   * The unit of work. Subclasses do their thing here; throw a
   * Temporary/PermanentError (or any Error) to fail the attempt.
   *
   * Successful return = job marked complete in BullMQ.
   */
  abstract handle(payload: JobPayload<K>, ctx: JobContext): Promise<void>;

  /**
   * BullMQ entry point. Don't override in subclasses — extend
   * `handle()` instead. The error→retry translation lives in the
   * shared `runHandler` helper (also used by `MultiJobWorker`).
   */
  async process(job: Job<JobPayload<K>>): Promise<void> {
    const ctx = buildJobContext(job, this.logger);
    await runHandler(ctx, () => this.handle(job.data, ctx));
  }
}
