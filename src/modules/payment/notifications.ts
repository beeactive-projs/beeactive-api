import type { NotifyParams } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.service';
import { formatDueDate, formatMoney } from '../notification/format';

/**
 * Notification builders for the payment module. Co-located with the
 * producers that use them so we keep `notification` free of any
 * payment-domain imports (and therefore avoid the circular-dep trap
 * that comes with `@Global()` modules).
 *
 * Builders take primitive arguments — never Sequelize entities — so
 * they can't be silently broken by a partially-loaded model. Callers
 * are responsible for choosing `notify()` vs `outbox.add()` based on
 * whether they're inside a transaction.
 *
 * Add a new builder when a notification shape repeats (2+ call sites).
 * For one-off shapes, leave the object literal inline at the call
 * site — three lines isn't a helper.
 */

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

interface InvoiceForBuilder {
  id: string;
  number: string | null;
  amountDueCents: number;
  currency: string;
  dueDate: Date | string | null;
}

/** Client received a freshly-finalized invoice. */
export function invoiceCreatedForClient(
  clientId: string,
  invoice: InvoiceForBuilder,
): NotifyParams {
  const amount = formatMoney(invoice.amountDueCents, invoice.currency);
  const due = formatDueDate(invoice.dueDate);
  return {
    userId: clientId,
    type: NotificationType.INVOICE_CREATED,
    title: 'New invoice',
    body: due ? `${amount} due ${due}.` : `${amount} — open to view details.`,
    data: { screen: 'profile/invoices', entityId: invoice.id },
  };
}

/** Instructor — Stripe confirmed the client paid. */
export function invoicePaidForInstructor(
  instructorId: string,
  invoice: InvoiceForBuilder,
): NotifyParams {
  const ref = invoice.number ?? invoice.id;
  return {
    userId: instructorId,
    type: NotificationType.INVOICE_PAID,
    title: 'Invoice paid',
    body: `Invoice ${ref} was paid by your client.`,
    data: { screen: 'coaching/invoices', entityId: invoice.id },
  };
}

/** Client — payment processed (matches the instructor-side receipt). */
export function invoicePaidForClient(
  clientId: string,
  invoiceId: string,
): NotifyParams {
  return {
    userId: clientId,
    type: NotificationType.INVOICE_PAID,
    title: 'Payment received',
    body: 'Thanks — your payment has been processed.',
    data: { screen: 'profile/invoices', entityId: invoiceId },
  };
}

/** Instructor — manually marked an invoice paid (out-of-band cash etc). */
export function invoiceMarkedPaidForInstructor(
  instructorId: string,
  invoice: InvoiceForBuilder,
): NotifyParams {
  const ref = invoice.number ?? invoice.id;
  return {
    userId: instructorId,
    type: NotificationType.INVOICE_PAID,
    title: 'Invoice marked paid',
    body: `Invoice ${ref} marked as paid out of band.`,
    data: { screen: 'coaching/invoices', entityId: invoice.id },
  };
}

