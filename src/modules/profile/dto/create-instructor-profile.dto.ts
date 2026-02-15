import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Create Instructor Profile DTO
 *
 * Sent when a user activates "I want to instruct activities".
 * All fields are optional — the user fills them in later.
 */
export class CreateInstructorProfileDto {
  @ApiPropertyOptional({
    example: 'Coach John',
    description: 'Professional display name',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  displayName?: string;
}
