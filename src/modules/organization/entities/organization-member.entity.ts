import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Organization } from './organization.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Organization Member Entity
 *
 * Links users to organizations.
 * Tracks ownership, health data sharing consent, and membership dates.
 */
@Table({
  tableName: 'organization_member',
  timestamps: false,
  underscored: true,
})
export class OrganizationMember extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Organization)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare organizationId: string;

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
  declare nickname: string;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  declare joinedAt: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare leftAt: Date;

  // Relationships
  @BelongsTo(() => Organization)
  declare organization: Organization;

  @BelongsTo(() => User)
  declare user: User;
}
