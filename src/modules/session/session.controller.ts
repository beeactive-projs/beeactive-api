import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { UpdateParticipantStatusDto } from './dto/update-participant-status.dto';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { SessionDocs } from '../../common/docs/session.docs';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';

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
  @ApiEndpoint({ ...SessionDocs.create, body: CreateSessionDto })
  async create(@Request() req, @Body() dto: CreateSessionDto) {
    return this.sessionService.create(req.user.id, dto);
  }

  @Get()
  @ApiEndpoint(SessionDocs.getMySessions)
  async getMySessions(@Request() req, @Query() pagination: PaginationDto) {
    return this.sessionService.getMySessions(
      req.user.id,
      pagination.page,
      pagination.limit,
    );
  }

  @Get(':id')
  @ApiEndpoint(SessionDocs.getById)
  async getById(@Param('id') id: string, @Request() req) {
    return this.sessionService.getById(id, req.user.id);
  }

  @Patch(':id')
  @ApiEndpoint({ ...SessionDocs.update, body: UpdateSessionDto })
  async update(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiEndpoint(SessionDocs.delete)
  async delete(@Param('id') id: string, @Request() req) {
    await this.sessionService.delete(id, req.user.id);
    return { message: 'Session deleted successfully' };
  }

  // =====================================================
  // PARTICIPANT MANAGEMENT
  // =====================================================

  @Post(':id/join')
  @ApiEndpoint(SessionDocs.joinSession)
  async joinSession(@Param('id') id: string, @Request() req) {
    return this.sessionService.joinSession(id, req.user.id);
  }

  @Post(':id/leave')
  @ApiEndpoint(SessionDocs.leaveSession)
  async leaveSession(@Param('id') id: string, @Request() req) {
    await this.sessionService.leaveSession(id, req.user.id);
    return { message: 'You have left the session' };
  }

  @Patch(':id/participants/:userId')
  @ApiEndpoint({ ...SessionDocs.updateParticipantStatus, body: UpdateParticipantStatusDto })
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
