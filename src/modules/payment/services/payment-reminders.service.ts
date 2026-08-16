import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../entities/subscription.entity';
import { StripeCustomer } from '../entities/stripe-customer.entity';
import { StripeAccount } from '../entities/stripe-account.entity';
import { Dispute } from '../entities/dispute.entity';
import { StripeService } from './stripe.service';
import { MAX_REFUND_WINDOW_DAYS } from './refund.service';
import { NotificationService } from '../../notification/notification.service';
import type { NotifyParams } from '../../notification/notification.service';
import {
  invoiceDueSoonForClient,
  invoiceOverdueForClient,
  invoiceOverdueForInstructor,
  invoiceDunningForClient,
  cardExpiringForClient,
  earningsSummaryForInstructor,
  refundWindowClosingForInstructor,
  disputeEvidenceDueForInstructor,
} from '../notifications';

const DAY_MS = 24 * 60 * 60_000;
const DUE_SOON_DAYS = 3;
const CARD_EXPIRY_WINDOW_DAYS = 30;
/** Stripe dispute statuses that still need the merchant to act. */
const DISPUTE_NEEDS_RESPONSE = ['needs_response', 'warning_needs_response'];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Cron-driven payment reminder sweeps (the `payments.*` reminder jobs).
 * Each method queries due rows and fires notifications directly via
 * `NotificationService.notify` — these run outside any transaction, and
 * idempotency comes from the per-builder `fingerprint` (remind-once or
 * once-per-day), not from DB flags. Per-item failures are caught so one
 * bad row can't abort the sweep.
 */
