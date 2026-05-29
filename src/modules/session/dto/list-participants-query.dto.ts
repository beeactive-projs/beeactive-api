import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Query DTO for `GET /sessions/instances/:id/participants`.
 *
 * Owner-only endpoint. Pagination is needed because a single session
 * can hold 1000 participants (max enforced by `capacity`).
 */
export class ListParticipantsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: [
      'PENDING_APPROVAL',
      'CONFIRMED',
      'WAITLISTED',
      'CANCELLED',
      'DECLINED',
    ],
    description: 'Filter by participant status. Omit for all.',
  })
  @IsOptional()
  @IsIn([
    'PENDING_APPROVAL',
    'CONFIRMED',
    'WAITLISTED',
    'CANCELLED',
    'DECLINED',
  ])
  status?:
    | 'PENDING_APPROVAL'
    | 'CONFIRMED'
    | 'WAITLISTED'
    | 'CANCELLED'
    | 'DECLINED';
}
