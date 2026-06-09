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
 * Append-only audit row for every state-changing admin action. Written
 * by AdminAuditService.record(). See migration 053.
 */
@Table({
  tableName: 'admin_action_log',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class AdminActionLog extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare adminUserId: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare action: string;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare targetType: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare targetId: string | null;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare meta: Record<string, unknown>;

  @Column({ type: DataType.STRING(45), allowNull: true })
  declare ip: string | null;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => User, 'adminUserId')
  declare admin: User;
}
