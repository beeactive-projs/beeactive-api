import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { SessionDocs } from '../../common/docs/session.docs';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { SessionInstanceService } from './services/session-instance.service';
import { SessionLifecycleService } from './services/session-lifecycle.service';
import { ListInstancesQueryDto } from './dto/list-instances-query.dto';
import { ListParticipantsQueryDto } from './dto/list-participants-query.dto';
import { CancelInstanceDto } from './dto/cancel-instance.dto';
import { RescheduleInstanceDto } from './dto/reschedule-instance.dto';
import { PatchInstanceDto } from './dto/patch-instance.dto';
import { FollowUpDto } from './dto/follow-up.dto';

/**
 * Read surface for session instances. No write endpoints yet — those
 * arrive in Phase C (booking) and Phase D (cancel/reschedule). Public
 * variants (anonymous-readable) arrive in Phase E.
 *
 * Auth: JWT required on all routes. Visibility (who can see what)
 * is enforced inside the service via `SessionAccessService`.
 */
@ApiTags('Sessions')
@Controller('sessions/instances')
@UseGuards(AuthGuard('jwt'))
export class SessionInstanceController {
  constructor(
    private readonly instanceService: SessionInstanceService,
    private readonly lifecycleService: SessionLifecycleService,
  ) {}

  @Get()
  @ApiEndpoint(SessionDocs.listInstances)
  list(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListInstancesQueryDto,
  ) {
    return this.instanceService.list(req.user.id, query);
  }

  @Get(':id')
  @ApiEndpoint(SessionDocs.getInstance)
  getById(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.instanceService.getById(req.user.id, id);
  }

  @Get(':id/participants')
  @ApiEndpoint(SessionDocs.listParticipants)
  listParticipants(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListParticipantsQueryDto,
  ) {
    // Ownership enforced inside the service (404 on cross-instructor).
    return this.instanceService.listParticipants(req.user.id, id, query);
  }

  // ─── Lifecycle write surface (Phase D) ─────────────────────────────

  @Post(':id/cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.cancelInstance)
  cancel(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelInstanceDto,
  ) {
    return this.lifecycleService.cancel(req.user.id, id, dto);
  }

  @Post(':id/reschedule')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.rescheduleInstance)
  reschedule(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleInstanceDto,
  ) {
    return this.lifecycleService.reschedule(req.user.id, id, dto);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.patchInstance)
  patchInstance(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchInstanceDto,
  ) {
    return this.lifecycleService.patchInstance(req.user.id, id, dto);
  }

  @Post(':id/follow-up')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.followUp)
  followUp(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FollowUpDto,
  ) {
    return this.lifecycleService.followUp(req.user.id, id, dto);
  }
}
