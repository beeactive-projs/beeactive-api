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
 * Admin-applied restriction on a user's ability to send messages.
 *
 * A suspension is active when:
 *   lifted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
 *
 * History is preserved (no hard delete) so we can show a user's past
 * suspensions during moderation review and apply graduated responses.
 */
@Table({
  tableName: 'messaging_suspension',
  // `@CreatedAt` needs `timestamps: true` to actually map the column.
  // Lifecycle state lives in `liftedAt`/`expiresAt`; no `updated_at`.
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class MessagingSuspension extends Model {
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
  declare userId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare appliedById: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare reason: string;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  declare startsAt: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare expiresAt: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare liftedAt: Date | null;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare liftedById: string | null;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => User, 'userId')
  declare user: User;

  @BelongsTo(() => User, 'appliedById')
  declare appliedBy: User;

  @BelongsTo(() => User, 'liftedById')
  declare liftedBy: User | null;
}
