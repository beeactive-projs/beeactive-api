import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Query for `GET /workout-logs`.
 *
 * The date bounds are what let a single day be asked for. The Today
 * view needs "everything that happened on this date", and an assigned
 * workout's status only covers prescribed work — a freestyle session
 * has no assignment to carry a status, so without this it was invisible
 * on the day it was actually done.
 */
export class ListWorkoutLogsQueryDto extends PaginationDto {
  /** Inclusive lower bound on `startedAt`. */
  @ApiPropertyOptional({ example: '2026-08-10T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  /** Exclusive upper bound on `startedAt`. */
  @ApiPropertyOptional({ example: '2026-08-11T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  /**
   * Case-insensitive match on the session name. Server-side because the
   * list is paged: filtering in the browser would only ever search the
   * page already loaded, and quietly miss the rest.
   */
  @ApiPropertyOptional({ example: 'push', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
