import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// Read the RAW query value (obj[key]) — the global ValidationPipe runs
// with enableImplicitConversion, which would otherwise coerce 'false' to
// boolean `true` before this transform sees it.
const toBool = ({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}) => {
  const v = obj?.[key];
  if (v === undefined || v === null || v === '') return undefined;
  return v === true || v === 'true';
};

/**
 * Generic paginated list filter shared by the content-moderation and
 * curated-domain admin endpoints. `status` maps to each resource's
 * status column; `includeDeleted` flips paranoid off.
 */
export class AdminListDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Free-text search (resource-specific).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @ApiPropertyOptional({ description: 'Status filter (resource-specific).' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({
    description: 'Include soft-deleted rows.',
    default: false,
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeDeleted?: boolean = false;
}
