import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
} from 'sequelize-typescript';

@Table({
  tableName: 'user',
  paranoid: true,
  timestamps: true,
  underscored: true,
})
export class User extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(255),
    unique: true,
    allowNull: true,
  })
  declare email: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare password_hash: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare first_name: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare last_name: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
  })
  declare phone: string;

  @Column({
    type: DataType.TINYINT.UNSIGNED,
    defaultValue: 1,
  })
  declare avatar_id: number;

  @Column({
    type: DataType.STRING(5),
    defaultValue: 'en',
  })
  declare language: string;

  @Column({
    type: DataType.STRING(50),
    defaultValue: 'Europe/Bucharest',
  })
  declare timezone: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare is_active: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare is_email_verified: boolean;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare email_verification_token: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare password_reset_token: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare password_reset_expires: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare last_login_at: Date;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;

  @DeletedAt
  declare deleted_at: Date;
}
