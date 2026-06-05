import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { User } from '../../user/entities/user.entity';
import { InstructorProfile } from '../../profile/entities/instructor-profile.entity';
import { Group } from '../../group/entities/group.entity';
import { SessionInstance } from '../../session/entities/session-instance.entity';
import { SessionInstanceStatus } from '../../session/entities/session.enums';
import {
  Subscription,
  SubscriptionStatus,
} from '../../payment/entities/subscription.entity';
import { Dispute } from '../../payment/entities/dispute.entity';
import {
  WebhookEvent,
  WebhookEventStatus,
} from '../../payment/entities/webhook-event.entity';
import {
  MessageReport,
  MessageReportStatus,
} from '../../messaging/entities/message-report.entity';

/** Stripe dispute statuses that count as "needs attention". */
const OPEN_DISPUTE_STATUSES = [
  'warning_needs_response',
  'needs_response',
  'under_review',
  'warning_under_review',
];

/**
 * Platform-wide counts for the admin dashboard. Purely additive — does
 * NOT touch the in-use analytics platform-stats endpoint.
 */
@Injectable()
export class AdminOverviewService {
  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(InstructorProfile)
    private readonly instructorProfileModel: typeof InstructorProfile,
    @InjectModel(Group) private readonly groupModel: typeof Group,
    @InjectModel(SessionInstance)
    private readonly sessionInstanceModel: typeof SessionInstance,
    @InjectModel(Subscription)
    private readonly subscriptionModel: typeof Subscription,
    @InjectModel(Dispute) private readonly disputeModel: typeof Dispute,
    @InjectModel(WebhookEvent)
    private readonly webhookEventModel: typeof WebhookEvent,
    @InjectModel(MessageReport)
    private readonly messageReportModel: typeof MessageReport,
  ) {}

  async getOverview() {
    const [
      usersTotal,
      usersActive,
      usersDeleted,
      instructors,
      groups,
      sessionsTotal,
      sessionsCompleted,
      activeSubscriptions,
      openDisputes,
      failedWebhooks,
      openMessageReports,
    ] = await Promise.all([
      this.userModel.count(),
      this.userModel.count({ where: { isActive: true } }),
      this.userModel.count({
        paranoid: false,
        where: { deletedAt: { [Op.ne]: null } },
      }),
      this.instructorProfileModel.count(),
      this.groupModel.count(),
      this.sessionInstanceModel.count(),
      this.sessionInstanceModel.count({
        where: { status: SessionInstanceStatus.Completed },
      }),
      this.subscriptionModel.count({
        where: {
          status: {
            [Op.in]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
        },
      }),
      this.disputeModel.count({
        where: { status: { [Op.in]: OPEN_DISPUTE_STATUSES } },
      }),
      this.webhookEventModel.count({
        where: { status: WebhookEventStatus.FAILED },
      }),
      this.messageReportModel.count({
        where: {
          status: {
            [Op.in]: [MessageReportStatus.OPEN, MessageReportStatus.REVIEWING],
          },
        },
      }),
    ]);

    return {
      users: { total: usersTotal, active: usersActive, deleted: usersDeleted },
      instructors,
      groups,
      sessions: { total: sessionsTotal, completed: sessionsCompleted },
      payments: {
        activeSubscriptions,
        openDisputes,
        failedWebhooks,
      },
      moderation: { openMessageReports },
    };
  }
}
