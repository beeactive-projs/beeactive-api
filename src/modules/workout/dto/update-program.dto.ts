import { PartialType } from '@nestjs/swagger';
import { CreateProgramDto } from './create-program.dto';

/** Partial of Create. Owner-only mutation; service runs cross-field re-validation. */
export class UpdateProgramDto extends PartialType(CreateProgramDto) {}
