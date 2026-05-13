import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Mark conversation read up to a point.
 *
 * If `upToIso` is omitted, the server uses the current time, marking
 * everything as read. Pass an ISO timestamp to mark read only up to a
 * specific message's createdAt (e.g. when the user scrolled but didn't
 * read further).
 */
export class MarkReadDto {
  @ApiPropertyOptional({
    description:
      'ISO timestamp; messages with createdAt ≤ this become read. Omit to mark the entire conversation as read.',
    example: '2026-05-11T18:30:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  upToIso?: string;
}
