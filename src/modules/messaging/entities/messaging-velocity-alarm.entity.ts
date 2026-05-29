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
 * Informational alarm fired when a single user crosses the velocity
 * threshold (default: >100 messages in 60 minutes). Does NOT auto-block.
 * Admins review the row, decide if a suspension is warranted.
 */
@Table({
  tableName: 'messaging_velocity_alarm',
  // Append-only alarm row — `@CreatedAt` needs `timestamps: true` to
  // map the column. Review state lives in `reviewedAt`.
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class MessagingVelocityAlarm extends Model {
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

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare windowStart: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare windowEnd: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare messageCount: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare threshold: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare reviewedAt: Date | null;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare reviewedById: string | null;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => User, 'userId')
  declare user: User;

  @BelongsTo(() => User, 'reviewedById')
  declare reviewedBy: User | null;
}
