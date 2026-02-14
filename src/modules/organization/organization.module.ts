import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { RoleModule } from '../role/role.module';
import { ParticipantProfile } from '../profile/entities/participant-profile.entity';
import { Session } from '../session/entities/session.entity';
import { OrganizerProfile } from '../profile/entities/organizer-profile.entity';

/**
 * Organization Module
 *
 * Manages organizations, memberships, discovery, and health data sharing consent.
 * Depends on RoleModule for assigning org-scoped ORGANIZER roles.
 *
 * Exports OrganizationService so InvitationModule can add members.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      Organization,
      OrganizationMember,
      ParticipantProfile,
      Session,
      OrganizerProfile,
    ]),
    RoleModule,
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
