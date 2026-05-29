import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
} from 'sequelize-typescript';
import { InstructorProfile } from '../../profile/entities/instructor-profile.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Public review left on an instructor's profile.
 *
 * Read-only in v1 — write/report endpoints will follow once moderation
 * policy is settled. `authorUserId` is nullable so a deleted author
 * doesn't drop the review (SET NULL at the DB level).
 */
@Table({
  tableName: 'review',
  timestamps: true,
  paranoid: true,
  underscored: true,
})
export class Review extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => InstructorProfile)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare instructorProfileId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
  })
  declare authorUserId: string | null;

  @Column({
    type: DataType.SMALLINT,
    allowNull: false,
  })
  declare rating: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare body: string;

  @Column({
    type: DataType.SMALLINT,
    allowNull: true,
  })
  declare monthsIn: number | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date | null;

  @BelongsTo(() => InstructorProfile)
  declare instructorProfile: InstructorProfile;

  @BelongsTo(() => User, 'authorUserId')
  declare author: User | null;
}
