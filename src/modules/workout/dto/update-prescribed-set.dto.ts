import { PartialType } from '@nestjs/swagger';
import { CreatePrescribedSetDto } from './create-prescribed-set.dto';

export class UpdatePrescribedSetDto extends PartialType(
  CreatePrescribedSetDto,
) {}
