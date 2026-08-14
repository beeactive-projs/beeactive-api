import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ExerciseLevel } from '../../exercise/entities/exercise.enums';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ProgramStatus } from '../entities/workout.enums';

/** Whose library to read. */
export enum ProgramLibrary {
  /** Only what you authored. */
  Mine = 'mine',
  /** Only MotionHive's starter content. */
  System = 'system',
  /** Both, yours first. */
  All = 'all',
}

/**
 * Query string for `GET /programs`.
 *
 * Scoped to your own library plus MotionHive's starter content. Another
 * user's programs are never reachable here regardless of `library`.
 */
export class ListProgramsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'strength' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ProgramStatus })
  @IsOptional()
  @IsEnum(ProgramStatus)
  status?: ProgramStatus;

  /**
   * True lists routines (single-workout programs), false lists
   * multi-week programs. Omit for both.
   */
  @ApiPropertyOptional({
    description:
      'Filter to single-workout programs (routines) or multi-week programs.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isSingleWorkout?: boolean;

  @ApiPropertyOptional({ example: 'Push / Pull / Legs' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  folder?: string;

  /** Editorial difficulty. Only curated content carries one. */
  @ApiPropertyOptional({ enum: ExerciseLevel })
  @IsOptional()
  @IsEnum(ExerciseLevel)
  level?: ExerciseLevel;

  /**
   * Defaults to `all`: a new account owns nothing, and defaulting to
   * `mine` would show them an empty library while starter content sat
   * one filter away, unseen.
   */
  @ApiPropertyOptional({ enum: ProgramLibrary, default: ProgramLibrary.All })
  @IsOptional()
  @IsEnum(ProgramLibrary)
  library?: ProgramLibrary;
}
