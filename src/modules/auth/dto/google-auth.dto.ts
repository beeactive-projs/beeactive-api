import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for Sign in with Google (token flow).
 * Frontend obtains ID token from Google Sign-In, sends it here.
 */
export class GoogleAuthDto {
  @ApiProperty({
    description: 'Google ID token from the frontend (Google Sign-In)',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
