/**
 * Central catalog of every queue + job + payload type.
 *
 * Two reasons this lives in one file:
 *
 * 1. Type safety end-to-end. Producers call
 *    `jobs.enqueue('notifications.email_send', payload)` and TypeScript
 *    enforces that `payload` has the right shape. If we miss a field
 *    or pass garbage, the compiler catches it.
 *
 * 2. Adding a new job is a one-line change here + one new worker file.
 *    No need to touch the JobsService or wire up new types in three
 *    different places.
 *
 * Naming convention: `<queueName>.<jobName>`. The dot-prefix makes it
 * easy to grep producers ("who enqueues notifications.* ?") and lets
 * us add per-queue concerns later (separate concurrency, separate
 * retention, separate workers on different dynos).
 */

/**
 * Queue names. Keep these short and lowercase — they show up in
 * Redis keys and the Bull Board UI. Add a new entry only when a job
 * needs different concurrency/retry/retention from existing queues.
 *
 * Today there's just `notifications`. Future queues per the research
 * synthesis will include `payments`, `sessions`, `auth`, `analytics`,
 * `maintenance`, `media`. Each gets its own row in QUEUE_DEFAULTS.
 */
export enum QueueName {
  Notifications = 'notifications',
}

/**
 * The full set of registered jobs. The keys MUST match
 * `<QueueName>.<jobName>` exactly — JobsService splits on the dot to
 * route to the right BullMQ queue.
 *
 * Phase 6 ships exactly one job (`notifications.email_send`) so the
 * shape is small. Subsequent phases add entries here.
 */
export interface JobPayloads {
  /**
   * Send a single notification email via Resend. The payload contains
   * everything the worker needs — no DB lookups required during
   * delivery (which keeps the worker fast and lets us retry without
   * worrying about DB state changing under us).
   */
  'notifications.email_send': {
    /** Receipt id — used for the BullMQ jobId so we get idempotency
     *  for free (the producer can re-enqueue after a transient failure
     *  and BullMQ will dedupe on this id). */
    receiptId: string;
    /** Recipient email address. */
    to: string;
    /** Subject line. Same string we store on the notification row. */
    title: string;
    /** Email body text. Same string we store on the notification row. */
    body: string;
    /** Optional CTA URL pre-built by NotificationService.buildCtaUrl().
     *  We pre-build it on the producer side so the worker doesn't
     *  need access to ConfigService. */
    ctaUrl?: string;
    /** Button label shown next to the CTA URL. */
    ctaLabel?: string;
  };
}

/**
 * Type-level helper: pull the payload type for a given job name. Used
 * by JobsService.enqueue<K>() and by BaseWorker so handlers know the
 * exact shape they'll receive.
 */
export type JobPayload<K extends keyof JobPayloads> = JobPayloads[K];

/**
 * The set of valid job names. Useful in places where we need a
 * runtime check (e.g. testing whether a string belongs to the
 * registry).
 */
export const ALL_JOB_NAMES: ReadonlyArray<keyof JobPayloads> = [
  'notifications.email_send',
] as const;

/**
 * Per-queue defaults applied to every job in that queue unless
 * overridden at enqueue time. The numbers come from
 * docs/research/jobs-system/02-bullmq-architecture-patterns.md.
 *
 *   attempts          how many times we retry on transient failure
 *   backoff           exponential delay between retries
 *   removeOnComplete  retention for successful jobs (size + age caps)
 *   removeOnFail      retention for failed jobs (longer — useful for
 *                     postmortem when something goes wrong)
 *
 * The retention caps are how we stay under 30 MB on Redis Cloud free
 * (see docs/research/jobs-system/redis-free-tier-decision.md).
 */
export const QUEUE_DEFAULTS = {
  [QueueName.Notifications]: {
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential' as const, delay: 2_000 },
      removeOnComplete: { age: 86_400, count: 1_000 }, // 1 day or 1k jobs
      removeOnFail: { age: 7 * 86_400, count: 5_000 }, // 7 days or 5k jobs
    },
  },
} as const;

/**
 * Helper: split a registry key into its queue name and bare job name.
 *   parseJobKey('notifications.email_send')
 *     → { queue: 'notifications', name: 'email_send' }
 */
export function parseJobKey<K extends keyof JobPayloads>(
  key: K,
): { queue: QueueName; name: string } {
  const [queue, ...rest] = (key as string).split('.');
  return { queue: queue as QueueName, name: rest.join('.') };
}
