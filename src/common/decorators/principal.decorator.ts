import {
  ExecutionContext,
  ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Projected view of the authenticated principal — what services
 * actually need to enforce ownership, gate roles, and personalise
 * notifications. Cheaper to pass around than the full `req.user`.
 */
export interface PrincipalContext {
  userId: string;
  /** Treat ADMIN / SUPER_ADMIN as INSTRUCTOR for catalog-write purposes. */
  isInstructor: boolean;
  displayName?: string;
}

const INSTRUCTOR_ROLES = new Set(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']);

/**
 * Param decorator that hands a service-ready PrincipalContext to a
 * controller method. Replaces the per-controller `principal(req)`
 * helper that was about to be copy-pasted into every workouts-domain
 * controller (program, assignment, log).
 *
 * Fails closed (403) when the route is hit without the JWT guard —
 * defense against forgetting `@UseGuards(AuthGuard('jwt'))`.
 *
 * Usage:
 *   async list(@Principal() principal: PrincipalContext) { ... }
 */
export const Principal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PrincipalContext => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user?.id) {
      throw new ForbiddenException(
        'Authenticated principal required (forgot @UseGuards(AuthGuard("jwt"))?).',
      );
    }
    // JwtStrategy attaches `roles` as a string[] of role names (see
    // `jwt.strategy.ts:validate`); the User entity types it as Role[]
    // for the relation, so the intersection in AuthenticatedUser
    // confuses TS — cast back to the runtime shape.
    const roles = (user.roles ?? []) as unknown as string[];
    return {
      userId: user.id,
      isInstructor: roles.some((r) => INSTRUCTOR_ROLES.has(r)),
      displayName:
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        undefined,
    };
  },
);
