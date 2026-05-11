import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  dataCard,
  dataRow,
  divider,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  primaryButton,
  secondaryButton,
  subheading,
} from '../_layouts/base-layout';

/**
 * Invoice send email (override-email path).
 *
 * Used when the instructor chooses to email the invoice to an address
 * that differs from the customer's on-file email. Stripe's native
 * `sendInvoice` endpoint always targets the customer's saved email,
 * so for a one-off override we take over delivery from our side and
 * link to the hosted invoice page Stripe already generated.
 */
export function invoiceSendTemplate(params: {
  instructorName: string;
  amountLabel: string;
  dueDateLabel: string | null;
  invoiceNumber: string | null;
  hostedInvoiceUrl: string;
  invoicePdfUrl: string | null;
  recipientName?: string | null;
}): string {
  const {
    instructorName,
    amountLabel,
    dueDateLabel,
    invoiceNumber,
    hostedInvoiceUrl,
    invoicePdfUrl,
    recipientName,
  } = params;

  const safeInstructor = escapeHtml(instructorName);
  const safeAmount = escapeHtml(amountLabel);
  const safeDue = escapeHtml(dueDateLabel);
  const safeNumber = escapeHtml(invoiceNumber);
  const greeting = recipientName
    ? `Hi ${escapeHtml(recipientName)},`
    : 'Hi there,';

  const rows =
    dataRow('Invoice #', invoiceNumber ? safeNumber : '—') +
    dataRow('From', safeInstructor) +
    dataRow('Amount', safeAmount) +
    (dueDateLabel ? dataRow('Due', safeDue) : '');

  const content = `
    ${eyebrow('INVOICE', 'action')}
    ${paragraph(greeting)}
    ${heading('You have a new invoice')}
    ${subheading(`${safeInstructor} sent you an invoice on MotionHive`)}
    ${dataCard(rows)}
    ${primaryButton('View &amp; pay invoice', hostedInvoiceUrl)}
    ${invoicePdfUrl ? secondaryButton('Download PDF', invoicePdfUrl) : ''}
    ${divider()}
    ${paragraph('Payment is handled securely by Stripe.')}
  `;

  return baseLayout(content, {
    preheader: `${safeInstructor} sent you an invoice for ${safeAmount}`,
    footerNote:
      "You're receiving this because an invoice was sent to this address on MotionHive.",
    category: 'action',
  });
}

export function invoiceSendTemplateText(params: {
  instructorName: string;
  amountLabel: string;
  dueDateLabel: string | null;
  invoiceNumber: string | null;
  hostedInvoiceUrl: string;
  invoicePdfUrl: string | null;
  recipientName?: string | null;
}): string {
  const {
    instructorName,
    amountLabel,
    dueDateLabel,
    invoiceNumber,
    hostedInvoiceUrl,
    invoicePdfUrl,
    recipientName,
  } = params;
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,';

  const details = [
    { label: 'Invoice #', value: invoiceNumber || '—' },
    { label: 'From', value: instructorName },
    { label: 'Amount', value: amountLabel },
    ...(dueDateLabel ? [{ label: 'Due', value: dueDateLabel }] : []),
  ];

  const ctas = [
    { label: 'View & pay invoice', url: hostedInvoiceUrl },
    ...(invoicePdfUrl ? [{ label: 'Download PDF', url: invoicePdfUrl }] : []),
  ];

  return plainTextLayout({
    preheader: `${instructorName} sent you an invoice for ${amountLabel}`,
    footerNote:
      "You're receiving this because an invoice was sent to this address on MotionHive.",
    sections: [
      {
        heading: 'You have a new invoice',
        body: [
          greeting,
          `${instructorName} sent you an invoice on MotionHive.`,
        ],
        details,
        ctas,
      },
      {
        body: ['Payment is handled securely by Stripe.'],
      },
    ],
  });
}