/** Client — Stripe reported invoice payment failed (card declined etc). */
export function invoicePaymentFailedForClient(
  clientId: string,
  invoiceId: string,
): NotifyParams {
  return {
    userId: clientId,
    type: NotificationType.PAYMENT_FAILED,
    title: 'Payment failed',
    body: 'Your invoice payment failed. Please update your card and retry.',
    data: { screen: 'profile/invoices', entityId: invoiceId },
  };
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

/** Client — subscribed to an instructor's product. */
export function subscriptionCreatedForClient(
  clientId: string,
  productName: string,
): NotifyParams {
  return {
    userId: clientId,
    type: NotificationType.SUBSCRIPTION_CREATED,
    title: 'New subscription',
    body: `You have been subscribed to ${productName}.`,
    // Memberships live in a tab on /profile — no detail route, so we
    // forward queryParams instead of an entityId.
    data: { screen: 'profile', queryParams: { tab: 'memberships' } },
  };
}

/**
 * Client — subscription cancelled. `immediate=true` is rare (e.g.
 * forced cancel by support); the default at-period-end variant copy
 * reassures them they keep access until the period closes.
 */
export function subscriptionCancelledForClient(
  clientId: string,
  productName: string | null,
  immediate: boolean,
): NotifyParams {
  const subject = productName
    ? `your "${productName}" membership`
    : 'your membership';
  return {
    userId: clientId,
    type: NotificationType.SUBSCRIPTION_CANCELED,
    title: immediate ? 'Membership cancelled' : 'Membership will cancel',
    body: immediate
      ? `${subject.charAt(0).toUpperCase() + subject.slice(1)} has been cancelled.`
      : `${subject.charAt(0).toUpperCase() + subject.slice(1)} will end at the close of the current period.`,
    data: { screen: 'profile', queryParams: { tab: 'memberships' } },
  };
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

/**
 * Client — a refund has been issued for one of their payments. When the
 * payment is tied to an invoice we deep-link to that invoice; otherwise
 * we land on the Invoices tab so the client can find it themselves.
 */
export function refundIssuedForClient(
  clientId: string,
  refundCents: number,
  currency: string,
  invoiceId: string | null,
): NotifyParams {
  const data = invoiceId
    ? { screen: 'profile/invoices', entityId: invoiceId }
    : { screen: 'profile', queryParams: { tab: 'invoices' } };
  return {
    userId: clientId,
    type: NotificationType.REFUND_ISSUED,
    title: 'Refund processed',
    body: `A refund of ${formatMoney(refundCents, currency)} has been issued.`,
    data,
  };
}

// ---------------------------------------------------------------------------
// Reminders (jobs-module cron sweeps)
// ---------------------------------------------------------------------------

/** Client — an open invoice is due within a few days. */
export function invoiceDueSoonForClient(
  clientId: string,
  invoice: InvoiceForBuilder,
): NotifyParams {
  const amount = formatMoney(invoice.amountDueCents, invoice.currency);
  const due = formatDueDate(invoice.dueDate);
  return {
    userId: clientId,
    type: NotificationType.INVOICE_DUE_SOON,
    title: 'Invoice due soon',
    body: due ? `${amount} is due ${due}.` : `${amount} is due soon.`,
    data: { screen: 'profile/invoices', entityId: invoice.id },
    // Once per invoice, ever.
    fingerprint: `invoice_due_soon:${invoice.id}`,
  };
}

/** Client — an open invoice is now past its due date. `dayKey` (YYYY-MM-DD)
 *  scopes the fingerprint so the reminder repeats at most once per day. */
export function invoiceOverdueForClient(
  clientId: string,
  invoice: InvoiceForBuilder,
  dayKey: string,
): NotifyParams {
  const amount = formatMoney(invoice.amountDueCents, invoice.currency);
  return {
    userId: clientId,
    type: NotificationType.INVOICE_OVERDUE,
    title: 'Invoice overdue',
    body: `${amount} is past due. Please pay to avoid interruption.`,
    data: { screen: 'profile/invoices', entityId: invoice.id },
    fingerprint: `invoice_overdue:${invoice.id}:${dayKey}`,
  };
}

/** Instructor — a client's invoice is overdue (once per day per invoice). */
export function invoiceOverdueForInstructor(
  instructorId: string,
  invoice: InvoiceForBuilder,
  dayKey: string,
): NotifyParams {
  const ref = invoice.number ?? invoice.id;
  const amount = formatMoney(invoice.amountDueCents, invoice.currency);
  return {
    userId: instructorId,
    type: NotificationType.INVOICE_OVERDUE,
    title: 'Client invoice overdue',
    body: `Invoice ${ref} (${amount}) is past due.`,
    data: { screen: 'coaching/invoices', entityId: invoice.id },
    fingerprint: `invoice_overdue_instr:${invoice.id}:${dayKey}`,
  };
}

/** Client — the card backing their subscription expires soon. */
export function cardExpiringForClient(
  clientId: string,
  card: {
    brand: string | null;
    last4: string | null;
    expMonth: number;
    expYear: number;
  },
): NotifyParams {
  const tail = card.last4 ? ` ending ${card.last4}` : '';
  const mm = String(card.expMonth).padStart(2, '0');
  return {
    userId: clientId,
    type: NotificationType.CARD_EXPIRING_SOON,
    title: 'Card expiring soon',
    body: `Your card${tail} expires ${mm}/${card.expYear}. Update it to avoid a failed charge.`,
    data: { screen: 'profile', queryParams: { tab: 'memberships' } },
    fingerprint: `card_expiring:${clientId}:${card.expYear}${mm}`,
  };
}

/** Instructor — monthly earnings summary for the closed month. */
export function earningsSummaryForInstructor(
  instructorId: string,
  summary: {
    monthLabel: string; // e.g. "May 2026"
    monthKey: string; // e.g. "2026-05" — fingerprint scope
    grossCents: number;
    currency: string;
    paymentCount: number;
  },
): NotifyParams {
  const gross = formatMoney(summary.grossCents, summary.currency);
  return {
    userId: instructorId,
    type: NotificationType.EARNINGS_SUMMARY,
    title: `Your ${summary.monthLabel} earnings`,
    body: `${gross} across ${summary.paymentCount} payment${summary.paymentCount === 1 ? '' : 's'} in ${summary.monthLabel}.`,
    data: { screen: 'coaching/payments' },
    fingerprint: `earnings_summary:${instructorId}:${summary.monthKey}`,
  };
}

/** Instructor — the 14-day refund window on a payment is about to close. */
export function refundWindowClosingForInstructor(
  instructorId: string,
  payment: {
    id: string;
    amountCents: number;
    currency: string;
    daysLeft: number;
  },
): NotifyParams {
  const amount = formatMoney(payment.amountCents, payment.currency);
  const days =
    payment.daysLeft <= 1 ? 'tomorrow' : `in ${payment.daysLeft} days`;
  return {
    userId: instructorId,
    type: NotificationType.REFUND_WINDOW_CLOSING,
    title: 'Refund window closing',
    body: `The refund window for a ${amount} payment closes ${days}.`,
    data: { screen: 'coaching/payments', entityId: payment.id },
    fingerprint: `refund_window:${payment.id}`,
  };
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

/** Instructor — a chargeback/dispute was opened against one of their charges. */
export function disputeOpenedForInstructor(
  instructorId: string,
  dispute: {
    id: string;
    amountCents: number;
    currency: string;
    reason: string | null;
    evidenceDueBy: Date | string | null;
  },
): NotifyParams {
  const amount = formatMoney(dispute.amountCents, dispute.currency);
  const due = formatDueDate(dispute.evidenceDueBy);
  const reason = dispute.reason ? ` (${dispute.reason})` : '';
  return {
    userId: instructorId,
    type: NotificationType.DISPUTE_OPENED,
    title: 'Payment disputed',
    body: due
      ? `A ${amount} payment was disputed${reason}. Respond with evidence by ${due}.`
      : `A ${amount} payment was disputed${reason}. Respond in Stripe as soon as possible.`,
    data: { screen: 'coaching/payments', entityId: dispute.id },
    // Once per dispute on open.
    fingerprint: `dispute_opened:${dispute.id}`,
  };
}

/** Instructor — dispute evidence deadline is approaching (T-3 / T-1). */
export function disputeEvidenceDueForInstructor(
  instructorId: string,
  dispute: {
    id: string;
    evidenceDueBy: Date | string | null;
    daysLeft: number;
    bucket: 't3' | 't1';
  },
): NotifyParams {
  const due = formatDueDate(dispute.evidenceDueBy);
  const when =
    dispute.daysLeft <= 1 ? 'tomorrow' : `in ${dispute.daysLeft} days`;
  return {
    userId: instructorId,
    type: NotificationType.DISPUTE_EVIDENCE_DUE,
    title: 'Dispute evidence due soon',
    body: due
      ? `Evidence for a disputed payment is due ${due} (${when}). Submit it in Stripe.`
      : `Evidence for a disputed payment is due ${when}. Submit it in Stripe.`,
    data: { screen: 'coaching/payments', entityId: dispute.id },
    fingerprint: `dispute_deadline:${dispute.id}:${dispute.bucket}`,
  };
}

/** Instructor — a client cancelled their own membership. */
export function subscriptionCancelledByClientForInstructor(
  instructorId: string,
  subscriptionId: string,
  clientName: string | null,
  productName: string | null,
): NotifyParams {
  const who = clientName ?? 'A client';
  const what = productName ? ` to "${productName}"` : '';
  return {
    userId: instructorId,
    type: NotificationType.SUBSCRIPTION_CANCELED,
    title: 'Membership cancelled by client',
    body: `${who} cancelled their membership${what}; access ends at period close.`,
    data: { screen: 'coaching/subscriptions', entityId: subscriptionId },
  };
}
