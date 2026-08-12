import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * How far back adherence is measured. Short by design: "did they train
 * this week" is the question a coach opens this screen to answer, not
 * "how was their year".
 */
export enum RosterWindow {
  OneWeek = '1w',
  FourWeeks = '4w',
}

/** Query for `GET /coach/roster`. */
export class RosterQueryDto {
  @ApiPropertyOptional({
    enum: RosterWindow,
    default: RosterWindow.FourWeeks,
  })
  @IsOptional()
  @IsEnum(RosterWindow)
  window?: RosterWindow;
}
