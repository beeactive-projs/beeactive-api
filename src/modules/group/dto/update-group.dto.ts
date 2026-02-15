import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsEmail,
  IsArray,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JoinPolicy } from '../entities/group.entity';

export class UpdateGroupDto {
  @ApiPropertyOptional({ example: 'Morning HIIT Crew' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: 'High-intensity interval training every weekday morning',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Europe/Bucharest' })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Make this group visible in public search',
  })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({
    enum: JoinPolicy,
    example: JoinPolicy.OPEN,
    description:
      'How new members join: OPEN (anyone), APPROVAL (needs approval), INVITE_ONLY',
  })
  @IsEnum(JoinPolicy)
  @IsOptional()
  joinPolicy?: JoinPolicy;

  @ApiPropertyOptional({
    example: ['fitness', 'hiit', 'morning'],
    description: 'Tags for categorization and search filtering',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ example: 'trainer@example.com' })
  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+40712345678' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'Str. Victoriei 123, Sector 1' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'Bucharest' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'RO' })
  @IsString()
  @MaxLength(5)
  @IsOptional()
  country?: string;
}
