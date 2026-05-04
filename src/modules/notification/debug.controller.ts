import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationDebugDocs } from '../../common/docs/notification.docs';
import { NotificationService } from './notification.service';
import { DebugNotifyDto } from './dto/debug-notify.dto';

/**
 * NotificationDebugController — SUPER_ADMIN-only escape hatch for
 * smoke-testing the notification pipeline without an upstream producer.
 *
 * Calls NotificationService.notify() with the supplied params. Used
 * to verify the in-app + email + receipt audit work end-to-end before
 * we wire real producers (auth, sessions, payments, etc.).
 *
 * Removed once Phase 5 (FE) and Phase 6 (producer migration) ship and
 * we have real call sites exercising the pipeline.
 */
@ApiTags('Notifications')
@Controller('admin/debug')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
export class NotificationDebugController {
  constructor(private readonly notifications: NotificationService) {}

  /**
   * Throttled to 5 calls per minute — this is a smoke-test tool, not
   * a load generator. The IP-level throttle stops a careless POST
   * loop from blasting Resend.
   */
  @Post('notify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiEndpoint(NotificationDebugDocs.notify)
  notify(@Body() dto: DebugNotifyDto) {
    // Spread `dto.data` into a plain object literal so it satisfies
    // the `NotificationData` index signature without forcing the DTO
    // class to declare one (which would defeat class-validator's
    // whitelist).
    return this.notifications.notify({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: dto.data ? { ...dto.data } : undefined,
      severity: dto.severity,
      fingerprint: dto.fingerprint,
      ctaLabel: dto.ctaLabel,
    });
  }
}
