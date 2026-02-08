import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * Health Module
 *
 * Terminus is NestJS's official health check library.
 * It provides pre-built health indicators for:
 * - Database (Sequelize, TypeORM, Prisma)
 * - Redis
 * - Disk space
 * - Memory usage
 * - HTTP endpoints (check if external APIs are up)
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
