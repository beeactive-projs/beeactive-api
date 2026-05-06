import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  buildPaginatedResponse,
  PaginatedResponse,
  getOffset,
} from '../../../common/dto/pagination.dto';
import {
  Notification,
  NotificationData,
  NotificationSeverity,
} from '../entities/notification.entity';
import { NotificationReceipt } from '../entities/notification-receipt.entity';

/**
 * Shape returned to the FE — flattens the (notification + receipt)
 * join into a single object so the bell component doesn't have to
 * navigate two levels of nesting.
 *
 * `id` here is the **receipt id**, not the notification id. The FE
 * mark-read / dismiss / delete endpoints all key off this.
 */
export interface BellNotification {
  id: string;
  notificationId: string;
  type: string;
  title: string;
  body: string;
  data: NotificationData | null;
  severity: NotificationSeverity;
  iconUrl: string | null;
  priority: number;
  deliveredAt: Date | null;
  viewedAt: Date | null;
  readAt: Date | null;
  clickedAt: Date | null;
  dismissedAt: Date | null;
  createdAt: Date;
}

export interface ListReceiptsOptions {
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

/**
 * NotificationReceiptService
 *
 * The FE-facing read/mutate API for the bell + history. Producers
 * write through `NotificationService.notify()`; the FE reads through
 * here.
 *
 * Ownership is enforced at the query level: every method takes
 * `userId` and only operates on rows owned by that user. A 404 is
 * returned for cross-user access (we don't leak existence with 403).
 */
@Injectable()
export class NotificationReceiptService {
  constructor(
    @InjectModel(NotificationReceipt)
    private readonly receiptModel: typeof NotificationReceipt,
    @InjectModel(Notification)
    private readonly notificationModel: typeof Notification,
  ) {}

  /**
   * Bell list query. Filters out expired alerts and (when set) alerts
   * scheduled for the future. Newest first.
   */
  async listForUser(
    userId: string,
    opts: ListReceiptsOptions,
  ): Promise<PaginatedResponse<BellNotification>> {
    const receiptWhere: Record<string, unknown> = { userId };
    if (opts.unreadOnly) {
      receiptWhere.readAt = { [Op.is]: null };
      receiptWhere.dismissedAt = { [Op.is]: null };
    }

    const { rows, count } = await this.receiptModel.findAndCountAll({
      where: receiptWhere,
      include: [this.activeNotificationInclude()],
      order: [['createdAt', 'DESC']],
      limit: opts.limit,
      offset: getOffset(opts.page, opts.limit),
    });

    const items = rows.map((r) => this.toBellShape(r));
    return buildPaginatedResponse(items, count, opts.page, opts.limit);
  }

  /**
   * Bell badge: unread count for the user. Filters mirror listForUser
   * (visibility window via the joined notification) so the badge
   * stays accurate.
   */
  async unreadCount(userId: string): Promise<number> {
    return this.receiptModel.count({
      where: {
        userId,
        readAt: { [Op.is]: null },
        dismissedAt: { [Op.is]: null },
      },
      include: [this.activeNotificationInclude()],
    });
  }

