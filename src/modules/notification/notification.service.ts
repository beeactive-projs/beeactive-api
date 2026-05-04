import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  Notification,
  NotificationAudienceType,
  NotificationData,
  NotificationSeverity,
} from './entities/notification.entity';
import {
  DeliveredChannels,
  DeliveredChannelStatus,
  NotificationReceipt,
} from './entities/notification-receipt.entity';
import {
  ChannelPreferences,
  NotificationPreference,
} from './entities/notification-preference.entity';
import { resolveChannels } from './notification-defaults';
import { NotificationType } from './notification-types';
import { User } from '../user/entities/user.entity';
import { EmailService } from '../../common/services/email.service';

// Re-export so existing call sites that import NotificationType from
// notification.service keep working without churn.
export { NotificationType } from './notification-types';

export interface NotifyParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: NotificationData;
  severity?: NotificationSeverity;
  /** sha256 dedup key — if a notification with this fingerprint already
   *  exists, the call is a no-op (returns the existing notification). */
  fingerprint?: string;
  /** Optional CTA label for the email channel. */
  ctaLabel?: string;
}

export interface NotifyResult {
  notificationId: string;
  receiptId: string;
  /** True when an existing fingerprint was found and we returned that
   *  instead of creating a new row. */
  deduped: boolean;
  delivered: DeliveredChannels;
}

/**
 * NotificationService — Phase 2
 *
 * Synchronously persists notifications and delivers in-app + email
 * channels in the request path. Push and SMS channels are stubbed
 * to `'skipped:not_implemented'` until the worker phase lands.
 *
 * The signature is unchanged from the Phase-1 stub — existing call
 * sites continue to work without modification, they just stop being
 * silent log lines.
 */
