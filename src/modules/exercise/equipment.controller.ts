import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';

import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { ExerciseDocs } from '../../common/docs/exercise.docs';
import { Equipment } from './entities/equipment.entity';
import { ExerciseService } from './exercise.service';

/**
 * Equipment taxonomy — read-only reference data. Used by the catalog
 * filter rail and the create-exercise equipment picker. Seeded by
 * migration 047.
 *
 * Open to any authenticated role — these are just labels and slugs.
 */
@ApiTags('Exercises — taxonomy')
@Controller('equipment')
@UseGuards(AuthGuard('jwt'))
export class EquipmentController {
  constructor(private readonly exerciseService: ExerciseService) {}

  @Get()
  @ApiEndpoint(ExerciseDocs.listEquipment)
  async list(): Promise<Equipment[]> {
    return this.exerciseService.listEquipment();
  }
}
