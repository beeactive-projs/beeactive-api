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
import { CryptoService, EmailService } from '../../common/services';
import { User } from '../user/entities/user.entity';
import { Organization } from '../organization/entities/organization.entity';
import { Role } from '../role/entities/role.entity';
import { OrganizationMember } from '../organization/entities/organization-member.entity';

/**
 * Invitation Service
 *
 * Manages invitations to join organizations.
 *
 * Flow:
 * 1. Trainer sends invitation → token generated (hashed) + email sent via Resend
 * 2. Invitee clicks link → token validated
 * 3. If valid + email matches → invitee added as org member + role assigned
 */
@Injectable()
export class InvitationService {
  constructor(
    @InjectModel(Invitation)
    private invitationModel: typeof Invitation,
    @InjectModel(OrganizationMember)
    private memberModel: typeof OrganizationMember,
    private organizationService: OrganizationService,
    private roleService: RoleService,
    private cryptoService: CryptoService,
    private emailService: EmailService,
    private configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Send an invitation
   *
   * Generates a hashed token, stores the hash in DB, sends the plain token via email.
   */
  async create(
    inviterId: string,
    dto: CreateInvitationDto,
  ): Promise<{ invitation: Invitation; invitationLink?: string }> {
    // Verify inviter is the OWNER of the organization
    const org = await this.organizationService.assertOwnerAndGet(
      dto.organizationId,
      inviterId,
    );

    // Check if the invited email is already a member
    const existingMember = await this.memberModel.findOne({
      where: {
        organizationId: dto.organizationId,
        leftAt: null,
      },
      include: [
        {
          model: User,
          where: { email: dto.email },
          attributes: ['id', 'email'],
        },
      ],
    });

    if (existingMember) {
      throw new BadRequestException(
        'This user is already a member of the organization',
      );
    }

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

    // Generate token — hash it for storage, keep plain for the link
    const plainToken = this.cryptoService.generateToken();
    const hashedToken = this.cryptoService.hashToken(plainToken);

    // Create invitation (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Get inviter name for email
    const inviter = await User.findByPk(inviterId, {
      attributes: ['firstName', 'lastName'],
    });
    const inviterName = inviter
      ? `${inviter.firstName} ${inviter.lastName}`
      : 'Organization Owner';

    const invitation = await this.invitationModel.create({
      inviterId: inviterId,
      email: dto.email,
      roleId: role.id,
      organizationId: dto.organizationId,
      token: hashedToken, // Store HASHED token
      message: dto.message,
      expiresAt: expiresAt,
    });

    // Build invitation link with PLAIN token
    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:4200';
    const invitationLink = `${frontendUrl}/accept-invitation?token=${plainToken}`;

    // Send invitation email via Resend
    this.emailService.sendInvitationEmail(dto.email, plainToken, inviterName, org.name, dto.message).catch((err: Error) =>
      this.logger.error(`Failed to send invitation email: ${err.message}`, 'InvitationService'),
    );

    this.logger.log(`Invitation sent to ${dto.email} for org ${org.name}`, 'InvitationService');

    // In dev, return the plain token link for testing
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    return {
      invitation,
      ...(isProduction ? {} : { invitationLink }),
    };
  }

  /**
   * Accept an invitation
   *
   * Validates the token (by hashing and comparing), checks email match,
   * adds user to organization, assigns role.
   */
  async accept(
    plainToken: string,
    userId: string,
    userEmail: string,
  ): Promise<{ message: string; organizationId: string }> {
    const hashedToken = this.cryptoService.hashToken(plainToken);

    const invitation = await this.invitationModel.findOne({
      where: { token: hashedToken },
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

    // Verify the accepting user's email matches the invitation email
    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }

    // Add user to organization
    await this.organizationService.addMember(invitation.organizationId, userId);

    // Assign role (org-scoped)
    await this.roleService.assignRoleToUser(userId, invitation.roleId, invitation.organizationId);

    // Mark as accepted
    await invitation.update({ acceptedAt: new Date() });

    this.logger.log(
      `Invitation accepted: user ${userId} joined org ${invitation.organizationId}`,
      'InvitationService',
    );

    // Notify the inviter that the invitation was accepted
    // TODO: [JOB SYSTEM] Move to background job when Redis/Bull is configured
    // TODO: Create a dedicated "invitation accepted" email template
    const inviterUser = await User.findByPk(invitation.inviterId, { attributes: ['email', 'firstName'] });
    if (inviterUser) {
      this.emailService.sendWelcomeEmail(inviterUser.email, inviterUser.firstName).catch(() => {});
    }

    return {
      message: 'Invitation accepted successfully',
      organizationId: invitation.organizationId,
    };
  }

  /**
   * Decline an invitation
   */
  async decline(plainToken: string): Promise<{ message: string }> {
    const hashedToken = this.cryptoService.hashToken(plainToken);

    const invitation = await this.invitationModel.findOne({
      where: { token: hashedToken },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.acceptedAt || invitation.declinedAt) {
      throw new BadRequestException('Invitation has already been responded to');
    }

    await invitation.update({ declinedAt: new Date() });

    return { message: 'Invitation declined' };
  }

  /**
   * Cancel an invitation (org owner)
   */
  async cancel(
    invitationId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const invitation = await this.invitationModel.findByPk(invitationId);

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Verify the user is the org owner
    await this.organizationService.assertOwnerAndGet(
      invitation.organizationId,
      userId,
    );

    if (invitation.acceptedAt) {
      throw new BadRequestException(
        'Cannot cancel an already accepted invitation',
      );
    }

    // Mark as declined (cancelled by owner)
    await invitation.update({ declinedAt: new Date() });

    this.logger.log(
      `Invitation ${invitationId} cancelled by owner ${userId}`,
      'InvitationService',
    );

    return { message: 'Invitation cancelled' };
  }

  /**
   * Resend an invitation email (org owner)
   *
   * Generates a new token and sends a new email. Old token is invalidated.
   */
  async resend(
    invitationId: string,
    userId: string,
  ): Promise<{ message: string; invitationLink?: string }> {
    const invitation = await this.invitationModel.findByPk(invitationId, {
      include: [Organization],
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Verify the user is the org owner
    await this.organizationService.assertOwnerAndGet(
      invitation.organizationId,
      userId,
    );

    if (invitation.acceptedAt) {
      throw new BadRequestException(
        'Cannot resend an already accepted invitation',
      );
    }

    // Generate new token
    const plainToken = this.cryptoService.generateToken();
    const hashedToken = this.cryptoService.hashToken(plainToken);

    // Extend expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update invitation with new token and expiry
    await invitation.update({
      token: hashedToken,
      expiresAt,
      declinedAt: null, // Clear declined status if it was declined
    });

    // Get inviter name
    const inviter = await User.findByPk(invitation.inviterId, {
      attributes: ['firstName', 'lastName'],
    });
    const inviterName = inviter
      ? `${inviter.firstName} ${inviter.lastName}`
      : 'Organization Owner';

    // Send email
    this.emailService.sendInvitationEmail(invitation.email, plainToken, inviterName, invitation.organization.name, invitation.message).catch((err: Error) =>
      this.logger.error(`Failed to resend invitation email: ${err.message}`, 'InvitationService'),
    );

    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:4200';
    const invitationLink = `${frontendUrl}/accept-invitation?token=${plainToken}`;
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    this.logger.log(`Invitation ${invitationId} resent to ${invitation.email}`, 'InvitationService');

    return {
      message: 'Invitation resent',
      ...(isProduction ? {} : { invitationLink }),
    };
  }

  /**
   * List pending invitations for the authenticated user's email
   */
  async getMyPendingInvitations(
    userEmail: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const offset = (page - 1) * limit;

    const { rows: data, count: totalItems } =
      await this.invitationModel.findAndCountAll({
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
        limit,
        offset,
        distinct: true,
      });

    const totalPages = Math.ceil(totalItems / limit);
    return {
      data,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * List invitations sent by the org owner
   */
  async getOrganizationInvitations(
    organizationId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    // Verify user has access to this org
    await this.organizationService.getById(organizationId, userId);

    const offset = (page - 1) * limit;

    const { rows: data, count: totalItems } =
      await this.invitationModel.findAndCountAll({
        where: { organizationId: organizationId },
        include: [
          {
            model: Role,
            attributes: ['id', 'name', 'displayName'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
        distinct: true,
      });

    const totalPages = Math.ceil(totalItems / limit);
    return {
      data,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}
