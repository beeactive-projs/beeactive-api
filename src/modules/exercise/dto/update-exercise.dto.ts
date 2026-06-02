import { PartialType } from '@nestjs/swagger';
import { CreateExerciseDto } from './create-exercise.dto';

/**
 * Update Exercise DTO
 *
 * Partial of CreateExerciseDto — every field is optional. The service
 * loads the current row, merges the DTO, re-runs cross-field validation
 * against the post-update snapshot, then persists.
 *
 * Notably absent: `source` cannot be changed (an INSTRUCTOR exercise
 * stays INSTRUCTOR forever — promotion to SYSTEM is a SUPER_ADMIN-only
 * concept handled elsewhere).
 */
export class UpdateExerciseDto extends PartialType(CreateExerciseDto) {}
