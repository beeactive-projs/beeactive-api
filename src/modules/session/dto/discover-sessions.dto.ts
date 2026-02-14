import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class DiscoverSessionsDto extends PaginationDto {
  @ApiPropertyOptional({
    example: 'yoga',
    description: 'Search term to filter sessions by title, description, or location',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;
}
