import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Admin status mutations on a user. All fields optional — the service
 * applies only the ones provided. Body-only (not query), so no string
 * coercion needed.
 */
export class UpdateUserStatusDto {
  @ApiPropertyOptional({
    description: 'Activate (true) or deactivate (false) the account.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'When true, clear lockout (lockedUntil + failedLoginAttempts).',
  })
  @IsOptional()
  @IsBoolean()
  unlock?: boolean;

  @ApiPropertyOptional({
    description:
      'When true, force the email to verified and clear the pending token.',
  })
  @IsOptional()
  @IsBoolean()
  forceEmailVerified?: boolean;
}
