import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Exercise } from '../../exercise/entities/exercise.entity';
import { ExerciseBlock } from './exercise-block.entity';
import { PrescribedSet } from './prescribed-set.entity';
import { ProgramWorkout } from './program-workout.entity';

/**
 * One exercise slot inside a program workout, referencing a real
 * `exercise` from the catalog. `block_id` is optional — when set,
 * the slot is part of a superset/circuit/etc. `superset_group_id` is
 * a per-workout integer that pairs exercises within the same workout
 * (alternative to a block for simple supersets).
 *
 * Soft-unpublish (locked decision §16): `exercise_id` is ON DELETE
 * RESTRICT — the exercise catalog can never hard-delete a row that
 * a program references. The catalog UI always soft-deletes, which
 * leaves references intact via the paranoid relation.
 */
@Table({
  tableName: 'prescribed_exercise',
  timestamps: true,
  underscored: true,
})
export class PrescribedExercise extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => ProgramWorkout)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare programWorkoutId: string;

  @ForeignKey(() => Exercise)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare exerciseId: string;

  @ForeignKey(() => ExerciseBlock)
  @Column({ type: DataType.CHAR(36), allowNull: true })
  declare blockId: string | null;

  /** Same value across exercises in this workout = paired superset. */
  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare supersetGroupId: number | null;

  @Column({ type: DataType.SMALLINT, allowNull: false })
  declare orderIndex: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  /** Optional swap suggestion the client sees in the picker. */
  @ForeignKey(() => Exercise)
  @Column({ type: DataType.CHAR(36), allowNull: true })
  declare alternateExerciseId: string | null;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;

  @BelongsTo(() => ProgramWorkout)
  declare workout: ProgramWorkout;

  @BelongsTo(() => Exercise, 'exerciseId')
  declare exercise: Exercise;

  @BelongsTo(() => Exercise, 'alternateExerciseId')
  declare alternateExercise: Exercise | null;

  @BelongsTo(() => ExerciseBlock)
  declare block: ExerciseBlock | null;

  @HasMany(() => PrescribedSet)
  declare sets: PrescribedSet[];
}
