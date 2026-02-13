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
import { Organization } from '../../organization/entities/organization.entity';
import { SessionParticipant } from './session-participant.entity';

/**
 * Session Entity
 *
 * Represents a training session (class, workshop, one-on-one).
 * Created by an organizer, optionally linked to an organization.
 *
 * Visibility controls who can see the session:
 * - PRIVATE: Only the organizer + specifically invited participants
 * - MEMBERS: All members of the organization
 * - PUBLIC: Anyone (for future discovery/marketplace)
 */
@Table({
  tableName: 'session',
  paranoid: true,
  timestamps: true,
  underscored: true,
})
export class Session extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Organization)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare organizationId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare organizerId: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare title: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare description: string;

  @Column({
    type: DataType.ENUM('ONE_ON_ONE', 'GROUP', 'ONLINE', 'WORKSHOP'),
    allowNull: false,
  })
  declare sessionType: string;

  @Column({
    type: DataType.ENUM('PRIVATE', 'MEMBERS', 'PUBLIC'),
    defaultValue: 'MEMBERS',
  })
  declare visibility: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare scheduledAt: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare durationMinutes: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare location: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare maxParticipants: number;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
  })
  declare price: number;

  @Column({
    type: DataType.STRING(3),
    defaultValue: 'RON',
  })
  declare currency: string;

  @Column({
    type: DataType.ENUM(
      'DRAFT',
      'SCHEDULED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ),
    defaultValue: 'SCHEDULED',
  })
  declare status: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare isRecurring: boolean;

  @Column({
    type: DataType.JSON,
    allowNull: true,
  })
  declare recurringRule: object;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare reminderSent: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date;

  // Relationships
  @BelongsTo(() => User, 'organizerId')
  declare organizer: User;

  @BelongsTo(() => Organization)
  declare organization: Organization;

  @HasMany(() => SessionParticipant)
  declare participants: SessionParticipant[];
}
