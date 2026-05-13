import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Admin suspends a user's ability to send messages.
 *
 * `expiresAtIso` omitted = indefinite suspension. Set a future ISO
 * timestamp for a temporary suspension that auto-lifts.
 */
export class SuspendUserDto {
  @ApiProperty({
    description: 'UUID of the user to suspend',
  })
  @IsUUID('4')
  userId!: string;

  @ApiProperty({
    description: 'Why the suspension is being applied (visible only to admins)',
    minLength: 5,
    maxLength: 255,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'ISO timestamp at which the suspension auto-lifts. Omit for indefinite.',
    example: '2026-06-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  expiresAtIso?: string;
}
