import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Notification } from './notification.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Per-channel delivery audit. Worker writes one entry per channel it
 * attempts.
 *
 * Values are open strings to allow ad-hoc reasons:
 *   'sent'                   — delivered successfully (sync path or worker confirmed)
 *   'queued'                 — handed to BullMQ; the worker hasn't
 *                              reported back yet. Worker overwrites
 *                              with 'sent' or 'failed:...' when it
 *                              finishes.
 *   'skipped:preference_off' — user disabled the channel
 *   'skipped:no_email'       — user has no email on file (future audiences)
 *   'skipped:not_implemented'— phase-1 placeholder for push/sms
 *   'failed:<reason>'        — delivery attempt failed permanently
 */
export type DeliveredChannelStatus =
  | 'sent'
  | 'queued'
  | `skipped:${string}`
  | `failed:${string}`;

export interface DeliveredChannels {
  in_app?: DeliveredChannelStatus;
  email?: DeliveredChannelStatus;
  push?: DeliveredChannelStatus;
  sms?: DeliveredChannelStatus;
}

/**
 * NotificationReceipt Entity
 *
 * Per-recipient state for a notification. UNIQUE(notification_id, user_id)
 * means at most one receipt per user per alert; the producer relies on
 * this for idempotent re-runs.
 *
 * The five timestamps form a funnel:
 *   delivered_at  → in-app row was created (bell now shows it)
 *   viewed_at     → user opened the bell dropdown and saw it
 *   read_at       → user explicitly marked it read OR clicked through
 *   clicked_at    → user followed the deep link to the entity
 *   dismissed_at  → user X'd it without reading
 *
 * Hard-deleted on user request — receipts have no audit value once the
 * user wants them gone, and re-shows are achieved by emitting a fresh
 * notification rather than un-deleting an old one.
 */
@Table({
  tableName: 'notification_receipt',
  // `timestamps: true` is required for Sequelize to translate
  // `order: ['createdAt', ...]` → `ORDER BY created_at`. We don't
  // have an updated_at column on this table (receipts are append-mostly,
  // mutations live in delivered/viewed/read/clicked/dismissed_at), so
  // we disable updatedAt explicitly.
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class NotificationReceipt extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Notification)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare notificationId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.CHAR(36),
    allowNull: false,
  })
  declare userId: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare deliveredAt: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare viewedAt: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare readAt: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare clickedAt: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare dismissedAt: Date | null;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  declare deliveredChannels: DeliveredChannels;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => Notification)
  declare notification: Notification;

  @BelongsTo(() => User)
  declare user: User;
}
