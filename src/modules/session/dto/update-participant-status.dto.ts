import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Update Participant Status DTO
 *
 * Used by the instructor to change a participant's status
 * (e.g., mark as ATTENDED, NO_SHOW).
 */
export class UpdateParticipantStatusDto {
  @ApiProperty({
    example: 'ATTENDED',
    enum: ['REGISTERED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED'],
    description: 'New participant status',
  })
  @IsEnum(['REGISTERED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED'])
  @IsNotEmpty()
  status: string;
}
