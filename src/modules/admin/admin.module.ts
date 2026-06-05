import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { RoleModule } from '../role/role.module';
import { PaymentModule } from '../payment/payment.module';
// NOTE: JobsService is provided by the @Global() JobsModule (registered
// once in AppModule) — inject it directly; do NOT re-import JobsModule
// here or its workers would double-register.
import { AdminImpersonationLog } from './entities/admin-impersonation-log.entity';
// Models read by the admin services (cross-tenant queries + db browser).
import { User } from '../user/entities/user.entity';
import { Role } from '../role/entities/role.entity';
import { UserRole } from '../role/entities/user-role.entity';
import { InstructorProfile } from '../profile/entities/instructor-profile.entity';
import { Group } from '../group/entities/group.entity';
import { SessionInstance } from '../session/entities/session-instance.entity';
import { InstructorClient } from '../client/entities/instructor-client.entity';
import { StripeAccount } from '../payment/entities/stripe-account.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Subscription } from '../payment/entities/subscription.entity';
import { Dispute } from '../payment/entities/dispute.entity';
import { WebhookEvent } from '../payment/entities/webhook-event.entity';
import { MessageReport } from '../messaging/entities/message-report.entity';
import { Notification } from '../notification/entities/notification.entity';
import { Venue } from '../venue/entities/venue.entity';
import { BlogPost } from '../blog/entities/blog-post.entity';
import { Feedback } from '../feedback/entities/feedback.entity';
import { Waitlist } from '../waitlist/entities/waitlist.entity';
import { Invoice } from '../payment/entities/invoice.entity';
import { Payment } from '../payment/entities/payment.entity';
// Controllers
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminImpersonationController } from './controllers/admin-impersonation.controller';
import { AdminDbController } from './controllers/admin-db.controller';
import { AdminOverviewController } from './controllers/admin-overview.controller';
import { AdminJobsController } from './controllers/admin-jobs.controller';
import { AdminPaymentsController } from './controllers/admin-payments.controller';
// Services
import { AdminUsersService } from './services/admin-users.service';
import { AdminImpersonationService } from './services/admin-impersonation.service';
import { AdminDbService } from './services/admin-db.service';
import { AdminOverviewService } from './services/admin-overview.service';
import { AdminJobsService } from './services/admin-jobs.service';
import { AdminPaymentsService } from './services/admin-payments.service';

/**
 * Admin module — a separate operator surface (consumed by the `admin`
 * Angular app). Purely additive: it only READS existing tables (plus its
 * own append-only impersonation audit log) and reuses RoleService /
 * AuthService. No existing module is modified.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      AdminImpersonationLog,
      User,
      Role,
      UserRole,
      InstructorProfile,
      Group,
      SessionInstance,
      InstructorClient,
      StripeAccount,
      RefreshToken,
      Subscription,
      Dispute,
      WebhookEvent,
      MessageReport,
      Notification,
      Venue,
      BlogPost,
      Feedback,
      Waitlist,
      Invoice,
      Payment,
    ]),
    RoleModule,
    AuthModule,
    PaymentModule,
  ],
  controllers: [
    AdminUsersController,
    AdminImpersonationController,
    AdminDbController,
    AdminOverviewController,
    AdminJobsController,
    AdminPaymentsController,
  ],
  providers: [
    AdminUsersService,
    AdminImpersonationService,
    AdminDbService,
    AdminOverviewService,
    AdminJobsService,
    AdminPaymentsService,
  ],
})
export class AdminModule {}
