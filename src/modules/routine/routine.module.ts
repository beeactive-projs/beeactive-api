import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { Exercise } from '../exercise/entities/exercise.entity';
import { RoleModule } from '../role/role.module';
import { LoggedExercise } from '../workout/entities/logged-exercise.entity';
import { LoggedSet } from '../workout/entities/logged-set.entity';
import { WorkoutLog } from '../workout/entities/workout-log.entity';
import { RoutineExercise } from './entities/routine-exercise.entity';
import { Routine } from './entities/routine.entity';
import { RoutineController } from './routine.controller';
import { RoutineService } from './routine.service';

/**
 * Routines module — user-authored saved workout shapes. Registers its own
 * entities + the workout-log entities it writes to on `start`. RoleModule
 * is required for RolesGuard to resolve.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      Routine,
      RoutineExercise,
      Exercise,
      WorkoutLog,
      LoggedExercise,
      LoggedSet,
    ]),
    RoleModule,
  ],
  controllers: [RoutineController],
  providers: [RoutineService],
  exports: [RoutineService],
})
export class RoutineModule {}
