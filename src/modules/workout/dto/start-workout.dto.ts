import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Body for `POST /workout-logs`. Pass `assignedWorkoutId` for an
 * assigned workout (the service hydrates logged_exercise + logged_set
 * rows from the assignment, resolves %1RM in the same tx). Omit it
 * for a freestyle workout; the client adds exercises afterward via
 * separate endpoints.
 */
export class StartWorkoutDto {
  @ApiPropertyOptional({ description: 'Optional — assigned workout id.' })
  @IsOptional()
  @IsUUID('4')
  assignedWorkoutId?: string;

  @ApiPropertyOptional({
    description:
      'Required for freestyle workouts (no assignedWorkoutId). Ignored otherwise.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
