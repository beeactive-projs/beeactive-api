import { IsOptional, IsString, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { OrganizationType } from '../entities/organization.entity';

export class DiscoverOrganizationsDto {
  @ApiPropertyOptional({
    example: 'yoga studio',
    description: 'Search by name or description',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: OrganizationType,
    example: OrganizationType.YOGA,
    description: 'Filter by organization type',
  })
  @IsEnum(OrganizationType)
  @IsOptional()
  type?: OrganizationType;

  @ApiPropertyOptional({
    example: 'Bucharest',
    description: 'Filter by city',
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({
    example: 'RO',
    description: 'Filter by country code',
  })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ example: 1, description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    description: 'Items per page',
    default: 20,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
