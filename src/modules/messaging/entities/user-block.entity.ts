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
 * Reason the blocker selected. Optional, free-form-ish enum surfaced to
 * the UI so we can later run aggregations ("how many blocks cite SCAM").
 */
export enum UserBlockReason {
  SPAM = 'SPAM',
  HARASSMENT = 'HARASSMENT',
  SCAM = 'SCAM',
  IMPERSONATION = 'IMPERSONATION',
  OTHER = 'OTHER',
}

@Table({
  tableName: 'user_block',
  // `@CreatedAt` needs `timestamps: true` to actually map the column.
  // Blocks are immutable except for being destroyed.
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class UserBlock extends Model {
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
  declare blockerId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare blockedId: string;

  @Column({
    type: DataType.ENUM(...Object.values(UserBlockReason)),
    allowNull: true,
  })
  declare reason: UserBlockReason | null;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => User, 'blockerId')
  declare blocker: User;

  @BelongsTo(() => User, 'blockedId')
  declare blocked: User;
}
