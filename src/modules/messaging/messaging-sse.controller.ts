import {
  Body,
  Controller,
  Headers,
  Post,
  Request,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { MessagingDocs } from '../../common/docs/messaging.docs';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { StreamAckDto } from './dto/stream-ack.dto';
import {
  MessagingEventsService,
  MessagingStreamEvent,
} from './messaging-events.service';
import { MessagingStreamAckService } from './messaging-stream-ack.service';
import { SseJwtGuard } from './auth/sse-jwt.guard';

/**
 * SSE stream + ack endpoint.
 *
 *   GET  /messaging/stream?token=<jwt>   long-lived event-stream
 *   POST /messaging/stream/ack           records last-seen event id
 *
 * The stream endpoint uses `SseJwtGuard` (NOT the regular `AuthGuard('jwt')`)
 * because `EventSource` cannot send custom headers — the access token
 * travels as a query parameter. The ack endpoint uses the regular guard
 * since it's a normal POST with `Authorization`.
 *
 * Held connections do NOT consume DB connections — the observable
 * filters EventEmitter2 events in memory only.
 */
@ApiTags('Messaging — Stream')
@Controller('messaging/stream')
export class MessagingSseController {
  constructor(
    private readonly events: MessagingEventsService,
    private readonly ack: MessagingStreamAckService,
  ) {}

  /**
   * Long-lived SSE stream. Emits messaging events for the
   * authenticated user PLUS a heartbeat every 25s.
   *
   * NOTE: the controller path is `/messaging/stream` and the method
   * path is empty, so the final route is `GET /messaging/stream`.
   */
  @Sse()
  @UseGuards(SseJwtGuard)
  @ApiEndpoint(MessagingDocs.stream)
  stream(
    @Request() req: AuthenticatedRequest,
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<{ id: string; data: MessagingStreamEvent }> {
    // EventSource sets Last-Event-ID automatically on reconnect with
    // the id of the most recently seen event. We feed it into the
    // subscription so the replay buffer can fill the gap before the
    // live stream resumes. Best-effort — see events.service docstring.
    return this.events.subscribeForUser(req.user.id, lastEventId);
  }

  /**
   * Client tells the server which event id it has fully processed.
   * Used as a stream-health heartbeat from the FE side and as the
   * future cursor for replay-on-reconnect (deferred).
   */
  @Post('ack')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(MessagingDocs.streamAck)
  recordAck(@Request() req: AuthenticatedRequest, @Body() dto: StreamAckDto) {
    this.ack.recordAck(req.user.id, dto.lastEventId);
    return { ok: true };
  }
}
