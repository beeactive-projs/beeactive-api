import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  eyebrow,
  heading,
  paragraph,
  personCard,
  plainTextLayout,
  secondaryButton,
} from '../_layouts/base-layout';

/**
 * Tells the request sender their client request was accepted.
 * Symmetrical to `clientRequestDeclinedTemplate` — the responder name
 * is the party who accepted; the recipient is the original sender.
 */
export function clientRequestAcceptedTemplate(params: {
  recipientFirstName: string | null;
  responderName: string;
  appLink: string;
}): string {
  const { recipientFirstName, responderName, appLink } = params;
  const safeFirst = escapeHtml(recipientFirstName);
  const safeResponder = escapeHtml(responderName);
  const greeting = recipientFirstName ? `Hi ${safeFirst},` : 'Hi,';

  const content = `
    ${eyebrow('REQUEST ACCEPTED', 'confirmation')}
    ${paragraph(greeting)}
    ${heading('Request accepted')}
    ${personCard({ name: responderName, role: 'Coach' })}
    ${paragraph(`<strong>${safeResponder}</strong> accepted your request. You can now coordinate sessions, memberships and invoices together.`)}
    ${secondaryButton('Open MotionHive', appLink)}
  `;

  return baseLayout(content, {
    preheader: `${responderName} accepted your request on MotionHive`,
    category: 'confirmation',
  });
}

export function clientRequestAcceptedTemplateText(params: {
  recipientFirstName: string | null;
  responderName: string;
  appLink: string;
}): string {
  const { recipientFirstName, responderName, appLink } = params;
  const greeting = recipientFirstName ? `Hi ${recipientFirstName},` : 'Hi,';
  return plainTextLayout({
    preheader: `${responderName} accepted your request on MotionHive`,
    sections: [
      {
        heading: 'Request accepted',
        body: [
          greeting,
          `${responderName} accepted your request. You can now coordinate sessions, memberships and invoices together.`,
        ],
        ctas: [{ label: 'Open MotionHive', url: appLink }],
      },
    ],
  });
}
