import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Session } from './entities/session.entity';
import { SessionParticipant } from './entities/session-participant.entity';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { RoleModule } from '../role/role.module';
import { OrganizationMember } from '../organization/entities/organization-member.entity';

/**
 * Session Module
 *
 * Manages training sessions and participant registrations.
 * Depends on OrganizationMember entity for visibility checks.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      Session,
      SessionParticipant,
      OrganizationMember,
    ]),
    RoleModule,
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
