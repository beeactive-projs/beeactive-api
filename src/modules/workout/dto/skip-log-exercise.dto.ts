import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Body for `PATCH /workout-logs/:id/exercises/:exerciseId/skip`.
 * Omit `skipped` to skip; send `false` to undo, which is what the
 * five-second undo strip in the logger does.
 */
export class SkipLogExerciseDto {
  @ApiPropertyOptional({
    default: true,
    description: 'False undoes a skip and puts the exercise back in play.',
  })
  @IsOptional()
  @IsBoolean()
  skipped?: boolean;
}
