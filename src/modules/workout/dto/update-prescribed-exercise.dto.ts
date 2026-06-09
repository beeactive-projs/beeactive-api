import { PartialType } from '@nestjs/swagger';
import { CreatePrescribedExerciseDto } from './create-prescribed-exercise.dto';

export class UpdatePrescribedExerciseDto extends PartialType(
  CreatePrescribedExerciseDto,
) {}
