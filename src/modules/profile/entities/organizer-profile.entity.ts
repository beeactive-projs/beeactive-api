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
 * Organizer Profile Entity
 *
 * Professional data for trainers/instructors.
 * This is what clients see when they view a trainer's profile.
 *
 * Created when a user activates "I want to organize activities".
 * Fields are filled in progressively by the trainer.
 */
@Table({
  tableName: 'organizer_profile',
  timestamps: true,
  underscored: true,
})
export class OrganizerProfile extends Model {
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
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare display_name: string;

  @Column({
    type: DataType.JSON,
    allowNull: true,
  })
  declare specializations: string[];

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare bio: string;

  @Column({
    type: DataType.JSON,
    allowNull: true,
  })
  declare certifications: object[];

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare years_of_experience: number;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare is_accepting_clients: boolean;

  @Column({
    type: DataType.JSON,
    allowNull: true,
  })
  declare social_links: object;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare show_social_links: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare show_email: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare show_phone: boolean;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare location_city: string;

  @Column({
    type: DataType.STRING(5),
    allowNull: true,
  })
  declare location_country: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare is_public: boolean;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;

  // Relationships
  @BelongsTo(() => User)
  declare user: User;
}
