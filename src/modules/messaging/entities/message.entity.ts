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
 * Kind of message. v1 only inserts TEXT. SYSTEM_* are written when
 * group membership / metadata changes — emitted automatically by the
 * service, never user-authored.
 */
export enum MessageKind {
  TEXT = 'TEXT',
  SYSTEM_JOIN = 'SYSTEM_JOIN',
  SYSTEM_LEAVE = 'SYSTEM_LEAVE',
  SYSTEM_RENAME = 'SYSTEM_RENAME',
  SYSTEM_ROLE_CHANGE = 'SYSTEM_ROLE_CHANGE',
}

/**
 * Loose shape for the JSONB metadata column. Threat flags attached by
 * MessagingContentService at send time, or SYSTEM_* payloads describing
 * the membership event.
 */
export interface MessageMetadata {
  threatFlags?: {
    urls?: string[];
    hasOffPlatformContact?: boolean;
    hasPaymentHandle?: boolean;
  };
  system?: {
    userId?: string;
    oldName?: string;
    newName?: string;
    oldRole?: string;
    newRole?: string;
  };
}

@Table({
  tableName: 'message',
  // We need Sequelize-managed `createdAt` (the BE returns it as the
  // canonical message timestamp), but the migration deliberately omits
  // an `updated_at` column — messages are append-only with soft-delete
  // tracked via `deleted_at`. Enable timestamps and explicitly disable
  // the updatedAt half.
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class Message extends Model {
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
    allowNull: true,
  })
  declare senderId: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(MessageKind)),
    allowNull: false,
    defaultValue: MessageKind.TEXT,
  })
  declare kind: MessageKind;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare body: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  declare metadata: MessageMetadata | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare deletedAt: Date | null;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare deletedById: string | null;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => Conversation)
  declare conversation: Conversation;

  @BelongsTo(() => User, 'senderId')
  declare sender: User | null;

  @BelongsTo(() => User, 'deletedById')
  declare deletedBy: User | null;
}
