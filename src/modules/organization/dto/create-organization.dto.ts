import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({
    example: "John's Fitness Studio",
    description: 'Organization name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: 'Personal training and group HIIT sessions',
    description: 'Organization description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: 'Europe/Bucharest',
    description: 'Timezone (defaults to Europe/Bucharest)',
  })
  @IsString()
  @IsOptional()
  timezone?: string;
}
