import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op } from 'sequelize';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../user/entities/user.entity';
import { Invitation } from '../invitation/entities/invitation.entity';
import {
  ClientRequest,
  ClientRequestStatus,
} from '../client/entities/client-request.entity';

/**
 * Bulk housekeeping sweeps for the `maintenance` queue. All four are
 * single-table bulk writes — silent (no notifications), idempotent
 * (the WHERE clause excludes already-handled rows), and cheap. They
 * intentionally bypass the per-row service paths (which send emails /
 * notifications) so a nightly sweep doesn't spam users.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    @InjectModel(RefreshToken)
    private readonly refreshTokenModel: typeof RefreshToken,
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(Invitation)
    private readonly invitationModel: typeof Invitation,
    @InjectModel(ClientRequest)
    private readonly clientRequestModel: typeof ClientRequest,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /** Delete refresh tokens whose expiry has passed (revoked or not). */
  async purgeExpiredRefreshTokens(now: Date): Promise<{ deleted: number }> {
    const deleted = await this.refreshTokenModel.destroy({
      where: { expiresAt: { [Op.lt]: now } },
    });
    this.log('refresh tokens purged', deleted);
    return { deleted };
  }

  /** Clear lockouts whose window has elapsed (reset attempts + lock). */
  async clearExpiredLockouts(now: Date): Promise<{ cleared: number }> {
    const [cleared] = await this.userModel.update(
      { failedLoginAttempts: 0, lockedUntil: null },
      { where: { lockedUntil: { [Op.lt]: now } } },
    );
    this.log('lockouts cleared', cleared);
    return { cleared };
  }

  /** Mark still-pending invitations past their expiry as declined. */
  async expireStaleInvitations(now: Date): Promise<{ expired: number }> {
    const [expired] = await this.invitationModel.update(
      { declinedAt: now },
      {
        where: {
          expiresAt: { [Op.lt]: now },
          acceptedAt: null as unknown as Date,
          declinedAt: null as unknown as Date,
        },
      },
    );
    this.log('invitations expired', expired);
    return { expired };
  }

  /** Move PENDING client requests past their 30-day window to DECLINED. */
  async expireStaleClientRequests(now: Date): Promise<{ expired: number }> {
    const [expired] = await this.clientRequestModel.update(
      { status: ClientRequestStatus.DECLINED, respondedAt: now },
      {
        where: {
          status: ClientRequestStatus.PENDING,
          expiresAt: { [Op.lt]: now },
        },
      },
    );
    // NOTE: the per-row declineRequest() also tidies up dangling pending
    // instructor_client rows; the bulk sweep deliberately skips that to
    // stay simple + email-free. Those rows are harmless once the request
    // is DECLINED and are filtered out of active-relationship reads.
    this.log('client requests expired', expired);
    return { expired };
  }

  private log(what: string, count: number): void {
    if (count > 0) {
      this.logger.log?.(`Maintenance: ${count} ${what}`, 'MaintenanceService');
    }
  }
}
