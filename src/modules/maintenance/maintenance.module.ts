import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../user/entities/user.entity';
import { Invitation } from '../invitation/entities/invitation.entity';
import { ClientRequest } from '../client/entities/client-request.entity';
import { MaintenanceService } from './maintenance.service';

/**
 * MaintenanceModule — owns the bulk housekeeping sweeps run by the
 * `maintenance` queue (expired refresh tokens, lockout expiry, stale
 * invitations / client requests). `forFeature` pulls in the four models
 * as model providers only; no service dependency on the owning modules,
 * so there's no import cycle. Exported for the jobs MaintenanceWorker.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([RefreshToken, User, Invitation, ClientRequest]),
  ],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
