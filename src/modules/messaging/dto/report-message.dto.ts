import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { MessageReportCategory } from '../entities/message-report.entity';

/**
 * Report a message or a whole conversation for abuse / spam / scam.
 *
 * At least ONE of (messageId, conversationId) is required — the schema
 * also enforces this with a CHECK constraint, but we validate up front
 * so users see a clean 400 instead of a DB error.
 */
export class ReportMessageDto {
  @ApiPropertyOptional({
    description:
      'Specific message being reported. Either this or conversationId is required.',
    example: '8b2a6f8b-9f93-4d11-9a4b-9c0a3a6c1b2e',
  })
  @ValidateIf((o: ReportMessageDto) => !o.conversationId)
  @IsUUID('4')
  messageId?: string;

  @ApiPropertyOptional({
    description:
      'Whole conversation being reported. Either this or messageId is required.',
    example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  })
  @ValidateIf((o: ReportMessageDto) => !o.messageId)
  @IsUUID('4')
  conversationId?: string;

  @ApiProperty({
    description: 'Why the user is reporting',
    enum: MessageReportCategory,
  })
  @IsEnum(MessageReportCategory)
  category!: MessageReportCategory;

  @ApiPropertyOptional({
    description: 'Optional free-text notes (max 2000 chars)',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
