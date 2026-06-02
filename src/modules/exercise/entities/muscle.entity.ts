import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Muscle Entity
 *
 * Reference taxonomy seeded inline by migration 047 (~17 rows: chest,
 * shoulders, triceps, biceps, forearms, lats, middle_back, lower_back,
 * traps, neck, abdominals, quadriceps, hamstrings, glutes, calves,
 * adductors, abductors).
 *
 * Joined to `exercise` via `exercise_muscle` (M2M with role —
 * PRIMARY / SECONDARY / STABILIZER).
 */
@Table({
  tableName: 'muscle',
  timestamps: true,
  underscored: true,
})
export class Muscle extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({ type: DataType.STRING(50), allowNull: false, unique: true })
  declare slug: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare commonName: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare latinName: string | null;

  /** 'upper' | 'lower' | 'core' | 'full_body' — free string by design. */
  @Column({ type: DataType.STRING(30), allowNull: false })
  declare bodyRegion: string;

  @Column({ type: DataType.SMALLINT, allowNull: false, defaultValue: 0 })
  declare displayOrder: number;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;
}
