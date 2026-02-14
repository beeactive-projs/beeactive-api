import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { InvitationService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { InvitationDocs } from '../../common/docs/invitation.docs';
import { PaginationDto } from '../../common/dto/pagination.dto';

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
 * NOTE: No emails are sent. The invitationLink is returned in the response
 * for testing. Share it manually or integrate an email provider later.
 */
@ApiTags('Invitations')
@Controller('invitations')
@UseGuards(AuthGuard('jwt'))
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post()
  @ApiEndpoint({ ...InvitationDocs.create, body: CreateInvitationDto })
  async create(@Request() req, @Body() dto: CreateInvitationDto) {
    return this.invitationService.create(req.user.id, dto);
  }

  @Get('pending')
  @ApiEndpoint(InvitationDocs.getMyPendingInvitations)
  async getMyPendingInvitations(
    @Request() req,
    @Query() pagination: PaginationDto,
  ) {
    return this.invitationService.getMyPendingInvitations(
      req.user.email,
      pagination.page,
      pagination.limit,
    );
  }

  @Post(':token/accept')
  @ApiEndpoint(InvitationDocs.accept)
  async accept(@Param('token') token: string, @Request() req) {
    return this.invitationService.accept(token, req.user.id);
  }

  @Post(':token/decline')
  @ApiEndpoint(InvitationDocs.decline)
  async decline(@Param('token') token: string) {
    return this.invitationService.decline(token);
  }

  @Get('organization/:id')
  @ApiEndpoint(InvitationDocs.getOrganizationInvitations)
  async getOrganizationInvitations(
    @Param('id') organizationId: string,
    @Request() req,
    @Query() pagination: PaginationDto,
  ) {
    return this.invitationService.getOrganizationInvitations(
      organizationId,
      req.user.id,
      pagination.page,
      pagination.limit,
    );
  }
}
