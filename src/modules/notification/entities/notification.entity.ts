import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  HasMany,
} from 'sequelize-typescript';
import { NotificationReceipt } from './notification-receipt.entity';

/**
 * The audience scope for a notification.
 * - USER: 1:1 — audienceId is the recipient userId. (V1 only.)
 * - GROUP: fan-out to group_member rows for audienceId. (Future.)
 * - PLATFORM: fan-out to all users. (Future.)
 *
 * V1 only emits USER. The other values are reserved so we don't
 * need a schema change when broadcast lands.
 */
export enum NotificationAudienceType {
  USER = 'USER',
  GROUP = 'GROUP',
  PLATFORM = 'PLATFORM',
}

export enum NotificationSeverity {
  INFO = 'info',
  SUCCESS = 'success',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Routing payload attached to a notification. Drives FE deep-linking
 * when the user clicks the bell entry.
 *
 * - `screen` + `entityId` → path-segment route (e.g. `/groups/<id>`).
 * - `queryParams` → forwarded as URL query string (e.g.
 *   `/profile?tab=memberships`). Used for tabbed pages with no detail
 *   route. Producers should pick one or the other, not both.
 */
export interface NotificationData {
  screen: string;
  entityId?: string;
  action?: string;
  queryParams?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Notification Entity
 *
 * The message itself. One row per event — broadcasts share one row
 * across many `notification_receipt` rows (one per recipient).
 *
 * `fingerprint` is an optional sha256 the producer computes to dedupe
 * within a window (e.g. session reminder for the same session+window).
 */
@Table({
  tableName: 'notification',
  timestamps: true,
  underscored: true,
})
export class Notification extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
  })
  declare type: string;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  declare title: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare body: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  declare data: NotificationData | null;

  @Column({
    type: DataType.ENUM(...Object.values(NotificationSeverity)),
    allowNull: false,
    defaultValue: NotificationSeverity.INFO,
  })
  declare severity: NotificationSeverity;

  @Column({
    type: DataType.STRING(300),
    allowNull: true,
  })
  declare iconUrl: string | null;

  @Column({
    type: DataType.SMALLINT,
    allowNull: false,
    defaultValue: 1,
  })
  declare priority: number;

  @Column({
    type: DataType.ENUM(...Object.values(NotificationAudienceType)),
    allowNull: false,
    defaultValue: NotificationAudienceType.USER,
  })
  declare audienceType: NotificationAudienceType;

  @Column({
    type: DataType.CHAR(36),
    allowNull: true,
    comment:
      'user.id when audienceType=USER; group.id when GROUP; NULL when PLATFORM',
  })
  declare audienceId: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare deliverAt: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare expireAt: Date | null;

  @Column({
    type: DataType.STRING(64),
    allowNull: true,
    comment: 'sha256 of (type + dedup keys); producer-computed',
  })
  declare fingerprint: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @HasMany(() => NotificationReceipt)
  declare receipts: NotificationReceipt[];
}
