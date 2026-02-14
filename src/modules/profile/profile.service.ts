import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ParticipantProfile } from './entities/participant-profile.entity';
import { OrganizerProfile } from './entities/organizer-profile.entity';
import { UpdateParticipantProfileDto } from './dto/update-participant-profile.dto';
import { CreateOrganizerProfileDto } from './dto/create-organizer-profile.dto';
import { UpdateOrganizerProfileDto } from './dto/update-organizer-profile.dto';
import { UpdateFullProfileDto } from './dto/update-full-profile.dto';
import { DiscoverTrainersDto } from './dto/discover-trainers.dto';
import { RoleService } from '../role/role.service';
import { UserService } from '../user/user.service';
import { User } from '../user/entities/user.entity';

/**
 * Profile Service
 *
 * Manages participant and organizer profiles.
 *
 * Key concepts:
 * - Participant profile is created automatically at registration
 * - Organizer profile is created when user activates "organize activities"
 * - A user can have BOTH profiles (trainer who also joins other classes)
 */
@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(ParticipantProfile)
    private participantProfileModel: typeof ParticipantProfile,
    @InjectModel(OrganizerProfile)
    private organizerProfileModel: typeof OrganizerProfile,
    private roleService: RoleService,
    private userService: UserService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // =====================================================
  // PARTICIPANT PROFILE
  // =====================================================

  /**
   * Create empty participant profile (called during registration)
   */
  async createParticipantProfile(
    userId: string,
    transaction?: Transaction,
  ): Promise<ParticipantProfile> {
    return this.participantProfileModel.create(
      { userId: userId },
      { transaction },
    );
  }

  /**
   * Get participant profile for the authenticated user
   */
  async getParticipantProfile(
    userId: string,
  ): Promise<ParticipantProfile | null> {
    return this.participantProfileModel.findOne({
      where: { userId: userId },
    });
  }

  /**
   * Update participant profile
   *
   * All fields are optional — user fills them progressively.
   */
  async updateParticipantProfile(
    userId: string,
    dto: UpdateParticipantProfileDto,
  ): Promise<ParticipantProfile> {
    const profile = await this.participantProfileModel.findOne({
      where: { userId: userId },
    });

    if (!profile) {
      throw new NotFoundException('Participant profile not found');
    }

    await profile.update(dto);
    return profile;
  }

  // =====================================================
  // ORGANIZER PROFILE
  // =====================================================

  /**
   * Create organizer profile and assign ORGANIZER role
   *
   * This is the "I want to organize activities" action.
   * Creates the profile AND adds the ORGANIZER role to the user.
   */
  async createOrganizerProfile(
    userId: string,
    dto: CreateOrganizerProfileDto,
  ): Promise<OrganizerProfile> {
    // Check if already has organizer profile
    const existing = await this.organizerProfileModel.findOne({
      where: { userId: userId },
    });

    if (existing) {
      throw new ConflictException('Organizer profile already exists');
    }

    // Create the profile
    const profile = await this.organizerProfileModel.create({
      userId: userId,
      displayName: dto.displayName || null,
    });

    // Assign ORGANIZER role (global, not org-scoped yet)
    await this.roleService.assignRoleToUserByName(userId, 'ORGANIZER');

    this.logger.log(
      `User ${userId} activated organizer profile`,
      'ProfileService',
    );

    return profile;
  }

  /**
   * Get organizer profile for the authenticated user
   */
  async getOrganizerProfile(userId: string): Promise<OrganizerProfile | null> {
    return this.organizerProfileModel.findOne({
      where: { userId: userId },
    });
  }

  /**
   * Update organizer profile
   */
  async updateOrganizerProfile(
    userId: string,
    dto: UpdateOrganizerProfileDto,
  ): Promise<OrganizerProfile> {
    const profile = await this.organizerProfileModel.findOne({
      where: { userId: userId },
    });

    if (!profile) {
      throw new NotFoundException(
        'Organizer profile not found. Activate it first via POST /profile/organizer',
      );
    }

    await profile.update(dto);
    return profile;
  }

  // =====================================================
  // UNIFIED PROFILE UPDATE
  // =====================================================

  /**
   * Update full profile (user + participant + organizer) in one call
   *
   * Only provided sections are updated. If a section is omitted, it's skipped.
   */
  async updateFullProfile(userId: string, dto: UpdateFullProfileDto) {
    const results: any = {};

    // Update core user fields
    if (dto.user && Object.keys(dto.user).length > 0) {
      results.user = await this.userService.updateUser(userId, dto.user);
    }

    // Update participant profile
    if (dto.participant && Object.keys(dto.participant).length > 0) {
      results.participant = await this.updateParticipantProfile(
        userId,
        dto.participant,
      );
    }

    // Update organizer profile (only if it exists)
    if (dto.organizer && Object.keys(dto.organizer).length > 0) {
      const orgProfile = await this.getOrganizerProfile(userId);
      if (orgProfile) {
        results.organizer = await this.updateOrganizerProfile(
          userId,
          dto.organizer,
        );
      }
    }

    this.logger.log(
      `Full profile updated for user ${userId} (sections: ${Object.keys(results).join(', ')})`,
      'ProfileService',
    );

    return results;
  }

  // =====================================================
  // TRAINER DISCOVERY (public)
  // =====================================================

  /**
   * Discover public organizer/trainer profiles
   *
   * Returns paginated list of trainers who have set isPublic=true.
   * Supports search by name/bio/specialization and filtering by city/country.
   * Sorted by years of experience (most experienced first).
   */
  async discoverTrainers(dto: DiscoverTrainersDto) {
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const offset = (page - 1) * limit;

    const where: any = {
      isPublic: true,
    };

    if (dto.city) {
      where.locationCity = { [Op.like]: `%${dto.city}%` };
    }

    if (dto.country) {
      where.locationCountry = dto.country;
    }

    // Search across displayName, bio
    if (dto.search) {
      where[Op.or] = [
        { displayName: { [Op.like]: `%${dto.search}%` } },
        { bio: { [Op.like]: `%${dto.search}%` } },
      ];
    }

    const { rows: profiles, count: totalItems } =
      await this.organizerProfileModel.findAndCountAll({
        where,
        include: [
          {
            model: User,
            attributes: ['id', 'firstName', 'lastName', 'avatarId'],
            where: dto.search
              ? {
                  [Op.or]: [
                    { firstName: { [Op.like]: `%${dto.search}%` } },
                    { lastName: { [Op.like]: `%${dto.search}%` } },
                  ],
                }
              : undefined,
            required: !dto.search, // If searching, allow profiles without user match
          },
        ],
        attributes: [
          'id',
          'userId',
          'displayName',
          'bio',
          'specializations',
          'yearsOfExperience',
          'isAcceptingClients',
          'locationCity',
          'locationCountry',
          'socialLinks',
          'showSocialLinks',
        ],
        order: [['yearsOfExperience', 'DESC']],
        limit,
        offset,
      });

    const data = profiles.map((profile) => ({
      id: profile.id,
      userId: profile.userId,
      firstName: profile.user?.firstName,
      lastName: profile.user?.lastName,
      avatarId: profile.user?.avatarId,
      displayName: profile.displayName,
      bio: profile.bio,
      specializations: profile.specializations,
      yearsOfExperience: profile.yearsOfExperience,
      isAcceptingClients: profile.isAcceptingClients,
      city: profile.locationCity,
      country: profile.locationCountry,
      socialLinks: profile.showSocialLinks ? profile.socialLinks : null,
    }));

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

  // =====================================================
  // PROFILE OVERVIEW
  // =====================================================

  /**
   * Get complete profile overview
   *
   * Returns user data, roles, and both profiles.
   * The frontend uses this to know what UI to show.
   */
  async getProfileOverview(user: User) {
    const [participantProfile, organizerProfile, roles] = await Promise.all([
      this.getParticipantProfile(user.id),
      this.getOrganizerProfile(user.id),
      this.roleService.getUserRoles(user.id),
    ]);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        avatarId: user.avatarId,
        language: user.language,
        timezone: user.timezone,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
      },
      roles: roles.map((r) => r.name),
      hasOrganizerProfile: !!organizerProfile,
      participantProfile: participantProfile
        ? {
            dateOfBirth: participantProfile.dateOfBirth,
            gender: participantProfile.gender,
            heightCm: participantProfile.heightCm,
            weightKg: participantProfile.weightKg,
            fitnessLevel: participantProfile.fitnessLevel,
            goals: participantProfile.goals,
            medicalConditions: participantProfile.medicalConditions,
            emergencyContactName: participantProfile.emergencyContactName,
            emergencyContactPhone: participantProfile.emergencyContactPhone,
            notes: participantProfile.notes,
          }
        : null,
      organizerProfile: organizerProfile
        ? {
            displayName: organizerProfile.displayName,
            bio: organizerProfile.bio,
            specializations: organizerProfile.specializations,
            certifications: organizerProfile.certifications,
            yearsOfExperience: organizerProfile.yearsOfExperience,
            isAcceptingClients: organizerProfile.isAcceptingClients,
            socialLinks: organizerProfile.socialLinks,
            locationCity: organizerProfile.locationCity,
            locationCountry: organizerProfile.locationCountry,
          }
        : null,
    };
  }
}
