import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { User } from '../../user/entities/user.entity';

/**
 * Where the device runs.
 * - web:     Web Push subscription (browser, via VAPID).
 * - ios:     Mobile, delivered via APNs (typically through FCM).
 * - android: Mobile, delivered via FCM directly.
 *
 * The push worker (later phase) branches on this value to pick the
 * adapter — the table itself is uniform.
 */
export enum DevicePlatform {
  WEB = 'WEB',
  IOS = 'IOS',
  ANDROID = 'ANDROID',
}

/**
 * DeviceToken Entity
 *
 * One row per (user, device) — same browser or app re-registering
 * upserts on (user_id, endpoint_hash) and bumps last_seen_at instead
 * of creating duplicates.
 *
 * `token` holds the raw push target:
 *   - web:    JSON-stringified PushSubscription { endpoint, keys: { p256dh, auth } }
 *   - ios/android: the FCM token string
 *
 * `endpoint_hash` is sha256 of the unique part (the subscription's
 * `endpoint` URL for web; the token itself for FCM) so we can use it
 * as a UNIQUE index without VARCHAR length issues.
 *
 * `revoked_at` is set on user logout, "remove device" UI action, or
 * when the push provider returns 410/NotRegistered. We never hard-
 * delete here — a future cleanup job prunes rows where revoked_at is
 * older than ~90 days.
 */
@Table({
  tableName: 'device_token',
  // `timestamps: true` so Sequelize handles createdAt → created_at
  // translation in queries. We don't have an updated_at column —
  // `last_seen_at` and `revoked_at` are mutated explicitly. So
  // updatedAt is disabled.
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class DeviceToken extends Model {
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
    type: DataType.ENUM(...Object.values(DevicePlatform)),
    allowNull: false,
  })
  declare platform: DevicePlatform;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare token: string;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
  })
  declare endpointHash: string;

  @Column({
    type: DataType.STRING(120),
    allowNull: true,
    comment: 'Optional UA / device label for the user-facing devices list',
  })
  declare deviceLabel: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare lastSeenAt: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare revokedAt: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => User)
  declare user: User;
}
