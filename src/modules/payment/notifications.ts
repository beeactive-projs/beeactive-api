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
