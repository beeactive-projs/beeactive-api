import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from '../../user/entities/user.entity';
import { SessionInstance } from './session-instance.entity';
import { SessionParticipantStatus } from './session.enums';

@Table({
  tableName: 'session_participant',
  paranoid: false,
  timestamps: true,
  underscored: true,
})
export class SessionParticipant extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => SessionInstance)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare instanceId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare userId: string;

  @Column({
    type: DataType.ENUM(...Object.values(SessionParticipantStatus)),
    allowNull: false,
  })
  declare status: SessionParticipantStatus;

  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare attended: boolean | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare checkedInAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare bookingNote: string | null;

  // Instructor-only note; never returned to client in response DTOs
  @Column({ type: DataType.TEXT, allowNull: true })
  declare privateNote: string | null;

  // Snapshot at booking time — immutable after creation.
  // These reflect the terms agreed to when the client booked.
  // Never update these after the initial insert; use a service guard.
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare snapshotPriceCents: number;

  @Column({ type: DataType.STRING(3), allowNull: false })
  declare snapshotCurrency: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare snapshotCancelCutoffH: number;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare snapshotLocationText: string | null;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare snapshotMeetingUrl: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare bookedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare approvedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare declinedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare cancelledAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare cancelReason: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare waitlistPosition: number | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  // Associations
  @BelongsTo(() => SessionInstance, 'instanceId')
  declare instance: SessionInstance;

  @BelongsTo(() => User, 'userId')
  declare user: User;
}
