import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { UserBlockReason } from '../entities/user-block.entity';

/**
 * Block another user. Reason is optional but useful for aggregate
 * reporting later ("most-cited block reason: SPAM").
 */
export class BlockUserDto {
  @ApiProperty({
    description: 'UUID of the user to block',
    example: '8b2a6f8b-9f93-4d11-9a4b-9c0a3a6c1b2e',
  })
  @IsUUID('4')
  blockedId!: string;

  @ApiPropertyOptional({
    description: 'Why the user is being blocked',
    enum: UserBlockReason,
  })
  @IsOptional()
  @IsEnum(UserBlockReason)
  reason?: UserBlockReason;
}
