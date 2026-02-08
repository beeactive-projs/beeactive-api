import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
} from 'sequelize-typescript';
import { User } from '../../user/entities/user.entity';
import { Role } from '../../role/entities/role.entity';
import { Organization } from '../../organization/entities/organization.entity';

/**
 * Invitation Entity
 *
 * Represents an invitation to join an organization.
 * The inviter sends a token (via link/email), the invitee uses it to join.
 *
 * Token is stored as plain text (single-use, expires in 7 days).
 * Unlike password reset tokens, invitation tokens don't need hashing
 * because they don't grant access to existing accounts.
 */
@Table({
  tableName: 'invitation',
  timestamps: false,
  underscored: true,
})
export class Invitation extends Model {
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
  declare inviter_id: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare email: string;

  @ForeignKey(() => Role)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare role_id: string;

  @ForeignKey(() => Organization)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare organization_id: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    unique: true,
  })
  declare token: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare message: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare expires_at: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare accepted_at: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare declined_at: Date;

  @CreatedAt
  declare created_at: Date;

  // Relationships
  @BelongsTo(() => User, 'inviter_id')
  declare inviter: User;

  @BelongsTo(() => Role)
  declare role: Role;

  @BelongsTo(() => Organization)
  declare organization: Organization;
}
