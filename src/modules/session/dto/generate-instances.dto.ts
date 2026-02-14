import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GenerateInstancesDto {
  @ApiPropertyOptional({
    example: 12,
    description:
      'Generate occurrences for the next N weeks from the template session start. Default 12.',
    default: 12,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(52)
  @IsOptional()
  weeks?: number = 12;
}
