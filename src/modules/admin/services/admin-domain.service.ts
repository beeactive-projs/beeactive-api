import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op, type WhereOptions } from 'sequelize';
import {
  buildPaginatedResponse,
  getOffset,
} from '../../../common/dto/pagination.dto';
import { Group } from '../../group/entities/group.entity';
import { SessionInstance } from '../../session/entities/session-instance.entity';
import { Venue } from '../../venue/entities/venue.entity';
import { Exercise } from '../../exercise/entities/exercise.entity';
import { AdminListDto } from '../dto/admin-list.dto';
import { AdminAuditService } from './admin-audit.service';

const USER_BRIEF = ['id', 'email', 'firstName', 'lastName'];

/**
 * Curated cross-tenant domain browsers (read-only) + a safe moderation
 * action (soft-delete a group). Sessions/venues/exercises are read-only
 * in this pass — their lifecycle actions carry side effects best left to
 * a later, deliberate phase.
 */
@Injectable()
export class AdminDomainService {
  constructor(
    @InjectModel(Group) private readonly groupModel: typeof Group,
    @InjectModel(SessionInstance)
    private readonly sessionModel: typeof SessionInstance,
    @InjectModel(Venue) private readonly venueModel: typeof Venue,
    @InjectModel(Exercise) private readonly exerciseModel: typeof Exercise,
    private readonly audit: AdminAuditService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async listGroups(dto: AdminListDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: WhereOptions<Group> = dto.q?.trim()
      ? ({ name: { [Op.iLike]: `%${dto.q.trim()}%` } } as WhereOptions<Group>)
      : {};
    const { rows, count } = await this.groupModel.findAndCountAll({
      where,
      paranoid: !dto.includeDeleted,
      include: [{ association: 'instructor', attributes: USER_BRIEF }],
      limit,
      offset: getOffset(page, limit),
      order: [['createdAt', 'DESC']],
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  async deleteGroup(adminId: string, id: string, ip: string | null) {
    const group = await this.groupModel.findByPk(id);
    if (!group) throw new NotFoundException('Group not found');
    await group.destroy();
    await this.audit.record({
      adminUserId: adminId,
      action: 'domain.group.delete',
      targetType: 'group',
      targetId: id,
      meta: { name: group.name },
      ip,
    });
    this.logger.log(
      `Admin ${adminId} soft-deleted group ${id}`,
      'AdminDomainService',
    );
    return { id, deleted: true };
  }

  async getExercise(id: string) {
    const exercise = await this.exerciseModel.findByPk(id, { paranoid: false });
    if (!exercise) throw new NotFoundException('Exercise not found');
    return exercise;
  }

  async updateExercise(
    adminId: string,
    id: string,
    patch: Record<string, unknown>,
    ip: string | null,
  ) {
    const exercise = await this.exerciseModel.findByPk(id);
    if (!exercise) throw new NotFoundException('Exercise not found');
    // Apply only the provided scalar fields — strip undefined so we never
    // null out a NOT NULL column the caller didn't touch.
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    exercise.set(clean);
    await exercise.save();
    await this.audit.record({
      adminUserId: adminId,
      action: 'domain.exercise.update',
      targetType: 'exercise',
      targetId: id,
      meta: { fields: Object.keys(clean) },
      ip,
    });
    this.logger.log(
      `Admin ${adminId} updated exercise ${id} (${Object.keys(patch).join(',')})`,
      'AdminDomainService',
    );
    return exercise;
  }

  async deleteExercise(adminId: string, id: string, ip: string | null) {
    const exercise = await this.exerciseModel.findByPk(id);
    if (!exercise) throw new NotFoundException('Exercise not found');
    await exercise.destroy();
    await this.audit.record({
      adminUserId: adminId,
      action: 'domain.exercise.delete',
      targetType: 'exercise',
      targetId: id,
      meta: { name: exercise.name, source: exercise.source },
      ip,
    });
    this.logger.log(
      `Admin ${adminId} soft-deleted exercise ${id} (${exercise.source})`,
      'AdminDomainService',
    );
    return { id, deleted: true };
  }

  async listSessions(dto: AdminListDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: WhereOptions<SessionInstance> = dto.status
      ? ({ status: dto.status } as WhereOptions<SessionInstance>)
      : {};
    const { rows, count } = await this.sessionModel.findAndCountAll({
      where,
      paranoid: !dto.includeDeleted,
      include: [
        { association: 'instructor', attributes: USER_BRIEF },
        { association: 'template', attributes: ['id', 'title'] },
      ],
      limit,
      offset: getOffset(page, limit),
      order: [['startAt', 'DESC']],
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  async listVenues(dto: AdminListDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const { rows, count } = await this.venueModel.findAndCountAll({
      paranoid: !dto.includeDeleted,
      include: [
        {
          association: 'instructor',
          attributes: ['id', 'displayName', 'userId'],
        },
      ],
      limit,
      offset: getOffset(page, limit),
      order: [['createdAt', 'DESC']],
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  async listExercises(dto: AdminListDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const and: WhereOptions<Exercise>[] = [];
    if (dto.q?.trim()) {
      and.push({
        name: { [Op.iLike]: `%${dto.q.trim()}%` },
      } as WhereOptions<Exercise>);
    }
    if (dto.status) {
      // reuse `status` as a source filter (SYSTEM/INSTRUCTOR/ADMIN)
      and.push({ source: dto.status } as WhereOptions<Exercise>);
    }
    const where: WhereOptions<Exercise> = and.length ? { [Op.and]: and } : {};
    const { rows, count } = await this.exerciseModel.findAndCountAll({
      where,
      paranoid: !dto.includeDeleted,
      include: [{ association: 'owner', attributes: USER_BRIEF }],
      limit,
      offset: getOffset(page, limit),
      order: [['createdAt', 'DESC']],
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }
}
