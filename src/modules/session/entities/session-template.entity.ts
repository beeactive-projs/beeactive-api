import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
} from 'sequelize-typescript';
import { User } from '../../user/entities/user.entity';
import { Group } from '../../group/entities/group.entity';
import { Venue } from '../../venue/entities/venue.entity';
import { SessionInstance } from './session-instance.entity';
import {
  SessionType,
  SessionAccess,
  SessionLocationKind,
  SessionMeetingProvider,
  SessionTemplateStatus,
} from './session.enums';

export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  daysOfWeek?: number[]; // 1=Mon..7=Sun (ISO 8601); WEEKLY only
  endDate?: string; // ISO date
  endAfterOccurrences?: number;
}

@Table({
  tableName: 'session_template',
  paranoid: true,
  timestamps: true,
  underscored: true,
})
export class SessionTemplate extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare instructorId: string;

  @ForeignKey(() => Group)
  @Column({ type: DataType.CHAR(36), allowNull: true })
  declare groupId: string | null;

  @ForeignKey(() => Venue)
  @Column({ type: DataType.CHAR(36), allowNull: true })
  declare venueId: string | null;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare slug: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare title: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(SessionType)),
    allowNull: false,
  })
  declare type: SessionType;

  @Column({
    type: DataType.ENUM(...Object.values(SessionAccess)),
    allowNull: false,
  })
  declare access: SessionAccess;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare approvalRequired: boolean;

  @Column({
    type: DataType.ENUM(...Object.values(SessionLocationKind)),
    allowNull: false,
  })
  declare locationKind: SessionLocationKind;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare meetingUrl: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(SessionMeetingProvider)),
    allowNull: true,
  })
  declare meetingProvider: SessionMeetingProvider | null;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare durationMinutes: number;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
    defaultValue: 'Europe/Bucharest',
  })
  declare timezone: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare capacity: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare waitlistEnabled: boolean;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 24 })
  declare cancellationCutoffHours: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare priceAmountCents: number;

  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'RON' })
  declare priceCurrency: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isRecurring: boolean;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare recurrenceRule: RecurrenceRule | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare firstStartAt: Date;

  @Column({
    type: DataType.ENUM(...Object.values(SessionTemplateStatus)),
    allowNull: false,
    defaultValue: SessionTemplateStatus.Active,
  })
  declare status: SessionTemplateStatus;

  @Column({ type: DataType.DATE, allowNull: true })
  declare endedAt: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date | null;

  // Associations
  @BelongsTo(() => User, 'instructorId')
  declare instructor: User;

  @BelongsTo(() => Group, 'groupId')
  declare group: Group | null;

  @BelongsTo(() => Venue, 'venueId')
  declare venue: Venue | null;

  @HasMany(() => SessionInstance, 'templateId')
  declare instances: SessionInstance[];
}
