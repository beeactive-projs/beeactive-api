import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { UpdateParticipantProfileDto } from './dto/update-participant-profile.dto';
import { CreateOrganizerProfileDto } from './dto/create-organizer-profile.dto';
import { UpdateOrganizerProfileDto } from './dto/update-organizer-profile.dto';
import {
  ApiEndpoint,
  ApiStandardResponses,
} from '../../common/decorators/api-response.decorator';

/**
 * Profile Controller
 *
 * Manages user profiles:
 * - GET    /profile/me              → Full profile overview (roles + both profiles)
 * - GET    /profile/participant      → Get participant profile
 * - PATCH  /profile/participant      → Update participant profile
 * - POST   /profile/organizer        → Activate organizer profile ("I want to organize")
 * - GET    /profile/organizer        → Get organizer profile
 * - PATCH  /profile/organizer        → Update organizer profile
 *
 * All endpoints require JWT authentication.
 */
@ApiTags('Profiles')
@Controller('profile')
@UseGuards(AuthGuard('jwt'))
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  // =====================================================
  // PROFILE OVERVIEW
  // =====================================================

  @Get('me')
  @ApiEndpoint({
    summary: 'Get full profile overview',
    description:
      'Returns user data, roles, and both profiles. Use this on app load to determine what UI to show.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Profile overview retrieved',
        example: {
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'user@example.com',
            first_name: 'John',
            last_name: 'Doe',
          },
          roles: ['PARTICIPANT'],
          has_organizer_profile: false,
          participant_profile: {
            fitness_level: 'INTERMEDIATE',
            goals: ['weight_loss'],
          },
          organizer_profile: null,
        },
      },
      ApiStandardResponses.Unauthorized,
    ],
  })
  async getProfileOverview(@Request() req) {
    return this.profileService.getProfileOverview(req.user);
  }

  // =====================================================
  // PARTICIPANT PROFILE
  // =====================================================

  @Get('participant')
  @ApiEndpoint({
    summary: 'Get participant profile',
    description: 'Returns the authenticated user\'s participant profile data.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Participant profile retrieved',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          fitness_level: 'INTERMEDIATE',
          goals: ['weight_loss', 'muscle_gain'],
          date_of_birth: '1990-05-15',
          gender: 'MALE',
          height_cm: 180.5,
          weight_kg: 75.0,
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  })
  async getParticipantProfile(@Request() req) {
    return this.profileService.getParticipantProfile(req.user.id);
  }

  @Patch('participant')
  @ApiEndpoint({
    summary: 'Update participant profile',
    description:
      'Update health & fitness data. All fields are optional — fill them progressively.',
    auth: true,
    body: UpdateParticipantProfileDto,
    responses: [
      {
        status: 200,
        description: 'Participant profile updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  })
  async updateParticipantProfile(
    @Request() req,
    @Body() dto: UpdateParticipantProfileDto,
  ) {
    return this.profileService.updateParticipantProfile(req.user.id, dto);
  }

  // =====================================================
  // ORGANIZER PROFILE
  // =====================================================

  @Post('organizer')
  @ApiEndpoint({
    summary: 'Activate organizer profile',
    description:
      'Creates an organizer profile and assigns the ORGANIZER role. This is the "I want to organize activities" action.',
    auth: true,
    body: CreateOrganizerProfileDto,
    responses: [
      {
        status: 201,
        description: 'Organizer profile created and ORGANIZER role assigned',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          display_name: 'Coach John',
          user_id: '550e8400-e29b-41d4-a716-446655440001',
        },
      },
      { status: 409, description: 'Organizer profile already exists' },
      ApiStandardResponses.Unauthorized,
    ],
  })
  async createOrganizerProfile(
    @Request() req,
    @Body() dto: CreateOrganizerProfileDto,
  ) {
    return this.profileService.createOrganizerProfile(req.user.id, dto);
  }

  @Get('organizer')
  @ApiEndpoint({
    summary: 'Get organizer profile',
    description: 'Returns the authenticated user\'s organizer/trainer profile.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organizer profile retrieved',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          display_name: 'Coach John',
          bio: 'Certified trainer',
          specializations: ['hiit', 'yoga'],
          years_of_experience: 5,
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  })
  async getOrganizerProfile(@Request() req) {
    return this.profileService.getOrganizerProfile(req.user.id);
  }

  @Patch('organizer')
  @ApiEndpoint({
    summary: 'Update organizer profile',
    description:
      'Update professional data. All fields optional — fill progressively.',
    auth: true,
    body: UpdateOrganizerProfileDto,
    responses: [
      {
        status: 200,
        description: 'Organizer profile updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  })
  async updateOrganizerProfile(
    @Request() req,
    @Body() dto: UpdateOrganizerProfileDto,
  ) {
    return this.profileService.updateOrganizerProfile(req.user.id, dto);
  }
}
