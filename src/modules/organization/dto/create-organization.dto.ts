import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsEmail,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OrganizationType,
  JoinPolicy,
} from '../entities/organization.entity';

export class CreateOrganizationDto {
  @ApiProperty({
    example: "John's Fitness Studio",
    description: 'Organization name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: 'Personal training and group HIIT sessions',
    description: 'Organization description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: 'Europe/Bucharest',
    description: 'Timezone (defaults to Europe/Bucharest)',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    enum: OrganizationType,
    example: OrganizationType.FITNESS,
    description: 'Organization category',
  })
  @IsEnum(OrganizationType)
  @IsOptional()
  type?: OrganizationType;

  @ApiPropertyOptional({
    example: false,
    description: 'Make this organization visible in public search',
  })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({
    enum: JoinPolicy,
    example: JoinPolicy.INVITE_ONLY,
    description:
      'How new members join: OPEN (anyone), REQUEST (needs approval), INVITE_ONLY',
  })
  @IsEnum(JoinPolicy)
  @IsOptional()
  joinPolicy?: JoinPolicy;

  @ApiPropertyOptional({ example: 'contact@fitnessstudio.com' })
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
