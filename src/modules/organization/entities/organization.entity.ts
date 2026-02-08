import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  HasMany,
} from 'sequelize-typescript';
import { OrganizationMember } from './organization-member.entity';

/**
 * Organization Entity
 *
 * Represents a training studio, gym, or team.
 * A trainer creates an organization to group their sessions and clients.
 *
 * Soft deletes enabled — organizations are never truly removed.
 */
@Table({
  tableName: 'organization',
  paranoid: true,
  timestamps: true,
  underscored: true,
})
export class Organization extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    unique: true,
  })
  declare slug: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare description: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  declare logo_url: string;

  @Column({
    type: DataType.STRING(50),
    defaultValue: 'Europe/Bucharest',
  })
  declare timezone: string;

  @Column({
    type: DataType.JSON,
    allowNull: true,
  })
  declare settings: object;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare is_active: boolean;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;

  @DeletedAt
  declare deleted_at: Date;

  // Relationships
  @HasMany(() => OrganizationMember)
  declare members: OrganizationMember[];
}
