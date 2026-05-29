import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsFutureOrCloseToNow } from '../../../common/validators/future-date.validator';

/**
 * Body for `POST /sessions/instances/:id/reschedule`.
 *
 * Only single-instance reschedule is supported. Duration is preserved.
 * The reschedule fires SESSION_RESCHEDULED to every non-terminal
 * participant and recomputes conflicts.
 */
export class RescheduleInstanceDto {
  @ApiProperty({
    description:
      'New ISO 8601 datetime for the instance (must be in the future).',
  })
  @IsISO8601()
  @IsFutureOrCloseToNow({ skewMinutes: 5 })
  newStartAt: string;

  @ApiPropertyOptional({
    description: 'Optional note to participants about the reschedule.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
