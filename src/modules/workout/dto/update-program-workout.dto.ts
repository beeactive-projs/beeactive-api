import { PartialType } from '@nestjs/swagger';
import { CreateProgramWorkoutDto } from './create-program-workout.dto';

export class UpdateProgramWorkoutDto extends PartialType(
  CreateProgramWorkoutDto,
) {}
