import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsFutureOrCloseToNow } from '../../../common/validators/future-date.validator';

/**
 * Body for `POST /sessions/instances/:id/cancel` (instructor-initiated).
 *
 * `scope`:
 *   - `this`           — only this single occurrence
 *   - `thisAndFuture`  — this + all later occurrences of the same template
 *   - `series`         — the entire template (template flips to CANCELLED;
 *                        past instances are preserved for history)
 *
 * `rescheduleTo` is optional and only meaningful for `scope=this`. If set,
 * the same notification recipients also get a reschedule-offer hint —
 * actual creation of a new instance at the new time is a separate
 * reschedule endpoint call (kept atomic and explicit).
 */
export class CancelInstanceDto {
  @ApiProperty({ enum: ['this', 'thisAndFuture', 'series'] })
  @IsIn(['this', 'thisAndFuture', 'series'])
  scope: 'this' | 'thisAndFuture' | 'series';

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Optional message shown to affected participants.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({
    description:
      'Future ISO 8601 datetime — only used with scope=this to hint a reschedule offer.',
  })
  @IsOptional()
  @IsISO8601()
  @IsFutureOrCloseToNow({ skewMinutes: 5 })
  rescheduleTo?: string;
}
