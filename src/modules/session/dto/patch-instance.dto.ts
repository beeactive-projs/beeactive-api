import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for `PATCH /sessions/instances/:id` (instructor-only).
 *
 * Sets per-occurrence overrides on a single instance. Any field set here
 * "wins" over the template value for this occurrence; null clears the
 * override (the template value takes over again).
 *
 * Constraints (enforced in the service):
 *   - venueId must belong to the caller (IDOR guard via VenueService).
 *   - capacityOverride below current `confirmedCount` is rejected — we
 *     cannot retroactively kick people out of a session.
 *   - All free text HTML-stripped server-side.
 */
export class PatchInstanceDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleOverride?: string | null;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  descriptionOverride?: string | null;

  @ApiPropertyOptional({ description: 'Venue UUID; null clears the override.' })
  @IsOptional()
  @IsUUID('4')
  venueIdOverride?: string | null;

  @ApiPropertyOptional({ description: 'HTTPS-only.', maxLength: 500 })
  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['https'] })
  @MaxLength(500)
  meetingUrlOverride?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacityOverride?: number | null;
}
