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
import { Venue } from '../../venue/entities/venue.entity';
import { SessionTemplate } from './session-template.entity';
import { SessionParticipant } from './session-participant.entity';
import { SessionInstanceStatus } from './session.enums';

@Table({
  tableName: 'session_instance',
  paranoid: true,
  timestamps: true,
  underscored: true,
})
export class SessionInstance extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => SessionTemplate)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare templateId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare instructorId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare occurrenceIndex: number;

  @Column({ type: DataType.DATE, allowNull: false })
  declare startAt: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare endAt: Date;

  // Per-occurrence overrides (null = use template value)
  @Column({ type: DataType.STRING(255), allowNull: true })
  declare titleOverride: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare descriptionOverride: string | null;

  @ForeignKey(() => Venue)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
    field: 'venue_id_override',
  })
  declare venueIdOverride: string | null;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare meetingUrlOverride: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare capacityOverride: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isOverride: boolean;

  @Column({
    type: DataType.ENUM(...Object.values(SessionInstanceStatus)),
    allowNull: false,
    defaultValue: SessionInstanceStatus.Scheduled,
  })
  declare status: SessionInstanceStatus;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare cancelReason: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare cancelledAt: Date | null;

  // Denormalised participant counters (maintained atomically by service)
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare confirmedCount: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare pendingApprovalCount: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare waitlistedCount: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare attendedCount: number | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare conflictingInstanceIds: string[] | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date | null;

  // Associations
  @BelongsTo(() => SessionTemplate, 'templateId')
  declare template: SessionTemplate;

  @BelongsTo(() => User, 'instructorId')
  declare instructor: User;

  @BelongsTo(() => Venue, {
    foreignKey: 'venue_id_override',
    as: 'venueOverride',
  })
  declare venueOverride: Venue | null;

  @HasMany(() => SessionParticipant, 'instanceId')
  declare participants: SessionParticipant[];
}
