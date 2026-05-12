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
} from '../_layouts/base-layout';

/**
 * Notifies an instructor that a user has requested to become their
 * client. The deep link opens the instructor's Clients page with the
 * specific request highlighted so they can accept or decline in one
 * click.
 *
 * TODO [product]: the same `reviewLink` is used for both accept and
 * decline buttons today (the FE page handles either action from the
 * highlighted row). When product approves a separate `declineLink`
 * pre-action, swap the second button to that URL.
 */
export function clientRequestToInstructorTemplate(params: {
  instructorFirstName: string | null;
  clientName: string;
  reviewLink: string;
  message?: string;
}): string {
  const { instructorFirstName, clientName, reviewLink, message } = params;
  const safeFirst = escapeHtml(instructorFirstName);
  const safeClient = escapeHtml(clientName);
  const safeMessage = escapeHtml(message);
  const greeting = instructorFirstName ? `Hi ${safeFirst},` : 'Hi,';

  const content = `
    ${eyebrow('NEW CLIENT REQUEST', 'request')}
    ${paragraph(greeting)}
    ${heading('New client request')}
    ${personCard({ name: clientName, role: 'Prospective client' })}
    ${paragraph(`<strong>${safeClient}</strong> wants to work with you as a client.`)}
    ${message ? calloutBox('info', `<em>"${safeMessage}"</em>`) : ''}
    ${buttonRow([
      primaryButton('Accept request', reviewLink),
      dangerButton('Decline', reviewLink),
    ])}
  `;

  return baseLayout(content, {
    preheader: `${clientName} wants to work with you on MotionHive`,
    category: 'request',
  });
}

export function clientRequestToInstructorTemplateText(params: {
  instructorFirstName: string | null;
  clientName: string;
  reviewLink: string;
  message?: string;
}): string {
  const { instructorFirstName, clientName, reviewLink, message } = params;
  const greeting = instructorFirstName ? `Hi ${instructorFirstName},` : 'Hi,';
  return plainTextLayout({
    preheader: `${clientName} wants to work with you on MotionHive`,
    sections: [
      {
        heading: 'New client request',
        body: [
          greeting,
          `${clientName} wants to work with you as a client.`,
          ...(message ? [`Message: "${message}"`] : []),
        ],
        ctas: [
          { label: 'Accept request', url: reviewLink },
          { label: 'Decline', url: reviewLink },
        ],
      },
    ],
  });
}
