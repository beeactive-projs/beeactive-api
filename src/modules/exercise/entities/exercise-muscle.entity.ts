import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
} from 'sequelize-typescript';
import { Exercise } from './exercise.entity';
import { Muscle } from './muscle.entity';
import { MuscleRole } from './exercise.enums';

/**
 * Exercise <-> Muscle join (M2M with `role` column).
 *
 * Composite primary key (`exerciseId`, `muscleId`, `role`) so the same
 * exercise can list a single muscle under multiple roles in pathological
 * cases (e.g. a movement that's both primary AND stabilizer for an
 * accessory muscle). In practice each pair has exactly one row.
 *
 * Service invariant (not DDL): every exercise must have at least one
 * PRIMARY row; PRIMARY rows are capped at 3 (locked decision §20).
 * SECONDARY and STABILIZER are unbounded.
 */
@Table({
  tableName: 'exercise_muscle',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class ExerciseMuscle extends Model {
  @ForeignKey(() => Exercise)
  @Column({ type: DataType.CHAR(36), primaryKey: true })
  declare exerciseId: string;

  @ForeignKey(() => Muscle)
  @Column({ type: DataType.CHAR(36), primaryKey: true })
  declare muscleId: string;

  @Column({
    type: DataType.ENUM(...Object.values(MuscleRole)),
    primaryKey: true,
  })
  declare role: MuscleRole;

  @CreatedAt declare createdAt: Date;

  @BelongsTo(() => Exercise)
  declare exercise: Exercise;

  @BelongsTo(() => Muscle)
  declare muscle: Muscle;
}
