import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { SessionDocs } from '../../common/docs/session.docs';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { SessionBookingService } from './services/session-booking.service';
import { BookSessionDto } from './dto/book-session.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { DeclineParticipantDto } from './dto/decline-participant.dto';
import { PatchParticipantDto } from './dto/patch-participant.dto';

/**
 * Booking surface — what a client does to a session, and what an
 * instructor does to a participant on their session.
 *
 * Ownership / eligibility checks live inside the service. Returns
 * 404 (not 403) for cross-instructor access to keep existence private.
 *
 * Throttling:
 *   - book: 5/min/user — defeats burst clickers + simple bots.
 *   - cancel-booking: 10/min/user — users sometimes want to undo fast.
 *   - approve/decline/patch: instructor side, 60/hr per instructor.
 */
@ApiTags('Sessions')
@Controller('sessions/instances')
@UseGuards(AuthGuard('jwt'))
export class SessionBookingController {
  constructor(private readonly bookingService: SessionBookingService) {}

  @Post(':id/book')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiEndpoint(SessionDocs.bookInstance)
  book(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookSessionDto,
  ) {
    return this.bookingService.book(req.user.id, id, dto);
  }

  @Post(':id/cancel-booking')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiEndpoint(SessionDocs.cancelBooking)
  cancelBooking(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingService.cancelBooking(req.user.id, id, dto);
  }

  @Post(':id/participants/:participantId/approve')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.approveParticipant)
  approve(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
  ) {
    return this.bookingService.approve(req.user.id, id, participantId);
  }

  @Post(':id/participants/:participantId/decline')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.declineParticipant)
  decline(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: DeclineParticipantDto,
  ) {
    return this.bookingService.decline(req.user.id, id, participantId, dto);
  }

  @Patch(':id/participants/:participantId')
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.patchParticipant)
  patchParticipant(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: PatchParticipantDto,
  ) {
    return this.bookingService.patchParticipant(
      req.user.id,
      id,
      participantId,
      dto,
    );
  }
}
