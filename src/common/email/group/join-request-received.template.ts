import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  calloutBox,
  eyebrow,
  heading,
  paragraph,
  personCard,
  plainTextLayout,
  primaryButton,
  subheading,
} from '../_layouts/base-layout';

/**
 * Sent to a group owner when someone requests to join their APPROVAL-
 * policy group. The CTA deep-links to the group's join-requests page
 * so the owner can approve or decline in one click.
 *
 * TODO [product]: today the FE join-requests page accept/decline UI
 * lives inline — there's no separate `declineLink`. A single
 * `reviewLink` covers both actions, same shape as
 * `client/request-to-instructor`.
 */
export function groupJoinRequestReceivedTemplate(params: {
  ownerFirstName: string | null;
  requesterName: string;
  groupName: string;
  reviewLink: string;
  message?: string;
}): string {
  const { ownerFirstName, requesterName, groupName, reviewLink, message } =
    params;
  const safeFirst = escapeHtml(ownerFirstName);
  const safeRequester = escapeHtml(requesterName);
  const safeGroup = escapeHtml(groupName);
  const safeMessage = escapeHtml(message);
  const greeting = ownerFirstName ? `Hi ${safeFirst},` : 'Hi there,';

  const content = `
    ${eyebrow('JOIN REQUEST', 'request')}
    ${paragraph(greeting)}
    ${heading('New request to join your group')}
    ${subheading(`${safeRequester} wants to join ${safeGroup}`)}
    ${personCard({ name: requesterName, role: 'Wants to join your group' })}
    ${paragraph(`<strong>${safeRequester}</strong> requested to join <strong>${safeGroup}</strong>. Review their profile and approve or decline.`)}
    ${message ? calloutBox('info', `<em>"${safeMessage}"</em>`) : ''}
    ${primaryButton('Review request', reviewLink)}
  `;

  return baseLayout(content, {
    preheader: `${requesterName} wants to join ${groupName}`,
    category: 'request',
  });
}

export function groupJoinRequestReceivedTemplateText(params: {
  ownerFirstName: string | null;
  requesterName: string;
  groupName: string;
  reviewLink: string;
  message?: string;
}): string {
  const { ownerFirstName, requesterName, groupName, reviewLink, message } =
    params;
  const greeting = ownerFirstName ? `Hi ${ownerFirstName},` : 'Hi there,';
  return plainTextLayout({
    preheader: `${requesterName} wants to join ${groupName}`,
    sections: [
      {
        heading: 'New request to join your group',
        body: [
          greeting,
          `${requesterName} requested to join ${groupName}. Review their profile and approve or decline.`,
          ...(message ? [`Message: "${message}"`] : []),
        ],
        ctas: [{ label: 'Review request', url: reviewLink }],
      },
    ],
  });
}
