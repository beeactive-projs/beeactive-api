import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListTemplatesQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['active', 'recurring', 'ended', 'cancelled'] })
  @IsOptional()
  @IsIn(['active', 'recurring', 'ended', 'cancelled'])
  tab?: 'active' | 'recurring' | 'ended' | 'cancelled';

  @ApiPropertyOptional({ enum: ['GROUP', 'PRIVATE', 'OPEN'] })
  @IsOptional()
  @IsIn(['GROUP', 'PRIVATE', 'OPEN'])
  type?: 'GROUP' | 'PRIVATE' | 'OPEN';

  @ApiPropertyOptional({ enum: ['OPEN', 'CLIENTS_ONLY', 'GROUP_ONLY', 'FREE'] })
  @IsOptional()
  @IsIn(['OPEN', 'CLIENTS_ONLY', 'GROUP_ONLY', 'FREE'])
  access?: 'OPEN' | 'CLIENTS_ONLY' | 'GROUP_ONLY' | 'FREE';

  @ApiPropertyOptional({ enum: ['IN_PERSON', 'ONLINE'] })
  @IsOptional()
  @IsIn(['IN_PERSON', 'ONLINE'])
  locationKind?: 'IN_PERSON' | 'ONLINE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  groupId?: string;

  @ApiPropertyOptional({
    description: 'Search title/description (iLike)',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: ['firstStartAt', 'createdAt', 'title'] })
  @IsOptional()
  @IsIn(['firstStartAt', 'createdAt', 'title'])
  sortBy?: 'firstStartAt' | 'createdAt' | 'title';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDir?: 'ASC' | 'DESC';
}
