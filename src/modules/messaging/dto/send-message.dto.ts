import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Send a direct message to another user.
 *
 * v1 only supports DM-by-recipient. If a conversation between sender +
 * recipient already exists it's reused; otherwise it is created in the
 * same transaction as the message insert.
 *
 * Body cap enforced both here (@MaxLength 4000) and at the DB level
 * (CHECK constraint in migration 038) so a missing pipe in dev can't
 * sneak a too-long row past the database.
 */
export class SendMessageDto {
  @ApiProperty({
    example: '8b2a6f8b-9f93-4d11-9a4b-9c0a3a6c1b2e',
    description: 'UUID of the user to message',
  })
  @IsUUID('4')
  recipientId!: string;

  @ApiProperty({
    example: 'Running 5 minutes late — see you at the studio.',
    minLength: 1,
    maxLength: 4000,
    description: 'Plain-text message body (1–4000 chars)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
