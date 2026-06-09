import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ExerciseForce,
  ExerciseKind,
  ExerciseLevel,
  ExerciseMechanic,
  ExerciseVisibility,
  MovementPattern,
} from '../../exercise/entities/exercise.enums';

const vals = <T extends Record<string, string>>(e: T): string[] =>
  Object.values(e);

/**
 * Admin edit of an exercise's scalar fields (cross-tenant — works on
 * seeded/system entries too). Relations (muscles/equipment/media) are out
 * of scope for this form; all fields optional, only provided ones apply.
 */
export class AdminUpdateExerciseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  instructions?: string;

  @ApiPropertyOptional({ enum: ExerciseKind })
  @IsOptional()
  @IsIn(vals(ExerciseKind))
  kind?: string;

  @ApiPropertyOptional({ enum: ExerciseLevel })
  @IsOptional()
  @IsIn(vals(ExerciseLevel))
  level?: string;

  @ApiPropertyOptional({ enum: ExerciseMechanic })
  @IsOptional()
  @IsIn(vals(ExerciseMechanic))
  mechanic?: string;

  @ApiPropertyOptional({ enum: ExerciseForce })
  @IsOptional()
  @IsIn(vals(ExerciseForce))
  force?: string;

  @ApiPropertyOptional({ enum: MovementPattern })
  @IsOptional()
  @IsIn(vals(MovementPattern))
  movementPattern?: string;

  @ApiPropertyOptional({ enum: ExerciseVisibility })
  @IsOptional()
  @IsIn(vals(ExerciseVisibility))
  visibility?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  metValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  youtubeUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isUnilateral?: boolean;
}
