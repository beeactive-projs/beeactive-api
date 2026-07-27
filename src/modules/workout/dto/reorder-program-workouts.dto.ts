import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** One workout's target calendar slot within the reorder. */
export class ReorderProgramWorkoutItemDto {
  @ApiProperty({ example: 'b2c3d4e5-1111-2222-3333-4444bcde5555' })
  @IsUUID()
  id: string;

  /** 0-based week within the program. */
  @ApiProperty({ example: 0, minimum: 0, maximum: 103 })
  @IsInt()
  @Min(0)
  @Max(103)
  weekIndex: number;

  /** 0-based day within the week (Mon = 0). */
  @ApiProperty({ example: 0, minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  dayIndex: number;
}

/**
 * Atomic repositioning of workouts on the program calendar. The FE
 * sends the full target layout for every workout it moved (untouched
 * workouts may be omitted — their current slots are kept). The service
 * validates the combined layout for collisions and applies everything
 * in ONE transaction, so a drag-reorder can never leave the program
 * half-moved the way sequential PATCHes against the unique
 * (week, day) index would.
 */
export class ReorderProgramWorkoutsDto {
  @ApiProperty({
    type: [ReorderProgramWorkoutItemDto],
    description: 'Target (weekIndex, dayIndex) per moved workout.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(728)
  @ValidateNested({ each: true })
  @Type(() => ReorderProgramWorkoutItemDto)
  items: ReorderProgramWorkoutItemDto[];
}
