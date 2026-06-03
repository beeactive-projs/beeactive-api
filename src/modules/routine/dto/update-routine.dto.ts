import { PartialType } from '@nestjs/swagger';
import { CreateRoutineDto } from './create-routine.dto';

/**
 * Partial of CreateRoutineDto. If `exercises` is included, the BE replaces
 * the routine_exercise rows wholesale (simpler than diffing and matches how
 * users actually edit — drag to reorder + add/remove). Omit `exercises` to
 * leave the existing list untouched.
 */
export class UpdateRoutineDto extends PartialType(CreateRoutineDto) {}
