import {
  Table,
  Column,
  Model,
  DataType,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { User } from '../../user/entities/user.entity';

/**
 * Per-channel toggles. JSONB shape stored on the row.
 * Channels not present in the JSON inherit from the system default
 * for that notification type — see notification-defaults.ts (added
 * with the service rewrite).
 */
export interface ChannelPreferences {
  in_app?: boolean;
  email?: boolean;
  push?: boolean;
  sms?: boolean;
}

/**
 * NotificationPreference Entity
 *
 * Sparse table — only contains rows where the user has overridden the
 * system default for a given notification type. A missing row means
 * "use the default for this type".
 *
 * UNIQUE(user_id, type) so upsert-on-save is straightforward and the
 * settings page can render all 37 types from a single user query
 * merged with the in-code defaults map.
 */
@Table({
  tableName: 'notification_preference',
  timestamps: false,
  underscored: true,
})
export class NotificationPreference extends Model {
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
  declare userId: string;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
  })
  declare type: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  declare channels: ChannelPreferences;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User)
  declare user: User;
}
