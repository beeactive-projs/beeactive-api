import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvitationDto {
  @ApiProperty({
    example: 'mike@trainer.com',
    description: 'Email of the person to invite',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Group ID to invite the person to',
  })
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @ApiPropertyOptional({
    example: 'USER',
    description: 'Role to assign (default: USER)',
  })
  @IsString()
  @IsOptional()
  roleName?: string;

  @ApiPropertyOptional({
    example: 'Join my fitness group!',
    description: 'Personal message to include with the invitation',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  message?: string;
}
