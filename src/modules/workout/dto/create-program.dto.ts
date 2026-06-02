import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProgramKind, ProgramStatus } from '../entities/workout.enums';

/**
 * Create Program DTO — instructor authors a new program shell.
 *
 * V1 only ships `kind = WORKOUT`; the other values exist on the BE
 * for forward-compat (locked decision §3). Workouts/exercises/sets
 * are added via nested endpoints after the program exists.
 */
export class CreateProgramDto {
  @ApiProperty({ example: 'Strength foundations — 8 weeks', maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    example:
      '8-week beginner barbell program. 3 days/week, full-body, linear progression.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    enum: ProgramKind,
    example: ProgramKind.Workout,
    default: ProgramKind.Workout,
  })
  @IsOptional()
  @IsEnum(ProgramKind)
  kind?: ProgramKind;

  @ApiPropertyOptional({
    enum: ProgramStatus,
    example: ProgramStatus.Draft,
    default: ProgramStatus.Draft,
  })
  @IsOptional()
  @IsEnum(ProgramStatus)
  status?: ProgramStatus;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 104 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(104)
  durationWeeks?: number;

  @ApiPropertyOptional({
    example: 'linear',
    description:
      'Free-text UX hint (linear / undulating / block / conjugate). Not enum-validated.',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  periodizationModel?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/.../cover.jpg',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  coverImageUrl?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['hypertrophy', 'fat_loss'],
    description: 'Free tags — UI uses them for browse hints.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  goalTags?: string[];
}
