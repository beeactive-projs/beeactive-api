import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  SequelizeHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * Health Check Controller
 *
 * Provides endpoints for monitoring the application's health.
 * Used by:
 * - Load balancers (Railway, AWS, etc.) to know if the instance is healthy
 * - Monitoring tools (DataDog, New Relic, etc.)
 * - DevOps team for troubleshooting
 *
 * If health check fails, Railway will restart the container automatically!
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: SequelizeHealthIndicator,
  ) {}

  /**
   * Basic health check
   *
   * Returns: { status: 'ok', info: {...}, error: {...}, details: {...} }
   *
   * Checks:
   * - Database connection (can we query MySQL?)
   * - Overall app status
   *
   * If ANY check fails, returns 503 Service Unavailable
   * If ALL checks pass, returns 200 OK
   */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Application is healthy',
    schema: {
      example: {
        status: 'ok',
        info: {
          database: {
            status: 'up',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Application is unhealthy',
  })
  check() {
    return this.health.check([
      // Check database connection
      () => this.db.pingCheck('database'),

      // You can add more checks here:
      // () => this.redis.pingCheck('redis'),
      // () => this.disk.checkStorage('storage', { threshold: 250 * 1024 * 1024 * 1024 }),
    ]);
  }
}
