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
import { NotificationCategory } from './notification-categories';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

/**
 * NotificationSettingsController — the Notifications tab in /profile.
 *
 * Mounted under /users/me/notification-settings. The user-facing
 * surface is category-grouped (~6 rows × 1 channel = email). The
 * service explodes a category-level edit into per-type writes under
 * the hood, so power-user surfaces could later expose per-type
 * granularity without a schema change.
 *
 * Note: in-app, push, and SMS channels aren't part of the API today.
 * In-app is always on by design; push and SMS aren't implemented yet.
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
    return this.preferences.updateCategoriesForUser(req.user.id, dto.items);
  }

  @Delete(':category/reset')
  @ApiEndpoint(NotificationSettingsDocs.resetType)
  resetCategory(
    @Request() req: AuthenticatedRequest,
    @Param('category', new ParseEnumPipe(NotificationCategory))
    category: NotificationCategory,
  ) {
    return this.preferences.resetToDefault(req.user.id, category);
  }

  @Delete()
  @ApiEndpoint(NotificationSettingsDocs.resetAll)
  resetAll(@Request() req: AuthenticatedRequest) {
    return this.preferences.resetToDefault(req.user.id);
  }
}
