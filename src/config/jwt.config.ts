import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';

export const getJwtConfig = (
  configService: ConfigService,
): JwtModuleOptions => {
  const secret = configService.get<string>('JWT_SECRET');
  // Env validation should have caught this; double-check for safety.
  if (!secret) {
    throw new Error('JWT_SECRET is required.');
  }

  return {
    secret,
    signOptions: {
      // Short-lived access token; refresh tokens cover UX.
      expiresIn: configService.get('JWT_EXPIRES_IN') || '2h',
    },
  };
};
