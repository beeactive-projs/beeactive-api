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
import { AssignedExercise } from './assigned-exercise.entity';
import { PrescribedSet } from './prescribed-set.entity';
import { ExerciseSetType } from './workout.enums';

/**
 * One assigned set — field-for-field mirror of PrescribedSet plus
 * the %1RM resolution snapshot (`resolved_weight_kg`, `resolved_at`).
 *
 * At assignment time the targets are copied verbatim. When the
 * client starts the workout, the log service walks the assigned sets
 * with `target_weight_percent_1rm != null` and resolves them against
 * the latest one_rep_max for (client, exercise), stamping the
 * computed absolute weight + timestamp here. The client UI shows the
 * resolved value, not the percentage.
 */
@Table({
  tableName: 'assigned_set',
  timestamps: true,
  underscored: true,
})
export class AssignedSet extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => AssignedExercise)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare assignedExerciseId: string;

  @ForeignKey(() => PrescribedSet)
  @Column({ type: DataType.CHAR(36), allowNull: true })
  declare masterSetId: string | null;

  @Column({ type: DataType.SMALLINT, allowNull: false })
  declare orderIndex: number;

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseSetType)),
    allowNull: false,
    defaultValue: ExerciseSetType.Normal,
  })
  declare setType: ExerciseSetType;

  // ── Target mirror (kept editable per-assignment) ─────────────────

  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare targetRepsMin: number | null;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare targetRepsMax: number | null;

  @Column({
    type: DataType.DECIMAL(6, 2),
    allowNull: true,
    get(this: AssignedSet): number | null {
      const raw = this.getDataValue('targetWeightKg') as unknown as
        | string
        | null;
      return raw == null ? null : Number(raw);
    },
  })
  declare targetWeightKg: number | null;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
    get(this: AssignedSet): number | null {
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
    get(this: AssignedSet): number | null {
      const raw = this.getDataValue('targetRpe') as unknown as string | null;
      return raw == null ? null : Number(raw);
    },
  })
  declare targetRpe: number | null;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare targetRir: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare restAfterSeconds: number | null;

  @Column({ type: DataType.CHAR(7), allowNull: true })
  declare tempo: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  // ── %1RM resolution snapshot (filled by log service on start) ────

  @Column({
    type: DataType.DECIMAL(6, 2),
    allowNull: true,
    get(this: AssignedSet): number | null {
      const raw = this.getDataValue('resolvedWeightKg') as unknown as
        | string
        | null;
      return raw == null ? null : Number(raw);
    },
  })
  declare resolvedWeightKg: number | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare resolvedAt: Date | null;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;

  @BelongsTo(() => AssignedExercise)
  declare exercise: AssignedExercise;
}
