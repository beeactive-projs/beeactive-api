import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Queue } from 'bullmq';
import {
  JobPayload,
  JobPayloads,
  parseJobKey,
  QueueName,
} from './job-registry';

/**
 * Per-call options when enqueueing.
 *
 *   jobId  — explicit BullMQ job id. We default to a sensible value
 *            in callers (e.g. the receipt id) so a duplicate enqueue
 *            for the same logical event is idempotent: BullMQ silently
 *            drops the second add when the id is already in the queue.
 *   delay  — schedule the job for N ms in the future
 *   runAt  — sugar over `delay` for absolute timestamps ("run at
 *            tomorrow 9am UTC"). Computed against Date.now() at call
 *            time.
 *   attempts / backoff — override the queue's defaults for one job.
 *            Almost never needed; queue-level defaults are the right
 *            knob 99% of the time.
 */
export interface EnqueueOptions {
  jobId?: string;
  delay?: number;
  runAt?: Date;
  attempts?: number;
}

/**
 * The producer-facing API for the jobs system.
 *
 * Every other module in the app talks to this service when it wants
 * something done async. Nobody else imports `bullmq` directly — that
 * keeps the BullMQ dependency confined to this module so we could
 * swap to a different queue backend later (or run a no-op double in
 * tests) without touching producers.
 *
 * Behaviour when Redis is unavailable:
 *   - On boot, `app.module.ts` only registers `BullModule` if
 *     `REDIS_HOST` is set.
 *   - When unset (typical local dev without docker), this service
 *     can't resolve any queues and falls back to no-op + warning log.
 *   - Producers see no error — their `enqueue()` returns `null`
 *     instead of a Job. They don't have to special-case it.
 *
 * Type safety: the K generic constrains the payload to the registry
 * entry. If you mistype the job name or pass the wrong shape, TS
 * fails at the call site, not at runtime.
 */
@Injectable()
export class JobsService {
  // BullMQ Queue refs, looked up lazily via ModuleRef.
  // We can't use `@InjectQueue` directly here because that decorator
  // requires the queue to exist — and queues only exist when
  // BullModule.registerQueue() ran (which happens conditionally
  // based on REDIS_HOST). ModuleRef.get() with `strict: false` lets
  // us probe for the queue and gracefully no-op when missing.
  private queueCache = new Map<QueueName, Queue | null>();

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Enqueue a job. Returns the BullMQ Job on success, or null when
   * Redis isn't configured (dev mode without REDIS_HOST).
   *
   * Producers don't usually need to inspect the return value — the
   * `jobId` option is the right way to get idempotency, not by
   * caching the return.
   */
  async enqueue<K extends keyof JobPayloads>(
    name: K,
    payload: JobPayload<K>,
    opts: EnqueueOptions = {},
  ): Promise<unknown> {
    const queue = this.getQueue(parseJobKey(name).queue);
    if (!queue) {
      this.logger.warn?.(
        `[JobsService] no queue available for ${String(name)} — Redis not configured. Dropping job.`,
        'JobsService',
      );
      return null;
    }

    const { name: jobName } = parseJobKey(name);
    const delay =
      opts.runAt !== undefined
        ? Math.max(0, opts.runAt.getTime() - Date.now())
        : opts.delay;

    return queue.add(jobName, payload, {
      jobId: opts.jobId,
      delay,
      attempts: opts.attempts,
    });
  }

  /**
   * Lazy queue lookup with caching. We try once and remember the
   * result so subsequent enqueues don't pay the lookup cost.
   *
   * The `as` cast is safe because BullModule.registerQueue() always
   * provides a Queue at the right token — if it's missing it's
   * because BullModule isn't registered (no Redis), and we already
   * handle that by returning null below.
   */
  private getQueue(queueName: QueueName): Queue | null {
    if (this.queueCache.has(queueName)) {
      return this.queueCache.get(queueName) ?? null;
    }
    let queue: Queue | null = null;
    try {
      queue = this.moduleRef.get<Queue>(getQueueToken(queueName), {
        strict: false,
      });
    } catch {
      queue = null;
    }
    this.queueCache.set(queueName, queue);
    return queue;
  }
}
