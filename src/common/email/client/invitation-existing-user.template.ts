import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  buttonRow,
  calloutBox,
  dangerButton,
  eyebrow,
  heading,
  paragraph,
  personCard,
  plainTextLayout,
  primaryButton,
  securityNote,
} from '../_layouts/base-layout';

/**
 * Client invitation to a recipient who already has a MotionHive
 * account. The CTA deep-links into the in-app coaches tab with the
 * specific request open, so a single click takes them to accept or
 * decline.
 *
 * TODO [product]: same `acceptLink` is used for both buttons; the FE
 * page handles either action from the highlighted request row. When
 * a dedicated decline endpoint exists, wire the second button to it.
 */
export function clientInvitationExistingUserTemplate(params: {
  recipientFirstName: string | null;
  instructorName: string;
  acceptLink: string;
  message?: string;
}): string {
  const { recipientFirstName, instructorName, acceptLink, message } = params;
  const safeFirst = escapeHtml(recipientFirstName);
  const safeInstructor = escapeHtml(instructorName);
  const safeMessage = escapeHtml(message);
  const greeting = recipientFirstName ? `Hi ${safeFirst},` : 'Hi,';

  const content = `
    ${eyebrow('CLIENT REQUEST', 'action')}
    ${paragraph(greeting)}
    ${heading(`${safeInstructor} sent you a client request`)}
    ${personCard({ name: instructorName, role: 'Coach' })}
    ${paragraph(`<strong>${safeInstructor}</strong> wants to add you as a client on MotionHive. Accept to start coordinating sessions, memberships and invoices together.`)}
    ${message ? calloutBox('info', `<em>"${safeMessage}"</em>`) : ''}
    ${buttonRow([
      primaryButton('Accept', acceptLink),
      dangerButton('Decline', acceptLink),
    ])}
    ${securityNote("If you weren't expecting this, you can safely ignore the email or decline from your account.")}
  `;

  return baseLayout(content, {
    preheader: `${instructorName} wants to add you as a client on MotionHive`,
    category: 'action',
  });
}

export function clientInvitationExistingUserTemplateText(params: {
  recipientFirstName: string | null;
  instructorName: string;
  acceptLink: string;
  message?: string;
}): string {
  const { recipientFirstName, instructorName, acceptLink, message } = params;
  const greeting = recipientFirstName ? `Hi ${recipientFirstName},` : 'Hi,';
  return plainTextLayout({
    preheader: `${instructorName} wants to add you as a client on MotionHive`,
    sections: [
      {
        heading: `${instructorName} sent you a client request`,
        body: [
          greeting,
          `${instructorName} wants to add you as a client on MotionHive. Accept to start coordinating sessions, memberships and invoices together.`,
          ...(message ? [`Message: "${message}"`] : []),
        ],
        ctas: [
          { label: 'Accept', url: acceptLink },
          { label: 'Decline', url: acceptLink },
        ],
      },
      {
        body: [
          "If you weren't expecting this, you can safely ignore the email or decline from your account.",
        ],
      },
    ],
  });
}
