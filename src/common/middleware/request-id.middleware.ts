import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request ID Middleware
 *
 * Generates a unique ID for each HTTP request.
 * This ID is:
 * - Returned in response headers (X-Request-ID)
 * - Available in logs to trace a request through the entire app
 * - Super helpful for debugging in production!
 *
 * Example: User reports error → you search logs by request ID → see the full story
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Check if client sent a request ID (useful for distributed systems)
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    // Store it in the request object so we can access it anywhere
    req['requestId'] = requestId;

    // Send it back in the response so client can reference it
    res.setHeader('X-Request-ID', requestId);

    next();
  }
}

// Extend Express Request type to include requestId
// This makes TypeScript happy when we use req.requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
