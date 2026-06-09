import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateRoutineExerciseDto {
  @ApiProperty({ example: 'aa11cc22-dd33-44ee-bb55-ff66aa77bb88' })
  @IsUUID('4')
  exerciseId: string;

  @ApiPropertyOptional({
    description: 'Same value across rows in a routine = paired superset.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  supersetGroupId?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  defaultSets?: number;

  @ApiPropertyOptional({ example: 5, minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  targetRepsMin?: number;

  @ApiPropertyOptional({ example: 8, minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  targetRepsMax?: number;

  @ApiPropertyOptional({ example: 80, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999)
  targetWeightKg?: number;

  @ApiPropertyOptional({ example: 90, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  restAfterSeconds?: number;
}

export class CreateRoutineDto {
  @ApiProperty({ example: 'Push day A', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Chest, shoulders, triceps.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: 'PPL split', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  folder?: string;

  @ApiPropertyOptional({
    type: [CreateRoutineExerciseDto],
    description:
      'Optional — the routine can be created empty and exercises added via PATCH later.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateRoutineExerciseDto)
  exercises?: CreateRoutineExerciseDto[];
}
