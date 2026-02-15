import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { InstructorClientStatus } from '../entities/instructor-client.entity';

/**
 * List Clients DTO
 *
 * Extends the standard pagination DTO with an optional status filter.
 * Used by instructors to filter their client list.
 */
export class ListClientsDto extends PaginationDto {
  @ApiPropertyOptional({
    example: 'ACTIVE',
    description: 'Filter clients by relationship status',
    enum: InstructorClientStatus,
  })
  @IsEnum(InstructorClientStatus)
  @IsOptional()
  status?: InstructorClientStatus;
}