  /**
   * Shared `include` clause for the bell queries: only join
   * notifications that are currently visible (deliver_at <= now AND
   * (expire_at IS NULL OR expire_at > now)). Built per-call so `now`
   * is fresh — Sequelize freezes literal values at expression build
   * time, not at query execution time.
   */
  private activeNotificationInclude() {
    const now = new Date();
    return {
      model: this.notificationModel,
      required: true,
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              { deliverAt: { [Op.is]: null } },
              { deliverAt: { [Op.lte]: now } },
            ],
          },
          {
            [Op.or]: [
              { expireAt: { [Op.is]: null } },
              { expireAt: { [Op.gt]: now } },
            ],
          },
        ],
      },
    };
  }

  async markAsRead(userId: string, receiptId: string): Promise<void> {
    const receipt = await this.findOwnedOrThrow(userId, receiptId);
    if (!receipt.readAt) {
      receipt.readAt = new Date();
      await receipt.save();
    }
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const [updated] = await this.receiptModel.update(
      { readAt: new Date() },
      {
        where: {
          userId,
          readAt: { [Op.is]: null },
        },
      },
    );
    return { updated };
  }

  /**
   * Mark a batch of receipts as viewed. Called by the FE when the
   * bell dropdown opens — we want the analytics signal but not the
   * "mark read" implication.
   */
  async markAsViewed(
    userId: string,
    receiptIds: string[],
  ): Promise<{ updated: number }> {
    if (receiptIds.length === 0) return { updated: 0 };
    const [updated] = await this.receiptModel.update(
      { viewedAt: new Date() },
      {
        where: {
          id: { [Op.in]: receiptIds },
          userId,
          viewedAt: { [Op.is]: null },
        },
      },
    );
    return { updated };
  }

  /**
   * Set clicked_at + read_at in one shot. The FE calls this when the
   * user clicks through to the deep-linked screen.
   */
  async markAsClicked(userId: string, receiptId: string): Promise<void> {
    const receipt = await this.findOwnedOrThrow(userId, receiptId);
    const now = new Date();
    if (!receipt.clickedAt) receipt.clickedAt = now;
    if (!receipt.readAt) receipt.readAt = now;
    await receipt.save();
  }

  async dismiss(userId: string, receiptId: string): Promise<void> {
    const receipt = await this.findOwnedOrThrow(userId, receiptId);
    if (!receipt.dismissedAt) {
      receipt.dismissedAt = new Date();
      await receipt.save();
    }
  }

  /**
   * Hard delete — receipts have no audit value once the user wants
   * them gone. Re-shows are achieved by emitting a fresh notification.
   */
  async remove(userId: string, receiptId: string): Promise<void> {
    const deleted = await this.receiptModel.destroy({
      where: { id: receiptId, userId },
    });
    if (deleted === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Record the per-channel outcome for a receipt. Used by workers
   * (Phase 6+) to update `delivered_channels` after async delivery
   * completes — e.g. the email worker writes `email: 'sent'` or
   * `email: 'failed:resend timeout'` here when its job finishes.
   *
   * Merges with the existing JSONB so other channel results (in_app,
   * push, sms) aren't clobbered by a single channel's update.
   *
   * Silently no-ops when the receipt no longer exists (the user
   * deleted it before the worker finished). The worker shouldn't
   * fail just because a row is gone.
   */
  async recordChannelOutcome(
    receiptId: string,
    channel: 'in_app' | 'email' | 'push' | 'sms',
    outcome: string,
  ): Promise<void> {
    const receipt = await this.receiptModel.findByPk(receiptId);
    if (!receipt) return;
    const next = { ...receipt.deliveredChannels, [channel]: outcome };
    receipt.deliveredChannels = next;
    await receipt.save();
  }

  private async findOwnedOrThrow(
    userId: string,
    receiptId: string,
  ): Promise<NotificationReceipt> {
    const receipt = await this.receiptModel.findOne({
      where: { id: receiptId, userId },
    });
    if (!receipt) {
      // 404 (not 403) — don't leak existence of receipts owned by others.
      throw new NotFoundException('Notification not found');
    }
    return receipt;
  }

  private toBellShape(receipt: NotificationReceipt): BellNotification {
    const n = receipt.notification;
    return {
      id: receipt.id,
      notificationId: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      severity: n.severity,
      iconUrl: n.iconUrl,
      priority: n.priority,
      deliveredAt: receipt.deliveredAt,
      viewedAt: receipt.viewedAt,
      readAt: receipt.readAt,
      clickedAt: receipt.clickedAt,
      dismissedAt: receipt.dismissedAt,
      createdAt: receipt.createdAt,
    };
  }
}
