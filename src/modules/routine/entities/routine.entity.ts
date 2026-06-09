import {
  Column,
  CreatedAt,
  DataType,
  DeletedAt,
  ForeignKey,
  HasMany,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import { User } from '../../user/entities/user.entity';
import { RoutineExercise } from './routine-exercise.entity';

/**
 * User-authored saved workout shape — name + ordered list of exercises with
 * default sets/reps/weight. Started via `POST /routines/:id/start`, which
 * materialises a fresh WorkoutLog with no `assignedWorkoutId` and seeds
 * `logged_exercise` + `logged_set` rows from the routine_exercise rows.
 *
 * Distinct from Program: routines are owned by a single user, single-workout,
 * mutable defaults, no assignment indirection.
 */
@Table({
  tableName: 'routine',
  timestamps: true,
  paranoid: true,
  underscored: true,
})
export class Routine extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare userId: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  /** Free-text folder name (Hevy pattern). Null = unfiled. */
  @Column({ type: DataType.STRING(100), allowNull: true })
  declare folder: string | null;

  /** Bumped on every successful start; sorts the FE Routines list. */
  @Column({ type: DataType.DATE, allowNull: true })
  declare lastPerformedAt: Date | null;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;
  @DeletedAt declare deletedAt: Date | null;

  @HasMany(() => RoutineExercise, {
    foreignKey: 'routineId',
    onDelete: 'CASCADE',
  })
  declare exercises: RoutineExercise[];
}
