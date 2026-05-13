import type { LoggerService } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op } from 'sequelize';
import { Message } from './entities/message.entity';
import { MessagingVelocityAlarm } from './entities/messaging-velocity-alarm.entity';

/**
 * Fires *informational* velocity alarms when a user sends an unusual
 * volume of messages in a short window. Does NOT auto-block — that
 * decision belongs to a human admin. A row in messaging_velocity_alarm
 * surfaces in the admin moderation UI for review.
 *
 * Threshold + window default to the values in the plan §5:
 *   100 sends / 60 minutes
 *
 * The decision is idempotent: if there's already an unreviewed alarm
 * for this user within the past hour, we don't write a second one. So
 * a user who sends 200 messages in an hour gets exactly one row.
 */
@Injectable()
export class MessagingVelocityService {
  static readonly DEFAULT_THRESHOLD = 100;
  static readonly DEFAULT_WINDOW_MS = 60 * 60 * 1000;

  constructor(
    @InjectModel(MessagingVelocityAlarm)
    private readonly alarmModel: typeof MessagingVelocityAlarm,
    @InjectModel(Message)
    private readonly messageModel: typeof Message,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Called after a successful send. Counts the user's recent activity
   * from the `message` table; if over threshold AND no unreviewed
   * alarm in the window, writes a fresh alarm row. Errors here NEVER
   * propagate — a flaky alarm write should not fail user-facing
   * delivery.
   *
   * Why the table and not the rate-limit bucket: the per-user rate
   * limit is 30/min, so its in-memory bucket can never exceed 30
   * within any 60-second window. Counting it against a 100/60min
   * threshold makes the condition unreachable. We query the message
   * table directly — one indexed COUNT per send is cheap and
   * survives API restarts (in-memory state does not).
   */
  async recordSendAndMaybeAlarm(
    userId: string,
    opts: { threshold?: number; windowMs?: number } = {},
  ): Promise<void> {
    const threshold =
      opts.threshold ?? MessagingVelocityService.DEFAULT_THRESHOLD;
    const windowMs =
      opts.windowMs ?? MessagingVelocityService.DEFAULT_WINDOW_MS;

    try {
      const windowStartCount = new Date(Date.now() - windowMs);
      const count = await this.messageModel.count({
        where: {
          senderId: userId,
          createdAt: { [Op.gt]: windowStartCount },
        },
      });
      if (count < threshold) return;

      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMs);

      const existing = await this.alarmModel.findOne({
        where: {
          userId,
          createdAt: { [Op.gt]: windowStart },
          reviewedAt: null,
        },
        attributes: ['id'],
      });
      if (existing) return;

      await this.alarmModel.create({
        userId,
        windowStart,
        windowEnd: now,
        messageCount: count,
        threshold,
      });

      this.logger.warn?.(
        `Velocity alarm: user=${userId} count=${count} threshold=${threshold} window=${windowMs}ms`,
        'MessagingVelocityService',
      );
    } catch (err) {
      // Belt-and-braces: don't let alarm bookkeeping break a send.
      this.logger.error?.(
        `Velocity alarm write failed for ${userId}: ${(err as Error).message}`,
        (err as Error).stack,
        'MessagingVelocityService',
      );
    }
  }
}
