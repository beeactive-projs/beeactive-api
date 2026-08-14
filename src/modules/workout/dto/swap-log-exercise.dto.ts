import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Body for `PATCH /workout-logs/:id/exercises/:exerciseId/swap`.
 * The set rows and anything already logged into them survive; only the
 * exercise identity changes.
 */
export class SwapLogExerciseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Catalog exercise to swap in.',
  })
  @IsUUID('4')
  exerciseId!: string;
}
