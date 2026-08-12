import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { Exercise } from '../exercise/entities/exercise.entity';
import { RoleModule } from '../role/role.module';
import { CoachRosterController } from './coach-roster.controller';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

/**
 * Progress is read-only and derived. It owns no tables — the aggregates
 * run over the workout log and one_rep_max, so nothing here needs a
 * migration or writes anywhere.
 */
@Module({
  imports: [SequelizeModule.forFeature([Exercise]), RoleModule],
  controllers: [ProgressController, CoachRosterController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
