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
 * Participant Profile Entity
 *
 * Health & fitness data for participants/clients.
 * This data is PRIVATE by default — trainers can only see it
 * if the participant explicitly shares it (via organization_member.shared_health_info).
 *
 * Created automatically when a user registers.
 * Fields are filled in progressively by the user.
 */
@Table({
  tableName: 'participant_profile',
  timestamps: true,
  underscored: true,
})
export class ParticipantProfile extends Model {
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
    unique: true,
  })
  declare user_id: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  declare date_of_birth: string;

  @Column({
    type: DataType.ENUM('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'),
    allowNull: true,
  })
  declare gender: string;

  @Column({
    type: DataType.DECIMAL(5, 1),
    allowNull: true,
  })
  declare height_cm: number;

  @Column({
    type: DataType.DECIMAL(5, 1),
    allowNull: true,
  })
  declare weight_kg: number;

  @Column({
    type: DataType.ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED'),
    allowNull: true,
  })
  declare fitness_level: string;

  @Column({
    type: DataType.JSON,
    allowNull: true,
  })
  declare goals: string[];

  @Column({
    type: DataType.JSON,
    allowNull: true,
  })
  declare medical_conditions: string[];

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare emergency_contact_name: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
  })
  declare emergency_contact_phone: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare notes: string;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;

  // Relationships
  @BelongsTo(() => User)
  declare user: User;
}
