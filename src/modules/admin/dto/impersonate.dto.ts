import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Impersonation request body. `reason` is required and audited — mirrors
 * the messaging-moderation audit-reason pattern.
 */
export class ImpersonateDto {
  @ApiProperty({
    description: 'Why this impersonation is happening (audited).',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;
}
