'use strict';

import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  BelongsToMany,
} from 'sequelize-typescript';
import { User } from '../../user/entities/user.entity';
// We will create this Pivot table later, but we import it now to prepare
// import { UserRole } from './user-role.entity';

@Table({
  tableName: 'role', // Maps to the 'role' table
  timestamps: true,
  underscored: true,
})
export class Role extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(50),
    unique: true,
    allowNull: false,
  })
  name: string; // e.g., 'SUPER_ADMIN', 'ORGANIZER'

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    field: 'display_name',
  })
  displayName: string; // e.g., 'Super Administrator'

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  description: string;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 10,
    comment: '1=Highest Authority, 10=Lowest',
  })
  level: number;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
    field: 'is_system_role',
  })
  isSystemRole: boolean; // If true, this role cannot be deleted from the UI

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  // A Role belongs to many Users (Many-to-Many)
  // We will uncomment this once we create the 'UserRole' pivot table
  // @BelongsToMany(() => User, () => UserRole)
  // users: User[];
}
