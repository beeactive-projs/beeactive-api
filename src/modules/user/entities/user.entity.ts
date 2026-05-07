import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  BelongsToMany,
  HasMany,
} from 'sequelize-typescript';
import { Role } from '../../role/entities/role.entity';
import { UserRole } from '../../role/entities/user-role.entity';
import { SocialAccount } from './social-account.entity';

@Table({
  tableName: 'user',
  paranoid: true,
  timestamps: true,
  underscored: true,
})
export class User extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(255),
    unique: true,
    allowNull: false,
  })
  declare email: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare passwordHash: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare firstName: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare lastName: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
  })
  declare phone: string;

  @Column({
    type: DataType.SMALLINT,
    defaultValue: 1,
  })
  declare avatarId: number;

  /**
   * Cloudinary secure_url of the user's uploaded profile picture.
   * Null until they upload one; UI falls back to a coloured initials
   * badge in that case.
   */
  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare avatarUrl: string | null;

  /**
   * Cloudinary public_id for the uploaded avatar. Used to DELETE the
   * previous asset when the user replaces their picture — without this
   * we'd leak storage on every re-upload.
   */
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare avatarPublicId: string | null;

  @Column({
    type: DataType.STRING(5),
    defaultValue: 'en',
  })
  declare language: string;

  @Column({
    type: DataType.STRING(50),
    defaultValue: 'Europe/Bucharest',
  })
  declare timezone: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare isActive: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare isEmailVerified: boolean;

  // SHA-256 hash of the verification token; never stores plaintext.
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare emailVerificationToken: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare emailVerificationExpires: Date | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare passwordResetToken: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare passwordResetExpires: Date | null;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare failedLoginAttempts: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare lockedUntil: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare passwordChangedAt: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare lastLoginAt: Date;

  /**
   * ISO 3166-1 alpha-2 country code (uppercase, e.g. 'RO').
   *
   * Source of truth for the user's country — feeds Stripe Connect
   * onboarding (instructors) and display. Nullable so signup doesn't
   * force it; service-layer validation enforces presence before
   * Stripe onboarding.
   */
  @Column({
    type: DataType.CHAR(2),
    allowNull: true,
  })
  declare countryCode: string | null;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare city: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date;

  // Relationships
  @BelongsToMany(() => Role, () => UserRole)
  declare roles: Role[];

  @HasMany(() => SocialAccount)
  declare socialAccounts: SocialAccount[];
}
