import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Query for `GET /my/workouts/today`.
 *
 * The date comes from the client because "today" is a calendar fact in
 * the person's own timezone, not the server's. Omit it and the server
 * falls back to its own date, which is only right for callers in the
 * same zone.
 */
export class TrainingDayQueryDto {
  @ApiPropertyOptional({
    example: '2026-08-06',
    description:
      "Client-calendar date as YYYY-MM-DD. Defaults to the server's date.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  date?: string;
}
