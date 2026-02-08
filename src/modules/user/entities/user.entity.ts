import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  BelongsToMany,
} from 'sequelize-typescript';
import { Role } from '../../role/entities/role.entity';
import { UserRole } from '../../role/entities/user-role.entity';

/**
 * User Entity
 *
 * Represents a user in the system.
 * Maps to the 'user' table in MySQL database.
 *
 * Sequelize decorators:
 * - @Table() → Configure table settings
 * - @Column() → Define database column
 * - @BelongsToMany() → Define relationship with other tables
 *
 * Settings:
 * - paranoid: true → Soft deletes (sets deleted_at instead of removing row)
 * - timestamps: true → Auto-manage created_at, updated_at
 * - underscored: true → Use snake_case in DB (firstName → first_name)
 */
@Table({
  tableName: 'user',
  paranoid: true, // Soft deletes - users are never truly deleted
  timestamps: true, // Automatically manage created_at, updated_at
  underscored: true, // Convert camelCase to snake_case for DB columns
})
export class User extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  // ✅ SECURITY FIX: Email is now required (allowNull: false)
  @Column({
    type: DataType.STRING(255),
    unique: true,
    allowNull: false, // Email is required for authentication
  })
  declare email: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare password_hash: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare first_name: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare last_name: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
  })
  declare phone: string;

  @Column({
    type: DataType.TINYINT.UNSIGNED,
    defaultValue: 1,
  })
  declare avatar_id: number;

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
  declare is_active: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare is_email_verified: boolean;

  // ✅ SECURITY FIX: Tokens are now hashed (stores SHA-256 hash, not plain token)
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare email_verification_token: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare password_reset_token: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare password_reset_expires: Date | null;

  // ✅ SECURITY FEATURE: Account lockout after failed login attempts
  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare failed_login_attempts: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare locked_until: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare last_login_at: Date;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;

  @DeletedAt
  declare deleted_at: Date;

  // Relationships
  @BelongsToMany(() => Role, () => UserRole)
  declare roles: Role[];
}
