import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../../../common/decorators/api-response.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminDocs } from '../../../common/docs/admin.docs';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminAuditService } from '../services/admin-audit.service';
import { AdminListDto } from '../dto/admin-list.dto';

/** Read-only admin action audit log. ADMIN/SUPPORT+. */
@ApiTags('Admin — Audit')
@Controller('admin/audit')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get('actions')
  @ApiEndpoint(AdminDocs.listAuditLog)
  actions(@Query() q: AdminListDto) {
    return this.audit.list(q.page ?? 1, q.limit ?? 20, q.status);
  }
}
