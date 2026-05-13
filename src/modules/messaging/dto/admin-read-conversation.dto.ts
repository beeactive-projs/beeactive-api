import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Admin reads messages inside a flagged conversation.
 *
 * `reason` is REQUIRED — every staff read writes an
 * admin_message_access_log row keyed on this string. This is what backs
 * the "we only read messages for flagged cases, and we log every access"
 * claim. Optional `relatedReportId` ties the access to a specific
 * report in the moderation queue.
 */
export class AdminReadConversationDto {
  @ApiProperty({
    description: 'Why this conversation is being read (audit trail)',
    minLength: 5,
  })
  @IsString()
  @MinLength(5)
  reason!: string;

  @ApiPropertyOptional({
    description: 'ID of the report this access is in support of',
  })
  @IsOptional()
  @IsUUID('4')
  relatedReportId?: string;

  @ApiPropertyOptional({
    default: 50,
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
