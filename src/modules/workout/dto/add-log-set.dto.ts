import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExerciseSetType } from '../entities/workout.enums';

/**
 * Add an unplanned set to a logged exercise. Targets are nil — the
 * client just types actuals as they go (or doesn't, if they're
 * mark-complete-only).
 */
export class AddLogSetDto {
  @ApiPropertyOptional({ enum: ExerciseSetType })
  @IsOptional()
  @IsEnum(ExerciseSetType)
  setType?: ExerciseSetType;
}
