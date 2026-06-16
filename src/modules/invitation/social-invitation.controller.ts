import {
  Body,
  Controller,
  HttpCode,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { SendFriendInviteDto } from './dto/send-friend-invite.dto';
import { SuggestInstructorDto } from './dto/suggest-instructor.dto';
import { SocialInvitationService } from './social-invitation.service';

/**
 * Home-page "Invite a friend" + "Suggest an instructor" endpoints.
 *
 * Both are open to any authenticated user. Hard-throttled (10 sends
 * per hour per IP) so the friend-invite tab can't be weaponised as
 * a free-email-blaster.
 */
@ApiTags('Invitations (social)')
@Controller('invitations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('USER')
export class SocialInvitationController {
  constructor(
    private readonly socialInvitationService: SocialInvitationService,
  ) {}

  @Post('friend')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  async sendFriendInvite(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SendFriendInviteDto,
  ): Promise<void> {
    await this.socialInvitationService.sendFriendInvite(req.user.id, dto);
  }

  @Post('instructor')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  async suggestInstructor(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SuggestInstructorDto,
  ): Promise<void> {
    await this.socialInvitationService.suggestInstructor(req.user.id, dto);
  }
}
