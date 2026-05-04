import { Module, Global } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { NotificationService } from './notification.service';
import { NotificationReceiptService } from './services/notification-receipt.service';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { DeviceTokenService } from './services/device-token.service';
import { NotificationController } from './notification.controller';
import { NotificationSettingsController } from './notification-settings.controller';
import { DeviceController } from './device.controller';
import { NotificationDebugController } from './debug.controller';
import { Notification } from './entities/notification.entity';
import { NotificationReceipt } from './entities/notification-receipt.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { DeviceToken } from './entities/device-token.entity';
import { User } from '../user/entities/user.entity';
import { RoleModule } from '../role/role.module';
import { EmailService } from '../../common/services/email.service';

/**
 * Notification Module — Phase 2
 *
 * Global so any service can inject NotificationService without
 * importing NotificationModule explicitly.
 *
 * Exposes 4 services:
 *   - NotificationService            — producer-facing (notify/notifyMany)
 *   - NotificationReceiptService     — FE-facing reads + mark-read/dismiss
 *   - NotificationPreferenceService  — settings page reads/writes
 *   - DeviceTokenService             — push registration storage
 *
 * REST controllers ship in Phase 3. EmailService is provided locally
 * because it isn't exported from a shared module elsewhere — every
 * consumer module declares it the same way.
 */
@Global()
@Module({
  imports: [
    SequelizeModule.forFeature([
      Notification,
      NotificationReceipt,
      NotificationPreference,
      DeviceToken,
      User,
    ]),
    // RoleModule provides RoleService — required by RolesGuard which
    // protects the SUPER_ADMIN-only debug controller.
    RoleModule,
  ],
  controllers: [
    NotificationController,
    NotificationSettingsController,
    DeviceController,
    NotificationDebugController,
  ],
  providers: [
    NotificationService,
    NotificationReceiptService,
    NotificationPreferenceService,
    DeviceTokenService,
    EmailService,
  ],
  exports: [
    NotificationService,
    NotificationReceiptService,
    NotificationPreferenceService,
    DeviceTokenService,
    SequelizeModule,
  ],
})
export class NotificationModule {}
