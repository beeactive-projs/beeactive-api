import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { UpdateParticipantStatusDto } from './dto/update-participant-status.dto';
import {
  ApiEndpoint,
  ApiStandardResponses,
} from '../../common/decorators/api-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

/**
 * Session Controller
 *
 * Training session management:
 * - POST   /sessions                              → Create session (ORGANIZER)
 * - GET    /sessions                              → List my visible sessions
 * - GET    /sessions/:id                          → Get session details
 * - PATCH  /sessions/:id                          → Update session (organizer only)
 * - DELETE /sessions/:id                          → Delete session (organizer only)
 * - POST   /sessions/:id/join                     → Join session (participant)
 * - POST   /sessions/:id/leave                    → Leave session (participant)
 * - PATCH  /sessions/:id/participants/:userId     → Update participant status (organizer)
 */
@ApiTags('Sessions')
@Controller('sessions')
@UseGuards(AuthGuard('jwt'))
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  // =====================================================
  // SESSION CRUD
  // =====================================================

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ORGANIZER', 'ADMIN', 'SUPER_ADMIN')
  @ApiEndpoint({
    summary: 'Create a new session',
    description:
      'Create a training session. Requires ORGANIZER role. If organization_id is provided, you must be a member.',
    auth: true,
    body: CreateSessionDto,
    responses: [
      {
        status: 201,
        description: 'Session created successfully',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Morning Yoga Flow',
          session_type: 'GROUP',
          visibility: 'MEMBERS',
          scheduled_at: '2026-02-15T09:00:00.000Z',
          duration_minutes: 60,
          status: 'SCHEDULED',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  })
  async create(@Request() req, @Body() dto: CreateSessionDto) {
    return this.sessionService.create(req.user.id, dto);
  }

  @Get()
  @ApiEndpoint({
    summary: 'List my visible sessions',
    description:
      'Returns all sessions visible to you: your own sessions, org MEMBERS sessions, PUBLIC sessions, and sessions you joined.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Sessions listed',
      },
      ApiStandardResponses.Unauthorized,
    ],
  })
  async getMySessions(@Request() req) {
    return this.sessionService.getMySessions(req.user.id);
  }

  @Get(':id')
  @ApiEndpoint({
    summary: 'Get session details',
    description:
      'Returns full session details including participants. Access controlled by visibility rules.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Session details retrieved',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  })
  async getById(@Param('id') id: string, @Request() req) {
    return this.sessionService.getById(id, req.user.id);
  }

  @Patch(':id')
  @ApiEndpoint({
    summary: 'Update session',
    description: 'Update session details. Organizer only.',
    auth: true,
    body: UpdateSessionDto,
    responses: [
      {
        status: 200,
        description: 'Session updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  })
  async update(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiEndpoint({
    summary: 'Delete session',
    description: 'Soft-delete a session. Organizer only.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Session deleted',
        example: { message: 'Session deleted successfully' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  })
  async delete(@Param('id') id: string, @Request() req) {
    await this.sessionService.delete(id, req.user.id);
    return { message: 'Session deleted successfully' };
  }

  // =====================================================
  // PARTICIPANT MANAGEMENT
  // =====================================================

  @Post(':id/join')
  @ApiEndpoint({
    summary: 'Join a session',
    description:
      'Register as a participant. Checks visibility rules and capacity.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Successfully joined session',
        example: {
          id: 'participant-uuid',
          session_id: 'session-uuid',
          user_id: 'user-uuid',
          status: 'REGISTERED',
        },
      },
      { status: 400, description: 'Already registered, session full, or own session' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  })
  async joinSession(@Param('id') id: string, @Request() req) {
    return this.sessionService.joinSession(id, req.user.id);
  }

  @Post(':id/leave')
  @ApiEndpoint({
    summary: 'Leave a session',
    description: 'Cancel your registration for a session.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Successfully left session',
        example: { message: 'You have left the session' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  })
  async leaveSession(@Param('id') id: string, @Request() req) {
    await this.sessionService.leaveSession(id, req.user.id);
    return { message: 'You have left the session' };
  }

  @Patch(':id/participants/:userId')
  @ApiEndpoint({
    summary: 'Update participant status',
    description:
      'Change a participant\'s status (e.g., mark as ATTENDED, NO_SHOW). Organizer only.',
    auth: true,
    body: UpdateParticipantStatusDto,
    responses: [
      {
        status: 200,
        description: 'Participant status updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  })
  async updateParticipantStatus(
    @Param('id') sessionId: string,
    @Param('userId') participantUserId: string,
    @Request() req,
    @Body() dto: UpdateParticipantStatusDto,
  ) {
    return this.sessionService.updateParticipantStatus(
      sessionId,
      participantUserId,
      req.user.id,
      dto,
    );
  }
}
