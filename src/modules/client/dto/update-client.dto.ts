import { IsOptional, IsString, IsEnum, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Allowed status transitions when updating a client relationship.
 * Only ACTIVE and ARCHIVED are valid update targets — PENDING is set automatically.
 */
enum UpdateClientStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Update Client DTO
 *
 * Used by instructors to update notes on a client relationship
 * or to archive (end) the relationship.
 */
export class UpdateClientDto {
  @ApiPropertyOptional({
    example: 'Prefers morning sessions. Working on upper body strength.',
    description: 'Private notes about the client (only visible to the instructor)',
  })
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    example: 'ARCHIVED',
    description: 'Update the relationship status (ACTIVE or ARCHIVED)',
    enum: UpdateClientStatus,
  })
  @IsEnum(UpdateClientStatus)
  @IsOptional()
  status?: 'ACTIVE' | 'ARCHIVED';
}
