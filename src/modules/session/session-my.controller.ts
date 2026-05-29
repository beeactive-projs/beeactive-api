import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { SessionDocs } from '../../common/docs/session.docs';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { SessionClientService } from './services/session-client.service';
import { MySessionsQueryDto } from './dto/my-sessions-query.dto';

/**
 * Client utilities: My Sessions, counts, .ics download, join-info.
 *
 * All endpoints require auth. The .ics endpoint is auth-gated even for
 * OPEN sessions — a calendar entry that includes a meeting URL must
 * only go to a logged-in caller (Phase E public endpoints redact URLs;
 * .ics is the controlled way to surface them once booked).
 */
@ApiTags('Sessions · Client')
@Controller('sessions')
@UseGuards(AuthGuard('jwt'))
export class SessionMyController {
  constructor(private readonly clientService: SessionClientService) {}

  @Get('my')
  @ApiEndpoint(SessionDocs.listMy)
  listMy(
    @Request() req: AuthenticatedRequest,
    @Query() query: MySessionsQueryDto,
  ) {
    return this.clientService.listMy(req.user.id, query);
  }

  @Get('my/counts')
  @ApiEndpoint(SessionDocs.myCounts)
  myCounts(@Request() req: AuthenticatedRequest) {
    return this.clientService.counts(req.user.id);
  }

  @Get('instances/:id/ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @ApiEndpoint(SessionDocs.icsDownload)
  async ics(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    // Service performs access gating + URL redaction. For gated
    // (CLIENTS_ONLY / GROUP_ONLY) sessions, non-participants get 404.
    // For ONLINE sessions, the meeting URL is only included for
    // confirmed participants.
    const ics = await this.clientService.ics(req.user.id, id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="session-${id}.ics"`,
    );
    res.send(ics);
  }

  @Get('instances/:id/join-info')
  @ApiEndpoint(SessionDocs.joinInfo)
  joinInfo(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientService.joinInfo(req.user.id, id);
  }
}
