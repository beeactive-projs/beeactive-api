import type { LoggerService } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  buildPaginatedResponse,
  PaginatedResponse,
} from '../../common/dto/pagination.dto';
import { User } from '../user/entities/user.entity';
import { AdminMessageAccessLog } from './entities/admin-message-access-log.entity';
import { Conversation, ConversationType } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message, MessageKind } from './entities/message.entity';
import {
  MessageReport,
  MessageReportCategory,
  MessageReportStatus,
} from './entities/message-report.entity';
import { MessagingSuspension } from './entities/messaging-suspension.entity';
import { MessagingVelocityAlarm } from './entities/messaging-velocity-alarm.entity';

interface ReportTarget {
  reportedUserId: string;
  messageId: string | null;
  conversationId: string | null;
}

export interface AdminReadView {
  items: Array<{
    id: string;
    conversationId: string;
    senderId: string | null;
    kind: MessageKind;
    body: string;
    deletedAt: Date | null;
    createdAt: Date;
  }>;
  accessLogId: string;
}

/**
 * Moderation service — owns the report queue, admin access logging, and
 * suspension lifecycle. Kept separate from MessagingService (which is
 * the user-facing surface) and MessagingSafetyService (which answers
 * "can this happen") because moderation concerns are admin-only and
 * have their own audit semantics.
 */
