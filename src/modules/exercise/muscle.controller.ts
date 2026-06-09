import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';

import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { ExerciseDocs } from '../../common/docs/exercise.docs';
import { Muscle } from './entities/muscle.entity';
import { ExerciseService } from './exercise.service';

/**
 * Muscle taxonomy — read-only reference data. Used by the catalog
 * filter rail (design S1) and the create-exercise muscle picker
 * (design S3). Seeded by migration 047.
 *
 * Open to any authenticated role — these are just labels and slugs.
 * No role gate here.
 */
@ApiTags('Exercises — taxonomy')
@Controller('muscles')
@UseGuards(AuthGuard('jwt'))
export class MuscleController {
  constructor(private readonly exerciseService: ExerciseService) {}

  @Get()
  @ApiEndpoint(ExerciseDocs.listMuscles)
  async list(): Promise<Muscle[]> {
    return this.exerciseService.listMuscles();
  }
}
