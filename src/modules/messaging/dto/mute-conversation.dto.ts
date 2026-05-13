import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Mute (or unmute) a conversation.
 *
 * `untilIso` omitted or null = unmute. A future ISO timestamp = muted
 * until that time. A past ISO is treated as unmute (defensive).
 */
export class MuteConversationDto {
  @ApiPropertyOptional({
    description:
      'ISO timestamp until which the conversation is muted. Omit to unmute.',
    example: '2026-06-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  untilIso?: string | null;
}
