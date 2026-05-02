import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferOwnershipDto {
  @ApiProperty({
    description:
      'User ID of the new owner. Must be an active member of the group.',
  })
  @IsUUID('4')
  newOwnerId: string;
}