@Injectable()
export class PaymentRemindersService {
  constructor(
    @InjectModel(Invoice) private readonly invoiceModel: typeof Invoice,
    @InjectModel(Payment) private readonly paymentModel: typeof Payment,
    @InjectModel(Subscription)
    private readonly subscriptionModel: typeof Subscription,
    @InjectModel(StripeCustomer)
    private readonly stripeCustomerModel: typeof StripeCustomer,
    @InjectModel(StripeAccount)
    private readonly stripeAccountModel: typeof StripeAccount,
    @InjectModel(Dispute) private readonly disputeModel: typeof Dispute,
    private readonly sequelize: Sequelize,
    private readonly stripeService: StripeService,
    private readonly notifications: NotificationService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // ── 1. invoice due soon ──────────────────────────────────────────────
  async remindInvoicesDueSoon(now: Date): Promise<{ sent: number }> {
    const horizon = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
    const invoices = await this.invoiceModel.findAll({
      where: {
        status: InvoiceStatus.OPEN,
        clientId: { [Op.ne]: null },
        dueDate: { [Op.gt]: now, [Op.lte]: horizon },
      },
    });
    return this.fanOut(
      invoices.map((inv) =>
        invoiceDueSoonForClient(inv.clientId as string, this.invoiceRef(inv)),
      ),
    );
  }

  // ── 2. invoice overdue (client + instructor) ─────────────────────────
  async escalateOverdueInvoices(now: Date): Promise<{ sent: number }> {
    const dayKey = this.dayKey(now);
    const invoices = await this.invoiceModel.findAll({
      where: {
        status: InvoiceStatus.OPEN,
        dueDate: { [Op.ne]: null, [Op.lt]: now },
      },
    });
    const params: NotifyParams[] = [];
    for (const inv of invoices) {
      const ref = this.invoiceRef(inv);
      if (inv.clientId)
        params.push(invoiceOverdueForClient(inv.clientId, ref, dayKey));
      params.push(invoiceOverdueForInstructor(inv.instructorId, ref, dayKey));
    }
    return this.fanOut(params);
  }

  // ── 3. card expiring soon ────────────────────────────────────────────
  async remindCardsExpiring(now: Date): Promise<{ sent: number }> {
    if (!this.stripeService.isConfigured) return { sent: 0 };

    const subs = await this.subscriptionModel.findAll({
      where: {
        status: {
          [Op.in]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
        clientId: { [Op.ne]: null },
      },
      attributes: ['clientId', 'stripeCustomerId'],
    });
    // One notification per customer (the client), not per subscription.
    const clientByCustomer = new Map<string, string>();
    for (const s of subs) {
      if (
        s.stripeCustomerId &&
        s.clientId &&
        !clientByCustomer.has(s.stripeCustomerId)
      ) {
        clientByCustomer.set(s.stripeCustomerId, s.clientId);
      }
    }
    if (clientByCustomer.size === 0) return { sent: 0 };

    const customers = await this.stripeCustomerModel.findAll({
      where: {
        stripeCustomerId: { [Op.in]: [...clientByCustomer.keys()] },
        defaultPaymentMethodId: { [Op.ne]: null },
      },
      attributes: ['stripeCustomerId', 'defaultPaymentMethodId'],
    });

    const params: NotifyParams[] = [];
    for (const customer of customers) {
      const clientId = clientByCustomer.get(customer.stripeCustomerId);
      if (!clientId || !customer.defaultPaymentMethodId) continue;
      try {
        const pm = await this.stripeService.stripe.paymentMethods.retrieve(
          customer.defaultPaymentMethodId,
        );
        const card = pm.card;
        if (!card) continue;
        // A card with exp 05/2026 is valid through the end of May; the
        // boundary is the first instant of the next month.
        const expiryBoundary = new Date(card.exp_year, card.exp_month, 1);
        const msLeft = expiryBoundary.getTime() - now.getTime();
        if (msLeft > 0 && msLeft <= CARD_EXPIRY_WINDOW_DAYS * DAY_MS) {
          params.push(
            cardExpiringForClient(clientId, {
              brand: card.brand ?? null,
              last4: card.last4 ?? null,
              expMonth: card.exp_month,
              expYear: card.exp_year,
            }),
          );
        }
      } catch (err) {
        this.logger.warn?.(
          `Card-expiry check failed for customer ${customer.stripeCustomerId}: ${(err as Error).message}`,
          'PaymentRemindersService',
        );
      }
    }
    return this.fanOut(params);
  }

  // ── 4. monthly earnings summary ──────────────────────────────────────
  async sendMonthlyEarningsSummaries(now: Date): Promise<{ sent: number }> {
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthLabel = `${MONTHS[lastMonthStart.getMonth()]} ${lastMonthStart.getFullYear()}`;
    const monthKey = `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth() + 1).padStart(2, '0')}`;

    const rows = (await this.paymentModel.findAll({
      attributes: [
        'instructorId',
        'currency',
        [this.sequelize.fn('SUM', this.sequelize.col('amount_cents')), 'gross'],
        [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'cnt'],
      ],
      where: {
        status: PaymentStatus.SUCCEEDED,
        paidAt: { [Op.gte]: lastMonthStart, [Op.lt]: thisMonthStart },
      },
      group: ['instructor_id', 'currency'],
      raw: true,
    })) as unknown as Array<{
      instructorId: string;
      currency: string;
      gross: number | string;
      cnt: number | string;
    }>;

    const params = rows
      .filter((r) => Number(r.cnt) > 0)
      .map((r) =>
        earningsSummaryForInstructor(r.instructorId, {
          monthLabel,
          monthKey: `${monthKey}:${r.currency}`,
          grossCents: Number(r.gross),
          currency: r.currency,
          paymentCount: Number(r.cnt),
        }),
      );
    return this.fanOut(params);
  }

  // ── 5. refund window closing ─────────────────────────────────────────
  async remindRefundWindowClosing(now: Date): Promise<{ sent: number }> {
    // Closes in (0, 2] days → paidAt in [now-14d, now-12d).
    const windowEnd = new Date(now.getTime() - MAX_REFUND_WINDOW_DAYS * DAY_MS);
    const warnStart = new Date(
      now.getTime() - (MAX_REFUND_WINDOW_DAYS - 2) * DAY_MS,
    );
    const payments = await this.paymentModel.findAll({
      where: {
        status: PaymentStatus.SUCCEEDED,
        amountRefundedCents: 0,
        paidAt: { [Op.gte]: windowEnd, [Op.lt]: warnStart },
      },
    });
    const params = payments
      .filter((p) => p.paidAt != null)
      .map((p) => {
        const closesAt = new Date(
          p.paidAt!.getTime() + MAX_REFUND_WINDOW_DAYS * DAY_MS,
        );
        const daysLeft = Math.max(
          1,
          Math.ceil((closesAt.getTime() - now.getTime()) / DAY_MS),
        );
        return refundWindowClosingForInstructor(p.instructorId, {
          id: p.id,
          invoiceId: p.invoiceId,
          amountCents: p.amountCents,
          currency: p.currency,
          daysLeft,
        });
      });
    return this.fanOut(params);
  }

  // ── 6. dunning (open invoice with a failed payment) ──────────────────
  async runDunning(now: Date): Promise<{ sent: number }> {
    const dayKey = this.dayKey(now);
    const failed = await this.paymentModel.findAll({
      where: { status: PaymentStatus.FAILED, invoiceId: { [Op.ne]: null } },
      attributes: ['invoiceId'],
      raw: true,
    });
    const invoiceIds = [...new Set(failed.map((p) => p.invoiceId as string))];
    if (invoiceIds.length === 0) return { sent: 0 };

    const invoices = await this.invoiceModel.findAll({
      where: {
        id: { [Op.in]: invoiceIds },
        status: InvoiceStatus.OPEN,
        clientId: { [Op.ne]: null },
      },
    });
    return this.fanOut(
      invoices.map((inv) =>
        invoiceDunningForClient(inv.clientId as string, inv.id, dayKey),
      ),
    );
  }

  // ── 7. dispute evidence deadline (T-3 / T-1) ─────────────────────────
  async remindDisputeDeadlines(now: Date): Promise<{ sent: number }> {
    const disputes = await this.disputeModel.findAll({
      where: {
        status: { [Op.in]: DISPUTE_NEEDS_RESPONSE },
        evidenceDueBy: { [Op.ne]: null, [Op.gt]: now },
      },
    });
    const params: NotifyParams[] = [];
    for (const d of disputes) {
      if (!d.evidenceDueBy) continue;
      const daysLeft = Math.ceil(
        (d.evidenceDueBy.getTime() - now.getTime()) / DAY_MS,
      );
      const bucket: 't3' | 't1' | null =
        daysLeft > 2 && daysLeft <= 3
          ? 't3'
          : daysLeft > 0 && daysLeft <= 1
            ? 't1'
            : null;
      if (!bucket) continue;
      params.push(
        disputeEvidenceDueForInstructor(d.instructorId, {
          id: d.id,
          evidenceDueBy: d.evidenceDueBy,
          daysLeft,
          bucket,
        }),
      );
    }
    return this.fanOut(params);
  }

  // ── helpers ──────────────────────────────────────────────────────────
  private invoiceRef(inv: Invoice) {
    return {
      id: inv.id,
      number: inv.number,
      amountDueCents: inv.amountDueCents,
      currency: inv.currency,
      dueDate: inv.dueDate,
    };
  }

  private dayKey(now: Date): string {
    return now.toISOString().slice(0, 10);
  }

  /** Fire each notification independently; one failure doesn't abort. */
  private async fanOut(params: NotifyParams[]): Promise<{ sent: number }> {
    let sent = 0;
    for (const p of params) {
      try {
        await this.notifications.notify(p);
        sent += 1;
      } catch (err) {
        this.logger.error?.(
          `Reminder notify failed (${p.type} → ${p.userId}): ${(err as Error).message}`,
          undefined,
          'PaymentRemindersService',
        );
      }
    }
    return { sent };
  }
}
