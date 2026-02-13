import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  CreatedAt,
  BelongsTo,
} from 'sequelize-typescript';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

/**
 * RolePermission Pivot Entity
 *
 * Links roles to permissions (many-to-many)
 * Already seeded in database
 */
@Table({
  tableName: 'role_permission',
  timestamps: false, // Only created_at
  paranoid: false,
  underscored: true,
})
export class RolePermission extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Role)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare roleId: string;

  @ForeignKey(() => Permission)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare permissionId: string;

  @CreatedAt
  declare createdAt: Date;

  // Relationships
  @BelongsTo(() => Role)
  declare role: Role;

  @BelongsTo(() => Permission)
  declare permission: Permission;
}