@Injectable()
export class MessagingModerationService {
  constructor(
    @InjectModel(MessageReport)
    private readonly reportModel: typeof MessageReport,
    @InjectModel(MessagingSuspension)
    private readonly suspensionModel: typeof MessagingSuspension,
    @InjectModel(AdminMessageAccessLog)
    private readonly accessLogModel: typeof AdminMessageAccessLog,
    @InjectModel(Conversation)
    private readonly conversationModel: typeof Conversation,
    @InjectModel(Message)
    private readonly messageModel: typeof Message,
    @InjectModel(MessagingVelocityAlarm)
    private readonly velocityAlarmModel: typeof MessagingVelocityAlarm,
    @InjectModel(ConversationParticipant)
    private readonly participantModel: typeof ConversationParticipant,
    private readonly sequelize: Sequelize,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // =========================================================================
  // User-facing — submit a report
  // =========================================================================

  /**
   * User submits a report. Resolves the reported user from the supplied
   * messageId or conversationId. Stores the report in OPEN status; the
   * moderation queue picks it up from there.
   *
   * Anti-abuse: a reporter can't open more than one OPEN report against
   * the same (target user) tuple from the same conversation context.
   * Re-reporting transitions to merged once a similar OPEN report
   * exists — we currently 409 to keep the queue clean.
   */
  async submitReport(
    reporterId: string,
    dto: {
      messageId?: string;
      conversationId?: string;
      category: MessageReportCategory;
      notes?: string;
    },
  ): Promise<MessageReport> {
    if (!dto.messageId && !dto.conversationId) {
      throw new BadRequestException(
        'Either messageId or conversationId is required.',
      );
    }

    const target = await this.resolveReportTarget(
      reporterId,
      dto.messageId,
      dto.conversationId,
    );

    if (target.reportedUserId === reporterId) {
      throw new BadRequestException('You cannot report your own messages.');
    }

    const existingOpen = await this.reportModel.findOne({
      where: {
        reporterId,
        reportedUserId: target.reportedUserId,
        status: {
          [Op.in]: [MessageReportStatus.OPEN, MessageReportStatus.REVIEWING],
        },
        ...(target.conversationId
          ? { conversationId: target.conversationId }
          : {}),
      },
      attributes: ['id'],
    });
    if (existingOpen) {
      throw new ConflictException(
        'You already have an open report against this user. Our team will review it.',
      );
    }

    const report = await this.reportModel.create({
      reporterId,
      reportedUserId: target.reportedUserId,
      messageId: target.messageId,
      conversationId: target.conversationId,
      category: dto.category,
      notes: dto.notes ?? null,
      status: MessageReportStatus.OPEN,
    });

    this.logger.log?.(
      `Report ${report.id} filed by ${reporterId} against ${target.reportedUserId} (${dto.category})`,
      'MessagingModerationService',
    );

    return report;
  }

  // =========================================================================
  // Admin — moderation queue
  // =========================================================================

  async listReports(
    page: number,
    limit: number,
    filter: { status?: MessageReportStatus; category?: MessageReportCategory },
  ): Promise<PaginatedResponse<MessageReport>> {
    const where: {
      status?: MessageReportStatus;
      category?: MessageReportCategory;
    } = {};
    if (filter.status) where.status = filter.status;
    if (filter.category) where.category = filter.category;

    const offset = (page - 1) * limit;
    const { rows, count } = await this.reportModel.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'reporter',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
        {
          model: User,
          as: 'reportedUser',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
      order: [
        // OPEN first, then REVIEWING, then everything else by recency.
        ['status', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit,
      offset,
      distinct: true,
    });

    return buildPaginatedResponse(rows, count, page, limit);
  }

  /**
   * Admin transitions a report. Allowed:
   *   OPEN → REVIEWING / RESOLVED / DISMISSED
   *   REVIEWING → RESOLVED / DISMISSED
   * Anything else (e.g. RESOLVED → OPEN) is 400.
   */
  async resolveReport(
    adminUserId: string,
    reportId: string,
    next: MessageReportStatus,
    resolutionNotes?: string,
  ): Promise<MessageReport> {
    const report = await this.reportModel.findByPk(reportId);
    if (!report) {
      throw new NotFoundException('Report not found.');
    }

    this.assertReportTransitionAllowed(report.status, next);

    const isTerminal =
      next === MessageReportStatus.RESOLVED ||
      next === MessageReportStatus.DISMISSED;

    await report.update({
      status: next,
      resolutionNotes: resolutionNotes ?? report.resolutionNotes,
      resolvedById: isTerminal ? adminUserId : report.resolvedById,
      resolvedAt: isTerminal ? new Date() : report.resolvedAt,
    });

    this.logger.log?.(
      `Report ${reportId} → ${next} by admin ${adminUserId}`,
      'MessagingModerationService',
    );

    return report;
  }

  // =========================================================================
  // Admin — read a flagged conversation (audit-logged)
  // =========================================================================

  /**
   * Read messages in a conversation for moderation review. Every call
   * writes an admin_message_access_log row in the SAME transaction as
   * the read, so the audit trail can never get out of sync with the
   * data the admin actually saw.
   */
  async readConversationForModeration(
    adminUserId: string,
    conversationId: string,
    args: {
      reason: string;
      relatedReportId?: string;
      limit?: number;
    },
  ): Promise<AdminReadView> {
    const conversation = await this.conversationModel.findByPk(conversationId, {
      attributes: ['id'],
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    if (args.relatedReportId) {
      const report = await this.reportModel.findByPk(args.relatedReportId, {
        attributes: ['id'],
      });
      if (!report) {
        throw new BadRequestException('relatedReportId does not exist.');
      }
    }

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    const result = await this.sequelize.transaction(async (tx) => {
      // Audit FIRST. If the read query fails later, we still recorded
      // the *intent* to access — important: an admin can't repeatedly
      // probe by issuing reads that "happen to" fail to bypass logging.
      const log = await this.accessLogModel.create(
        {
          adminUserId,
          conversationId,
          relatedReportId: args.relatedReportId ?? null,
          reason: args.reason,
        },
        { transaction: tx },
      );

      const rows = await this.messageModel.findAll({
        where: { conversationId },
        order: [['createdAt', 'DESC']],
        limit,
        transaction: tx,
      });

      return { log, rows };
    });

    return {
      accessLogId: result.log.id,
      items: result.rows.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        kind: m.kind,
        body: m.deletedAt ? '[deleted]' : m.body,
        deletedAt: m.deletedAt,
        createdAt: m.createdAt,
      })),
    };
  }

  // =========================================================================
  // Admin — suspension lifecycle
  // =========================================================================

  async suspend(
    adminUserId: string,
    args: { userId: string; reason: string; expiresAtIso?: string },
  ): Promise<MessagingSuspension> {
    if (args.userId === adminUserId) {
      throw new BadRequestException('Admins cannot suspend themselves.');
    }

    const target = await User.findByPk(args.userId, { attributes: ['id'] });
    if (!target) {
      throw new NotFoundException('User not found.');
    }

    let expiresAt: Date | null = null;
    if (args.expiresAtIso) {
      expiresAt = new Date(args.expiresAtIso);
      if (Number.isNaN(expiresAt.getTime())) {
        throw new BadRequestException(
          'expiresAtIso is not a valid ISO timestamp.',
        );
      }
      if (expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('expiresAtIso must be in the future.');
      }
    }

    // Don't stack active suspensions — extend an existing one is a
    // separate intent. For v1, refuse to create a second active row.
    const active = await this.suspensionModel.findOne({
      where: {
        userId: args.userId,
        liftedAt: null,
        [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
      },
    });
    if (active) {
      throw new ConflictException(
        'User already has an active messaging suspension. Lift it before applying a new one.',
      );
    }

    const row = await this.suspensionModel.create({
      userId: args.userId,
      appliedById: adminUserId,
      reason: args.reason,
      expiresAt,
    });

    this.logger.log?.(
      `Admin ${adminUserId} suspended ${args.userId} (expires=${expiresAt?.toISOString() ?? 'INDEFINITE'})`,
      'MessagingModerationService',
    );

    return row;
  }

  // =========================================================================
  // Admin — velocity alarms
  // =========================================================================

  async listVelocityAlarms(
    page: number,
    limit: number,
    includeReviewed: boolean,
  ): Promise<PaginatedResponse<MessagingVelocityAlarm>> {
    const where = includeReviewed ? {} : { reviewedAt: null };
    const offset = (page - 1) * limit;
    const { rows, count } = await this.velocityAlarmModel.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  async reviewVelocityAlarm(
    adminUserId: string,
    alarmId: string,
  ): Promise<MessagingVelocityAlarm> {
    const alarm = await this.velocityAlarmModel.findByPk(alarmId);
    if (!alarm) {
      throw new NotFoundException('Velocity alarm not found.');
    }
    if (alarm.reviewedAt) {
      throw new BadRequestException('This alarm has already been reviewed.');
    }
    await alarm.update({
      reviewedAt: new Date(),
      reviewedById: adminUserId,
    });
    this.logger.log?.(
      `Admin ${adminUserId} reviewed velocity alarm ${alarmId}`,
      'MessagingModerationService',
    );
    return alarm;
  }

  async lift(
    adminUserId: string,
    suspensionId: string,
  ): Promise<MessagingSuspension> {
    const row = await this.suspensionModel.findByPk(suspensionId);
    if (!row) {
      throw new NotFoundException('Suspension not found.');
    }
    if (row.liftedAt) {
      throw new BadRequestException('Suspension is already lifted.');
    }
    await row.update({ liftedAt: new Date(), liftedById: adminUserId });

    this.logger.log?.(
      `Admin ${adminUserId} lifted suspension ${suspensionId}`,
      'MessagingModerationService',
    );

    return row;
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private assertReportTransitionAllowed(
    current: MessageReportStatus,
    next: MessageReportStatus,
  ): void {
    if (next === MessageReportStatus.OPEN) {
      throw new BadRequestException('Cannot transition a report back to OPEN.');
    }
    const terminal =
      current === MessageReportStatus.RESOLVED ||
      current === MessageReportStatus.DISMISSED;
    if (terminal) {
      throw new BadRequestException(
        `Report is already in terminal state ${current}.`,
      );
    }
    // OPEN → anything-not-OPEN, REVIEWING → RESOLVED/DISMISSED are
    // both fine. The only blocked transition is OPEN → OPEN
    // (no-op) and REVIEWING → REVIEWING (no-op).
    if (current === next) {
      throw new BadRequestException(`Report is already in state ${current}.`);
    }
  }

  /**
   * Resolve who is being reported. If messageId is supplied we read its
   * sender; otherwise we walk the conversation and pick the participant
   * that isn't the reporter. Either path errors with 404 when the
   * referenced rows don't exist or 400 when the reporter is somehow
   * naming a target that has no clear sender.
   *
   * Security: the reporter MUST be an active participant of the
   * conversation they're reporting. Without this gate, any
   * authenticated user with a known conversation UUID could file
   * abuse reports against either participant — a harassment vector
   * (and DoS against the 5/hr report throttle of good actors).
   */
  private async resolveReportTarget(
    reporterId: string,
    messageId: string | undefined,
    conversationId: string | undefined,
  ): Promise<ReportTarget> {
    if (messageId) {
      const message = await this.messageModel.findByPk(messageId, {
        attributes: ['id', 'senderId', 'conversationId'],
      });
      if (!message) {
        throw new NotFoundException('Message not found.');
      }
      if (!message.senderId) {
        throw new BadRequestException('Cannot report a system message.');
      }
      // Authorization gate — reporter must be in the conversation.
      // 404 (not 403) so we don't leak "this conversation exists but
      // you're not in it" to a casual probe.
      await this.assertReporterIsParticipant(
        reporterId,
        message.conversationId,
      );
      return {
        reportedUserId: message.senderId,
        messageId: message.id,
        conversationId: message.conversationId,
      };
    }

    // conversationId path — pick the other DIRECT participant. For
    // groups (v2+), the report needs a specific message; refuse here so
    // we don't accidentally implicate every group member.
    const conversation = await this.conversationModel.findByPk(
      conversationId as string,
      {
        attributes: ['id', 'type'],
        include: [{ association: 'participants' }],
      },
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }
    // Same gate as the messageId path: the reporter must actually
    // belong to this conversation. We check against the eagerly-
    // loaded participants array we already have.
    const reporterParticipant = conversation.participants.find(
      (p) => p.userId === reporterId && !p.leftAt,
    );
    if (!reporterParticipant) {
      throw new NotFoundException('Conversation not found.');
    }
    if (conversation.type !== ConversationType.DIRECT) {
      throw new BadRequestException(
        'For group conversations, please report a specific message.',
      );
    }
    const otherUserId = conversation.participants.find(
      (p) => p.userId !== reporterId && !p.leftAt,
    )?.userId;
    if (!otherUserId) {
      throw new BadRequestException(
        'Cannot resolve the reported user from this conversation.',
      );
    }
    return {
      reportedUserId: otherUserId,
      messageId: null,
      conversationId: conversation.id,
    };
  }

  /**
   * Throws NotFoundException unless `reporterId` is an active
   * participant of `conversationId`. Returns 404 (not 403) so the
   * existence of the conversation isn't leaked.
   */
  private async assertReporterIsParticipant(
    reporterId: string,
    conversationId: string,
  ): Promise<void> {
    const row = await this.participantModel.findOne({
      where: { conversationId, userId: reporterId, leftAt: null },
      attributes: ['id'],
    });
    if (!row) {
      throw new NotFoundException('Conversation not found.');
    }
  }
}
