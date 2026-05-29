import { Injectable, OnModuleDestroy } from '@nestjs/common';

/**
 * Records the last SSE event id the client confirmed seeing. The
 * FE pings POST /messaging/stream/ack with the id of the most-recently
 * processed event so the server can:
 *
 *   1. Tell whether a stream is "alive" — if no ack arrives for >2x
 *      the heartbeat window, the FE has likely dropped the connection
 *      (proxy buffering or backgrounded tab).
 *   2. Eventually support replay-from-cursor: if you reconnect with
 *      `Last-Event-ID` (built into EventSource), we could re-emit
 *      anything you missed. v1 doesn't do replay — the FE falls back
 *      to a one-shot REST refresh on reconnect — but the ack metadata
 *      is captured here so v2 can light up replay without a migration.
 *
 * In-memory only for v1. Swap for Redis the day we go multi-instance.
 * The interface (recordAck / getLastAck) stays stable.
 */
@Injectable()
export class MessagingStreamAckService implements OnModuleDestroy {
  /** TTL in ms — drop entries that haven't been touched in 1h. */
  static readonly ACK_TTL_MS = 60 * 60 * 1000;

  private readonly acks = new Map<
    string,
    { lastEventId: string; updatedAt: number }
  >();

  private readonly sweepTimer: NodeJS.Timeout = setInterval(
    () => this.sweep(),
    5 * 60 * 1000,
  ).unref();

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
    this.acks.clear();
  }

  recordAck(userId: string, lastEventId: string): void {
    this.acks.set(userId, { lastEventId, updatedAt: Date.now() });
  }

  getLastAck(userId: string): {
    lastEventId: string;
    updatedAt: number;
  } | null {
    const row = this.acks.get(userId);
    if (!row) return null;
    if (Date.now() - row.updatedAt > MessagingStreamAckService.ACK_TTL_MS) {
      this.acks.delete(userId);
      return null;
    }
    return row;
  }

  private sweep(): void {
    const cutoff = Date.now() - MessagingStreamAckService.ACK_TTL_MS;
    for (const [userId, row] of this.acks) {
      if (row.updatedAt < cutoff) this.acks.delete(userId);
    }
  }
}
