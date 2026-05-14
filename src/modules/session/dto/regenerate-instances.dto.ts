import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegenerateInstancesDto {
  @ApiProperty({
    description: '1..104 occurrences to generate',
    minimum: 1,
    maximum: 104,
  })
  @IsInt()
  @Min(1)
  @Max(104)
  count: number;
}
