import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsArray,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserProfileDto {
  @ApiPropertyOptional({
    example: '1990-05-15',
    description: 'Date of birth (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    example: 'MALE',
    enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'],
  })
  @IsEnum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ example: 180.5, description: 'Height in cm' })
  @IsNumber()
  @Min(50)
  @Max(300)
  @IsOptional()
  heightCm?: number;

  @ApiPropertyOptional({ example: 75.0, description: 'Weight in kg' })
  @IsNumber()
  @Min(20)
  @Max(500)
  @IsOptional()
  weightKg?: number;

  @ApiPropertyOptional({
    example: 'INTERMEDIATE',
    enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
  })
  @IsEnum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'])
  @IsOptional()
  fitnessLevel?: string;

  @ApiPropertyOptional({
    example: ['weight_loss', 'muscle_gain'],
    description: 'Fitness goals',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  goals?: string[];

  @ApiPropertyOptional({
    example: ['asthma', 'knee_injury'],
    description: 'Medical conditions or injuries',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  medicalConditions?: string[];

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: '+40123456789' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({
    example: 'Prefer morning sessions',
    description: 'Additional notes',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
