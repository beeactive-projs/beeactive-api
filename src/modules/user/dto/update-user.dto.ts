import {
  IsOptional,
  IsString,
  IsNumber,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Update User DTO
 *
 * For updating core user fields (name, phone, avatar, language, timezone).
 * Email change is NOT supported here — requires separate re-verification flow.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ example: '+40123456789' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 1, description: 'Avatar ID (1-20)' })
  @IsNumber()
  @Min(1)
  @Max(20)
  @IsOptional()
  avatarId?: number;

  @ApiPropertyOptional({ example: 'en', description: 'Language code' })
  @IsString()
  @MaxLength(5)
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ example: 'Europe/Bucharest' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  timezone?: string;
}
