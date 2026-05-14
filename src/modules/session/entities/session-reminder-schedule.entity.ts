import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
} from 'sequelize-typescript';
import { SessionInstance } from './session-instance.entity';
import { SessionParticipant } from './session-participant.entity';
import { SessionReminderKind } from './session.enums';

@Table({
  tableName: 'session_reminder_schedule',
  paranoid: false,
  timestamps: false,
  underscored: true,
})
export class SessionReminderSchedule extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => SessionInstance)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare instanceId: string;

  @ForeignKey(() => SessionParticipant)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare participantId: string;

  @Column({
    type: DataType.ENUM(...Object.values(SessionReminderKind)),
    allowNull: false,
  })
  declare kind: SessionReminderKind;

  @Column({ type: DataType.DATE, allowNull: false })
  declare fireAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare sentAt: Date | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare jobId: string | null;

  @CreatedAt
  declare createdAt: Date;

  // Associations
  @BelongsTo(() => SessionInstance, 'instanceId')
  declare instance: SessionInstance;

  @BelongsTo(() => SessionParticipant, 'participantId')
  declare participant: SessionParticipant;
}
