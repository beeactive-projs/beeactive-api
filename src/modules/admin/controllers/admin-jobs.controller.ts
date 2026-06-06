import {
  Body,
  Controller,
  Get,
  Post,
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
import { AdminJobsService } from '../services/admin-jobs.service';
import { TriggerJobDto } from '../dto/trigger-job.dto';

/** Operations — jobs/queues. Read ADMIN+; trigger SUPER_ADMIN. */
@ApiTags('Admin — Jobs')
@Controller('admin/jobs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
export class AdminJobsController {
  constructor(private readonly jobs: AdminJobsService) {}

  @Get('overview')
  @ApiEndpoint(AdminDocs.jobsOverview)
  overview() {
    return this.jobs.overview();
  }

  @Post('trigger')
  @Roles('SUPER_ADMIN')
  @ApiEndpoint(AdminDocs.triggerJob)
  trigger(@Request() req: AuthenticatedRequest, @Body() dto: TriggerJobDto) {
    return this.jobs.trigger(req.user.id, dto.name);
  }
}
