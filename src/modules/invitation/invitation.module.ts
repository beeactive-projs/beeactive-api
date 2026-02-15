import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Invitation } from './entities/invitation.entity';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { GroupModule } from '../group/group.module';
import { GroupMember } from '../group/entities/group-member.entity';
import { RoleModule } from '../role/role.module';
import { CryptoService, EmailService } from '../../common/services';

/**
 * Invitation Module
 *
 * Manages invitations to join groups.
 * Depends on GroupModule for adding members and RoleModule for role assignment.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([Invitation, GroupMember]),
    GroupModule,
    RoleModule,
  ],
  controllers: [InvitationController],
  providers: [InvitationService, CryptoService, EmailService],
  exports: [InvitationService],
})
export class InvitationModule {}
