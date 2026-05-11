import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  securityNote,
  subheading,
} from '../_layouts/base-layout';

/**
 * Sent to a group inviter when the recipient declines the invitation.
 * Symmetric to `invitation-accepted` — same intent, opposite outcome.
 * Brief and non-punishing; people decline for lots of reasons.
 *
 * No CTA — there's nothing useful to do here. The inviter can still
 * invite someone else from the group page on their own time.
 */
export function invitationDeclinedTemplate(
  inviterName: string,
  declinerName: string,
  groupName: string,
): string {
  const safeInviter = escapeHtml(inviterName);
  const safeDecliner = escapeHtml(declinerName);
  const safeGroup = escapeHtml(groupName);

  const content = `
    ${eyebrow('UPDATE', 'update')}
    ${heading('Invitation declined')}
    ${subheading(`Heads up — your invitation wasn't accepted`)}
    ${paragraph(`Hi ${safeInviter}, <strong>${safeDecliner}</strong> declined your invitation to join <strong>${safeGroup}</strong>.`)}
    ${securityNote('You can always invite someone else from the group settings whenever you want.')}
  `;

  return baseLayout(content, {
    preheader: `${declinerName} declined your invitation to ${groupName}`,
    category: 'update',
  });
}

export function invitationDeclinedTemplateText(
  inviterName: string,
  declinerName: string,
  groupName: string,
): string {
  return plainTextLayout({
    preheader: `${declinerName} declined your invitation to ${groupName}`,
    sections: [
      {
        heading: 'Invitation declined',
        body: [
          `Hi ${inviterName}, ${declinerName} declined your invitation to join ${groupName}.`,
          'You can always invite someone else from the group settings whenever you want.',
        ],
      },
    ],
  });
}
