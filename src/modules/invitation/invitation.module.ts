import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Invitation } from './entities/invitation.entity';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { OrganizationModule } from '../organization/organization.module';
import { RoleModule } from '../role/role.module';
import { CryptoService } from '../../common/services';

/**
 * Invitation Module
 *
 * Manages invitations to join organizations.
 * Depends on OrganizationModule for adding members and RoleModule for role assignment.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([Invitation]),
    OrganizationModule,
    RoleModule,
  ],
  controllers: [InvitationController],
  providers: [InvitationService, CryptoService],
  exports: [InvitationService],
})
export class InvitationModule {}
