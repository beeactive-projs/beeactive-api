import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ProgramAssignmentStatus } from '../entities/workout.enums';

/**
 * Query for `GET /program-assignments` (instructor surface) and
 * `GET /my/program-assignments` (client surface). The two endpoints
 * scope ownership server-side; this DTO is shared.
 */
export class ListAssignmentsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ProgramAssignmentStatus })
  @IsOptional()
  @IsEnum(ProgramAssignmentStatus)
  status?: ProgramAssignmentStatus;

  @ApiPropertyOptional({
    description: 'Filter by a specific client (instructor surface only).',
  })
  @IsOptional()
  @IsUUID('4')
  clientId?: string;
}
