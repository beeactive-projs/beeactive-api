import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { User } from '../../user/entities/user.entity';

/**
 * Append-only audit row: every time a SUPER_ADMIN impersonates another
 * user, one row is written (inside the same transaction that mints the
 * impersonation token, before it is returned). Backs the "every
 * impersonation is logged" guarantee.
 *
 * Mirrors `AdminMessageAccessLog`. FKs are ON DELETE RESTRICT in the
 * migration (see 052 / policy in 044) so audit attribution can't vanish.
 */
@Table({
  tableName: 'admin_impersonation_log',
  // Append-only audit row — `@CreatedAt` needs `timestamps: true` to map
  // the column; `updatedAt: false` keeps Sequelize from expecting an
  // `updated_at` we never added in the migration.
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class AdminImpersonationLog extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare adminUserId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare targetUserId: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare reason: string;

  @Column({
    type: DataType.STRING(45),
    allowNull: true,
  })
  declare ip: string | null;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => User, 'adminUserId')
  declare admin: User;

  @BelongsTo(() => User, 'targetUserId')
  declare target: User;
}
