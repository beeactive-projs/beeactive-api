import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MessagingAdminDocs } from '../../common/docs/messaging.docs';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { AdminReadConversationDto } from './dto/admin-read-conversation.dto';
import { LiftSuspensionDto } from './dto/lift-suspension.dto';
import { ListReportsDto, ListVelocityAlarmsDto } from './dto/list-reports.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { MessagingModerationService } from './messaging-moderation.service';

/**
 * Admin moderation surface. Reports, suspensions, audit-logged reads.
 *
 * Every staff read of user conversation contents goes through
 * `readConversation` which writes an admin_message_access_log row in
 * the same transaction as the read. There is no other path that exposes
 * messages by id to staff — this is the only audited entry point.
 */
@ApiTags('Messaging — Admin')
@Controller('admin/messaging')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN', 'SUPPORT')
export class MessagingAdminController {
  constructor(private readonly moderation: MessagingModerationService) {}

  // ── Reports queue ────────────────────────────────────────────────

  @Get('reports')
  @ApiEndpoint(MessagingAdminDocs.listReports)
  listReports(@Query() query: ListReportsDto) {
    return this.moderation.listReports(query.page ?? 1, query.limit ?? 20, {
      status: query.status,
      category: query.category,
    });
  }

  @Patch('reports/:id')
  @ApiEndpoint(MessagingAdminDocs.resolveReport)
  resolveReport(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.moderation.resolveReport(
      req.user.id,
      id,
      dto.status,
      dto.resolutionNotes,
    );
  }

  // ── Audit-logged conversation read ───────────────────────────────

  @Post('conversations/:id/messages')
  @ApiEndpoint(MessagingAdminDocs.readConversation)
  readConversation(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminReadConversationDto,
  ) {
    return this.moderation.readConversationForModeration(req.user.id, id, {
      reason: dto.reason,
      relatedReportId: dto.relatedReportId,
      limit: dto.limit,
    });
  }

  // ── Suspensions ──────────────────────────────────────────────────

  @Post('suspensions')
  @ApiEndpoint(MessagingAdminDocs.suspend)
  suspend(@Request() req: AuthenticatedRequest, @Body() dto: SuspendUserDto) {
    return this.moderation.suspend(req.user.id, {
      userId: dto.userId,
      reason: dto.reason,
      expiresAtIso: dto.expiresAtIso,
    });
  }

  @Patch('suspensions/:id/lift')
  @ApiEndpoint(MessagingAdminDocs.liftSuspension)
  lift(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: LiftSuspensionDto,
  ) {
    // DTO carries optional admin notes — not used yet; v2 will record
    // them on a moderator-action audit row (out of scope for v1).
    return this.moderation.lift(req.user.id, id);
  }

  // ── Velocity alarms ─────────────────────────────────────────────

  @Get('velocity-alarms')
  @ApiEndpoint(MessagingAdminDocs.listVelocityAlarms)
  listVelocityAlarms(@Query() query: ListVelocityAlarmsDto) {
    return this.moderation.listVelocityAlarms(
      query.page ?? 1,
      query.limit ?? 20,
      query.includeReviewed ?? false,
    );
  }

  @Patch('velocity-alarms/:id/review')
  @ApiEndpoint(MessagingAdminDocs.reviewVelocityAlarm)
  reviewVelocityAlarm(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.moderation.reviewVelocityAlarm(req.user.id, id);
  }
}
