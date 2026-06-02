import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { ExerciseBlock } from './entities/exercise-block.entity';
import { PrescribedExercise } from './entities/prescribed-exercise.entity';
import { PrescribedSet } from './entities/prescribed-set.entity';
import { Program } from './entities/program.entity';
import { ProgramWorkout } from './entities/program-workout.entity';

/**
 * Workout Module — owns the program-authoring tree (program →
 * program_workout → exercise_block → prescribed_exercise →
 * prescribed_set), plus future ProgramAssignment / WorkoutLog /
 * OneRepMax surfaces (next sub-slices).
 *
 * This first slice registers the entities so Sequelize relations
 * resolve (the existing exercise module's PrescribedExercise.exerciseId
 * → Exercise FK only links here once both modules are loaded). No
 * controllers / services yet — those land in B1.5 (program CRUD).
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      Program,
      ProgramWorkout,
      ExerciseBlock,
      PrescribedExercise,
      PrescribedSet,
    ]),
  ],
  controllers: [],
  providers: [],
  exports: [SequelizeModule],
})
export class WorkoutModule {}
