import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Login DTO
 *
 * Data for user login.
 * Simple validation - just checks format, not strength (already registered).
 */
export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'YourPassword123!',
    description: 'User password',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
