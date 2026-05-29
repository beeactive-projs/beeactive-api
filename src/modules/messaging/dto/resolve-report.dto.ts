import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MessageReportStatus } from '../entities/message-report.entity';

/**
 * Transition a report to a non-OPEN state. Admin endpoint. Allowed
 * transitions enforced server-side: OPEN → REVIEWING/RESOLVED/DISMISSED,
 * REVIEWING → RESOLVED/DISMISSED. Once terminal, no further transitions.
 */
export class ResolveReportDto {
  @ApiProperty({
    enum: MessageReportStatus,
    description:
      'New status. OPEN is rejected — use this only to move forward.',
  })
  @IsEnum(MessageReportStatus)
  status!: MessageReportStatus;

  @ApiPropertyOptional({
    description: 'Optional notes the admin attaches to the decision',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNotes?: string;
}
