import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  BelongsToMany,
  HasMany,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
} from 'sequelize-typescript';
import { User } from '../../user/entities/user.entity';
import { Muscle } from './muscle.entity';
import { Equipment } from './equipment.entity';
import { ExerciseMuscle } from './exercise-muscle.entity';
import { ExerciseEquipment } from './exercise-equipment.entity';
import { ExerciseMedia } from './exercise-media.entity';
import {
  ExerciseSource,
  ExerciseVisibility,
  ExerciseKind,
  ExerciseForce,
  ExerciseMechanic,
  ExerciseLevel,
  MovementPattern,
  ExerciseMediaKind,
} from './exercise.enums';

/**
 * Exercise — catalog row, shared across SYSTEM (seeded), INSTRUCTOR
 * (custom), and ADMIN sources. Soft-unpublish + fork-count semantics
 * are locked in `docs/research/workouts/04-locked-decisions.md` §16-17.
 * Keep enums in sync with migrations 047-048.
 */
@Table({
  tableName: 'exercise',
  timestamps: true,
  underscored: true,
  paranoid: true,
})
export class Exercise extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare name: string;

  /** Owner-scoped unique slug — SYSTEM exercises (NULL owner) share a global namespace. */
  @Column({ type: DataType.STRING(255), allowNull: false })
  declare slug: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare instructions: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseKind)),
    allowNull: false,
  })
  declare kind: ExerciseKind;

  // -- Classification --

  @Column({
    type: DataType.ENUM(...Object.values(MovementPattern)),
    allowNull: true,
  })
  declare movementPattern: MovementPattern | null;

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseMechanic)),
    allowNull: true,
  })
  declare mechanic: ExerciseMechanic | null;

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseForce)),
    allowNull: true,
  })
  declare force: ExerciseForce | null;

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseLevel)),
    allowNull: false,
    defaultValue: ExerciseLevel.Beginner,
  })
  declare level: ExerciseLevel;

  /**
   * MET intensity for cardio exercises (e.g. 7.0 for running). Internal
   * — used downstream for calorie estimation; not surfaced in the UI per
   * design open question 8.
   */
  @Column({
    type: DataType.DECIMAL(3, 1),
    allowNull: true,
    get(this: Exercise): number | null {
      const raw = this.getDataValue('metValue') as unknown as string | null;
      return raw == null ? null : Number(raw);
    },
  })
  declare metValue: number | null;

  // -- Ownership & visibility --

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseSource)),
    allowNull: false,
  })
  declare source: ExerciseSource;

  @ForeignKey(() => User)
  @Column({ type: DataType.CHAR(36), allowNull: true })
  declare ownerId: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseVisibility)),
    allowNull: false,
    defaultValue: ExerciseVisibility.Private,
  })
  declare visibility: ExerciseVisibility;

  @ForeignKey(() => Exercise)
  @Column({ type: DataType.CHAR(36), allowNull: true })
  declare forkedFromId: string | null;

  // -- Provenance (traceability strings — NEVER an FK to an external system) --

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare sourceProvider: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare sourceExternalId: string | null;

  // -- Media (primary; multi-image overlay lives in exercise_media) --

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseMediaKind)),
    allowNull: false,
    defaultValue: ExerciseMediaKind.None,
  })
  declare mediaKind: ExerciseMediaKind;

  /** Catalog list thumbnail. For SYSTEM exercises = start-position image. */
  @Column({ type: DataType.STRING(500), allowNull: true })
  declare thumbnailUrl: string | null;

  /** Custom exercises only (V1). Native upload comes in V2. */
  @Column({ type: DataType.STRING(500), allowNull: true })
  declare youtubeUrl: string | null;

  // -- UI hints --

  /** Optional per-exercise override for which fields the logging UI surfaces. */
  @Column({ type: DataType.JSONB, allowNull: true })
  declare trackingFields: string[] | null;

  // -- Programming hints --

  /** Split squats, single-arm rows, etc. — surfaced in logging UX. §18 */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isUnilateral: boolean;

  // -- Denormalized counters --

  /**
   * Count of rows where `forked_from_id = this.id` AND `deleted_at IS NULL`.
   * Maintained inside the fork transaction: +1 on create, -1 on soft-delete.
   * Sortable; do NOT compute on read. §17
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare forkCount: number;

  // -- Future export hooks (nullable, populated over time) --

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare fitCategory: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare fitSubcategory: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare hkActivityType: string | null;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;
  @DeletedAt declare deletedAt: Date | null;

  // -- Relationships --

  @BelongsTo(() => User, 'ownerId')
  declare owner: User | null;

  @BelongsTo(() => Exercise, 'forkedFromId')
  declare forkedFrom: Exercise | null;

  @BelongsToMany(() => Muscle, () => ExerciseMuscle)
  declare muscles: Muscle[];

  @BelongsToMany(() => Equipment, () => ExerciseEquipment)
  declare equipment: Equipment[];

  @HasMany(() => ExerciseMedia)
  declare media: ExerciseMedia[];

  /**
   * The join rows themselves — needed when reading the `role` on
   * `exercise_muscle` (primary/secondary/stabilizer). Use this include
   * when the muscle role matters; use `muscles` when you only need the
   * muscle list.
   */
  @HasMany(() => ExerciseMuscle)
  declare muscleRoles: ExerciseMuscle[];
}
