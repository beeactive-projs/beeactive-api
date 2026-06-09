import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  buildPaginatedResponse,
  getOffset,
} from '../../../common/dto/pagination.dto';
import { AdminActionLog } from '../entities/admin-action-log.entity';
import { User } from '../../user/entities/user.entity';

export interface AdminActionInput {
  adminUserId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Central recorder for admin mutation audit rows. record() never throws
 * into the caller — an audit write failing must not break the action it
 * describes (it's logged instead). Reads power the admin audit-log view.
 */
@Injectable()
export class AdminAuditService {
  constructor(
    @InjectModel(AdminActionLog)
    private readonly logModel: typeof AdminActionLog,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async record(input: AdminActionInput): Promise<void> {
    try {
      await this.logModel.create({
        adminUserId: input.adminUserId,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        meta: input.meta ?? {},
        ip: input.ip ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Failed to write admin audit row (${input.action}): ${(err as Error).message}`,
        'AdminAuditService',
      );
    }
  }

  async list(page: number, limit: number, action?: string) {
    const where = action ? { action } : {};
    const { rows, count } = await this.logModel.findAndCountAll({
      where,
      include: [{ model: User, as: 'admin', attributes: ['id', 'email'] }],
      limit,
      offset: getOffset(page, limit),
      order: [['createdAt', 'DESC']],
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }
}
