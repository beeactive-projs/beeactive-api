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
import { Message } from './message.entity';

export enum MessageReportCategory {
  SPAM = 'SPAM',
  SCAM = 'SCAM',
  HARASSMENT = 'HARASSMENT',
  IMPERSONATION = 'IMPERSONATION',
  SEXUAL = 'SEXUAL',
  OTHER = 'OTHER',
}

export enum MessageReportStatus {
  OPEN = 'OPEN',
  REVIEWING = 'REVIEWING',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

@Table({
  tableName: 'message_report',
  // `@CreatedAt` needs `timestamps: true` to actually map the column.
  // Status transitions are tracked via `resolvedAt`; no `updated_at`
  // column exists in the migration.
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class MessageReport extends Model {
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
  declare reporterId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare reportedUserId: string;

  @ForeignKey(() => Message)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare messageId: string | null;

  @ForeignKey(() => Conversation)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare conversationId: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(MessageReportCategory)),
    allowNull: false,
  })
  declare category: MessageReportCategory;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare notes: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(MessageReportStatus)),
    allowNull: false,
    defaultValue: MessageReportStatus.OPEN,
  })
  declare status: MessageReportStatus;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare resolvedById: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare resolvedAt: Date | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare resolutionNotes: string | null;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => User, 'reporterId')
  declare reporter: User;

  @BelongsTo(() => User, 'reportedUserId')
  declare reportedUser: User;

  @BelongsTo(() => Message, 'messageId')
  declare message: Message | null;

  @BelongsTo(() => Conversation, 'conversationId')
  declare conversation: Conversation | null;

  @BelongsTo(() => User, 'resolvedById')
  declare resolvedBy: User | null;
}
