import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Body for `POST /program-assignments`. Triggers the deep-copy
 * transaction — the entire program tree is cloned per-client.
 */
export class AssignProgramDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-1111-2222-3333abcd4444' })
  @IsUUID('4')
  programId: string;

  @ApiProperty({ example: '5c1a8b9d-2e3f-4a01-9b8c-7d6e5f4a3b2c' })
  @IsUUID('4')
  clientId: string;

  /** ISO date (no time). Day 0 of the program lands on this date. */
  @ApiProperty({ example: '2026-06-09' })
  @IsDateString({ strict: true })
  startDate: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
