import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * What to carry across when turning a finished workout into a routine.
 *
 * TARGETS bakes what you actually did into next time's targets, which
 * is the progressive-overload default: you beat the numbers in front of
 * you. STRUCTURE keeps the shape and drops the loads, for when the
 * session was a one-off effort you don't want to anchor to.
 */
export enum SaveRoutineMode {
  Targets = 'TARGETS',
  Structure = 'STRUCTURE',
}

/** Body for `POST /workout-logs/:id/save-as-routine`. */
export class SaveLogAsRoutineDto {
  @ApiProperty({ example: 'Saturday session', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Push / Pull / Legs', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  folder?: string;

  @ApiPropertyOptional({
    enum: SaveRoutineMode,
    default: SaveRoutineMode.Targets,
  })
  @IsOptional()
  @IsEnum(SaveRoutineMode)
  mode?: SaveRoutineMode;
}
