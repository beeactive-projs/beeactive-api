import {
  Body,
  Controller,
  Get,
  Param,
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

  @Get('queues/:queue/jobs')
  @ApiEndpoint(AdminDocs.listQueueJobs)
  listJobs(
    @Param('queue') queue: string,
    @Query('perState') perState?: string,
  ) {
    const n = Math.min(50, Math.max(1, Number(perState) || 10));
    return this.jobs.listJobs(queue, n);
  }

  @Post('queues/:queue/jobs/:jobId/retry')
  @Roles('SUPER_ADMIN')
  @ApiEndpoint(AdminDocs.retryJob)
  retry(
    @Request() req: AuthenticatedRequest,
    @Param('queue') queue: string,
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.retry(req.user.id, queue, jobId);
  }
}
