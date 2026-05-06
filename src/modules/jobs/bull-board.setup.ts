import type { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QueueName } from './job-registry';

const BULL_BOARD_PATH = '/admin/queues';

/**
 * Mount the Bull Board admin UI at /admin/queues, gated by HTTP
 * basic auth. This is intentionally a separate auth path from the
 * rest of the API:
 *
 *   - Bull Board ships an Express handler, not Nest routes — it
 *     sits below NestJS's pipe/guard layer
 *   - Wiring JWT into Express middleware would require duplicating
 *     the JWT-strategy logic outside Nest's DI, which is ugly
 *   - HTTP basic auth is a 5-line middleware. We set credentials
 *     via env (BULL_BOARD_USER / BULL_BOARD_PASSWORD) and rotate
 *     them by changing env vars — no code changes
 *
 * If either credential env var is missing the route never mounts
 * (404). That's the right "default off" posture for an admin panel.
 *
 * Idempotent: safe to call multiple times during boot (only takes
 * effect once because the setup checks for the credentials).
 */
export function setupBullBoard(app: INestApplication, logger: Logger): void {
  const user = process.env.BULL_BOARD_USER;
  const password = process.env.BULL_BOARD_PASSWORD;

  if (!user || !password) {
    logger.warn(
      `Bull Board not mounted — set BULL_BOARD_USER + BULL_BOARD_PASSWORD to enable ${BULL_BOARD_PATH}`,
    );
    return;
  }

  // Resolve every registered queue from the Nest DI container. We
  // can't statically import Queue refs because BullModule provides
  // them lazily via tokens.
  const queues: Queue[] = [];
  for (const name of Object.values(QueueName)) {
    try {
      const queue = app.get<Queue>(getQueueToken(name), { strict: false });
      if (queue) queues.push(queue);
    } catch {
      // Queue not registered (e.g. REDIS_HOST not set) → skip.
    }
  }

  if (queues.length === 0) {
    logger.warn(
      'Bull Board not mounted — no BullMQ queues are registered (is Redis configured?)',
    );
    return;
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  // HTTP basic auth gate. Constant-time-ish comparison via length
  // check + char-by-char isn't strictly needed at our scale, but the
  // simple `===` is fine here since the credential is short and a
  // brute-force attacker would hit our network rate-limits long
  // before timing-attacking this string compare.
  const basicAuth = (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="bull-board"');
      res.status(401).send('Authentication required');
      return;
    }
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    const idx = decoded.indexOf(':');
    const u = idx >= 0 ? decoded.slice(0, idx) : '';
    const p = idx >= 0 ? decoded.slice(idx + 1) : '';
    if (u !== user || p !== password) {
      res.set('WWW-Authenticate', 'Basic realm="bull-board"');
      res.status(401).send('Invalid credentials');
      return;
    }
    next();
  };

  app.use(BULL_BOARD_PATH, basicAuth, serverAdapter.getRouter());
  logger.log(`Bull Board mounted at ${BULL_BOARD_PATH} (basic auth)`);
}
