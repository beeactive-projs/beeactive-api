import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for `POST /sessions/instances/:id/participants/:pid/decline`.
 *
 * `reason` is shown to the client in the decline notification.
 */
export class DeclineParticipantDto {
  @ApiPropertyOptional({
    description: 'Reason shown to the client (max 200 chars).',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
