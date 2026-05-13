import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that activates the `messaging-sse` strategy (SseJwtStrategy).
 *
 * Used exclusively by the SSE stream endpoint. Every other endpoint
 * uses `AuthGuard('jwt')` and continues to require the
 * `Authorization` header.
 *
 * Security: this guard accepts a JWT from the `?token=` query
 * parameter. NEVER reuse it on another endpoint — query-string tokens
 * leak via browser history, referrer headers, and proxy access logs.
 * Grep for `messaging-sse` to verify there is only one call site.
 */
@Injectable()
export class SseJwtGuard extends AuthGuard('messaging-sse') {}
