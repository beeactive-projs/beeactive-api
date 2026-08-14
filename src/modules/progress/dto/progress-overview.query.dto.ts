import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ProgressRange } from './progress-range.enum';

/** Query for `GET /progress/overview`. */
export class ProgressOverviewQueryDto {
  @ApiPropertyOptional({
    enum: ProgressRange,
    default: ProgressRange.TwelveWeeks,
    description: 'Window to summarise. Records and streaks ignore it.',
  })
  @IsOptional()
  @IsEnum(ProgressRange)
  range?: ProgressRange;
}
