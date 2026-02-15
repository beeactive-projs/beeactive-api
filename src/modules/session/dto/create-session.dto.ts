import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsDateString,
  IsBoolean,
  ValidateNested,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecurringRuleDto } from './recurring-rule.dto';

export class CreateSessionDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Group ID (optional — session can exist without a group)',
  })
  @IsString()
  @IsOptional()
  groupId?: string;

  @ApiProperty({ example: 'Morning Yoga Flow' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'Gentle yoga for all levels' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 'GROUP',
    enum: ['ONE_ON_ONE', 'GROUP', 'ONLINE', 'WORKSHOP'],
  })
  @IsEnum(['ONE_ON_ONE', 'GROUP', 'ONLINE', 'WORKSHOP'])
  @IsNotEmpty()
  sessionType: string;

  @ApiPropertyOptional({
    example: 'GROUP',
    enum: ['PUBLIC', 'GROUP', 'CLIENTS', 'PRIVATE'],
    description: 'Who can see this session (default: GROUP)',
  })
  @IsEnum(['PUBLIC', 'GROUP', 'CLIENTS', 'PRIVATE'])
  @IsOptional()
  visibility?: string;

  @ApiProperty({
    example: '2026-02-15T09:00:00.000Z',
    description: 'When the session starts (ISO 8601)',
  })
  @IsDateString()
  @IsNotEmpty()
  scheduledAt: string;

  @ApiProperty({ example: 60, description: 'Duration in minutes' })
  @IsNumber()
  @Min(5)
  @Max(480)
  @IsNotEmpty()
  durationMinutes: number;

  @ApiPropertyOptional({ example: 'Fitness Studio, Bucharest' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({
    example: 20,
    description: 'Max participants (null = unlimited)',
  })
  @IsNumber()
  @Min(1)
  @Max(1000)
  @IsOptional()
  maxParticipants?: number;

  @ApiPropertyOptional({ example: 50.0, description: 'Session price' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({
    example: 'RON',
    description: 'Currency code (default: RON)',
  })
  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    example: 'SCHEDULED',
    enum: ['DRAFT', 'SCHEDULED'],
    description: 'Initial status (default: SCHEDULED)',
  })
  @IsEnum(['DRAFT', 'SCHEDULED'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'If true, this session repeats according to recurringRule. Use generate-instances to create future occurrences.',
  })
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @ApiPropertyOptional({
    description:
      'When isRecurring is true: frequency (WEEKLY/DAILY/MONTHLY), interval, daysOfWeek (for WEEKLY), endDate or endAfterOccurrences.',
    type: RecurringRuleDto,
  })
  @ValidateNested()
  @Type(() => RecurringRuleDto)
  @IsOptional()
  recurringRule?: RecurringRuleDto;
}
