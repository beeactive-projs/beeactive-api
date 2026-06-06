import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { JobsService } from '../../jobs/jobs.service';
import { TRIGGERABLE_JOBS, isTriggerableJob } from '../../jobs/job-registry';
import { AdminAuditService } from './admin-audit.service';

/**
 * Admin Operations — jobs/queues. Thin wrapper over JobsService (which
 * keeps the BullMQ dependency confined to the jobs module). Read-only
 * queue counts + manual sweep triggers; deep inspection/retry of
 * individual jobs is delegated to Bull Board (/admin/queues).
 */
@Injectable()
export class AdminJobsService {
  constructor(
    private readonly jobs: JobsService,
    private readonly audit: AdminAuditService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /** Queue counts + the catalog of triggerable sweeps + Bull Board path. */
  async overview() {
    const { redisEnabled, queues } = await this.jobs.getQueuesOverview();
    return {
      redisEnabled,
      queues,
      triggerable: TRIGGERABLE_JOBS,
      bullBoardPath: '/admin/queues',
    };
  }

  async trigger(adminId: string, name: string) {
    if (!isTriggerableJob(name)) {
      throw new BadRequestException(`Job '${name}' is not triggerable.`);
    }
    const res = await this.jobs.triggerCron(name);
    await this.audit.record({
      adminUserId: adminId,
      action: 'jobs.trigger',
      targetType: 'job',
      targetId: name,
      meta: { enqueued: res.enqueued, jobId: res.jobId },
    });
    this.logger.log(
      `Admin ${adminId} triggered job ${name} (enqueued=${res.enqueued})`,
      'AdminJobsService',
    );
    return { name, ...res };
  }
}
