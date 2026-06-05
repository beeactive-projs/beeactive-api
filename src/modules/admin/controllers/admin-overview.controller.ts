import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../../../common/decorators/api-response.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminDocs } from '../../../common/docs/admin.docs';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminOverviewService } from '../services/admin-overview.service';

/** Platform dashboard counts — ADMIN+SUPER_ADMIN. */
@ApiTags('Admin — Overview')
@Controller('admin/overview')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminOverviewController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get()
  @ApiEndpoint(AdminDocs.getOverview)
  getOverview() {
    return this.overview.getOverview();
  }
}
