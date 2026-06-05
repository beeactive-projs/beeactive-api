import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Shared filter for the admin payments-oversight lists. `status` maps to
 * each resource's status column; `filter` is a resource-specific preset
 * (e.g. accounts: incomplete|disabled; webhooks: failed|orphaned).
 */
export class PaymentsListDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Exact status filter (resource-specific).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({
    description: 'Named preset filter (resource-specific).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  filter?: string;
}
