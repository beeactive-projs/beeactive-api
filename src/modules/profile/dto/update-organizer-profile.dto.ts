import {
  IsOptional,
  IsString,
  IsArray,
  IsNumber,
  IsBoolean,
  IsObject,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class CertificationDto {
  @IsString()
  name: string;

  @IsString()
  issuer: string;

  @IsNumber()
  year: number;
}

export class UpdateOrganizerProfileDto {
  @ApiPropertyOptional({
    example: 'Coach John',
    description: 'Professional display name',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  display_name?: string;

  @ApiPropertyOptional({
    example: 'Certified personal trainer with 5 years experience',
  })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({
    example: ['hiit', 'yoga', 'strength'],
    description: 'Training specializations',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  specializations?: string[];

  @ApiPropertyOptional({
    example: [{ name: 'ACE CPT', issuer: 'ACE', year: 2020 }],
    description: 'Professional certifications',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CertificationDto)
  @IsOptional()
  certifications?: CertificationDto[];

  @ApiPropertyOptional({ example: 5 })
  @IsNumber()
  @Min(0)
  @Max(50)
  @IsOptional()
  years_of_experience?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_accepting_clients?: boolean;

  @ApiPropertyOptional({
    example: { instagram: 'coach_john', facebook: 'CoachJohn' },
  })
  @IsObject()
  @IsOptional()
  social_links?: object;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  show_social_links?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  show_email?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  show_phone?: boolean;

  @ApiPropertyOptional({ example: 'Bucharest' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  location_city?: string;

  @ApiPropertyOptional({ example: 'RO' })
  @IsString()
  @MaxLength(5)
  @IsOptional()
  location_country?: string;
}
