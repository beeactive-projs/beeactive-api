import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Verify Email DTO
 *
 * Data Transfer Object for email verification.
 * Contains the verification token sent via email.
 */
export class VerifyEmailDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f6...',
    description: 'Email verification token received via email',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
