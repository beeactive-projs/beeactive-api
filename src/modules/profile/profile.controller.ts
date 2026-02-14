import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { UpdateParticipantProfileDto } from './dto/update-participant-profile.dto';
import { CreateOrganizerProfileDto } from './dto/create-organizer-profile.dto';
import { UpdateOrganizerProfileDto } from './dto/update-organizer-profile.dto';
import { UpdateFullProfileDto } from './dto/update-full-profile.dto';
import { DiscoverTrainersDto } from './dto/discover-trainers.dto';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { ProfileDocs } from '../../common/docs/profile.docs';

/**
 * Profile Controller
 *
 * Manages user profiles:
 *
 * Public (no auth):
 * - GET    /profile/trainers/discover → Browse/search public trainers
 *
 * Authenticated:
 * - GET    /profile/me              → Full profile overview (roles + both profiles)
 * - PATCH  /profile/me              → Unified profile update
 * - GET    /profile/participant      → Get participant profile
 * - PATCH  /profile/participant      → Update participant profile
 * - POST   /profile/organizer        → Activate organizer profile ("I want to organize")
 * - GET    /profile/organizer        → Get organizer profile
 * - PATCH  /profile/organizer        → Update organizer profile
 */
@ApiTags('Profiles')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  // =====================================================
  // TRAINER DISCOVERY (public — no auth required)
  // =====================================================

  @Get('trainers/discover')
  @ApiEndpoint(ProfileDocs.discoverTrainers)
  async discoverTrainers(@Query() dto: DiscoverTrainersDto) {
    return this.profileService.discoverTrainers(dto);
  }

  // =====================================================
  // PROFILE OVERVIEW (auth required)
  // =====================================================

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(ProfileDocs.getProfileOverview)
  async getProfileOverview(@Request() req) {
    return this.profileService.getProfileOverview(req.user);
  }

  /**
   * Unified profile update
   *
   * Update user + participant + organizer profiles in a single API call.
   * Only provided sections are updated.
   */
  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint({
    ...ProfileDocs.updateFullProfile,
    body: UpdateFullProfileDto,
  })
  async updateFullProfile(
    @Request() req,
    @Body() dto: UpdateFullProfileDto,
  ) {
    return this.profileService.updateFullProfile(req.user.id, dto);
  }

  // =====================================================
  // PARTICIPANT PROFILE
  // =====================================================

  @Get('participant')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(ProfileDocs.getParticipantProfile)
  async getParticipantProfile(@Request() req) {
    return this.profileService.getParticipantProfile(req.user.id);
  }

  @Patch('participant')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint({
    ...ProfileDocs.updateParticipantProfile,
    body: UpdateParticipantProfileDto,
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
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint({
    ...ProfileDocs.createOrganizerProfile,
    body: CreateOrganizerProfileDto,
  })
  async createOrganizerProfile(
    @Request() req,
    @Body() dto: CreateOrganizerProfileDto,
  ) {
    return this.profileService.createOrganizerProfile(req.user.id, dto);
  }

  @Get('organizer')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(ProfileDocs.getOrganizerProfile)
  async getOrganizerProfile(@Request() req) {
    return this.profileService.getOrganizerProfile(req.user.id);
  }

  @Patch('organizer')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint({
    ...ProfileDocs.updateOrganizerProfile,
    body: UpdateOrganizerProfileDto,
  })
  async updateOrganizerProfile(
    @Request() req,
    @Body() dto: UpdateOrganizerProfileDto,
  ) {
    return this.profileService.updateOrganizerProfile(req.user.id, dto);
  }
}
