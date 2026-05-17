import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for `PATCH /sessions/instances/:id/participants/:pid`.
 *
 * Instructor-only. Used post-session for marking attendance and
 * jotting a private note. `attended` is tri-state (true / false / null
 * to revert to unmarked).
 */
export class PatchParticipantDto {
  @ApiPropertyOptional({
    description:
      'Mark attendance: true=attended, false=no-show, null=unmark. Allowed only after the session start.',
  })
  @IsOptional()
  @IsBoolean()
  attended?: boolean | null;

  @ApiPropertyOptional({
    description:
      'Instructor-only note about this participant (max 2000 chars). HTML stripped server-side.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNote?: string | null;
}
