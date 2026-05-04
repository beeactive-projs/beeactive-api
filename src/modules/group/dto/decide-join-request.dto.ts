import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum JoinRequestDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class DecideJoinRequestDto {
  @ApiProperty({ enum: JoinRequestDecision })
  @IsEnum(JoinRequestDecision)
  action: JoinRequestDecision;
}
