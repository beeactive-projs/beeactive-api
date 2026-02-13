import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStrongPassword } from '../../../common/validators/strong-password.validator';

/**
 * Register DTO
 *
 * Data Transfer Object for user registration.
 * All fields are validated before reaching the service layer.
 */
export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address (must be unique)',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'SecureP@ssw0rd!',
    description:
      'Strong password (8+ chars, uppercase, lowercase, number, special char)',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @IsStrongPassword() // ✅ Now enforces strong password requirements
  password: string;

  @ApiProperty({
    example: 'John',
    description: 'User first name',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: 'User last name',
  })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({
    example: '+40123456789',
    description: 'Phone number (optional)',
  })
  @IsString()
  @IsOptional()
  phone?: string;
}
