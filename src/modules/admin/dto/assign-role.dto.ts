import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ADMIN_ROLE_NAMES } from '../admin.constants';

/** Assign a system role to a user (SUPER_ADMIN only). */
export class AssignRoleDto {
  @ApiProperty({ enum: ADMIN_ROLE_NAMES })
  @IsIn(ADMIN_ROLE_NAMES)
  role!: string;
}
