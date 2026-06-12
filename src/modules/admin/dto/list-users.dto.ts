import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ADMIN_ROLE_NAMES } from '../admin.constants';

// Read the RAW query value (obj[key]) — the global ValidationPipe runs
// with enableImplicitConversion, which would otherwise coerce the string
// 'false' to boolean `true` before this transform sees it.
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
 * Cross-tenant user listing filter for the admin app. Every field is
 * optional; an empty DTO returns all (non-deleted) users, newest first.
 */
export class ListUsersDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Free-text search (name, email, handle).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @ApiPropertyOptional({ enum: ADMIN_ROLE_NAMES })
  @IsOptional()
  @IsIn(ADMIN_ROLE_NAMES)
  role?: string;

  @ApiPropertyOptional({ description: 'Filter by active flag.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by email-verified flag.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isEmailVerified?: boolean;

  @ApiPropertyOptional({
    description: 'When true, only currently-locked accounts.',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional({
    description: 'Include soft-deleted users alongside live ones.',
    default: false,
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeDeleted?: boolean = false;

  @ApiPropertyOptional({
    description: 'Return ONLY soft-deleted users (overrides includeDeleted).',
    default: false,
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  onlyDeleted?: boolean = false;
}
