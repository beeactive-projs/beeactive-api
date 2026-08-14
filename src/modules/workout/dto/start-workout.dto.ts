import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Body for `POST /workout-logs`. Three mutually exclusive sources:
 *
 *   assignedWorkoutId — a scheduled workout from an assignment. Hydrates
 *     the tree from the assigned rows and resolves %1RM in the same tx.
 *   programId — start a program ad hoc, with no assignment involved.
 *     This is how a single-workout program (a routine) is run on demand.
 *   neither — freestyle, requires `name`. Exercises are added after.
 */
export class StartWorkoutDto {
  @ApiPropertyOptional({ description: 'Optional. Assigned workout id.' })
  @IsOptional()
  @IsUUID('4')
  assignedWorkoutId?: string;

  @ApiPropertyOptional({
    description:
      'Optional. Start this program directly, without an assignment. ' +
      'Intended for single-workout programs (routines).',
  })
  @IsOptional()
  @IsUUID('4')
  programId?: string;

  @ApiPropertyOptional({
    description:
      'Required for freestyle workouts (no assignedWorkoutId or programId). ' +
      'Ignored otherwise.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
