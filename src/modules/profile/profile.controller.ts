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
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { ProfileDocs } from '../../common/docs/profile.docs';

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
  @ApiEndpoint(ProfileDocs.getProfileOverview)
  async getProfileOverview(@Request() req) {
    return this.profileService.getProfileOverview(req.user);
  }

  // =====================================================
  // PARTICIPANT PROFILE
  // =====================================================

  @Get('participant')
  @ApiEndpoint(ProfileDocs.getParticipantProfile)
  async getParticipantProfile(@Request() req) {
    return this.profileService.getParticipantProfile(req.user.id);
  }

  @Patch('participant')
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
  @ApiEndpoint(ProfileDocs.getOrganizerProfile)
  async getOrganizerProfile(@Request() req) {
    return this.profileService.getOrganizerProfile(req.user.id);
  }

  @Patch('organizer')
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
