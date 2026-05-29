import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RecurrenceRuleDto } from './recurrence-rule.dto';

export class UpdateTemplateDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ enum: ['GROUP', 'PRIVATE', 'OPEN'] })
  @IsOptional()
  @IsIn(['GROUP', 'PRIVATE', 'OPEN'])
  type?: 'GROUP' | 'PRIVATE' | 'OPEN';

  @ApiPropertyOptional({ enum: ['OPEN', 'CLIENTS_ONLY', 'GROUP_ONLY', 'FREE'] })
  @IsOptional()
  @IsIn(['OPEN', 'CLIENTS_ONLY', 'GROUP_ONLY', 'FREE'])
  access?: 'OPEN' | 'CLIENTS_ONLY' | 'GROUP_ONLY' | 'FREE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  groupId?: string;

  @ApiPropertyOptional({ enum: ['IN_PERSON', 'ONLINE'] })
  @IsOptional()
  @IsIn(['IN_PERSON', 'ONLINE'])
  locationKind?: 'IN_PERSON' | 'ONLINE';

  @ApiPropertyOptional({ description: 'HTTPS only.' })
  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['https'] })
  @MaxLength(500)
  meetingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  venueId?: string;

  @ApiPropertyOptional({ minimum: 5, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 168 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  cancellationCutoffHours?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceAmountCents?: number;

  @ApiPropertyOptional({ maxLength: 3 })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  priceCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  recurrenceRule?: RecurrenceRuleDto;
}
