/**
 * Extend Express Request so that req.user is typed on JWT-protected routes.
 *
 * The shape of `user` matches what JwtStrategy returns: plain user fields + roles.
 * Controllers that use @UseGuards(AuthGuard('jwt')) can use req.user with full type safety.
 *
 * @see src/modules/auth/strategies/jwt.strategy.ts (validate return value)
 */
declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarId: number;
        language: string;
        timezone: string;
        isActive: boolean;
        isEmailVerified: boolean;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
      };
    }
  }
}

export {};
