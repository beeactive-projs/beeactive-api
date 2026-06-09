import {
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import { Exercise } from '../../exercise/entities/exercise.entity';
import { Routine } from './routine.entity';

/**
 * One exercise slot inside a Routine. Per-exercise defaults (sets / reps /
 * weight / rest) are copied to logged_set rows when the routine is started.
 * V1 ships one shape per exercise — for "5x5 then 3x10" the user adds the
 * exercise twice.
 */
@Table({
  tableName: 'routine_exercise',
  timestamps: true,
  underscored: true,
})
export class RoutineExercise extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Routine)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare routineId: string;

  @ForeignKey(() => Exercise)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare exerciseId: string;

  @Column({ type: DataType.SMALLINT, allowNull: false })
  declare orderIndex: number;

  /** Same value across rows in a routine = paired superset. */
  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare supersetGroupId: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @Column({ type: DataType.SMALLINT, allowNull: false, defaultValue: 3 })
  declare defaultSets: number;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare targetRepsMin: number | null;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare targetRepsMax: number | null;

  @Column({
    type: DataType.DECIMAL(6, 2),
    allowNull: true,
    get(this: RoutineExercise): number | null {
      const raw = this.getDataValue('targetWeightKg') as unknown as
        | string
        | null;
      return raw == null ? null : Number(raw);
    },
  })
  declare targetWeightKg: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare restAfterSeconds: number | null;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;

  @BelongsTo(() => Routine, 'routineId')
  declare routine: Routine;

  @BelongsTo(() => Exercise, 'exerciseId')
  declare exercise: Exercise;
}
