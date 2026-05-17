import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for `POST /sessions/instances/:id/cancel-booking`.
 *
 * Both fields optional. `reason` is short, structured (used in analytics
 * and the instructor's roster view); `message` is the free-text note the
 * client can leave for the instructor. Both HTML-stripped server-side.
 */
export class CancelBookingDto {
  @ApiPropertyOptional({
    description: 'Short reason category (max 80 chars).',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Free-text note to instructor (max 500 chars).',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
