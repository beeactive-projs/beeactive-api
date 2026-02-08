import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsDateString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSessionDto {
  @ApiPropertyOptional({ example: 'Morning Yoga Flow - Updated' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: 'GROUP',
    enum: ['ONE_ON_ONE', 'GROUP', 'ONLINE', 'WORKSHOP'],
  })
  @IsEnum(['ONE_ON_ONE', 'GROUP', 'ONLINE', 'WORKSHOP'])
  @IsOptional()
  session_type?: string;

  @ApiPropertyOptional({
    example: 'MEMBERS',
    enum: ['PRIVATE', 'MEMBERS', 'PUBLIC'],
  })
  @IsEnum(['PRIVATE', 'MEMBERS', 'PUBLIC'])
  @IsOptional()
  visibility?: string;

  @ApiPropertyOptional({ example: '2026-02-15T10:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  scheduled_at?: string;

  @ApiPropertyOptional({ example: 90 })
  @IsNumber()
  @Min(5)
  @Max(480)
  @IsOptional()
  duration_minutes?: number;

  @ApiPropertyOptional({ example: 'New Location' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsNumber()
  @Min(1)
  @Max(1000)
  @IsOptional()
  max_participants?: number;

  @ApiPropertyOptional({ example: 60.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({
    example: 'CANCELLED',
    enum: ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  })
  @IsEnum(['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  @IsOptional()
  status?: string;
}
