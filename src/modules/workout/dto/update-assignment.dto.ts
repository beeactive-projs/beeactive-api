import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ProgramAssignmentStatus } from '../entities/workout.enums';

/**
 * INSTRUCTOR-only PATCH on a program assignment. Status transitions
 * are validated server-side (PENDING/ACTIVE/PAUSED ↔, COMPLETED &
 * CANCELLED terminal).
 */
export class UpdateAssignmentDto {
  @ApiPropertyOptional({ enum: ProgramAssignmentStatus })
  @IsOptional()
  @IsEnum(ProgramAssignmentStatus)
  status?: ProgramAssignmentStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
