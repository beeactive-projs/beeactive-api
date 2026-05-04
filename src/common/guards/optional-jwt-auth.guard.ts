import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

/**
 * Soft JWT guard for endpoints that work with OR without a session.
 *
 * If the request includes a valid Bearer token, `req.user` is populated
 * the same way as the strict `AuthGuard('jwt')`. If the token is missing
 * or invalid, the request is allowed through with `req.user` left
 * undefined — controllers must handle the anonymous case explicitly.
 *
 * Used for endpoints like `GET /groups/discover` which are public-by-
 * default but personalize their response (e.g. "exclude groups I'm
 * already a member of") when the caller is signed in.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  /**
   * Override the default error-throwing behavior: a missing/invalid
   * token is fine — we just return `null` so passport leaves
   * `req.user === undefined`.
   */
  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const req = context.switchToHttp().getRequest<Request>();
      // Surface the absence of a credentialed user without throwing.
      (req as Request & { user?: unknown }).user = undefined;
      return undefined as unknown as TUser;
    }
    return user;
  }
}
