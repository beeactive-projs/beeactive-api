import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { UserService } from '../../user/user.service';

/**
 * Second JWT strategy, dedicated to the SSE stream.
 *
 * Reasoning: browser `EventSource` cannot set custom request headers,
 * so the access token can't go in `Authorization: Bearer`. We accept
 * it as a query parameter on the stream endpoint instead. We MUST NOT
 * change the default `'jwt'` strategy to also accept query tokens —
 * that would weaken every authenticated REST endpoint and create
 * referer-log / CSRF-style leakage problems.
 *
 * Keeping this strategy in a separate file under the messaging module
 * makes the trade-off local and easy to reason about. The only thing
 * the FE may use a query-string token for is `GET /messaging/stream`.
 *
 * Naming: the strategy name is `'messaging-sse'` (not `'jwt-sse'`).
 * The longer name is deliberate — Passport registers strategies into a
 * single global registry, and we want it to be glaringly obvious in
 * grep / code review that any guard using this strategy ACCEPTS A
 * QUERY-STRING TOKEN. If you see `AuthGuard('messaging-sse')` outside
 * of the SSE controller, it is a security bug.
 *
 * Validation is intentionally simpler than the main JwtStrategy: we
 * accept any token whose signature checks out and whose subject
 * resolves to an active user. We do NOT consult the
 * password-changed-at marker here because expired-after-password-change
 * sessions are typically caught when the client first tries to call a
 * regular REST endpoint (which uses the main strategy); the stream
 * itself is read-only so even a slightly-late drop is acceptable.
 */
@Injectable()
export class SseJwtStrategy extends PassportStrategy(
  Strategy,
  'messaging-sse',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured.');
    }
    super({
      // Token comes from `?token=...` on the SSE GET. Header fallback
      // stays available in case a non-browser client (curl / test) hits
      // the endpoint with a normal Bearer token.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromUrlQueryParameter('token'),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    // Minimal shape — the SSE endpoint only needs req.user.id.
    return { id: user.id };
  }
}
