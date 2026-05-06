import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query DTO for `GET /sessions/:id/recurrence-preview`.
 *
 * `weeks` is the look-ahead window (in weeks) used to project future
 * occurrences from a recurring-session rule. We cap at 52 to keep the
 * response size predictable and 1 as the floor (zero weeks = empty
 * response, which is a degenerate request).
 */
export class RecurrencePreviewQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 52,
    default: 12,
    description: 'How many weeks ahead to project. Defaults to 12.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  weeks?: number = 12;
}
