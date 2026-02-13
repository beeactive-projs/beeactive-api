import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { RoleService } from '../role/role.service';
import { User } from '../user/entities/user.entity';
import { ParticipantProfile } from '../profile/entities/participant-profile.entity';

/**
 * Organization Service
 *
 * Manages organizations (fitness studios, gyms, teams).
 *
 * Key flows:
 * - Trainer creates org → becomes owner + gets ORGANIZER role in org context
 * - Members join via invitations (handled by InvitationModule)
 * - Members can share/hide their health data per-organization
 */
@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Organization)
    private organizationModel: typeof Organization,
    @InjectModel(OrganizationMember)
    private memberModel: typeof OrganizationMember,
    @InjectModel(ParticipantProfile)
    private participantProfileModel: typeof ParticipantProfile,
    private roleService: RoleService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Generate URL-friendly slug from organization name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100);
  }

  /**
   * Ensure slug is unique by appending a number if needed
   */
  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (await this.organizationModel.findOne({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  // =====================================================
  // ORGANIZATION CRUD
  // =====================================================

  /**
   * Create a new organization
   *
   * Only users with ORGANIZER role can create organizations.
   * The creator becomes the owner and gets org-scoped ORGANIZER role.
   */
  async create(
    userId: string,
    dto: CreateOrganizationDto,
  ): Promise<Organization> {
    const baseSlug = this.generateSlug(dto.name);
    const slug = await this.ensureUniqueSlug(baseSlug);

    const organization = await this.organizationModel.create({
      name: dto.name,
      slug,
      description: dto.description,
      timezone: dto.timezone || 'Europe/Bucharest',
    });

    // Add creator as owner
    await this.memberModel.create({
      organizationId: organization.id,
      userId: userId,
      isOwner: true,
    });

    // Assign ORGANIZER role scoped to this organization
    await this.roleService.assignRoleToUserByName(
      userId,
      'ORGANIZER',
      organization.id,
    );

    this.logger.log(
      `Organization created: ${organization.name} by user ${userId}`,
      'OrganizationService',
    );

    return organization;
  }

  /**
   * Get all organizations the user belongs to
   */
  async getMyOrganizations(userId: string): Promise<Organization[]> {
    const memberships = await this.memberModel.findAll({
      where: { userId: userId, leftAt: null },
      include: [
        {
          model: Organization,
          where: { is_active: true },
        },
      ],
    });

    return memberships.map((m) => m.organization);
  }

  /**
   * Get organization by ID (only if user is a member)
   */
  async getById(organizationId: string, userId: string): Promise<Organization> {
    const organization = await this.organizationModel.findByPk(organizationId, {
      include: [OrganizationMember],
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check membership
    const isMember = organization.members.some(
      (m) => m.userId === userId && !m.leftAt,
    );

    if (!isMember) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    return organization;
  }

  /**
   * Update organization (owner only)
   */
  async update(
    organizationId: string,
    userId: string,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const organization = await this.organizationModel.findByPk(organizationId);

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check ownership
    await this.assertOwner(organizationId, userId);

    await organization.update(dto);
    return organization;
  }

  // =====================================================
  // MEMBER MANAGEMENT
  // =====================================================

  /**
   * Get all members of an organization
   *
   * Returns basic info for all members.
   * Health data is only included if the member has sharedHealthInfo = true.
   */
  async getMembers(organizationId: string, userId: string) {
    // Verify the requesting user is a member
    await this.assertMember(organizationId, userId);

    const members = await this.memberModel.findAll({
      where: { organizationId: organizationId, leftAt: null },
      include: [
        {
          model: User,
          attributes: [
            'id',
            'email',
            'firstName',
            'lastName',
            'phone',
            'avatarId',
          ],
        },
      ],
    });

    // Check if the requester is the org owner (trainers see more data)
    const requester = members.find((m) => m.userId === userId);
    const isOwner = requester?.isOwner || false;

    const result: any[] = [];

    for (const member of members) {
      const memberData: any = {
        id: member.id,
        userId: member.userId,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
        avatarId: member.user.avatarId,
        isOwner: member.isOwner,
        nickname: member.nickname,
        sharedHealthInfo: member.sharedHealthInfo,
        joinedAt: member.joinedAt,
      };

      // If requester is owner AND member has shared health info → include it
      if (isOwner && member.sharedHealthInfo && member.userId !== userId) {
        const profile = await this.participantProfileModel.findOne({
          where: { userId: member.userId },
        });

        if (profile) {
          memberData.health_data = {
            fitnessLevel: profile.fitnessLevel,
            goals: profile.goals,
            medical_conditions: profile.medicalConditions,
            height_cm: profile.heightCm,
            weight_kg: profile.weightKg,
            notes: profile.notes,
          };
        }
      }

      result.push(memberData);
    }

    return result;
  }

  /**
   * Update own membership settings (sharedHealthInfo, nickname)
   */
  async updateMyMembership(
    organizationId: string,
    userId: string,
    dto: UpdateMemberDto,
  ): Promise<OrganizationMember> {
    const member = await this.memberModel.findOne({
      where: {
        organizationId: organizationId,
        userId: userId,
        leftAt: null,
      },
    });

    if (!member) {
      throw new NotFoundException('You are not a member of this organization');
    }

    await member.update(dto);
    return member;
  }

  /**
   * Remove a member from the organization (owner only)
   */
  async removeMember(
    organizationId: string,
    memberId: string,
    userId: string,
  ): Promise<void> {
    await this.assertOwner(organizationId, userId);

    const member = await this.memberModel.findOne({
      where: {
        organizationId: organizationId,
        userId: memberId,
        leftAt: null,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.isOwner) {
      throw new ForbiddenException('Cannot remove the organization owner');
    }

    await member.update({ leftAt: new Date() });

    this.logger.log(
      `Member ${memberId} removed from org ${organizationId} by ${userId}`,
      'OrganizationService',
    );
  }

  // =====================================================
  // HELPERS
  // =====================================================

  /**
   * Add a user as a member (used by InvitationService)
   */
  async addMember(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember> {
    // Check if already a member
    const existing = await this.memberModel.findOne({
      where: {
        organizationId: organizationId,
        userId: userId,
        leftAt: null,
      },
    });

    if (existing) return existing;

    return this.memberModel.create({
      organizationId: organizationId,
      userId: userId,
      isOwner: false,
    });
  }

  private async assertMember(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember> {
    const member = await this.memberModel.findOne({
      where: {
        organizationId: organizationId,
        userId: userId,
        leftAt: null,
      },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    return member;
  }

  private async assertOwner(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.assertMember(organizationId, userId);

    if (!member.isOwner) {
      throw new ForbiddenException('Only the organization owner can do this');
    }
  }
}
