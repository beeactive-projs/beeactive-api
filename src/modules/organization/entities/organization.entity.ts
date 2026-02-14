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
 * Organization types supported by the platform
 */
export enum OrganizationType {
  FITNESS = 'FITNESS',
  YOGA = 'YOGA',
  DANCE = 'DANCE',
  CROSSFIT = 'CROSSFIT',
  MARTIAL_ARTS = 'MARTIAL_ARTS',
  SWIMMING = 'SWIMMING',
  RUNNING = 'RUNNING',
  CYCLING = 'CYCLING',
  PILATES = 'PILATES',
  SPORTS_TEAM = 'SPORTS_TEAM',
  PERSONAL_TRAINING = 'PERSONAL_TRAINING',
  OTHER = 'OTHER',
}

/**
 * How new members can join the organization
 */
export enum JoinPolicy {
  OPEN = 'OPEN', // Anyone can join instantly
  REQUEST = 'REQUEST', // User requests, owner approves (future)
  INVITE_ONLY = 'INVITE_ONLY', // Only via invitation link
}

/**
 * Organization Entity
 *
 * Represents a training studio, gym, or team.
 * A trainer creates an organization to group their sessions and clients.
 *
 * Organizations can be public (discoverable) or private (invite-only).
 * Public orgs appear in search results and can be joined based on joinPolicy.
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
  declare logoUrl: string;

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
  declare isActive: boolean;

  // ── Discovery fields ──────────────────────────────────

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
    comment: 'Whether this org appears in public search results',
  })
  declare isPublic: boolean;

  @Column({
    type: DataType.STRING(50),
    defaultValue: OrganizationType.OTHER,
    comment: 'Organization category (FITNESS, YOGA, DANCE, etc.)',
  })
  declare type: OrganizationType;

  @Column({
    type: DataType.STRING(20),
    defaultValue: JoinPolicy.INVITE_ONLY,
    comment: 'How new members join: OPEN, REQUEST, INVITE_ONLY',
  })
  declare joinPolicy: JoinPolicy;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare contactEmail: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
  })
  declare contactPhone: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  declare address: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare city: string;

  @Column({
    type: DataType.STRING(5),
    allowNull: true,
  })
  declare country: string;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
    comment: 'Denormalized member count for sorting/display',
  })
  declare memberCount: number;

  // ── Timestamps ────────────────────────────────────────

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date;

  // ── Relationships ─────────────────────────────────────

  @HasMany(() => OrganizationMember)
  declare members: OrganizationMember[];
}
