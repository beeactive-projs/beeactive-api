import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Forgot Password DTO
 *
 * DTO = Data Transfer Object
 * Defines the shape of data sent in the request.
 *
 * Decorators:
 * - @IsEmail() → Validates email format
 * - @IsNotEmpty() → Field cannot be empty
 * - @ApiProperty() → Shows up in Swagger documentation
 */
export class ForgotPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address to send password reset link',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
