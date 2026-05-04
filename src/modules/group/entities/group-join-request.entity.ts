import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Group } from './group.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Join-request lifecycle.
 *
 * - PENDING   : awaiting the group owner's decision.
 * - APPROVED  : owner approved; a GroupMember row was created in the
 *               same transaction.
 * - REJECTED  : owner rejected; no membership.
 * - CANCELLED : the requesting user withdrew the request before it was
 *               decided.
 *
 * Only one PENDING row per (groupId, userId) is allowed (enforced by a
 * partial unique index). Decided rows are kept for audit and do not
 * block a future request.
 */
export enum GroupJoinRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

@Table({
  tableName: 'group_join_request',
  timestamps: true,
  underscored: true,
})
export class GroupJoinRequest extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Group)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare groupId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare userId: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: GroupJoinRequestStatus.PENDING,
  })
  declare status: GroupJoinRequestStatus;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare message: string | null;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare decidedById: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare decidedAt: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => Group, 'groupId')
  declare group: Group;

  @BelongsTo(() => User, 'userId')
  declare user: User;

  @BelongsTo(() => User, 'decidedById')
  declare decidedBy: User | null;
}
