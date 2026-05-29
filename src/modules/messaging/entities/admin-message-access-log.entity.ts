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
import { MessageReport } from './message-report.entity';

/**
 * Append-only audit row: every time staff reads messages inside a user
 * conversation, one row is written. Required to back the "we only read
 * user messages for flagged cases, and we log every access" claim.
 */
@Table({
  tableName: 'admin_message_access_log',
  // Append-only audit row — `@CreatedAt` needs `timestamps: true` to
  // actually map the column; `updatedAt: false` keeps Sequelize from
  // expecting an `updated_at` we never added in the migration.
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class AdminMessageAccessLog extends Model {
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

  @ForeignKey(() => Conversation)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare conversationId: string;

  @ForeignKey(() => MessageReport)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare relatedReportId: string | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare reason: string;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => User, 'adminUserId')
  declare admin: User;

  @BelongsTo(() => Conversation)
  declare conversation: Conversation;

  @BelongsTo(() => MessageReport, 'relatedReportId')
  declare relatedReport: MessageReport | null;
}
