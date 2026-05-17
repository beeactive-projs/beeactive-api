import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for `POST /sessions/instances/:id/book`.
 *
 * `bookingNote` reaches the instructor as a one-time message attached
 * to the booking (visible on the participant row in the detail page).
 * It does NOT become part of any public payload.
 */
export class BookSessionDto {
  @ApiPropertyOptional({
    description:
      'Optional message from client to instructor (max 500 chars). HTML stripped server-side.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bookingNote?: string;
}
