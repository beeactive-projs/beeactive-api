import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Query DTO for `GET /sessions/my`.
 *
 * Tabs:
 *   - `upcoming`         — CONFIRMED bookings with startAt > now
 *   - `pendingApproval`  — PENDING_APPROVAL bookings (any time)
 *   - `waitlisted`       — WAITLISTED bookings
 *   - `past`             — CONFIRMED bookings with startAt <= now
 *   - `cancelled`        — CANCELLED or DECLINED bookings
 *
 * Default tab is `upcoming` (matches the My Sessions design).
 */
export class MySessionsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['upcoming', 'pendingApproval', 'waitlisted', 'past', 'cancelled'],
    default: 'upcoming',
  })
  @IsOptional()
  @IsIn(['upcoming', 'pendingApproval', 'waitlisted', 'past', 'cancelled'])
  tab?: 'upcoming' | 'pendingApproval' | 'waitlisted' | 'past' | 'cancelled';
}
