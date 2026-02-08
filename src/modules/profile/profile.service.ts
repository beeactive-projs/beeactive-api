import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ParticipantProfile } from './entities/participant-profile.entity';
import { OrganizerProfile } from './entities/organizer-profile.entity';
import { UpdateParticipantProfileDto } from './dto/update-participant-profile.dto';
import { CreateOrganizerProfileDto } from './dto/create-organizer-profile.dto';
import { UpdateOrganizerProfileDto } from './dto/update-organizer-profile.dto';
import { RoleService } from '../role/role.service';
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
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // =====================================================
  // PARTICIPANT PROFILE
  // =====================================================

  /**
   * Create empty participant profile (called during registration)
   */
  async createParticipantProfile(userId: string): Promise<ParticipantProfile> {
    return this.participantProfileModel.create({ user_id: userId });
  }

  /**
   * Get participant profile for the authenticated user
   */
  async getParticipantProfile(
    userId: string,
  ): Promise<ParticipantProfile | null> {
    return this.participantProfileModel.findOne({
      where: { user_id: userId },
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
      where: { user_id: userId },
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
      where: { user_id: userId },
    });

    if (existing) {
      throw new ConflictException('Organizer profile already exists');
    }

    // Create the profile
    const profile = await this.organizerProfileModel.create({
      user_id: userId,
      display_name: dto.display_name || null,
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
      where: { user_id: userId },
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
      where: { user_id: userId },
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
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        avatar_id: user.avatar_id,
        language: user.language,
        timezone: user.timezone,
        is_email_verified: user.is_email_verified,
        created_at: user.created_at,
      },
      roles: roles.map((r) => r.name),
      has_organizer_profile: !!organizerProfile,
      participant_profile: participantProfile
        ? {
            date_of_birth: participantProfile.date_of_birth,
            gender: participantProfile.gender,
            height_cm: participantProfile.height_cm,
            weight_kg: participantProfile.weight_kg,
            fitness_level: participantProfile.fitness_level,
            goals: participantProfile.goals,
            medical_conditions: participantProfile.medical_conditions,
            emergency_contact_name: participantProfile.emergency_contact_name,
            emergency_contact_phone: participantProfile.emergency_contact_phone,
            notes: participantProfile.notes,
          }
        : null,
      organizer_profile: organizerProfile
        ? {
            display_name: organizerProfile.display_name,
            bio: organizerProfile.bio,
            specializations: organizerProfile.specializations,
            certifications: organizerProfile.certifications,
            years_of_experience: organizerProfile.years_of_experience,
            is_accepting_clients: organizerProfile.is_accepting_clients,
            social_links: organizerProfile.social_links,
            location_city: organizerProfile.location_city,
            location_country: organizerProfile.location_country,
          }
        : null,
    };
  }
}
