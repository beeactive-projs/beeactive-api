import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Create Client Request DTO
 *
 * Used when an instructor invites a user to become their client,
 * or when a user requests to become an instructor's client.
 */
export class CreateClientRequestDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'User ID of the person to send the request to',
  })
  @IsUUID()
  @IsNotEmpty()
  toUserId: string;

  @ApiPropertyOptional({
    example: 'I would like to help you with your fitness goals!',
    description: 'Optional personal message to include with the request',
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  message?: string;
}
