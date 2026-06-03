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
  DeletedAt,
} from 'sequelize-typescript';
import { User } from '../../user/entities/user.entity';
import { ProgramWorkout } from './program-workout.entity';
import { ProgramKind, ProgramStatus } from './workout.enums';

/**
 * Program — instructor-authored, per-instructor private library
 * (locked decision §3 — no marketplace in V1). `program.kind` reserves
 * MEAL / HABIT / HYBRID for future modules; V1 only ships WORKOUT.
 *
 * Assignment to a client is a separate flow: see ProgramAssignment +
 * the deep-copy transaction (locked decision §10, copy-on-assign).
 */
@Table({
  tableName: 'program',
  timestamps: true,
  underscored: true,
  paranoid: true,
})
export class Program extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare ownerId: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(ProgramKind)),
    allowNull: false,
    defaultValue: ProgramKind.Workout,
  })
  declare kind: ProgramKind;

  @Column({
    type: DataType.ENUM(...Object.values(ProgramStatus)),
    allowNull: false,
    defaultValue: ProgramStatus.Draft,
  })
  declare status: ProgramStatus;

  /**
   * Program length in days. Author UI defaults to "Weeks" with a unit
   * toggle (locked V1 decision, mirrors Trainerize). Null = open-ended.
   */
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare durationDays: number | null;

  /** Free-text UX hint only (e.g. "linear", "block periodization"). */
  @Column({ type: DataType.STRING(50), allowNull: true })
  declare periodizationModel: string | null;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare coverImageUrl: string | null;

  /** E.g. ["hypertrophy","fat_loss"]. Free shape for V1. */
  @Column({ type: DataType.JSONB, allowNull: true })
  declare goalTags: string[] | null;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;
  @DeletedAt declare deletedAt: Date | null;

  @BelongsTo(() => User, 'ownerId')
  declare owner: User;

  @HasMany(() => ProgramWorkout)
  declare workouts: ProgramWorkout[];
}
