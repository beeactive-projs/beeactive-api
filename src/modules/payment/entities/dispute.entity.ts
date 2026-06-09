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
import { Payment } from './payment.entity';

/**
 * Dispute Entity
 *
 * Local mirror of a Stripe dispute (chargeback). Created/updated by the
 * `charge.dispute.created` (and future dispute.* ) webhook so we can:
 *   1. Notify the instructor immediately when a dispute opens.
 *   2. Drive the `payments.dispute_deadline` cron, which reminds the
 *      instructor at ~T-3 and ~T-1 before `evidenceDueBy`.
 *
 * `status` stores Stripe's raw dispute status string (e.g.
 * `needs_response`, `under_review`, `won`, `lost`) — we don't model an
 * enum so new Stripe statuses don't require a migration. The deadline
 * cron only reminds while the dispute still needs a response.
 */
@Table({
  tableName: 'dispute',
  timestamps: true,
  underscored: true,
})
export class Dispute extends Model {
  @Column({
    type: DataType.CHAR(36),
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  /** Stripe dispute id (`dp_...`). Unique — the upsert key. */
  @Column({ type: DataType.STRING(255), allowNull: false })
  declare stripeDisputeId: string;

  /** The disputed charge (`ch_...`); used to resolve the local payment. */
  @Column({ type: DataType.STRING(255), allowNull: false })
  declare stripeChargeId: string;

  @ForeignKey(() => Payment)
  @Column({ type: DataType.CHAR(36), allowNull: true })
  declare paymentId: string | null;

  /** The instructor whose connected account took the charge. */
  @ForeignKey(() => User)
  @Column({ type: DataType.CHAR(36), allowNull: false })
  declare instructorId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare amountCents: number;

  @Column({ type: DataType.STRING(3), allowNull: false })
  declare currency: string;

  /** Stripe dispute reason (e.g. `fraudulent`, `product_not_received`). */
  @Column({ type: DataType.STRING(64), allowNull: true })
  declare reason: string | null;

  /** Raw Stripe dispute status. */
  @Column({ type: DataType.STRING(40), allowNull: false })
  declare status: string;

  /** Evidence submission deadline (`evidence_details.due_by`). */
  @Column({ type: DataType.DATE, allowNull: true })
  declare evidenceDueBy: Date | null;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare openedAt: Date;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => Payment, 'paymentId')
  declare payment: Payment | null;

  @BelongsTo(() => User, 'instructorId')
  declare instructor: User;
}
