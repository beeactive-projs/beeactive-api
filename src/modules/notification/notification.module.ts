import { Module, Global } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { NotificationService } from './notification.service';
import { Notification } from './entities/notification.entity';
import { NotificationReceipt } from './entities/notification-receipt.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { DeviceToken } from './entities/device-token.entity';

/**
 * Notification Module
 *
 * Global so any service can inject NotificationService without
 * importing NotificationModule explicitly. Entities are registered
 * here; the service rewrite + REST controllers land in the next
 * phase of the notifications-foundation plan.
 *
 * See ~/.claude/plans/notifications-foundation.md for the phased
 * rollout and docs/research/jobs-system/notification-tables.html
 * for the schema design.
 */
@Global()
@Module({
  imports: [
    SequelizeModule.forFeature([
      Notification,
      NotificationReceipt,
      NotificationPreference,
      DeviceToken,
    ]),
  ],
  providers: [NotificationService],
  exports: [NotificationService, SequelizeModule],
})
export class NotificationModule {}
