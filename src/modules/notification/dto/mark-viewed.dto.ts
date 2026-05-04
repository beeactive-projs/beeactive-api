import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/**
 * Body for PATCH /notifications/viewed.
 *
 * Capped at 100 IDs per call because the FE sends this on bell-dropdown
 * open and we don't want a runaway from a misbehaving client.
 */
export class MarkViewedDto {
  @ApiProperty({
    type: [String],
    description: 'Receipt IDs the user has just seen in the dropdown',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids: string[];
}
