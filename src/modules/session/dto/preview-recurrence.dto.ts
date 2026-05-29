import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RecurrenceRuleDto } from './recurrence-rule.dto';

export class PreviewRecurrenceDto {
  @ApiProperty()
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  rule: RecurrenceRuleDto;

  @ApiProperty({ description: 'ISO 8601 datetime of first occurrence' })
  @IsISO8601()
  firstStartAt: string;

  @ApiProperty({ description: 'IANA timezone', example: 'Europe/Bucharest' })
  @IsString()
  @IsNotEmpty()
  timezone: string;

  @ApiPropertyOptional({
    description: 'Horizon in weeks (1..52); default 12',
    minimum: 1,
    maximum: 52,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  weeksHorizon?: number;
}
