import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Queue, type JobType } from 'bullmq';
import {
  JobPayload,
  JobPayloads,
  parseJobKey,
  QueueName,
  type TriggerableJobName,
} from './job-registry';

/** Per-queue live counts for the admin Operations screen. */
export interface QueueOverview {
  name: QueueName;
  available: boolean;
  counts: Record<string, number> | null;
}

/** A single job's snapshot for the admin Operations jobs list. */
export interface QueueJob {
  id: string;
  queue: QueueName;
  name: string;
  state: string;
  attemptsMade: number;
  timestamp: number | null;
  processedOn: number | null;
  finishedOn: number | null;
  failedReason: string | null;
}

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
    // Clean drop when Redis isn't configured. Queues are registered
    // unconditionally (so their tokens exist) but have no live
    // connection without `BullModule.forRoot`, so we must not call
    // `queue.add`. Checked at call time, when `.env` is fully loaded.
    if (!process.env.REDIS_HOST) {
      this.logger.warn?.(
        `[JobsService] Redis not configured — dropping ${String(name)}.`,
        'JobsService',
      );
      return null;
    }

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
   * Live per-queue job counts for the admin Operations screen. Keeps the
   * BullMQ dependency inside this module (admin never imports bullmq).
   * When Redis isn't configured, every queue reports available=false.
   */
  async getQueuesOverview(): Promise<{
    redisEnabled: boolean;
    queues: QueueOverview[];
  }> {
    const redisEnabled = !!process.env.REDIS_HOST;
    const queues = await Promise.all(
      Object.values(QueueName).map(async (qn): Promise<QueueOverview> => {
        const queue = redisEnabled ? this.getQueue(qn) : null;
        if (!queue) return { name: qn, available: false, counts: null };
        try {
          const counts = await queue.getJobCounts(
            'waiting',
            'active',
            'completed',
            'failed',
            'delayed',
            'paused',
          );
          return { name: qn, available: true, counts };
        } catch {
          return { name: qn, available: false, counts: null };
        }
      }),
    );
    return { redisEnabled, queues };
  }

  /**
   * Recent jobs across the key states for one queue (admin Operations
   * jobs list). Returns up to `perState` jobs per state, newest first.
   * Empty + available:false when Redis isn't configured.
   */
  async getQueueJobs(
    queueName: QueueName,
    perState = 10,
  ): Promise<{ available: boolean; jobs: QueueJob[] }> {
    const queue = process.env.REDIS_HOST ? this.getQueue(queueName) : null;
    if (!queue) return { available: false, jobs: [] };

    const states: JobType[] = [
      'active',
      'waiting',
      'delayed',
      'failed',
      'completed',
    ];
    const out: QueueJob[] = [];
    for (const state of states) {
      const list = await queue.getJobs([state], 0, perState - 1, false);
      for (const j of list) {
        if (!j) continue;
        out.push({
          id: String(j.id),
          queue: queueName,
          name: j.name,
          state,
          attemptsMade: j.attemptsMade ?? 0,
          timestamp: j.timestamp ?? null,
          processedOn: j.processedOn ?? null,
          finishedOn: j.finishedOn ?? null,
          failedReason: state === 'failed' ? (j.failedReason ?? null) : null,
        });
      }
    }
    out.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    return { available: true, jobs: out };
  }

  /**
   * Re-run a finished job by id. Only `failed` or `completed` jobs can be
   * retried (in-flight ones can't). Returns the resulting state.
   */
  async retryJob(
    queueName: QueueName,
    jobId: string,
  ): Promise<{ id: string; state: string }> {
    const queue = this.getQueue(queueName);
    if (!queue) {
      return { id: jobId, state: 'unavailable' };
    }
    const job = await queue.getJob(jobId);
    if (!job) {
      return { id: jobId, state: 'not_found' };
    }
    const state = await job.getState();
    if (state === 'failed') await job.retry('failed');
    else if (state === 'completed') await job.retry('completed');
    else return { id: jobId, state }; // in-flight — nothing to retry
    return { id: jobId, state: await job.getState() };
  }

  /**
   * Manually fire an idempotent sweep job (admin "run now"). Only the
   * sweeps in TRIGGERABLE_JOBS reach here (validated by the caller). All
   * such jobs take a `{ runKey }` payload, so this is type-safe.
   */
  async triggerCron(
    name: TriggerableJobName,
  ): Promise<{ enqueued: boolean; jobId: string | null }> {
    const job = await this.enqueue(name, { runKey: `manual-${Date.now()}` });
    const jobId =
      job && typeof job === 'object' && 'id' in job
        ? String((job as { id?: string | number }).id ?? '')
        : null;
    return { enqueued: !!job, jobId: jobId || null };
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
