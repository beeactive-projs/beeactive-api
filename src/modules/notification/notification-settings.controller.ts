import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { NotificationSettingsDocs } from '../../common/docs/notification.docs';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationType } from './notification-types';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

/**
 * NotificationSettingsController — the settings tab in /profile.
 *
 * Mounted under /users/me/notification-settings (a dedicated controller
 * keeps notification concerns colocated with the rest of the
 * notification module rather than scattering them across UserController).
 */
@ApiTags('Notifications')
@Controller('users/me/notification-settings')
@UseGuards(AuthGuard('jwt'))
export class NotificationSettingsController {
  constructor(private readonly preferences: NotificationPreferenceService) {}

  @Get()
  @ApiEndpoint(NotificationSettingsDocs.get)
  get(@Request() req: AuthenticatedRequest) {
    return this.preferences.getForUser(req.user.id);
  }

  @Patch()
  @ApiEndpoint(NotificationSettingsDocs.update)
  update(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.preferences.bulkUpdate(req.user.id, dto.items);
  }

  @Delete(':type/reset')
  @ApiEndpoint(NotificationSettingsDocs.resetType)
  resetType(
    @Request() req: AuthenticatedRequest,
    @Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
  ) {
    return this.preferences.resetToDefault(req.user.id, type);
  }

  @Delete()
  @ApiEndpoint(NotificationSettingsDocs.resetAll)
  resetAll(@Request() req: AuthenticatedRequest) {
    return this.preferences.resetToDefault(req.user.id);
  }
}
