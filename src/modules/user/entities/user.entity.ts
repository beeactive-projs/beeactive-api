// These are decorators from sequelize-typescript
// Decorators are like "annotations" that add behavior to classes/properties
// In Laravel, you'd define $table, $fillable, etc. - here we use decorators instead

import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  HasMany,
  HasOne,
} from 'sequelize-typescript';

// @Table tells Sequelize: "this class = this database table"
// tableName: 'user' means it maps to your 'user' table in MySQL
// paranoid: true enables soft deletes (uses deleted_at instead of actually deleting)
// timestamps: true means Sequelize handles created_at/updated_at automatically

@Table({
  tableName: 'user',
  paranoid: true,
  timestamps: true,
  underscored: true, // Converts camelCase to snake_case (firstName -> first_name)
})
export class User extends Model {
  // Each @Column decorator defines a column in the table
  // The property name (id, email, etc.) becomes the column name
  // DataType tells MySQL what type to expect

  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4, // Auto-generates UUID
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(255),
    unique: true,
    allowNull: true, // Nullable because social login users might not have email initially
  })
  email: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true, // Nullable for social login users
  })
  passwordHash: string; // underscored:true converts this to password_hash in DB

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  firstName: string; // -> first_name in DB

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  lastName: string; // -> last_name in DB

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
  })
  phone: string;

  @Column({
    type: DataType.TINYINT.UNSIGNED,
    defaultValue: 1,
  })
  avatarId: number; // -> avatar_id in DB

  @Column({
    type: DataType.STRING(5),
    defaultValue: 'en',
  })
  language: string;

  @Column({
    type: DataType.STRING(50),
    defaultValue: 'Europe/Bucharest',
  })
  timezone: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  isActive: boolean; // -> is_active in DB

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  isEmailVerified: boolean; // -> is_email_verified in DB

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  emailVerificationToken: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  passwordResetToken: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  passwordResetExpires: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  lastLoginAt: Date; // -> last_login_at in DB

  // These three are special - Sequelize handles them automatically
  // @CreatedAt, @UpdatedAt, @DeletedAt are shortcuts

  @CreatedAt
  declare createdAt: Date; // -> created_at in DB

  @UpdatedAt
  declare updatedAt: Date; // -> updated_at in DB

  @DeletedAt
  declare deletedAt: Date; // -> deleted_at in DB (for soft deletes)

  // ============================================
  // RELATIONSHIPS (we'll uncomment these later)
  // ============================================

  // A user can have many social accounts (Google, Facebook, etc.)
  // @HasMany(() => SocialAccount)
  // socialAccounts: SocialAccount[];

  // A user can have many refresh tokens (multiple devices logged in)
  // @HasMany(() => RefreshToken)
  // refreshTokens: RefreshToken[];

  // A user can have one organizer profile (if they're an organizer)
  // @HasOne(() => OrganizerProfile)
  // organizerProfile: OrganizerProfile;

  // A user can have one participant profile (if they're a participant)
  // @HasOne(() => ParticipantProfile)
  // participantProfile: ParticipantProfile;
}
