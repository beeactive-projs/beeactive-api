import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecurrenceRuleDto {
  @ApiProperty({ enum: ['DAILY', 'WEEKLY', 'MONTHLY'] })
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @ApiProperty({ description: '1..99', minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  interval: number;

  @ApiPropertyOptional({
    description:
      'Day-of-week 1=Mon..7=Sun. Required for WEEKLY, forbidden otherwise.',
    type: [Number],
  })
  @ValidateIf((o: RecurrenceRuleDto) => o.frequency === 'WEEKLY')
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional({
    description:
      'ISO date — stop after this date (exclusive with endAfterOccurrences)',
  })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({
    description: '1..365 — stop after N occurrences (exclusive with endDate)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  endAfterOccurrences?: number;
}
