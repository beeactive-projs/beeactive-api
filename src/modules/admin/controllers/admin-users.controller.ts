import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../../../common/decorators/api-response.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminDocs } from '../../../common/docs/admin.docs';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../../common/types/authenticated-request';
import { AdminUsersService } from '../services/admin-users.service';
import { ListUsersDto } from '../dto/list-users.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { AssignRoleDto } from '../dto/assign-role.dto';

/**
 * Cross-tenant user management. Class gated to ADMIN+SUPER_ADMIN; the
 * mutating role/restore endpoints override to SUPER_ADMIN at the method.
 */
@ApiTags('Admin — Users')
@Controller('admin/users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiEndpoint(AdminDocs.listUsers)
  listUsers(@Query() query: ListUsersDto) {
    return this.users.listUsers(query);
  }

  @Get(':id')
  @ApiEndpoint(AdminDocs.getUserDetail)
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getUserDetail(id);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiEndpoint(AdminDocs.updateUserStatus)
  updateStatus(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.users.updateStatus(req.user.id, id, dto, req.ip ?? null);
  }

  @Post(':id/roles')
  @Roles('SUPER_ADMIN')
  @ApiEndpoint(AdminDocs.assignRole)
  assignRole(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.users.assignRole(req.user.id, id, dto.role);
  }

  @Delete(':id/roles/:role')
  @Roles('SUPER_ADMIN')
  @ApiEndpoint(AdminDocs.revokeRole)
  revokeRole(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('role') role: string,
  ) {
    return this.users.revokeRole(req.user.id, id, role);
  }

  @Post(':id/restore')
  @Roles('SUPER_ADMIN')
  @ApiEndpoint(AdminDocs.restoreUser)
  restore(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.restoreUser(req.user.id, id);
  }
}
