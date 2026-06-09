import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
} from 'sequelize-typescript';
import { PrescribedExercise } from './prescribed-exercise.entity';
import { ProgramWorkout } from './program-workout.entity';
import { ExerciseBlockKind } from './workout.enums';

/**
 * Optional grouping of exercises within a workout — supersets,
 * circuits, EMOM / AMRAP / Tabata blocks. V1 UI only renders
 * SUPERSET; the other block kinds are schema-supported but the FE
 * ships the UI later (locked decision §4, deferred block UX).
 *
 * An exercise can belong to at most one block via `block_id`; the
 * block holds the timing fields (rounds, durations, rest between
 * rounds) so the individual `prescribed_exercise` rows stay simple.
 */
@Table({
  tableName: 'exercise_block',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class ExerciseBlock extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => ProgramWorkout)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare programWorkoutId: string;

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseBlockKind)),
    allowNull: false,
  })
  declare kind: ExerciseBlockKind;

  @Column({ type: DataType.SMALLINT, allowNull: false })
  declare orderIndex: number;

  /** For CIRCUIT / EMOM / AMRAP — number of rounds. Null = open-ended. */
  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare rounds: number | null;

  /** For EMOM / AMRAP / TABATA — total block duration. */
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare durationSeconds: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare restBetweenRoundsSeconds: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @CreatedAt declare createdAt: Date;

  @BelongsTo(() => ProgramWorkout)
  declare workout: ProgramWorkout;

  @HasMany(() => PrescribedExercise, 'blockId')
  declare exercises: PrescribedExercise[];
}
