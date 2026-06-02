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
import { Equipment } from './equipment.entity';

/**
 * Exercise <-> Equipment join (M2M, no extras).
 *
 * Composite primary key (`exerciseId`, `equipmentId`). No `role` —
 * equipment is a flat list of "things you need."
 *
 * "Bodyweight" is its own equipment row; an exercise with no equipment
 * required should reference Bodyweight rather than have an empty list.
 */
@Table({
  tableName: 'exercise_equipment',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class ExerciseEquipment extends Model {
  @ForeignKey(() => Exercise)
  @Column({ type: DataType.CHAR(36), primaryKey: true })
  declare exerciseId: string;

  @ForeignKey(() => Equipment)
  @Column({ type: DataType.CHAR(36), primaryKey: true })
  declare equipmentId: string;

  @CreatedAt declare createdAt: Date;

  @BelongsTo(() => Exercise)
  declare exercise: Exercise;

  @BelongsTo(() => Equipment)
  declare equipment: Equipment;
}
