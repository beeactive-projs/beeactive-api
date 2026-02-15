import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for Sign in with Facebook (token flow).
 * Frontend obtains access token from Facebook Login SDK, sends it here.
 */
export class FacebookAuthDto {
  @ApiProperty({
    description: 'Facebook access token from the frontend (Facebook Login)',
    example: 'EAAGm0PX4ZCps8BA...',
  })
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}
