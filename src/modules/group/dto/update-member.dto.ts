import { IsOptional, IsBoolean, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Update Member DTO
 *
 * Used by participants to update their own membership settings
 * within a group: health data sharing consent and nickname.
 */
export class UpdateMemberDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'Share health info (weight, conditions, goals) with the instructor',
  })
  @IsBoolean()
  @IsOptional()
  sharedHealthInfo?: boolean;

  @ApiPropertyOptional({
    example: 'Johnny',
    description: 'Nickname within this group',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  nickname?: string;
}
