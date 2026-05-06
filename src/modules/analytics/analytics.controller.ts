import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { AnalyticsService } from './analytics.service';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { AnalyticsDocs } from '../../common/docs/analytics.docs';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

/**
 * Analytics Controller
 *
 * Provides analytics endpoints:
 * - GET /analytics/instructor/summary  → Instructor's key metrics (30 days)
 * - GET /analytics/me/activity          → User's own activity summary
 * - GET /analytics/admin/platform       → Platform-wide stats (ADMIN+)
 */
@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(AuthGuard('jwt'))
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('instructor/summary')
  @UseGuards(RolesGuard)
  @Roles('INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN')
  @ApiEndpoint(AnalyticsDocs.getInstructorSummary)
  async getInstructorSummary(@Request() req: AuthenticatedRequest) {
    return this.analyticsService.getInstructorSummary(req.user.id);
  }

  @Get('me/activity')
  @ApiEndpoint(AnalyticsDocs.getUserActivity)
  async getUserActivity(@Request() req: AuthenticatedRequest) {
    return this.analyticsService.getUserActivity(req.user.id);
  }

  @Get('admin/platform')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiEndpoint(AnalyticsDocs.getPlatformStats)
  async getPlatformStats() {
    return this.analyticsService.getPlatformStats();
  }
}
