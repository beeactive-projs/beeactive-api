import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Invitation } from './entities/invitation.entity';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { OrganizationService } from '../organization/organization.service';
import { RoleService } from '../role/role.service';
import { CryptoService } from '../../common/services';
import { User } from '../user/entities/user.entity';
import { Organization } from '../organization/entities/organization.entity';
import { Role } from '../role/entities/role.entity';

/**
 * Invitation Service
 *
 * Manages invitations to join organizations.
 *
 * Flow:
 * 1. Trainer sends invitation → token generated + link returned
 * 2. Invitee clicks link → token validated
 * 3. If valid → invitee added as org member + role assigned
 *
 * NOTE: Emails are NOT sent — the invitation link is returned
 * in the API response for testing. In production, integrate
 * an email provider (Resend, SendGrid) here.
 */
@Injectable()
export class InvitationService {
  constructor(
    @InjectModel(Invitation)
    private invitationModel: typeof Invitation,
    private organizationService: OrganizationService,
    private roleService: RoleService,
    private cryptoService: CryptoService,
    private configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Send an invitation
   *
   * Returns the invitation link for testing purposes.
   * In production, this would send an email instead.
   */
  async create(
    inviterId: string,
    dto: CreateInvitationDto,
  ): Promise<{ invitation: Invitation; invitationLink: string }> {
    // Verify inviter is owner of the organization
    const org = await this.organizationService.getById(
      dto.organizationId,
      inviterId,
    );

    // Find the role to assign
    const roleName = dto.roleName || 'PARTICIPANT';
    const role = await this.roleService.findByName(roleName);

    // Check for existing pending invitation
    const existing = await this.invitationModel.findOne({
      where: {
        email: dto.email,
        organizationId: dto.organizationId,
        acceptedAt: null,
        declinedAt: null,
      },
    });

    if (existing && existing.expiresAt > new Date()) {
      throw new BadRequestException(
        'An active invitation already exists for this email',
      );
    }

    // Generate unique token
    const token = this.cryptoService.generateToken();

    // Create invitation (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await this.invitationModel.create({
      inviterId: inviterId,
      email: dto.email,
      roleId: role.id,
      organizationId: dto.organizationId,
      token,
      message: dto.message,
      expiresAt: expiresAt,
    });

    // Build invitation link
    // NOTE: In production, use FRONTEND_URL instead of API URL
    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:4200';
    const invitationLink = `${frontendUrl}/accept-invitation?token=${token}`;

    // TODO: Send email with invitation link
    // await this.emailService.sendInvitation(dto.email, invitationLink, inviter, org);
    this.logger.log(
      `Invitation sent to ${dto.email} for org ${org.name}. Link: ${invitationLink}`,
      'InvitationService',
    );

    return {
      invitation,
      invitationLink,
    };
  }

  /**
   * Accept an invitation
   *
   * Validates the token, adds user to organization, assigns role.
   */
  async accept(
    token: string,
    userId: string,
  ): Promise<{ message: string; organizationId: string }> {
    const invitation = await this.invitationModel.findOne({
      where: { token },
      include: [Organization, Role],
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('Invitation has already been accepted');
    }

    if (invitation.declinedAt) {
      throw new BadRequestException('Invitation has been declined');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    // Add user to organization
    await this.organizationService.addMember(
      invitation.organizationId,
      userId,
    );

    // Assign role (org-scoped)
    await this.roleService.assignRoleToUser(
      userId,
      invitation.roleId,
      invitation.organizationId,
    );

    // Mark as accepted
    await invitation.update({ acceptedAt: new Date() });

    this.logger.log(
      `Invitation accepted: user ${userId} joined org ${invitation.organizationId}`,
      'InvitationService',
    );

    return {
      message: 'Invitation accepted successfully',
      organizationId: invitation.organizationId,
    };
  }

  /**
   * Decline an invitation
   */
  async decline(token: string): Promise<{ message: string }> {
    const invitation = await this.invitationModel.findOne({
      where: { token },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.acceptedAt || invitation.declinedAt) {
      throw new BadRequestException(
        'Invitation has already been responded to',
      );
    }

    await invitation.update({ declinedAt: new Date() });

    return { message: 'Invitation declined' };
  }

  /**
   * List pending invitations for the authenticated user's email
   */
  async getMyPendingInvitations(userEmail: string): Promise<Invitation[]> {
    return this.invitationModel.findAll({
      where: {
        email: userEmail,
        acceptedAt: null,
        declinedAt: null,
      },
      include: [
        {
          model: User,
          as: 'inviter',
          attributes: ['id', 'firstName', 'lastName', 'avatarId'],
        },
        {
          model: Organization,
          attributes: ['id', 'name', 'slug'],
        },
        {
          model: Role,
          attributes: ['id', 'name', 'displayName'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * List invitations sent by the org owner
   */
  async getOrganizationInvitations(
    organizationId: string,
    userId: string,
  ): Promise<Invitation[]> {
    // Verify user has access to this org
    await this.organizationService.getById(organizationId, userId);

    return this.invitationModel.findAll({
      where: { organizationId: organizationId },
      include: [
        {
          model: Role,
          attributes: ['id', 'name', 'displayName'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }
}
