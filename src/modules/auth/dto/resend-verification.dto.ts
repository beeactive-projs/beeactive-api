import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Resend Verification DTO
 *
 * Data Transfer Object for resending email verification.
 * Contains just the email address.
 */
export class ResendVerificationDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address to resend verification to',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
