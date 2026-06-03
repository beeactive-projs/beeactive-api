import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Add an unplanned exercise mid-session. Used by the active log when:
 *   - a client decides to add an extra exercise to a coached session
 *   - a freestyle session builds itself one exercise at a time
 *
 * `exerciseId` must reference a catalog row the caller can read
 * (SYSTEM, owned, or PUBLIC custom).
 */
export class AddLogExerciseDto {
  @ApiProperty({ example: 'aa11cc22-dd33-44ee-bb55-ff66aa77bb88' })
  @IsUUID('4')
  exerciseId: string;
}
