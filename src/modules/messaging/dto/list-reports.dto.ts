import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  MessageReportCategory,
  MessageReportStatus,
} from '../entities/message-report.entity';

/**
 * Admin filter for the moderation queue. Defaults pull OPEN reports first.
 */
export class ListReportsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: MessageReportStatus })
  @IsOptional()
  @IsEnum(MessageReportStatus)
  status?: MessageReportStatus;

  @ApiPropertyOptional({ enum: MessageReportCategory })
  @IsOptional()
  @IsEnum(MessageReportCategory)
  category?: MessageReportCategory;
}

/**
 * Admin filter for the velocity-alarm queue. Defaults to unreviewed.
 */
export class ListVelocityAlarmsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'When true, include alarms that have already been reviewed.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeReviewed?: boolean = false;
}
