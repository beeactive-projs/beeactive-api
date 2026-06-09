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
import { Exercise } from './exercise.entity';
import { ExerciseMediaKind } from './exercise.enums';

/**
 * Exercise Media — provider-overlay table keyed by our UUID.
 *
 * Holds 0..N media rows per exercise. The architectural insurance for
 * provider-isolation: a third-party media source (MuscleWiki, wger,
 * jsDelivr-hosted Free Exercise DB images) is stored as an overlay row,
 * never as a foreign key. If the provider disappears, we drop the
 * rows; the catalog exercise survives.
 *
 * V1 writes:
 *   - `provider='jsdelivr'`, `kind='IMAGE'` — Free Exercise DB images
 *     (two per system exercise: start + end, via `displayOrder`)
 *   - `provider='youtube'`, `kind='IMAGE'` — oEmbed thumbnails for
 *     custom exercises with `youtubeUrl`
 *
 * V2 adds:
 *   - `provider='musclewiki'`, `kind='VIDEO'` — licensed video overlay
 *   - `provider='cloudinary'`, `kind='VIDEO'` — instructor uploads
 *
 * `isPrimary=true` rows are unique per exercise (partial unique index
 * in migration 047). The primary row backs `exercise.thumbnailUrl`.
 *
 * `licensedUntil` enforces license expiry at read time — when a
 * provider deal ends, rows past their date are filtered out by the
 * service layer (no need to bulk-delete).
 */
@Table({
  tableName: 'exercise_media',
  timestamps: true,
  underscored: true,
})
export class ExerciseMedia extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Exercise)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare exerciseId: string;

  /** 'jsdelivr' | 'cloudinary' | 'youtube' | 'musclewiki' | 'wger' */
  @Column({ type: DataType.STRING(50), allowNull: false })
  declare provider: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare providerAssetId: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(ExerciseMediaKind)),
    allowNull: false,
  })
  declare kind: ExerciseMediaKind;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare url: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare thumbnailUrl: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare durationSeconds: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare widthPx: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare heightPx: number | null;

  @Column({ type: DataType.SMALLINT, allowNull: false, defaultValue: 0 })
  declare displayOrder: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isPrimary: boolean;

  /** When set, the service-layer read filter hides this row past the date. */
  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare licensedUntil: string | null;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;

  @BelongsTo(() => Exercise)
  declare exercise: Exercise;
}
