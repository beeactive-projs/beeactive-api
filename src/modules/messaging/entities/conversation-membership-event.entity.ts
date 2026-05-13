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
import { Conversation } from './conversation.entity';

/**
 * Membership-change events for a conversation. Append-only audit trail.
 * v1 DMs do not write to this table; reserved for group conversations
 * (JOINED / LEFT / ADDED / REMOVED / ROLE_CHANGED).
 */
export enum ConversationMembershipEventType {
  JOINED = 'JOINED',
  LEFT = 'LEFT',
  ADDED = 'ADDED',
  REMOVED = 'REMOVED',
  ROLE_CHANGED = 'ROLE_CHANGED',
}

@Table({
  tableName: 'conversation_membership_event',
  // Append-only audit row — `@CreatedAt` needs `timestamps: true` to
  // actually map the column; the migration has no `updated_at`.
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class ConversationMembershipEvent extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Conversation)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare conversationId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare userId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare actorId: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(ConversationMembershipEventType)),
    allowNull: false,
  })
  declare eventType: ConversationMembershipEventType;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  declare metadata: Record<string, unknown> | null;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => Conversation)
  declare conversation: Conversation;

  @BelongsTo(() => User, 'userId')
  declare user: User;

  @BelongsTo(() => User, 'actorId')
  declare actor: User | null;
}
