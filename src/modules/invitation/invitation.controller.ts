import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { InvitationService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import {
  ApiEndpoint,
  ApiStandardResponses,
} from '../../common/decorators/api-response.decorator';

/**
 * Invitation Controller
 *
 * Manages invitations to join organizations:
 * - POST   /invitations              → Send invitation (org owner)
 * - GET    /invitations/pending       → My pending invitations
 * - POST   /invitations/:token/accept → Accept invitation
 * - POST   /invitations/:token/decline → Decline invitation
 * - GET    /invitations/organization/:id → List org invitations (owner)
 *
 * NOTE: No emails are sent. The invitation_link is returned in the response
 * for testing. Share it manually or integrate an email provider later.
 */
@ApiTags('Invitations')
@Controller('invitations')
@UseGuards(AuthGuard('jwt'))
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Send an invitation',
    description:
      'Invite someone to join your organization. Returns an invitation_link for testing (no email sent).',
    auth: true,
    body: CreateInvitationDto,
    responses: [
      {
        status: 201,
        description: 'Invitation sent',
        example: {
          invitation: {
            id: 'invitation-uuid',
            email: 'mike@trainer.com',
            organization_id: 'org-uuid',
            expires_at: '2026-02-22T00:00:00.000Z',
          },
          invitation_link:
            'http://localhost:4200/accept-invitation?token=abc123...',
        },
      },
      { status: 400, description: 'Active invitation already exists' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  })
  async create(@Request() req, @Body() dto: CreateInvitationDto) {
    return this.invitationService.create(req.user.id, dto);
  }

  @Get('pending')
  @ApiEndpoint({
    summary: 'Get my pending invitations',
    description:
      'Returns all pending invitations for the authenticated user\'s email.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Pending invitations listed',
        example: [
          {
            id: 'invitation-uuid',
            inviter: { first_name: 'Sarah', last_name: 'Johnson' },
            organization: { name: "Sarah's Fitness Studio" },
            role: { display_name: 'Participant' },
            message: 'Join my fitness studio!',
            expires_at: '2026-02-22T00:00:00.000Z',
          },
        ],
      },
      ApiStandardResponses.Unauthorized,
    ],
  })
  async getMyPendingInvitations(@Request() req) {
    return this.invitationService.getMyPendingInvitations(req.user.email);
  }

  @Post(':token/accept')
  @ApiEndpoint({
    summary: 'Accept an invitation',
    description:
      'Accept an invitation using its token. Adds you to the organization and assigns the role.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Invitation accepted',
        example: {
          message: 'Invitation accepted successfully',
          organization_id: 'org-uuid',
        },
      },
      { status: 400, description: 'Invitation expired, already accepted, or declined' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  })
  async accept(@Param('token') token: string, @Request() req) {
    return this.invitationService.accept(token, req.user.id);
  }

  @Post(':token/decline')
  @ApiEndpoint({
    summary: 'Decline an invitation',
    description: 'Decline an invitation using its token.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Invitation declined',
        example: { message: 'Invitation declined' },
      },
      { status: 400, description: 'Invitation already responded to' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  })
  async decline(@Param('token') token: string) {
    return this.invitationService.decline(token);
  }

  @Get('organization/:id')
  @ApiEndpoint({
    summary: 'List organization invitations',
    description:
      'List all invitations sent for an organization. Requires org membership.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organization invitations listed',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  })
  async getOrganizationInvitations(
    @Param('id') organizationId: string,
    @Request() req,
  ) {
    return this.invitationService.getOrganizationInvitations(
      organizationId,
      req.user.id,
    );
  }
}
