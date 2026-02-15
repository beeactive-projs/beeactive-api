import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Group } from './group.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Group Member Entity
 *
 * Links users to groups.
 * Tracks ownership, health data sharing consent, and membership dates.
 *
 * A user can be a member of multiple groups.
 * The owner (isOwner = true) is the instructor who created the group.
 * Members who leave have leftAt set (soft membership removal).
 */
@Table({
  tableName: 'group_member',
  timestamps: false,
  underscored: true,
})
export class GroupMember extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Group)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare groupId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare userId: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare isOwner: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare sharedHealthInfo: boolean;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare nickname: string | null;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  declare joinedAt: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare leftAt: Date | null;

  // -- Relationships --

  @BelongsTo(() => Group)
  declare group: Group;

  @BelongsTo(() => User)
  declare user: User;
}
