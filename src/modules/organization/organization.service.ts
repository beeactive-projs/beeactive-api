import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op } from 'sequelize';
import { Organization, JoinPolicy } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { DiscoverOrganizationsDto } from './dto/discover-organizations.dto';
import { RoleService } from '../role/role.service';
import { User } from '../user/entities/user.entity';
import { ParticipantProfile } from '../profile/entities/participant-profile.entity';
import { Session } from '../session/entities/session.entity';
import { OrganizerProfile } from '../profile/entities/organizer-profile.entity';

/**
 * Organization Service
 *
 * Manages organizations (fitness studios, gyms, teams).
 *
 * Key flows:
 * - Trainer creates org → becomes owner + gets ORGANIZER role in org context
 * - Members join via invitations OR self-join (if joinPolicy = OPEN)
 * - Public orgs appear in discovery search
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
   *
   * Handles Unicode/diacritics properly:
   * - "Sală de Fitness" → "sala-de-fitness"
   * - "Café Résumé" → "cafe-resume"
   */
  private generateSlug(name: string): string {
    return name
      .normalize('NFD') // Decompose diacritics (ă → a + combining mark)
      .replace(/[\u0300-\u036f]/g, '') // Remove combining marks
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove remaining non-alphanumeric
      .replace(/\s+/g, '-') // Spaces to hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, '') // Trim leading/trailing hyphens
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
      type: dto.type || 'OTHER',
      isPublic: dto.isPublic || false,
      joinPolicy: dto.joinPolicy || 'INVITE_ONLY',
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      address: dto.address,
      city: dto.city,
      country: dto.country,
      memberCount: 1, // owner counts as first member
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
          where: { isActive: true },
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
   *
   * If name is changed, slug is automatically regenerated.
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

    // If name changes, regenerate slug
    if (dto.name && dto.name !== organization.name) {
      const baseSlug = this.generateSlug(dto.name);
      const slug = await this.ensureUniqueSlug(baseSlug);
      (dto as any).slug = slug;
    }

    await organization.update(dto);
    return organization;
  }

  /**
   * Delete organization (owner only, soft delete)
   */
  async deleteOrganization(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const organization = await this.organizationModel.findByPk(organizationId);

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    await this.assertOwner(organizationId, userId);

    organization.isActive = false;
    await organization.save();
    await organization.destroy(); // Soft delete (paranoid: true)

    this.logger.log(
      `Organization deleted: ${organization.name} by user ${userId}`,
      'OrganizationService',
    );
  }

  /**
   * Leave an organization voluntarily
   *
   * Owners cannot leave — they must transfer ownership first (future) or delete the org.
   */
  async leaveOrganization(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.memberModel.findOne({
      where: {
        organizationId,
        userId,
        leftAt: null,
      },
    });

    if (!member) {
      throw new NotFoundException('You are not a member of this organization');
    }

    if (member.isOwner) {
      throw new ForbiddenException(
        'Organization owner cannot leave. Transfer ownership first or delete the organization.',
      );
    }

    await member.update({ leftAt: new Date() });

    this.logger.log(
      `User ${userId} left organization ${organizationId}`,
      'OrganizationService',
    );
  }

  // =====================================================
  // MEMBER MANAGEMENT
  // =====================================================

  /**
   * Get all members of an organization
   *
   * Returns basic info for all members.
   * Health data is only included if the member has sharedHealthInfo = true.
   *
   * FIX: Pre-fetches all health profiles in a single query (no N+1).
   */
  async getMembers(
    organizationId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    // Verify the requesting user is a member
    await this.assertMember(organizationId, userId);

    const offset = (page - 1) * limit;

    const { rows: members, count: totalItems } =
      await this.memberModel.findAndCountAll({
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
        limit,
        offset,
        order: [['joinedAt', 'ASC']],
      });

    // Check if the requester is the org owner (trainers see more data)
    const requester = members.find((m) => m.userId === userId);
    const isOwner = requester?.isOwner || false;

    // Pre-fetch all health profiles in ONE query (fixes N+1 problem)
    let profileMap = new Map<string, ParticipantProfile>();
    if (isOwner) {
      const memberIdsWithHealthShared = members
        .filter((m) => m.sharedHealthInfo && m.userId !== userId)
        .map((m) => m.userId);

      if (memberIdsWithHealthShared.length > 0) {
        const profiles = await this.participantProfileModel.findAll({
          where: { userId: memberIdsWithHealthShared },
        });
        profileMap = new Map(profiles.map((p) => [p.userId, p]));
      }
    }

    const data = members.map((member) => {
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
        const profile = profileMap.get(member.userId);
        if (profile) {
          memberData.healthData = {
            fitnessLevel: profile.fitnessLevel,
            goals: profile.goals,
            medicalConditions: profile.medicalConditions,
            heightCm: profile.heightCm,
            weightKg: profile.weightKg,
            notes: profile.notes,
          };
        }
      }

      return memberData;
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
  // DISCOVERY (PUBLIC — no membership required)
  // =====================================================

  /**
   * Discover public organizations
   *
   * Returns paginated list of public, active organizations.
   * Supports filtering by type, city, country, and free-text search.
   * Sorted by member count (most popular first).
   *
   * No authentication required for this endpoint.
   */
  async discoverOrganizations(dto: DiscoverOrganizationsDto) {
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const offset = (page - 1) * limit;

    const where: any = {
      isPublic: true,
      isActive: true,
    };

    if (dto.type) {
      where.type = dto.type;
    }

    if (dto.city) {
      where.city = { [Op.like]: `%${dto.city}%` };
    }

    if (dto.country) {
      where.country = dto.country;
    }

    if (dto.search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${dto.search}%` } },
        { description: { [Op.like]: `%${dto.search}%` } },
      ];
    }

    const { rows: data, count: totalItems } =
      await this.organizationModel.findAndCountAll({
        where,
        attributes: [
          'id',
          'name',
          'slug',
          'description',
          'logoUrl',
          'type',
          'joinPolicy',
          'city',
          'country',
          'memberCount',
          'createdAt',
        ],
        order: [['memberCount', 'DESC']],
        limit,
        offset,
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
   * Get public profile of an organization
   *
   * Returns organization details, owner/trainer info, and upcoming public sessions.
   * Visible to anyone — no membership required.
   */
  async getPublicProfile(organizationId: string) {
    const organization = await this.organizationModel.findOne({
      where: {
        id: organizationId,
        isPublic: true,
        isActive: true,
      },
      attributes: [
        'id',
        'name',
        'slug',
        'description',
        'logoUrl',
        'type',
        'joinPolicy',
        'contactEmail',
        'contactPhone',
        'address',
        'city',
        'country',
        'timezone',
        'memberCount',
        'createdAt',
      ],
    });

    if (!organization) {
      throw new NotFoundException('Organization not found or is not public');
    }

    // Get the owner (trainer)
    const ownerMembership = await this.memberModel.findOne({
      where: { organizationId, isOwner: true, leftAt: null },
      include: [
        {
          model: User,
          attributes: ['id', 'firstName', 'lastName', 'avatarId'],
        },
      ],
    });

    // Get trainer's organizer profile (if public)
    let trainerProfile: any = null;
    if (ownerMembership) {
      const orgProfile = await OrganizerProfile.findOne({
        where: { userId: ownerMembership.userId, isPublic: true },
        attributes: [
          'displayName',
          'bio',
          'specializations',
          'yearsOfExperience',
          'isAcceptingClients',
          'locationCity',
          'locationCountry',
          'socialLinks',
          'showSocialLinks',
          'showEmail',
          'showPhone',
        ],
      });

      if (orgProfile) {
        trainerProfile = {
          userId: ownerMembership.userId,
          firstName: ownerMembership.user.firstName,
          lastName: ownerMembership.user.lastName,
          avatarId: ownerMembership.user.avatarId,
          displayName: orgProfile.displayName,
          bio: orgProfile.bio,
          specializations: orgProfile.specializations,
          yearsOfExperience: orgProfile.yearsOfExperience,
          isAcceptingClients: orgProfile.isAcceptingClients,
          socialLinks: orgProfile.showSocialLinks
            ? orgProfile.socialLinks
            : null,
        };
      } else {
        trainerProfile = {
          userId: ownerMembership.userId,
          firstName: ownerMembership.user.firstName,
          lastName: ownerMembership.user.lastName,
          avatarId: ownerMembership.user.avatarId,
        };
      }
    }

    // Get upcoming public/member sessions
    const upcomingSessions = await Session.findAll({
      where: {
        organizationId,
        visibility: { [Op.in]: ['PUBLIC', 'MEMBERS'] },
        status: { [Op.in]: ['SCHEDULED', 'IN_PROGRESS'] },
        scheduledAt: { [Op.gte]: new Date() },
      },
      attributes: [
        'id',
        'title',
        'description',
        'sessionType',
        'visibility',
        'scheduledAt',
        'durationMinutes',
        'location',
        'maxParticipants',
        'price',
        'currency',
        'status',
      ],
      order: [['scheduledAt', 'ASC']],
      limit: 10,
    });

    return {
      organization,
      trainer: trainerProfile,
      upcomingSessions,
    };
  }

  /**
   * Self-join a public organization
   *
   * Only works if:
   * - Organization is public
   * - Join policy is OPEN
   * - User is not already a member
   */
  async selfJoinOrganization(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember> {
    const organization = await this.organizationModel.findByPk(organizationId);

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (!organization.isPublic) {
      throw new ForbiddenException(
        'This organization is not public. You need an invitation to join.',
      );
    }

    if (organization.joinPolicy !== JoinPolicy.OPEN) {
      throw new ForbiddenException(
        `This organization requires ${organization.joinPolicy === JoinPolicy.INVITE_ONLY ? 'an invitation' : 'approval from the owner'} to join.`,
      );
    }

    // Check if already a member
    const existing = await this.memberModel.findOne({
      where: { organizationId, userId, leftAt: null },
    });

    if (existing) {
      throw new BadRequestException(
        'You are already a member of this organization',
      );
    }

    const member = await this.memberModel.create({
      organizationId,
      userId,
      isOwner: false,
    });

    // Update denormalized member count
    await this.organizationModel.increment('memberCount', {
      where: { id: organizationId },
    });

    this.logger.log(
      `User ${userId} self-joined organization ${organization.name}`,
      'OrganizationService',
    );

    return member;
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

    const member = await this.memberModel.create({
      organizationId: organizationId,
      userId: userId,
      isOwner: false,
    });

    // Update denormalized member count
    await this.organizationModel.increment('memberCount', {
      where: { id: organizationId },
    });

    return member;
  }

  /**
   * Assert user is the owner and return the organization
   *
   * Used by InvitationService to verify only owners can send invitations.
   *
   * @throws ForbiddenException if user is not a member or not the owner
   * @throws NotFoundException if organization not found
   */
  async assertOwnerAndGet(
    organizationId: string,
    userId: string,
  ): Promise<Organization> {
    const organization = await this.organizationModel.findByPk(organizationId);
    if (!organization) throw new NotFoundException('Organization not found');
    await this.assertOwner(organizationId, userId);
    return organization;
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
