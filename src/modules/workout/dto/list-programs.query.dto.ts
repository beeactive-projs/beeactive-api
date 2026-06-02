import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ProgramStatus } from '../entities/workout.enums';

/**
 * Query string for `GET /programs`. Owner-scoped — the BE filters to
 * the authenticated instructor's library.
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
}
