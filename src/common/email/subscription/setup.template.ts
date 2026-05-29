import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  dataCard,
  dataRow,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  primaryButton,
  securityNote,
  subheading,
} from '../_layouts/base-layout';

/**
 * Sent to a client when their trainer sets up a recurring membership.
 *
 * Always-confirm policy: every new subscription requires the client
 * to explicitly confirm — even if they have a card on file from a
 * prior one. The link points at the first invoice's Stripe-hosted
 * page, which shows the plan name + amount + cycle and lets them
 * confirm with a saved card or a new one. Once they pay, Stripe
 * activates the subscription. See SECURITY_NOTES.md for the
 * rationale.
 */
export function subscriptionSetupTemplate(params: {
  instructorName: string;
  planName: string;
  amountLabel: string;
  cycleLabel: string | null;
  /** Kept named `setupUrl` for back-compat — this is the confirmation URL. */
  setupUrl: string;
  recipientName?: string | null;
}): string {
  const {
    instructorName,
    planName,
    amountLabel,
    cycleLabel,
    setupUrl,
    recipientName,
  } = params;

  const safeInstructor = escapeHtml(instructorName);
  const safePlan = escapeHtml(planName);
  const safeAmount = escapeHtml(amountLabel);
  const safeCycle = escapeHtml(cycleLabel);
  const greeting = recipientName
    ? `Hi ${escapeHtml(recipientName)},`
    : 'Hi there,';

  const rows =
    dataRow('Plan', safePlan) +
    dataRow('From', safeInstructor) +
    dataRow('Amount', safeAmount) +
    (cycleLabel ? dataRow('Billed', safeCycle) : '');

  const content = `
    ${eyebrow('CONFIRM MEMBERSHIP', 'action')}
    ${paragraph(greeting)}
    ${heading('Confirm your membership')}
    ${subheading(`${safeInstructor} set up a recurring plan for you`)}
    ${dataCard(rows)}
    ${paragraph("Click below to confirm and start your membership. You'll be able to use a saved card or enter a new one — and you can cancel any time from your account.")}
    ${primaryButton('Confirm and start membership', setupUrl)}
    ${securityNote("If you weren't expecting this, you can ignore this email — nothing is charged until you confirm. Payment is handled securely by Stripe.")}
  `;

  return baseLayout(content, {
    preheader: `${safeInstructor} set up a ${safePlan} membership — confirm to start`,
    footerNote:
      "You're receiving this because a trainer set up a membership for this address on MotionHive. Nothing is charged until you confirm.",
    category: 'action',
  });
}

export function subscriptionSetupTemplateText(params: {
  instructorName: string;
  planName: string;
  amountLabel: string;
  cycleLabel: string | null;
  setupUrl: string;
  recipientName?: string | null;
}): string {
  const {
    instructorName,
    planName,
    amountLabel,
    cycleLabel,
    setupUrl,
    recipientName,
  } = params;
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,';

  const details = [
    { label: 'Plan', value: planName },
    { label: 'From', value: instructorName },
    { label: 'Amount', value: amountLabel },
    ...(cycleLabel ? [{ label: 'Billed', value: cycleLabel }] : []),
  ];

  return plainTextLayout({
    preheader: `${instructorName} set up a ${planName} membership — confirm to start`,
    footerNote:
      "You're receiving this because a trainer set up a membership for this address on MotionHive. Nothing is charged until you confirm.",
    sections: [
      {
        heading: 'Confirm your membership',
        body: [
          greeting,
          `${instructorName} set up a ${planName} membership for you on MotionHive.`,
          "Click below to confirm and start your membership. You'll be able to use a saved card or enter a new one — and you can cancel any time from your account.",
        ],
        details,
        ctas: [{ label: 'Confirm and start membership', url: setupUrl }],
      },
      {
        body: [
          "If you weren't expecting this, you can ignore this email — nothing is charged until you confirm. Payment is handled securely by Stripe.",
        ],
      },
    ],
  });
}
