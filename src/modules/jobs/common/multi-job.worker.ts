import { Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type { Job } from 'bullmq';
import { JobContext, buildJobContext } from './job-context';
import { PermanentError } from './errors';
import { runHandler } from './run-handler';

/**
 * A single named-job handler. Typed per registry entry by the
 * subclass — see the `handlers` map below.
 */
export type JobHandler = (payload: never, ctx: JobContext) => Promise<void>;

/**
 * Base class for workers that own a whole queue with MORE THAN ONE
 * named job ("processor per queue"). The single-job counterpart is
 * `BaseWorker`.
 *
 * Subclasses populate `handlers`, keyed by the **bare** job name
 * (the part after the dot — e.g. `reminder_dispatch` for
 * `sessions.reminder_dispatch`). `JobsService.enqueue` adds the job
 * under that bare name, which is what BullMQ reports as `job.name`.
 *
 * `process()`:
 *   1. Builds a `JobContext` (tagged logger + attempt count).
 *   2. Routes to `handlers[job.name]`.
 *   3. Unknown name → `PermanentError` (no point retrying — the code
 *      that would handle it doesn't exist). It lands in the failed
 *      queue for investigation rather than burning the retry budget.
 *   4. Delegates retry-translation to the shared `runHandler`.
 *
 * Each handler method on the subclass keeps its precise payload type;
 * the `never` param on the stored signature is what makes a
 * specifically-typed handler assignable into the generic map (the
 * `job.data as never` cast is the dispatch boundary).
 */
export abstract class MultiJobWorker extends WorkerHost {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    protected readonly logger: LoggerService,
  ) {
    super();
  }

  /** Map of bare job name → handler. Populated by the subclass. */
  protected abstract readonly handlers: Record<string, JobHandler>;

  async process(job: Job): Promise<void> {
    const ctx = buildJobContext(job, this.logger);
    await runHandler(ctx, () => {
      const handler = this.handlers[job.name];
      if (!handler) {
        // Inside runHandler so it's translated to UnrecoverableError —
        // no point retrying a job whose handler doesn't exist.
        throw new PermanentError(
          `no handler registered for job "${job.queueName}.${job.name}"`,
        );
      }
      return handler(job.data as never, ctx);
    });
  }
}
