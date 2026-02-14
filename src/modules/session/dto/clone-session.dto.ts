import { IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CloneSessionDto {
  @ApiProperty({
    example: '2026-02-20T09:00:00.000Z',
    description: 'When the cloned session should be scheduled',
  })
  @IsDateString()
  @IsNotEmpty()
  scheduledAt: string;
}
