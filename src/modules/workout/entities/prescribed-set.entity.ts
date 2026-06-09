import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { PrescribedExercise } from './prescribed-exercise.entity';
import { ExerciseSetType } from './workout.enums';

/**
 * Wide-nullable set schema — full Hevy parity from day one (locked
 * decision §4). Each field is independently optional; the FE shows
 * whichever fields are relevant given the parent exercise's `kind`.
 *
 * `target_weight_percent_1rm` is mutually exclusive with
 * `target_weight_kg` at the UX level — the client picks one. At
 * workout-start the assigned copy resolves %1RM to an absolute weight
 * using the latest `one_rep_max` for (user, exercise). Locked §15.
 *
 * Decimals (rpe, weight, %1RM) come back from the pg driver as
 * strings to preserve precision — the getters coerce to number so
 * the TS types are honest.
 */
@Table({
  tableName: 'prescribed_set',
  timestamps: true,
  underscored: true,
})
export class PrescribedSet extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => PrescribedExercise)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare prescribedExerciseId: string;

  @Column({ type: DataType.SMALLINT, allowNull: false })
  declare orderIndex: number;

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseSetType)),
    allowNull: false,
    defaultValue: ExerciseSetType.Normal,
  })
  declare setType: ExerciseSetType;

  // ── Targets (all nullable; UI shows what `kind` dictates) ─────────

  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare targetRepsMin: number | null;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare targetRepsMax: number | null;

  @Column({
    type: DataType.DECIMAL(6, 2),
    allowNull: true,
    get(this: PrescribedSet): number | null {
      const raw = this.getDataValue('targetWeightKg') as unknown as
        | string
        | null;
      return raw == null ? null : Number(raw);
    },
  })
  declare targetWeightKg: number | null;

  /** 0–100. Resolved to weight at workout-start using one_rep_max. */
  @Column({
    // Sequelize's underscored() rule joins "percent1rm" without a
    // separator, but the migration column is `target_weight_percent_1rm`
    // (underscore before the number). Pin the field name explicitly so
    // the INSERT/SELECT hits the right column.
    field: 'target_weight_percent_1rm',
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
    get(this: PrescribedSet): number | null {
      const raw = this.getDataValue('targetWeightPercent1rm') as unknown as
        | string
        | null;
      return raw == null ? null : Number(raw);
    },
  })
  declare targetWeightPercent1rm: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare targetDurationSeconds: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare targetDistanceMeters: number | null;

  @Column({
    type: DataType.DECIMAL(3, 1),
    allowNull: true,
    get(this: PrescribedSet): number | null {
      const raw = this.getDataValue('targetRpe') as unknown as string | null;
      return raw == null ? null : Number(raw);
    },
  })
  declare targetRpe: number | null;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare targetRir: number | null;

  // ── Pacing ────────────────────────────────────────────────────────

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare restAfterSeconds: number | null;

  /** e.g. '3-1-1-0' = 3s descent / 1s pause / 1s ascent / 0s pause. */
  @Column({ type: DataType.CHAR(7), allowNull: true })
  declare tempo: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;

  @BelongsTo(() => PrescribedExercise)
  declare exercise: PrescribedExercise;
}
