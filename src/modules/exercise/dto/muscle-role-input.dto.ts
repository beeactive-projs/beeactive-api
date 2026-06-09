import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { MuscleRole } from '../entities/exercise.enums';

/**
 * One muscle row on the create/edit exercise form. Carries the muscle
 * id plus the role for this exercise (PRIMARY / SECONDARY / STABILIZER).
 *
 * The service enforces the invariants — at least one PRIMARY, max 3
 * PRIMARY rows; SECONDARY and STABILIZER unbounded. See locked
 * decision §20.
 */
export class MuscleRoleInputDto {
  @ApiProperty({
    example: '8a4b0fda-2c5e-4e60-94d6-3d2a8b5e0c5f',
    description: 'Muscle UUID — must reference an existing row in `muscle`',
  })
  @IsUUID('4')
  muscleId: string;

  @ApiProperty({
    enum: MuscleRole,
    example: MuscleRole.Primary,
    description: 'Role this muscle plays in the exercise',
  })
  @IsEnum(MuscleRole)
  role: MuscleRole;
}
