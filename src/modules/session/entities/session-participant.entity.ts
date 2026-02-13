import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
} from 'sequelize-typescript';
import { Session } from './session.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Session Participant Entity
 *
 * Tracks who registered for a session and their status.
 *
 * Status flow:
 * REGISTERED → CONFIRMED → ATTENDED (showed up)
 *                         → NO_SHOW (didn't show)
 *            → CANCELLED (user cancelled)
 */
@Table({
  tableName: 'session_participant',
  timestamps: false,
  underscored: true,
})
export class SessionParticipant extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Session)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare sessionId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare userId: string;

  @Column({
    type: DataType.ENUM(
      'REGISTERED',
      'CONFIRMED',
      'ATTENDED',
      'NO_SHOW',
      'CANCELLED',
    ),
    defaultValue: 'REGISTERED',
  })
  declare status: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare checkedInAt: Date;

  @CreatedAt
  declare createdAt: Date;

  // Relationships
  @BelongsTo(() => Session)
  declare session: Session;

  @BelongsTo(() => User)
  declare user: User;
}
