import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OneRepMaxSource } from '../entities/workout.enums';

/** Record a 1RM for `(user, exercise)`. Used by %1RM resolution. */
export class RecordOneRepMaxDto {
  @ApiProperty({ example: 'aa11cc22-dd33-44ee-bb55-ff66aa77bb88' })
  @IsUUID('4')
  exerciseId: string;

  @ApiProperty({ example: 142.5, minimum: 1 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(9999)
  weightKg: number;

  @ApiPropertyOptional({
    enum: OneRepMaxSource,
    default: OneRepMaxSource.Manual,
  })
  @IsOptional()
  @IsEnum(OneRepMaxSource)
  source?: OneRepMaxSource;

  @ApiPropertyOptional({ example: '2026-06-02T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
