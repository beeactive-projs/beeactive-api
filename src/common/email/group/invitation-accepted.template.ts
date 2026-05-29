import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  divider,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  secondaryButton,
  subheading,
} from '../_layouts/base-layout';

/**
 * Sent to the inviter when a recipient accepts a group invitation.
 * `frontendUrl` is optional and, when provided, renders an "Open
 * MotionHive" secondary CTA so the inviter can jump straight to the
 * group. Older callers that don't pass a URL keep working — the CTA
 * just renders without a button.
 */
export function invitationAcceptedTemplate(
  inviterName: string,
  accepterName: string,
  groupName: string,
  frontendUrl?: string,
): string {
  const safeInviter = escapeHtml(inviterName);
  const safeAccepter = escapeHtml(accepterName);
  const safeGroup = escapeHtml(groupName);
  const cta = frontendUrl
    ? secondaryButton('Open MotionHive', frontendUrl)
    : '';
  const content = `
    ${eyebrow('INVITATION ACCEPTED', 'confirmation')}
    ${heading('Invitation accepted!')}
    ${subheading('Great news — someone joined your group')}
    ${paragraph(`Hi ${safeInviter}, <strong>${safeAccepter}</strong> has accepted your invitation and joined <strong>${safeGroup}</strong>.`)}
    ${cta}
    ${divider()}
    ${paragraph('You can view your group members in the MotionHive app.')}
  `;

  return baseLayout(content, {
    preheader: `${safeAccepter} accepted your invitation to ${safeGroup}`,
    category: 'confirmation',
  });
}

export function invitationAcceptedTemplateText(
  inviterName: string,
  accepterName: string,
  groupName: string,
  frontendUrl?: string,
): string {
  return plainTextLayout({
    preheader: `${accepterName} accepted your invitation to ${groupName}`,
    sections: [
      {
        heading: 'Invitation accepted',
        body: [
          `Hi ${inviterName}, ${accepterName} has accepted your invitation and joined ${groupName}.`,
        ],
        ...(frontendUrl
          ? { ctas: [{ label: 'Open MotionHive', url: frontendUrl }] }
          : {}),
      },
      {
        body: ['You can view your group members in the MotionHive app.'],
      },
    ],
  });
}
