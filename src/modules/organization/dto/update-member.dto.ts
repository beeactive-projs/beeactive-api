import { IsOptional, IsBoolean, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Update Member DTO
 *
 * Used by participants to update their own membership settings,
 * specifically the health data sharing consent.
 */
export class UpdateMemberDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Share health info (weight, conditions, goals) with the trainer',
  })
  @IsBoolean()
  @IsOptional()
  sharedHealthInfo?: boolean;

  @ApiPropertyOptional({
    example: 'Johnny',
    description: 'Nickname within this organization',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  nickname?: string;
}
