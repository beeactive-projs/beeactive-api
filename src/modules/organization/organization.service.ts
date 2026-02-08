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
      organization_id: organization.id,
      user_id: userId,
      is_owner: true,
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
      where: { user_id: userId, left_at: null },
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
  async getById(
    organizationId: string,
    userId: string,
  ): Promise<Organization> {
    const organization = await this.organizationModel.findByPk(organizationId, {
      include: [OrganizationMember],
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check membership
    const isMember = organization.members.some(
      (m) => m.user_id === userId && !m.left_at,
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
   * Health data is only included if the member has shared_health_info = true.
   */
  async getMembers(organizationId: string, userId: string) {
    // Verify the requesting user is a member
    await this.assertMember(organizationId, userId);

    const members = await this.memberModel.findAll({
      where: { organization_id: organizationId, left_at: null },
      include: [
        {
          model: User,
          attributes: [
            'id',
            'email',
            'first_name',
            'last_name',
            'phone',
            'avatar_id',
          ],
        },
      ],
    });

    // Check if the requester is the org owner (trainers see more data)
    const requester = members.find((m) => m.user_id === userId);
    const isOwner = requester?.is_owner || false;

    const result: any[] = [];

    for (const member of members) {
      const memberData: any = {
        id: member.id,
        user_id: member.user_id,
        first_name: member.user.first_name,
        last_name: member.user.last_name,
        avatar_id: member.user.avatar_id,
        is_owner: member.is_owner,
        nickname: member.nickname,
        shared_health_info: member.shared_health_info,
        joined_at: member.joined_at,
      };

      // If requester is owner AND member has shared health info → include it
      if (isOwner && member.shared_health_info && member.user_id !== userId) {
        const profile = await this.participantProfileModel.findOne({
          where: { user_id: member.user_id },
        });

        if (profile) {
          memberData.health_data = {
            fitness_level: profile.fitness_level,
            goals: profile.goals,
            medical_conditions: profile.medical_conditions,
            height_cm: profile.height_cm,
            weight_kg: profile.weight_kg,
            notes: profile.notes,
          };
        }
      }

      result.push(memberData);
    }

    return result;
  }

  /**
   * Update own membership settings (shared_health_info, nickname)
   */
  async updateMyMembership(
    organizationId: string,
    userId: string,
    dto: UpdateMemberDto,
  ): Promise<OrganizationMember> {
    const member = await this.memberModel.findOne({
      where: {
        organization_id: organizationId,
        user_id: userId,
        left_at: null,
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
        organization_id: organizationId,
        user_id: memberId,
        left_at: null,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.is_owner) {
      throw new ForbiddenException('Cannot remove the organization owner');
    }

    await member.update({ left_at: new Date() });

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
        organization_id: organizationId,
        user_id: userId,
        left_at: null,
      },
    });

    if (existing) return existing;

    return this.memberModel.create({
      organization_id: organizationId,
      user_id: userId,
      is_owner: false,
    });
  }

  private async assertMember(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember> {
    const member = await this.memberModel.findOne({
      where: {
        organization_id: organizationId,
        user_id: userId,
        left_at: null,
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

    if (!member.is_owner) {
      throw new ForbiddenException('Only the organization owner can do this');
    }
  }
}