@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification)
    private readonly notificationModel: typeof Notification,
    @InjectModel(NotificationReceipt)
    private readonly receiptModel: typeof NotificationReceipt,
    @InjectModel(NotificationPreference)
    private readonly preferenceModel: typeof NotificationPreference,
    @InjectModel(User)
    private readonly userModel: typeof User,
    private readonly sequelize: Sequelize,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Send a notification to a single user.
   *
   * Persists the alert + receipt in a single transaction, then
   * synchronously fires per-channel delivery. Delivery failures do
   * not roll back the in-app row — the receipt records the failure
   * in `delivered_channels` so it can be retried out-of-band later.
   */
  async notify(params: NotifyParams): Promise<NotifyResult> {
    const result = await this.notifyMany([params.userId], {
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data,
      severity: params.severity,
      fingerprint: params.fingerprint,
      ctaLabel: params.ctaLabel,
    });
    return result.results[0];
  }

  /**
   * Send the same notification to many users (e.g. all session
   * participants). Creates ONE notification row + N receipts, then
   * fans out per-channel delivery in parallel.
   *
   * Note: blocks the request path during delivery in Phase 2. This
   * is deliberate — it makes the latency cost visible and motivates
   * moving to workers next.
   */
  async notifyMany(
    userIds: string[],
    params: Omit<NotifyParams, 'userId'>,
  ): Promise<{
    notificationId: string;
    deduped: boolean;
    results: NotifyResult[];
  }> {
    if (userIds.length === 0) {
      throw new Error('notifyMany called with empty userIds');
    }

    // Dedup the userIds list — a participant array could contain a
    // user twice, and we want at most one receipt per user.
    const uniqueUserIds = Array.from(new Set(userIds));

    const { notification, deduped } = await this.sequelize.transaction(
      async (tx) => {
        const existing = params.fingerprint
          ? await this.notificationModel.findOne({
              where: { fingerprint: params.fingerprint },
              transaction: tx,
            })
          : null;

        if (existing) {
          return { notification: existing, deduped: true };
        }

        // Phase 2 only emits USER-audience notifications. GROUP/
        // PLATFORM are reserved by the schema for the worker phase.
        const audienceType = NotificationAudienceType.USER;
        const audienceId = uniqueUserIds.length === 1 ? uniqueUserIds[0] : null;

        const created = await this.notificationModel.create(
          {
            type: params.type,
            title: params.title,
            body: params.body,
            data: params.data ?? null,
            severity: params.severity ?? NotificationSeverity.INFO,
            audienceType,
            audienceId,
            fingerprint: params.fingerprint ?? null,
          },
          { transaction: tx },
        );

        return { notification: created, deduped: false };
      },
    );

    // Pre-load preferences for everyone in one query.
    const prefRows = await this.preferenceModel.findAll({
      where: {
        userId: { [Op.in]: uniqueUserIds },
        type: params.type,
      },
    });
    const prefByUser = new Map<string, ChannelPreferences>(
      prefRows.map((p) => [p.userId, p.channels]),
    );

    // Pre-load user emails (single query).
    const users = await this.userModel.findAll({
      where: { id: { [Op.in]: uniqueUserIds } },
      attributes: ['id', 'email', 'firstName'],
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const results: NotifyResult[] = [];
    for (const userId of uniqueUserIds) {
      const channels = resolveChannels(
        params.type,
        prefByUser.get(userId) ?? null,
      );
      const user = userById.get(userId);

      const { receipt, delivered } = await this.deliverToUser({
        notification,
        userId,
        userEmail: user?.email ?? null,
        channels,
        ctaLabel: params.ctaLabel,
      });

      results.push({
        notificationId: notification.id,
        receiptId: receipt.id,
        deduped,
        delivered,
      });
    }

    this.logger.log(
      `[NOTIFICATION] ${params.type} → ${uniqueUserIds.length} users (notification=${notification.id})`,
      'NotificationService',
    );

    return { notificationId: notification.id, deduped, results };
  }

  /**
   * Deliver a single notification to a single user across all
   * enabled channels. Receipt is upserted via findOrCreate so a
   * re-run with the same fingerprint just finds the existing receipt.
   */
  private async deliverToUser(input: {
    notification: Notification;
    userId: string;
    userEmail: string | null;
    channels: Required<ChannelPreferences>;
    ctaLabel?: string;
  }): Promise<{ receipt: NotificationReceipt; delivered: DeliveredChannels }> {
    const { notification, userId, userEmail, channels, ctaLabel } = input;

    const [receipt] = await this.receiptModel.findOrCreate({
      where: { notificationId: notification.id, userId },
      defaults: {
        notificationId: notification.id,
        userId,
        deliveredAt: new Date(),
        deliveredChannels: {},
      },
    });

    const delivered: DeliveredChannels = { ...receipt.deliveredChannels };

    // ── in-app ──────────────────────────────────────────────
    // The receipt row IS the in-app delivery. Mark it sent unless
    // the user has explicitly disabled the channel (rare).
    delivered.in_app = channels.in_app
      ? 'sent'
      : ('skipped:preference_off' as DeliveredChannelStatus);

    // ── email ───────────────────────────────────────────────
    if (!channels.email) {
      delivered.email = 'skipped:preference_off';
    } else if (!userEmail) {
      delivered.email = 'skipped:no_email';
    } else {
      const ctaUrl = this.buildCtaUrl(notification.data);
      const status = await this.emailService.sendNotificationEmail({
        to: userEmail,
        title: notification.title,
        body: notification.body,
        ctaUrl,
        ctaLabel: ctaUrl ? (ctaLabel ?? 'Open MotionHive') : undefined,
      });
      delivered.email = status.ok
        ? 'sent'
        : (`failed:${status.reason.slice(0, 200)}` as DeliveredChannelStatus);
    }

    // ── push / sms ──────────────────────────────────────────
    // Phase 2 placeholders. Worker phase wires actual delivery.
    delivered.push = channels.push
      ? 'skipped:not_implemented'
      : 'skipped:preference_off';
    delivered.sms = channels.sms
      ? 'skipped:not_implemented'
      : 'skipped:preference_off';

    receipt.deliveredChannels = delivered;
    await receipt.save();

    return { receipt, delivered };
  }

  /**
   * Build the CTA URL for the email channel from notification.data.
   * Returns undefined when there's nothing to link to.
   */
  private buildCtaUrl(data: NotificationData | null): string | undefined {
    if (!data?.screen) return undefined;
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const segments = [data.screen];
    if (data.entityId) segments.push(data.entityId);
    return `${frontendUrl}/${segments.join('/')}`;
  }
}
