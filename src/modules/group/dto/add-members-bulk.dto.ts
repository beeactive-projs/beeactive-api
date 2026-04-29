import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  IsUUID,
} from 'class-validator';

export class AddMembersBulkDto {
  @ApiProperty({ type: [String], description: 'User IDs to add as members' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  userIds: string[];
}
