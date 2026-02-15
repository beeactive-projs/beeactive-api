import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from '../../user/entities/user.entity';

/**
 * Instructor-Client Relationship Status
 *
 * - PENDING: Invitation sent but not yet accepted
 * - ACTIVE: Both parties confirmed the relationship
 * - ARCHIVED: Relationship ended (soft removal)
 */
export enum InstructorClientStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Who initiated the instructor-client relationship
 */
export enum InitiatedBy {
  INSTRUCTOR = 'INSTRUCTOR',
  CLIENT = 'CLIENT',
}

/**
 * Instructor-Client Entity
 *
 * Represents a one-to-one relationship between an instructor and a client.
 * An instructor can have many clients; a client can have many instructors.
 *
 * This is the "active relationship" record. The request/invitation flow
 * is tracked separately in ClientRequest.
 */
@Table({
  tableName: 'instructor_client',
  timestamps: true,
  underscored: true,
})
export class InstructorClient extends Model {
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
  declare instructorId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare clientId: string;

  @Column({
    type: DataType.ENUM(...Object.values(InstructorClientStatus)),
    allowNull: false,
    defaultValue: InstructorClientStatus.PENDING,
  })
  declare status: InstructorClientStatus;

  @Column({
    type: DataType.ENUM(...Object.values(InitiatedBy)),
    allowNull: false,
  })
  declare initiatedBy: InitiatedBy;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare notes: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare startedAt: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  // Relationships
  @BelongsTo(() => User, 'instructorId')
  declare instructor: User;

  @BelongsTo(() => User, 'clientId')
  declare client: User;
}
